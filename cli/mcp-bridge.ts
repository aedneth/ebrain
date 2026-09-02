#!/usr/bin/env bun
/**
 * ebrain MCP bridge.
 *
 * Presents a stdio MCP server to local agents while proxying every request to
 * the shared HTTP daemon. Adapter configs store only this command; the bearer
 * is read from ebrain's chmod-600 token store at runtime.
 */
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { bridgeCommandConfig, bridgeCommandPath, type BridgeCommandConfig } from "./bridge-path.ts";
import { ensure as ensureDaemon } from "./daemon-control.ts";
import { Client } from "../vendor/gbrain/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StreamableHTTPClientTransport } from "../vendor/gbrain/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js";
import { Server } from "../vendor/gbrain/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js";
import { StdioServerTransport } from "../vendor/gbrain/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "../vendor/gbrain/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js";
import {
  DEFAULT_PORT,
  EBRAIN_MCP_TOKEN_ENV,
  isValidMcpToken,
  mcpUrl,
  readTokenFile,
  redactSecrets,
  tokenStorePaths,
} from "./mcp-token.ts";

const HOME = homedir();
const CFG = join(HOME, ".config", "ebrain");
const SERVER_NAME = "ebrain";
const BRIDGE_VERSION = "1";

// Re-exported from the SDK-free module (cli/bridge-path.ts) so existing importers keep working while
// tests can reach these pure functions without loading the MCP SDK (pass 6, F-T10).
export { bridgeCommandConfig, bridgeCommandPath, type BridgeCommandConfig };

export function resolveBridgeToken(opts: {
  env?: Record<string, string | undefined>;
  tokenFile?: string;
} = {}): string {
  // The store wins over the environment, and that order matters more than it looks.
  //
  // `ebrain sessions new` snapshots the current token into the tmux session environment at launch
  // time, so an agent started that way carried one bearer for its entire life. If the token was
  // re-minted afterwards — a daemon restart does exactly that — every call from that session
  // failed with a credential the process had no way to refresh, for hours, with no path back.
  // The store is the live value: `ensureToken` writes an operator-supplied environment token into
  // it too, so preferring the file never discards a deliberate override, it just reads the
  // current one.
  const token = readTokenFile(opts.tokenFile ?? tokenStorePaths(CFG).tokenFile);
  if (token) return token;
  const env = opts.env ?? process.env;
  const envToken = env[EBRAIN_MCP_TOKEN_ENV];
  if (envToken && isValidMcpToken(envToken)) return envToken;
  throw new Error(`missing ${EBRAIN_MCP_TOKEN_ENV}; run 'ebrain up' to create the local token store`);
}

/**
 * Is this failure "the daemon is not there", as opposed to a tool that legitimately errored?
 *
 * The distinction is the whole point of the bridge. An agent that cannot tell a dead daemon
 * from an empty result silently works without memory for an entire session — the exact
 * failure eBrain exists to remove — so transport-level failures get their own path.
 */
export function isDaemonUnavailable(e: unknown): boolean {
  const message = (e instanceof Error ? e.message : String(e)).toLowerCase();
  // Transport-level failures only. The 5xx arm matches the SDK's real wording — it reports an
  // upstream failure as `Error POSTing to endpoint (HTTP 503): …` — rather than a shape invented
  // to satisfy a test. A 4xx is deliberately absent: an auth or protocol rejection is a real
  // answer from a live host, and retrying or restarting on it would hide the actual problem.
  return /econnrefused|connection refused|fetch failed|econnreset|socket hang up|connect timeout|failed to connect|network error|http 5\d\d/.test(message);
}

/** Attempts per tool call before the bridge gives up and says so plainly. */
const MAX_ATTEMPTS = 3;

/**
 * Per-request deadline. The SDK would otherwise apply its own silent 60 s default, which is a
 * poor fit for a `think` against a large brain and unhelpfully opaque when it fires. Explicit
 * and tunable is better than implicit: an agent blocked forever on a wedged host is worse than
 * an agent told the call timed out.
 */
export function requestTimeoutMs(): number {
  const n = Number(process.env.EBRAIN_BRIDGE_TIMEOUT_MS || 120_000);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

function autoStartEnabled(): boolean {
  return process.env.EBRAIN_BRIDGE_NO_AUTOSTART !== "1";
}

/**
 * Rate-limited, not once-ever.
 *
 * A bridge process lives as long as its agent session — hours. Allowing exactly one auto-start
 * for that whole lifetime meant the second outage was never recovered: after one restart the
 * agent was permanently degraded to plain retries, which is the silent-no-memory state this
 * machinery exists to prevent. A cooldown keeps the anti-storm property (the real guard is the
 * start lock in daemon-control, which serialises N agents into one host) while letting a long
 * session recover as many times as it genuinely needs to.
 */
const AUTOSTART_COOLDOWN_MS = 30_000;
/** How long a tool call may spend inside a recovery before answering the agent instead. */
const AUTOSTART_DEADLINE_MS = 25_000;
let lastAutoStartMs = 0;

/**
 * Bound a recovery. `ensureDaemon` can legitimately block for the start timeout plus the lock
 * wait — far longer than the request deadline the bridge promises its client — and an agent left
 * hanging is worse than one told the daemon is down.
 */
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("auto-start deadline exceeded")), ms);
        (timer as unknown as { unref?: () => void }).unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function daemonDownMessage(port: number): string {
  return (
    `the eBrain daemon is not answering on 127.0.0.1:${port}, so shared memory is unavailable ` +
    `for this call. Start it with 'ebrain daemon start' (or 'ebrain up'), then retry.`
  );
}

/**
 * Run one MCP call against the shared host, riding out a daemon that is restarting.
 *
 * Every call opens its own short-lived connection, so there is no stale socket to repair;
 * what needs handling is the window where the host is down or still binding. The token is
 * re-read on each attempt because a restart may have re-minted it, and a single auto-start
 * is attempted so an agent whose daemon died between calls recovers without the user
 * noticing. The start lock in daemon-control makes that safe with N agents doing it at once.
 */
async function callHost<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const p = Number(process.env.EBRAIN_BRAIN_PORT || DEFAULT_PORT);
  let lastError: unknown;
  let recovered = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const token = resolveBridgeToken();
    try {
      return await withHttpClient(token, undefined, fn);
    } catch (e) {
      lastError = e;
      if (!isDaemonUnavailable(e)) throw e;
      const now = Date.now();
      if (!recovered && autoStartEnabled() && now - lastAutoStartMs >= AUTOSTART_COOLDOWN_MS) {
        lastAutoStartMs = now;
        recovered = true;
        try {
          await withDeadline(ensureDaemon({ quiet: true }), AUTOSTART_DEADLINE_MS);
        } catch { /* the retries below report the failure in the agent's own terms */ }
        attempt--; // the recovery is not one of this call's attempts against the host
        continue;
      }
      if (attempt < MAX_ATTEMPTS) await Bun.sleep(250 * attempt);
    }
  }
  throw new Error(redactSecrets(`${daemonDownMessage(p)} (${lastError instanceof Error ? lastError.message : String(lastError)})`));
}

async function withHttpClient<T>(
  token: string,
  url = mcpUrl(Number(process.env.EBRAIN_BRAIN_PORT || DEFAULT_PORT)),
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client(
    { name: "ebrain-mcp-bridge", version: BRIDGE_VERSION },
    { capabilities: {} },
  );
  // The handshake needs the same explicit deadline as the calls that follow it: `connect` runs
  // `initialize`, and left to the SDK's silent default it is the one request the bridge's own
  // timeout does not cover.
  await client.connect(transport, { timeout: requestTimeoutMs() });
  try {
    return await fn(client);
  } finally {
    try { await client.close(); } catch { /* best effort */ }
  }
}

function toolError(e: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const message = redactSecrets(e instanceof Error ? e.message : String(e));
  return {
    content: [{ type: "text", text: JSON.stringify({ error: { code: "bridge_error", message } }) }],
    isError: true,
  };
}

export async function listRemoteToolsForBridge(): Promise<unknown[]> {
  const result = await callHost(async (client) => client.listTools());
  const tools = (result as { tools?: unknown[] }).tools;
  return Array.isArray(tools) ? tools : [];
}

export async function startBridge(): Promise<void> {
  const server = new Server(
    { name: SERVER_NAME, version: BRIDGE_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      return await callHost(async (client) => client.listTools(undefined, { timeout: requestTimeoutMs() }));
    } catch (e) {
      throw new Error(redactSecrets(e instanceof Error ? e.message : String(e)));
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request: any): Promise<any> => {
    const { name, arguments: args } = request.params;
    try {
      return await callHost(async (client) => client.callTool({ name, arguments: args ?? {} }, undefined, { timeout: requestTimeoutMs() }));
    } catch (e) {
      return toolError(e);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function probe(): Promise<void> {
  const paths = tokenStorePaths(CFG);
  if (!existsSync(paths.tokenFile) && !process.env[EBRAIN_MCP_TOKEN_ENV]) {
    throw new Error(`token store missing; run 'ebrain up'`);
  }
  resolveBridgeToken(); // fail fast with the "run 'ebrain up'" message rather than a transport error
  const tools = await listRemoteToolsForBridge();
  console.log(`ebrain-mcp-bridge: tools/list ok (${tools.length} tools)`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--probe")) {
    await probe();
    return;
  }
  await startBridge();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`ebrain-mcp-bridge: ${redactSecrets(e instanceof Error ? e.message : String(e))}`);
    process.exit(1);
  });
}
