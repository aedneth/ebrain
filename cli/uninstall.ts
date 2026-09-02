#!/usr/bin/env bun
/**
 * cli/uninstall.ts — remove eBrain from this machine, completely and visibly.
 *
 * An install writes into five agent configs, $HOME, a service manager and PATH. Until this
 * existed there was no way to undo any of it: a user trying eBrain out had to reverse-engineer
 * the installer to get their machine back, which is its own argument against trying it.
 *
 * Two rules shape the design.
 *
 *  1. The brain is not ours to delete. `~/.gbrain` holds everything the user ever asked eBrain
 *     to remember, and it long outlives any single checkout. Uninstalling leaves it exactly
 *     where it is unless `--purge` is passed, and says so.
 *  2. Destructive commands state their plan and require `--yes`, the same contract
 *     `ebrain sessions kill` already follows. A bare `ebrain uninstall` removes nothing.
 */
import { existsSync, rmSync, readFileSync, writeFileSync, chmodSync, renameSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { redactSecrets } from "./mcp-token.ts";
import { serviceManager, uninstallService, stop as stopDaemon, SERVICE_LABEL, LAUNCHD_LABEL } from "./daemon-control.ts";
import { fillArgs, readAgentMcpSpecs, type AgentMcpSpec } from "./mcp-manifest.ts";

const HOME = homedir();
const CFG = join(HOME, ".config", "ebrain");
const MCP_SERVER_NAME = "ebrain";

export type ActionKind = "daemon" | "service" | "agent-cli" | "agent-config" | "path" | "config" | "timer" | "brain";

export interface PlanItem {
  kind: ActionKind;
  label: string;
  /** What is touched — a path, or a command that will be run. */
  target: string;
  present: boolean;
  /** Only performed with --purge. */
  purgeOnly?: boolean;
}

/**
 * Which agents to undo, read from the same manifests that decided how to register them.
 *
 * An uninstall that knows less than the install is an uninstall that leaves things behind, so
 * these are derived rather than restated: an agent onboarded because its manifest said so is
 * removed for exactly the same reason.
 */
function cliAgents(): AgentMcpSpec[] {
  return readAgentMcpSpecs().filter((spec) => spec.method === "cli" && spec.binary !== null && spec.removeArgs.length > 0);
}

function configAgents(): AgentMcpSpec[] {
  return readAgentMcpSpecs().filter((spec) => spec.method === "json" && spec.configPath !== null);
}

function binDir(): string {
  return process.env.EBRAIN_BIN_DIR || join(HOME, ".local", "bin");
}

/**
 * Everything an install leaves behind, whether or not it is currently present. Listing absent
 * items too is deliberate: the plan doubles as the answer to "what did this put on my machine?"
 */
export function uninstallPlan(): PlanItem[] {
  const items: PlanItem[] = [];
  const mgr = serviceManager();

  items.push({ kind: "daemon", label: "stop the shared-brain host", target: "ebrain daemon stop", present: true });

  items.push({
    kind: "service",
    label: "remove the supervision unit",
    target: mgr === "launchd" ? join(HOME, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`) : join(HOME, ".config", "systemd", "user", `${SERVICE_LABEL}.service`),
    present: mgr !== "none",
  });

  for (const spec of cliAgents()) {
    items.push({
      kind: "agent-cli",
      label: `unregister the MCP server from ${spec.agent}`,
      target: [spec.binary, ...fillArgs(spec.removeArgs, { name: MCP_SERVER_NAME, bridge: "" })].join(" "),
      present: true,
    });
  }

  for (const spec of configAgents()) {
    items.push({
      kind: "agent-config",
      label: `remove the '${MCP_SERVER_NAME}' entry from ${spec.agent}'s config`,
      target: spec.configPath!,
      present: existsSync(spec.configPath!),
    });
  }

  for (const unit of ["ebrain-dream.service", "ebrain-dream.timer"]) {
    const p = join(HOME, ".config", "systemd", "user", unit);
    items.push({ kind: "timer", label: `remove the nightly ${unit}`, target: p, present: existsSync(p) });
  }

  const launcher = join(binDir(), "ebrain");
  items.push({ kind: "path", label: "remove the launcher from PATH", target: launcher, present: existsSync(launcher) });

  items.push({
    kind: "config",
    // Name what is actually in there. "eBrain's own config" reads as disposable scaffolding, but
    // this directory also holds the dotenv the user pasted their provider keys into and their
    // spend ledger — the surprising deletion in the original wording, and the one that made the
    // protected brain store look inconsistent beside it.
    label: "remove ~/.config/ebrain — token store, launcher copies, logs, skills, AND your routing.yaml, your spend ledger and the provider API keys in its dotenv",
    target: CFG,
    present: existsSync(CFG),
  });

  for (const spec of configAgents()) {
    const backup = `${spec.configPath}.ebrain-backup`;
    items.push({
      kind: "agent-config",
      label: `remove the pre-eBrain backup of ${spec.agent}'s config`,
      target: backup,
      present: existsSync(backup),
    });
  }

  const brain = join(process.env.GBRAIN_HOME || HOME, ".gbrain");
  items.push({
    kind: "brain",
    label: "DELETE the brain store — everything eBrain ever remembered",
    target: brain,
    present: existsSync(brain),
    purgeOnly: true,
  });

  return items;
}

/** Drop eBrain's server from an agent config without disturbing the servers around it. */
export function removeServerFromConfig(current: Record<string, unknown>, keys: string | readonly string[]): Record<string, unknown> {
  // An agent may hold its servers under more than one key across versions; drop ours from each
  // one that is actually present, so an upgrade does not leave a stale entry behind.
  let next = current;
  for (const key of typeof keys === "string" ? [keys] : keys) {
    const map = next[key];
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    const { [MCP_SERVER_NAME]: _removed, ...rest } = map as Record<string, unknown>;
    next = { ...next, [key]: rest };
  }
  return next;
}

function rewriteJson(file: string, keys: readonly string[]): boolean {
  if (!existsSync(file)) return false;
  let parsed: Record<string, unknown>;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    parsed = raw as Record<string, unknown>;
  } catch {
    // A config we cannot parse is a config we must not rewrite.
    return false;
  }
  const next = removeServerFromConfig(parsed, keys);
  const tmp = `${file}.ebrain-tmp-${process.pid}`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
  return true;
}

function run(cmd: string[]): boolean {
  return Bun.spawnSync(cmd, { stdout: "ignore", stderr: "ignore" }).exitCode === 0;
}

function onPath(binary: string): boolean {
  return Bun.spawnSync(["sh", "-c", `command -v ${binary}`], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;
}

export interface UninstallOutcome {
  done: string[];
  skipped: string[];
  kept: string[];
}

export async function performUninstall(opts: { purge: boolean }): Promise<UninstallOutcome> {
  const done: string[] = [];
  const skipped: string[] = [];
  const kept: string[] = [];

  // The service first: stopping the host while a supervisor is watching only restarts it.
  const mgr = serviceManager();
  if (mgr !== "none") {
    const res = uninstallService();
    if (res.removed) done.push(`supervision unit removed (${res.path})`);
  }
  try {
    await stopDaemon({ quiet: true });
    done.push("shared-brain host stopped");
  } catch {
    skipped.push("could not stop the host; it may already be down");
  }

  for (const spec of cliAgents()) {
    if (!onPath(spec.binary!)) { skipped.push(`${spec.agent} is not installed`); continue; }
    const argv = [spec.binary!, ...fillArgs(spec.removeArgs, { name: MCP_SERVER_NAME, bridge: "" })];
    if (run(argv)) done.push(`unregistered from ${spec.agent}`);
    else skipped.push(`${spec.agent} had no '${MCP_SERVER_NAME}' entry to remove`);
  }

  for (const spec of configAgents()) {
    const file = spec.configPath!;
    if (rewriteJson(file, spec.keys)) done.push(`removed the '${MCP_SERVER_NAME}' entry from ${spec.agent} (${file})`);
    else skipped.push(`${spec.agent}: nothing to change`);
    // The backups eBrain made of these files are eBrain's litter, so uninstall clears them too.
    const backup = `${file}.ebrain-backup`;
    if (existsSync(backup)) {
      rmSync(backup, { force: true });
      done.push(`removed the pre-eBrain backup ${backup}`);
    }
  }

  for (const unit of ["ebrain-dream.timer", "ebrain-dream.service"]) {
    const p = join(HOME, ".config", "systemd", "user", unit);
    if (!existsSync(p)) continue;
    run(["systemctl", "--user", "disable", "--now", unit]);
    rmSync(p, { force: true });
    done.push(`removed ${unit}`);
  }
  if (existsSync(join(HOME, ".config", "systemd", "user"))) run(["systemctl", "--user", "daemon-reload"]);

  const launcher = join(binDir(), "ebrain");
  if (existsSync(launcher)) {
    rmSync(launcher, { force: true });
    done.push(`removed the launcher (${launcher})`);
  }

  if (existsSync(CFG)) {
    rmSync(CFG, { recursive: true, force: true });
    done.push(`removed ${CFG}`);
  }

  const brain = join(process.env.GBRAIN_HOME || HOME, ".gbrain");
  if (opts.purge) {
    if (existsSync(brain)) {
      rmSync(brain, { recursive: true, force: true });
      done.push(`PURGED the brain store (${brain})`);
    }
  } else if (existsSync(brain)) {
    kept.push(`the brain store is untouched at ${brain} — remove it yourself, or re-run with --purge`);
  }

  kept.push("this checkout was not deleted; remove the directory if you no longer want it");
  return { done, skipped, kept };
}

function printPlan(items: PlanItem[], purge: boolean): void {
  console.log("ebrain uninstall — this is what would be removed:\n");
  for (const item of items) {
    if (item.purgeOnly && !purge) continue;
    const mark = item.present ? "×" : "·";
    console.log(`  ${mark} ${item.label}`);
    console.log(`      ${item.target}${item.present ? "" : "   (not present)"}`);
  }
  if (!purge) {
    console.log("\n  The brain store is KEPT. Everything eBrain remembered stays on disk.");
    console.log("  Add --purge to delete it too — that cannot be undone.");
  }
  console.log("\n  Nothing has been removed. Re-run with --yes to proceed:");
  console.log(`    ebrain uninstall --yes${purge ? " --purge" : ""}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const purge = argv.includes("--purge");
  const yes = argv.includes("--yes");
  const dryRun = argv.includes("--dry-run");

  const plan = uninstallPlan();

  if (!yes || dryRun) {
    if (json) console.log(JSON.stringify({ plan, purge, applied: false }, null, 2));
    else printPlan(plan, purge);
    return;
  }

  const outcome = await performUninstall({ purge });
  if (json) {
    console.log(JSON.stringify({ ...outcome, purge, applied: true }, null, 2));
    return;
  }
  console.log("ebrain uninstall:");
  for (const line of outcome.done) console.log(`  done  ${line}`);
  for (const line of outcome.skipped) console.log(`  skip  ${line}`);
  for (const line of outcome.kept) console.log(`  kept  ${line}`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`ebrain uninstall: ${redactSecrets(e instanceof Error ? e.message : String(e))}`);
    process.exit(1);
  });
}
