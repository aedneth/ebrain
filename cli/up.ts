#!/usr/bin/env bun
/**
 * ebrain up / onboard — plug-and-play daemon cutover.
 *
 * Goal: the user never handles OAuth, bearer tokens, curl probes, or PGLite locks.
 * `ebrain up` starts the shared HTTP-MCP daemon, ensures the local agent token,
 * registers detected agents, and smoke-tests the endpoint. `ebrain onboard`
 * re-runs the idempotent registration layer.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, copyFileSync, renameSync, realpathSync } from "fs";
import { access } from "fs/promises";
import { constants } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { resolveEbrainHome } from "./ebrain-home.ts";
import { bridgeCommandConfig, bridgeCommandPath } from "./bridge-path.ts";
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
import { ensure as ensureDaemon, stop as stopDaemon, logLocation as daemonLogLocation } from "./daemon-control.ts";
import { materialiseDefaults } from "./config-bootstrap.ts";
import { fillArgs, findAgentSpec, mcpEntryFor, onboardableAgents, readAgentMcpSpecs, type AgentMcpSpec } from "./mcp-manifest.ts";

const HOME = homedir();
const EBRAIN_HOME = resolveEbrainHome();
const CFG = join(HOME, ".config", "ebrain");
const MCP_SERVER_NAME = "ebrain";

/**
 * Which agents `ebrain up` onboards is now a property of the adapters on disk, not a list in this
 * file. Dropping in `harness/adapters/pi/manifest.yaml` is enough for `ebrain onboard pi` to work,
 * which is what every other consumer of the manifests already assumed.
 */
function onboardableAgentNames(): string[] {
  return onboardableAgents(readAgentMcpSpecs()).map((spec) => spec.agent);
}

/** Every adapter, including those with no MCP surface — the set a user may legitimately name. */
function allAgentNames(): string[] {
  return readAgentMcpSpecs().map((spec) => spec.agent);
}

export type OnboardAgent = string;
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

export function parseOnboardTarget(args: string[], known = allAgentNames(), onboardable = onboardableAgentNames()): OnboardAgent[] {
  if (args.length === 0 || args.includes("--all")) return [...onboardable];
  const target = args.find((a) => !a.startsWith("--"));
  if (!target || target === "all") return [...onboardable];
  if (!known.includes(target)) {
    throw new Error(`unknown agent '${target}'. Use --all or one of: ${known.join(", ")}`);
  }
  return [target];
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

/**
 * The registration command for an agent that owns its own MCP registry, built from its manifest.
 *
 * eBrain runs `<binary> mcp add …` rather than writing into a file the agent manages, so the agent
 * stays the authority on its own config format. The token never appears in argv — the bridge reads
 * it from the 0600 store at call time — which is why `tokenInArgv` is false for every spec here.
 */
export function commandForAgent(
  agent: OnboardAgent,
  token: string,
  url = mcpUrl(port()),
  bridge = bridgeCommandPath(EBRAIN_HOME),
  spec = findAgentSpec(agent),
): CommandSpec | null {
  void token;
  void url;
  if (!spec || spec.method !== "cli" || !spec.binary || spec.addArgs.length === 0) return null;
  return {
    binary: spec.binary,
    tokenInArgv: false,
    args: fillArgs(spec.addArgs, { name: MCP_SERVER_NAME, bridge }),
  };
}

export function removalCommandForAgent(
  agent: OnboardAgent,
  spec = findAgentSpec(agent),
  bridge = bridgeCommandPath(EBRAIN_HOME),
): CommandSpec | null {
  if (!spec || spec.method !== "cli" || !spec.binary || spec.removeArgs.length === 0) return null;
  return {
    binary: spec.binary,
    tokenInArgv: false,
    args: fillArgs(spec.removeArgs, { name: MCP_SERVER_NAME, bridge }),
  };
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

/**
 * Did an agent CLI refuse the add only because the name is already taken? That is the one
 * failure a re-registration may resolve by removing first. Every other failure must leave a
 * working registration exactly where it is.
 */
export function looksLikeAlreadyRegistered(output: string): boolean {
  return /already\s+(exists|configured|registered|added)|duplicate\s+server|name\s+is\s+taken/i.test(output);
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

/**
 * Write an agent's config atomically, keeping one pre-eBrain copy.
 *
 * This file is the user's, not ours — it holds every other MCP server they configured. A
 * plain `writeFileSync` truncates first, so a crash or a concurrent onboard mid-write leaves
 * them with a half-written config and no way back. The token store already writes through a
 * temp file and a rename; agent configs deserve the same care, plus a one-time backup taken
 * before eBrain ever modifies them.
 */
function writeJsonObject(path: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Write through a symlink, do not replace it. Plenty of people keep ~/.cursor/mcp.json linked
  // into a dotfiles repo; `rename(2)` onto the link would swap it for a regular file and silently
  // detach them from their own config. Resolving first also keeps the temp file on the same
  // filesystem as the target, which is what makes the rename atomic rather than lucky.
  const target = existsSync(path) ? realpathSync(path) : path;
  const backup = `${target}.ebrain-backup`;
  if (existsSync(target) && !existsSync(backup)) {
    try {
      copyFileSync(target, backup);
      // The backup is a copy of a config eBrain then hardens to 0600; leaving the original's
      // looser mode on it would hand back the permissions the hardening just removed.
      chmodSync(backup, 0o600);
    } catch { /* a missing backup must never block onboarding */ }
  }
  const tmp = `${target}.ebrain-tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, target);
  chmodSync(target, 0o600);
}

function chmodIfExists(path: string, mode: number): void {
  if (!existsSync(path)) return;
  chmodSync(path, mode);
}

function hardenAgentConfig(agent: OnboardAgent, spec = findAgentSpec(agent)): void {
  if (!spec?.configPath) return;
  try { chmodIfExists(spec.configPath, 0o600); } catch { /* best-effort hardening */ }
}

/**
 * Merge eBrain's entry into an agent's JSON config, leaving every neighbouring server untouched.
 *
 * The shape and the key come from the agent's manifest, so this one function replaced a
 * per-agent pair of near-identical merges. `repairs` covers the schema quirks a specific agent
 * has — declared in its manifest rather than inferred here, because a repair applied to the wrong
 * config would be eBrain silently rewriting a file it does not own.
 */
export function mergeMcpConfig(
  current: Record<string, unknown>,
  spec: Pick<AgentMcpSpec, "keys" | "entryShape" | "repairs">,
  bridge = bridgeCommandConfig(bridgeCommandPath(EBRAIN_HOME)),
): Record<string, unknown> {
  const key = spec.keys[0] ?? "mcpServers";
  const existing = current[key] && typeof current[key] === "object" && !Array.isArray(current[key])
    ? current[key] as Record<string, unknown>
    : {};

  let rest: Record<string, unknown> = { ...current };
  const extra: Record<string, unknown> = {};

  // OpenCode's schema requires `instructions` to be an array; a string there makes it reject the
  // whole file, including the server we just added. Normalising it is a repair, not a preference.
  if (spec.repairs.includes("instructions-array")) {
    const { instructions: raw, ...withoutInstructions } = rest;
    rest = withoutInstructions;
    const instructions = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : undefined;
    if (instructions !== undefined) extra.instructions = instructions;
  }

  return {
    ...rest,
    [key]: { ...existing, [MCP_SERVER_NAME]: mcpEntryFor(spec.entryShape, bridge) },
    ...extra,
  };
}

/** Retained for callers and tests that name the agent rather than pass its spec. */
export function mergeCursorMcpConfig(current: Record<string, unknown>, token: string, url = mcpUrl(port())): Record<string, unknown> {
  void token;
  void url;
  return mergeMcpConfig(current, { keys: ["mcpServers"], entryShape: "command-args", repairs: [] });
}

export function mergeOpenCodeMcpConfig(current: Record<string, unknown>, token: string): Record<string, unknown> {
  void token;
  return mergeMcpConfig(current, { keys: ["mcp"], entryShape: "local-command", repairs: ["instructions-array"] });
}

/** Register an agent that has no `mcp add` command, by editing the config its manifest names. */
async function registerViaJsonConfig(spec: AgentMcpSpec, token: string): Promise<OnboardResult> {
  const agent = spec.agent;
  if (!spec.configPath) return { agent, status: "skipped", detail: "manifest declares no config path" };
  if (spec.binary && !(await which(spec.binary))) return { agent, status: "skipped", detail: `${spec.binary} not installed` };
  try {
    const next = mergeMcpConfig(readJsonObject(spec.configPath), spec);
    writeJsonObject(spec.configPath, next);
    hardenAgentConfig(agent, spec);
    return { agent, status: "registered", detail: `${spec.configPath} -> daemon bridge` };
  } catch (e) {
    return { agent, status: "failed", detail: redactSecrets(e instanceof Error ? e.message : String(e), [token]) };
  }
}

async function onboardOne(agent: OnboardAgent, token: string): Promise<OnboardResult> {
  const manifest = findAgentSpec(agent);
  if (!manifest) return { agent, status: "skipped", detail: "no adapter manifest for this agent" };
  if (manifest.method === "none") return { agent, status: "skipped", detail: "this adapter has no native MCP client" };
  if (manifest.method === "json") return registerViaJsonConfig(manifest, token);

  const spec = commandForAgent(agent, token, undefined, undefined, manifest);
  if (!spec) return { agent, status: "skipped", detail: "no registration command" };
  if (!(await which(spec.binary))) return { agent, status: "skipped", detail: `${spec.binary} not installed` };

  // Add first, and only drop an existing entry once a plain add has proved the name is
  // taken. Removing up front made every re-run destructive: if the add then failed for any
  // reason at all, the user was left with no eBrain entry where a working one had been.
  let res = await runAgentCommand(spec, token);
  if (!res.ok && looksLikeAlreadyRegistered(res.detail)) {
    await removeExisting(agent, token);
    res = await runAgentCommand(spec, token);
  }
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

/**
 * The smoke test decides whether `ebrain up` succeeded, so it has to be as patient as the thing
 * it is measuring. A single un-retried 10-second probe turned any transient blip — an engine still
 * warming its tool registry on a slow machine — into a failed installation, because
 * `scripts/install.sh` treats a non-zero `ebrain up` as fatal. The bridge already retries this
 * exact class of failure; the verifier of the install should not be less forgiving than the
 * runtime.
 */
async function smokeWithRetry(token: string, attempts = 3): Promise<Awaited<ReturnType<typeof toolsListSmoke>>> {
  let last = await toolsListSmoke(mcpUrl(port()), token, 20_000);
  for (let attempt = 2; attempt <= attempts && !last.ok; attempt++) {
    await Bun.sleep(1_000 * (attempt - 1));
    last = await toolsListSmoke(mcpUrl(port()), token, 20_000);
  }
  return last;
}

async function cmdUp(args: string[]): Promise<void> {
  const json = args.includes("--json");
  ensureDirs();

  // The user config comes first: `routing.yaml` was read by four call sites and written by none,
  // so a fresh clone could bring the daemon up and still fail on the first `ebrain route`. Doing
  // it before the daemon also means a failure here costs nothing that has to be undone.
  const configs = materialiseDefaults({ configDir: CFG });

  // `ensureDaemon` is the idempotent primitive: healthy already, or started under the shared
  // start lock and confirmed serving before it returns. Going through it rather than spawning
  // the control script means N agents running `ebrain up` at once still produce one host.
  const wasHealthy = await healthCheck(healthUrl(port()), 3_000);
  await ensureDaemon({ quiet: json });

  // A healthy daemon with no token store used to dead-end: the only mint that works without an
  // admin bootstrap token is the one the host performs at boot, before it takes the PGLite lock,
  // and `up` skips the boot when the port already answers. The user was told to "run 'ebrain up'"
  // — by `ebrain up`. Restarting the host runs that boot-time mint, so do it rather than say it.
  //
  // Two guards on that, because a command named `up` must never leave the brain DOWN. The trigger
  // is narrowed to the one failure a restart can actually fix, and if the restart does not take,
  // the host we stopped is brought back before the error propagates.
  let token: string;
  try {
    token = await tokenForOnboard();
  } catch (e) {
    const missingToken = e instanceof Error && e.message.includes(EBRAIN_MCP_TOKEN_ENV);
    if (!wasHealthy || !missingToken) throw e;
    if (!json) console.log("ebrain up: no local token found; restarting the host so it can mint one …");
    await stopDaemon({ quiet: true });
    try {
      await ensureDaemon({ quiet: json });
      token = await tokenForOnboard();
    } catch (restartError) {
      try { await ensureDaemon({ quiet: true }); } catch { /* reported below either way */ }
      throw restartError;
    }
  }
  const smoke = await smokeWithRetry(token);
  const results = await onboardAgents(onboardableAgentNames(), token);
  const payload = {
    daemon: { state: "up", url: mcpUrl(port()), already_running: wasHealthy },
    token: { store: tokenStorePaths(CFG).tokenFile, env: EBRAIN_MCP_TOKEN_ENV },
    config: configs.map(({ name, target, action }) => ({ name, path: target, action })),
    smoke,
    onboard: results,
  };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`ebrain up: daemon UP · ${mcpUrl(port())}`);
    console.log(`  token: ${EBRAIN_MCP_TOKEN_ENV} ready (${tokenStorePaths(CFG).tokenFile})`);
    // A hundredth `ebrain up` should not narrate configs it left alone; a first one must say
    // where the file it just made lives, because the user is about to edit it.
    for (const item of configs) {
      if (item.action !== "kept") console.log(`  config: ${item.detail}`);
    }
    console.log(smoke.ok ? `  smoke: tools/list ok (${smoke.tools} tools)` : `  smoke: FAILED — ${smoke.message}`);
    console.log("  onboard:");
    printOnboard(results, false);
    console.log("  next:");
    console.log(`    ebrain remember "Review database migrations before merge."   save a decision`);
    console.log(`    ebrain q "what must happen before a migration merges?"       recall it`);
    console.log(`    ebrain                                                       open cockpit`);
  }
  // `up` brings the SYSTEM up; `onboard` registers agents. Only the first is fatal here.
  //
  // A failed smoke means the daemon answers but exposes no usable tool surface: the product is
  // not working, and reporting that as success is the silent half-broken install this phase
  // exists to make impossible. A single adapter that would not register is a different thing —
  // the brain is up, the CLI works, and four of five agents are wired — so it is reported
  // loudly with the command that fixes it, and does not fail the install that just succeeded.
  if (!smoke.ok) {
    console.error("ebrain up: the daemon is running but tools/list failed, so agents would have no memory.");
    console.error(`  Check 'ebrain daemon status' and ${daemonLogLocation()}, then run 'ebrain up' again.`);
    process.exit(1);
  }
  const failed = results.filter((r) => r.status === "failed");
  if (failed.length > 0 && !json) {
    console.error(`  note: ${failed.length} agent(s) did not register: ${failed.map((r) => r.agent).join(", ")}`);
    console.error(`  eBrain itself is up. Retry just those with: ebrain onboard <agent>`);
  }
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
