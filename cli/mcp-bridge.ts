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
  const env = opts.env ?? process.env;
  const envToken = env[EBRAIN_MCP_TOKEN_ENV];
  if (envToken && isValidMcpToken(envToken)) return envToken;
  const token = readTokenFile(opts.tokenFile ?? tokenStorePaths(CFG).tokenFile);
  if (token) return token;
  throw new Error(`missing ${EBRAIN_MCP_TOKEN_ENV}; run 'ebrain up' to create the local token store`);
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
  await client.connect(transport);
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

export async function listRemoteToolsForBridge(token = resolveBridgeToken()): Promise<unknown[]> {
  const result = await withHttpClient(token, undefined, async (client) => client.listTools());
  const tools = (result as { tools?: unknown[] }).tools;
  return Array.isArray(tools) ? tools : [];
}

export async function startBridge(): Promise<void> {
  const server = new Server(
    { name: SERVER_NAME, version: BRIDGE_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const token = resolveBridgeToken();
    try {
      return await withHttpClient(token, undefined, async (client) => client.listTools());
    } catch (e) {
      throw new Error(redactSecrets(e instanceof Error ? e.message : String(e), [token]));
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request: any): Promise<any> => {
    const token = resolveBridgeToken();
    const { name, arguments: args } = request.params;
    try {
      return await withHttpClient(token, undefined, async (client) => client.callTool({ name, arguments: args ?? {} }));
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
  const token = resolveBridgeToken();
  const tools = await listRemoteToolsForBridge(token);
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
