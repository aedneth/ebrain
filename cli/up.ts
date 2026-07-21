#!/usr/bin/env bun
/**
 * ebrain up / onboard — plug-and-play daemon cutover.
 *
 * Goal: the user never handles OAuth, bearer tokens, curl probes, or PGLite locks.
 * `ebrain up` starts the shared HTTP-MCP daemon, ensures the local agent token,
 * registers detected agents, and smoke-tests the endpoint. `ebrain onboard`
 * re-runs the idempotent registration layer.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "fs";
import { access } from "fs/promises";
import { constants } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { resolveEbrainHome } from "./ebrain-home.ts";
import { bridgeCommandConfig, bridgeCommandPath } from "./mcp-bridge.ts";
import {
  EBRAIN_MCP_TOKEN_ENV,
  DEFAULT_PORT,
  ensureToken,
  healthCheck,
  healthUrl,
  mcpUrl,
  redactSecrets,
  runProcess,
  tokenStorePaths,
  toolsListSmoke,
} from "./mcp-token.ts";

const HOME = homedir();
const EBRAIN_HOME = resolveEbrainHome();
const CFG = join(HOME, ".config", "ebrain");
const SCRIPTS = join(EBRAIN_HOME, "scripts");
const DEFAULT_AGENTS = ["claude", "codex", "gemini", "cursor", "opencode"] as const;
const MCP_SERVER_NAME = "ebrain";

export type OnboardAgent = typeof DEFAULT_AGENTS[number] | "generic";
export type OnboardStatus = "registered" | "skipped" | "failed";

export interface OnboardResult {
  agent: OnboardAgent;
  status: OnboardStatus;
  detail: string;
}

export interface CommandSpec {
  binary: string;
  args: string[];
  tokenInArgv: boolean;
}

function port(): number {
  const n = Number(process.env.EBRAIN_BRAIN_PORT || DEFAULT_PORT);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PORT;
}

function baseUrl(): string {
  return `http://127.0.0.1:${port()}`;
}

function ensureDirs(): void {
  mkdirSync(CFG, { recursive: true, mode: 0o700 });
  mkdirSync(join(CFG, "wd"), { recursive: true, mode: 0o700 });
}

export function parseOnboardTarget(args: string[]): OnboardAgent[] {
  if (args.length === 0 || args.includes("--all")) return [...DEFAULT_AGENTS];
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) return [...DEFAULT_AGENTS];
  if (target === "all") return [...DEFAULT_AGENTS];
  if (![...DEFAULT_AGENTS, "generic"].includes(target as OnboardAgent)) {
    throw new Error(`unknown agent '${target}'. Use --all or one of: ${[...DEFAULT_AGENTS, "generic"].join(", ")}`);
  }
  return [target as OnboardAgent];
}

export async function which(binary: string, pathValue = process.env.PATH || ""): Promise<string | null> {
  for (const dir of pathValue.split(":")) {
    if (!dir) continue;
    const full = join(dir, binary);
    try {
      await access(full, constants.X_OK);
      return full;
    } catch { /* keep searching */ }
  }
  return null;
}

export function commandForAgent(agent: OnboardAgent, token: string, url = mcpUrl(port()), bridge = bridgeCommandPath(EBRAIN_HOME)): CommandSpec | null {
  void token;
  void url;
  switch (agent) {
    case "claude":
      return {
        binary: "claude",
        tokenInArgv: false,
        args: ["mcp", "add", "--scope", "user", MCP_SERVER_NAME, "--", bridge],
      };
    case "codex":
      return {
        binary: "codex",
        tokenInArgv: false,
        args: ["mcp", "add", MCP_SERVER_NAME, "--", bridge],
      };
    case "gemini":
      return {
        binary: "gemini",
        tokenInArgv: false,
        args: ["mcp", "add", "--scope", "user", "--transport", "stdio", MCP_SERVER_NAME, bridge],
      };
    case "opencode":
    case "cursor":
    case "generic":
      return null;
  }
}

export function removalCommandForAgent(agent: OnboardAgent): CommandSpec | null {
  switch (agent) {
    case "claude":
      return { binary: "claude", args: ["mcp", "remove", MCP_SERVER_NAME], tokenInArgv: false };
    case "codex":
      return { binary: "codex", args: ["mcp", "remove", MCP_SERVER_NAME], tokenInArgv: false };
    case "gemini":
      return { binary: "gemini", args: ["mcp", "remove", MCP_SERVER_NAME], tokenInArgv: false };
    default:
      return null;
  }
}

export function commandDisplay(spec: CommandSpec, token: string): string {
  return redactSecrets(`${spec.binary} ${spec.args.join(" ")}`, [token]);
}

async function runAgentCommand(spec: CommandSpec, token: string): Promise<{ ok: boolean; detail: string }> {
  if (!(await which(spec.binary))) return { ok: false, detail: `${spec.binary} not installed` };
  const res = await runProcess([spec.binary, ...spec.args], {
    env: { [EBRAIN_MCP_TOKEN_ENV]: token },
    timeoutMs: 20_000,
  });
  if (res.code === 0) return { ok: true, detail: commandDisplay(spec, token) };
  return {
    ok: false,
    detail: redactSecrets(`${spec.binary} failed rc=${res.code}: ${res.stderr || res.stdout}`, [token]).trim(),
  };
}

async function removeExisting(agent: OnboardAgent, token: string): Promise<void> {
  const spec = removalCommandForAgent(agent);
  if (!spec || !(await which(spec.binary))) return;
  await runProcess([spec.binary, ...spec.args], {
    env: { [EBRAIN_MCP_TOKEN_ENV]: token },
    timeoutMs: 10_000,
  });
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    throw new Error(`invalid JSON in ${path}; refusing to rewrite it`);
  }
}

function writeJsonObject(path: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function chmodIfExists(path: string, mode: number): void {
  if (!existsSync(path)) return;
  chmodSync(path, mode);
}

function hardenAgentConfig(agent: OnboardAgent): void {
  const files: string[] = [];
  switch (agent) {
    case "claude":
      files.push(join(HOME, ".claude.json"));
      break;
    case "codex":
      files.push(join(HOME, ".codex", "config.toml"));
      break;
    case "gemini":
      files.push(join(HOME, ".gemini", "settings.json"));
      break;
    case "cursor":
      files.push(join(HOME, ".cursor", "mcp.json"));
      break;
    case "opencode":
      files.push(join(HOME, ".config", "opencode", "opencode.json"));
      break;
  }
  for (const file of files) {
    try { chmodIfExists(file, 0o600); } catch { /* best-effort hardening */ }
  }
}

export function mergeCursorMcpConfig(current: Record<string, unknown>, token: string, url = mcpUrl(port())): Record<string, unknown> {
  void token;
  void url;
  const bridge = bridgeCommandConfig(bridgeCommandPath(EBRAIN_HOME));
  const mcpServers = current.mcpServers && typeof current.mcpServers === "object" && !Array.isArray(current.mcpServers)
    ? current.mcpServers as Record<string, unknown>
    : {};
  return {
    ...current,
    mcpServers: {
      ...mcpServers,
      [MCP_SERVER_NAME]: bridge,
    },
  };
}

export function mergeOpenCodeMcpConfig(current: Record<string, unknown>, token: string): Record<string, unknown> {
  void token;
  const mcp = current.mcp && typeof current.mcp === "object" && !Array.isArray(current.mcp)
    ? current.mcp as Record<string, unknown>
    : {};
  const bridge = bridgeCommandConfig(bridgeCommandPath(EBRAIN_HOME));
  const { instructions: rawInstructions, ...rest } = current;
  const instructions = Array.isArray(rawInstructions)
    ? rawInstructions
    : typeof rawInstructions === "string"
      ? [rawInstructions]
      : undefined;
  return {
    ...rest,
    mcp: {
      ...mcp,
      [MCP_SERVER_NAME]: {
        type: "local",
        command: [bridge.command, ...bridge.args],
      },
    },
    ...(instructions === undefined ? {} : { instructions }),
  };
}

async function registerCursor(token: string): Promise<OnboardResult> {
  if (!(await which("agent"))) return { agent: "cursor", status: "skipped", detail: "agent not installed" };
  const file = join(HOME, ".cursor", "mcp.json");
  try {
    const next = mergeCursorMcpConfig(readJsonObject(file), token);
    writeJsonObject(file, next);
    return { agent: "cursor", status: "registered", detail: "~/.cursor/mcp.json -> daemon bridge" };
  } catch (e) {
    return { agent: "cursor", status: "failed", detail: redactSecrets(e instanceof Error ? e.message : String(e), [token]) };
  }
}

async function registerOpenCode(token: string): Promise<OnboardResult> {
  if (!(await which("opencode"))) return { agent: "opencode", status: "skipped", detail: "opencode not installed" };
  const file = join(HOME, ".config", "opencode", "opencode.json");
  try {
    const next = mergeOpenCodeMcpConfig(readJsonObject(file), token);
    writeJsonObject(file, next);
    return { agent: "opencode", status: "registered", detail: "~/.config/opencode/opencode.json -> daemon bridge" };
  } catch (e) {
    return { agent: "opencode", status: "failed", detail: redactSecrets(e instanceof Error ? e.message : String(e), [token]) };
  }
}

async function onboardOne(agent: OnboardAgent, token: string): Promise<OnboardResult> {
  if (agent === "generic") return { agent, status: "skipped", detail: "generic has no native MCP client" };
  if (agent === "cursor") return registerCursor(token);
  if (agent === "opencode") return registerOpenCode(token);

  const spec = commandForAgent(agent, token);
  if (!spec) return { agent, status: "skipped", detail: "no registration command" };
  if (!(await which(spec.binary))) return { agent, status: "skipped", detail: `${spec.binary} not installed` };
  await removeExisting(agent, token);
  const res = await runAgentCommand(spec, token);
  if (res.ok) hardenAgentConfig(agent);
  return {
    agent,
    status: res.ok ? "registered" : "failed",
    detail: res.ok ? "daemon bridge registered" : res.detail,
  };
}

export async function onboardAgents(agents: OnboardAgent[], token: string): Promise<OnboardResult[]> {
  const out: OnboardResult[] = [];
  for (const agent of agents) out.push(await onboardOne(agent, token));
  return out;
}

async function startDaemon(): Promise<void> {
  const ctl = join(SCRIPTS, "ebrain-daemon");
  const res = await runProcess(["bash", ctl, "start"], { timeoutMs: 30_000 });
  if (res.code !== 0) throw new Error(redactSecrets(res.stderr || res.stdout).trim() || "daemon start failed");
}

async function waitForDaemon(timeoutMs = 15_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await healthCheck(healthUrl(port()), 2_000)) return true;
    await Bun.sleep(500);
  }
  return false;
}

async function tokenForOnboard(): Promise<string> {
  ensureDirs();
  const token = await ensureToken({
    configDir: CFG,
    ebrainHome: EBRAIN_HOME,
    mode: "up",
    allowAdminMint: true,
    baseUrl: baseUrl(),
  });
  return token.token;
}

function printOnboard(results: OnboardResult[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ agents: results }, null, 2));
    return;
  }
  for (const r of results) {
    const mark = r.status === "registered" ? "ok" : r.status === "skipped" ? "skip" : "fail";
    console.log(`  ${mark.padEnd(4)} ${r.agent.padEnd(8)} ${r.detail}`);
  }
}

async function cmdOnboard(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const agents = parseOnboardTarget(args.filter((a) => a !== "--json"));
  const token = await tokenForOnboard();
  const results = await onboardAgents(agents, token);
  printOnboard(results, json);
  if (results.some((r) => r.status === "failed")) process.exit(1);
}

async function cmdEnsureToken(args: string[]): Promise<void> {
  ensureDirs();
  const quiet = args.includes("--quiet");
  const boot = args.includes("--boot");
  const token = await ensureToken({
    configDir: CFG,
    ebrainHome: EBRAIN_HOME,
    mode: boot ? "boot" : "up",
    allowAuthCreate: boot,
    allowAdminMint: !boot,
    baseUrl: baseUrl(),
  });
  if (!quiet) console.log(`ebrain token: ready (${token.source})`);
}

async function cmdUp(args: string[]): Promise<void> {
  const json = args.includes("--json");
  ensureDirs();

  const wasHealthy = await healthCheck(healthUrl(port()), 3_000);
  if (!wasHealthy) {
    await startDaemon();
    if (!(await waitForDaemon())) throw new Error("daemon did not become healthy on :8541");
  }

  const token = await tokenForOnboard();
  const smoke = await toolsListSmoke(mcpUrl(port()), token);
  const results = await onboardAgents([...DEFAULT_AGENTS], token);
  const payload = {
    daemon: { state: "up", url: mcpUrl(port()), already_running: wasHealthy },
    token: { store: tokenStorePaths(CFG).tokenFile, env: EBRAIN_MCP_TOKEN_ENV },
    smoke,
    onboard: results,
  };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`ebrain up: daemon UP · ${mcpUrl(port())}`);
    console.log(`  token: ${EBRAIN_MCP_TOKEN_ENV} ready (${tokenStorePaths(CFG).tokenFile})`);
    console.log(smoke.ok ? `  smoke: tools/list ok (${smoke.tools} tools)` : `  smoke: warning ${smoke.message}`);
    console.log("  onboard:");
    printOnboard(results, false);
  }
  if (results.some((r) => r.status === "failed")) process.exit(1);
}

async function main(): Promise<void> {
  const [cmd = "up", ...args] = process.argv.slice(2);
  try {
    switch (cmd) {
      case "up":
        await cmdUp(args);
        break;
      case "onboard":
        await cmdOnboard(args);
        break;
      case "ensure-token":
        await cmdEnsureToken(args);
        break;
      default:
        throw new Error(`unknown subcommand '${cmd}'`);
    }
  } catch (e) {
    console.error(`ebrain ${cmd}: ${redactSecrets(e instanceof Error ? e.message : String(e))}`);
    process.exit(1);
  }
}

if (import.meta.main) main();
