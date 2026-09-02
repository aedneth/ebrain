#!/usr/bin/env bun
/**
 * cli/hooks-wire.ts — wire an adapter's hooks into the agent's runtime config.
 *
 * `harness/core/install.sh` wrote the hook wrappers to disk and then *checked* whether they were
 * referenced from the agent's config, printing "hook ⚠ NOT wired — add an entry yourself" when
 * they were not. For the non-security hooks that is merely friction. For `guard-secrets.sh` it is
 * the product's main safety control sitting on disk, inert, behind a JSON edit the user has to
 * perform by hand and get exactly right. A guard that is installed but not wired protects nothing,
 * and nothing on screen distinguishes that state from a working one after the first scroll.
 *
 * So installation wires it. The rules are the ones any tool editing a file it does not own must
 * follow:
 *
 *  - **Additive.** Other hooks — the user's own, another tool's — are never touched, reordered or
 *    dropped. Only eBrain's own entries are added.
 *  - **Idempotent.** Presence is matched on the wrapper's PATH, not on the exact command string,
 *    so an entry the user wrote as `bash /path/hook.sh` is recognised as already wired and is not
 *    duplicated into a second invocation on every install.
 *  - **Reversible.** One pre-eBrain backup is kept the first time, and the write is atomic.
 *  - **Honest.** A config that cannot be parsed is not rewritten; it is reported.
 *
 * Only one config format exists across the shipped adapters (`claude-json`), in two nestings:
 * Claude keeps its events under a top-level `hooks` key, Codex and Gemini keep them at the root.
 * The manifest says which.
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync, chmodSync, renameSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { expandPath } from "./mcp-manifest.ts";
import { resolveEbrainHome } from "./ebrain-home.ts";

export interface WrapperSpec {
  file: string;
  core: string;
  /** Manifest event key, e.g. `pre_tool_use`. */
  event: string;
  /** Which tool calls the hook applies to. Empty means "all". */
  matcher: string;
}

export interface HooksSpec {
  agent: string;
  format: "claude-json" | "none";
  configPath: string | null;
  hooksDir: string | null;
  /** Manifest event key -> the runtime's own event name. */
  events: Record<string, string>;
  /** Top-level key the events nest under, or null when they sit at the root. */
  root: string | null;
  wrappers: WrapperSpec[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseHooksBlock(agent: string, manifest: unknown, home = homedir()): HooksSpec {
  const none: HooksSpec = { agent, format: "none", configPath: null, hooksDir: null, events: {}, root: null, wrappers: [] };
  if (!isRecord(manifest) || !isRecord(manifest.hooks)) return none;
  const hooks = manifest.hooks;
  if (hooks.format !== "claude-json") return none;

  const events: Record<string, string> = {};
  if (isRecord(hooks.events)) {
    for (const [key, value] of Object.entries(hooks.events)) {
      if (typeof value === "string" && value.length > 0) events[key] = value;
    }
  }

  const wrappers: WrapperSpec[] = [];
  if (Array.isArray(hooks.wrappers)) {
    for (const entry of hooks.wrappers) {
      if (!isRecord(entry)) continue;
      const { file, core, event, matcher } = entry;
      if (typeof file !== "string" || typeof core !== "string" || typeof event !== "string") continue;
      wrappers.push({ file, core, event, matcher: typeof matcher === "string" ? matcher : "" });
    }
  }

  return {
    agent,
    format: "claude-json",
    configPath: typeof hooks.config === "string" && hooks.config.length > 0 ? expandPath(hooks.config, home) : null,
    hooksDir: typeof hooks.dir === "string" && hooks.dir.length > 0 ? expandPath(hooks.dir, home) : null,
    events,
    root: typeof hooks.root === "string" && hooks.root.length > 0 ? hooks.root : null,
    wrappers,
  };
}

export interface WireOutcome {
  next: Record<string, unknown>;
  /** Wrappers newly added by this call. */
  added: string[];
  /** Wrappers that were already wired, by any spelling of the command. */
  present: string[];
  /** Wrappers whose manifest event is not mapped by this adapter. */
  unmapped: string[];
}

/** The command eBrain writes for a new entry. `bash <path>` runs regardless of the exec bit. */
export function hookCommand(path: string): string {
  return `bash ${path}`;
}

function eventEntries(node: unknown): Record<string, unknown>[] {
  return Array.isArray(node) ? node.filter(isRecord) : [];
}

/**
 * Every way a command may name this wrapper. Hook commands run through a shell, so a user who
 * wrote `~/.claude/hooks/guard.sh` or `$HOME/.claude/hooks/guard.sh` has a working hook; matching
 * only the expanded absolute path would call it "not wired" and append a second copy on every
 * install — the exact duplication the idempotency rule exists to prevent.
 */
export function wrapperSpellings(wrapperPath: string, home: string): string[] {
  const spellings = [wrapperPath];
  const prefix = home.replace(/\/+$/, "");
  if (prefix && wrapperPath.startsWith(`${prefix}/`)) {
    const relative = wrapperPath.slice(prefix.length);
    spellings.push(`~${relative}`, `$HOME${relative}`, `\${HOME}${relative}`);
  }
  return spellings;
}

/** Is this wrapper already referenced anywhere under this event, however the user spelled it? */
function alreadyWired(entries: Record<string, unknown>[], spellings: readonly string[]): boolean {
  return entries.some((entry) => {
    const inner = Array.isArray(entry.hooks) ? entry.hooks : [];
    return inner.some((hook) =>
      isRecord(hook) && typeof hook.command === "string" && spellings.some((spelling) => (hook.command as string).includes(spelling)),
    );
  });
}

/**
 * Merge eBrain's hook entries into an existing config object. Pure: the caller writes the result.
 */
export function mergeHookConfig(current: Record<string, unknown>, spec: HooksSpec, home = homedir()): WireOutcome {
  const added: string[] = [];
  const present: string[] = [];
  const unmapped: string[] = [];
  if (spec.format !== "claude-json" || !spec.hooksDir) {
    return { next: current, added, present, unmapped: spec.wrappers.map((w) => w.file) };
  }

  // Work on the level the events actually live at, then put it back where it came from.
  const rootKey = spec.root;
  const container: Record<string, unknown> = rootKey
    ? (isRecord(current[rootKey]) ? { ...(current[rootKey] as Record<string, unknown>) } : {})
    : { ...current };

  for (const wrapper of spec.wrappers) {
    const runtimeEvent = spec.events[wrapper.event];
    if (!runtimeEvent) {
      // A wrapper whose event this runtime does not expose (the generic adapter's `manual` and
      // `git-post-commit` entries) is not a failure — it is simply not a runtime hook.
      unmapped.push(wrapper.file);
      continue;
    }
    const wrapperPath = join(spec.hooksDir, wrapper.file);
    const entries = eventEntries(container[runtimeEvent]);
    if (alreadyWired(entries, wrapperSpellings(wrapperPath, home))) {
      present.push(wrapper.file);
      continue;
    }
    container[runtimeEvent] = [
      ...entries,
      { matcher: wrapper.matcher, hooks: [{ type: "command", command: hookCommand(wrapperPath) }] },
    ];
    added.push(wrapper.file);
  }

  const next = rootKey ? { ...current, [rootKey]: container } : container;
  return { next, added, present, unmapped };
}

/** Read a JSON object, refusing to guess at a file we cannot parse. */
export function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed)) throw new Error(`${path} is not a JSON object; refusing to rewrite it`);
  return parsed;
}

/** Atomic write, keeping one pre-eBrain backup and writing through a symlink rather than over it. */
export function writeJson(path: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let target = path;
  try { target = realpathSync(path); } catch { /* not yet a file; write where asked */ }
  const backup = `${target}.ebrain-backup`;
  if (existsSync(target) && !existsSync(backup)) {
    copyFileSync(target, backup);
    chmodSync(backup, 0o600);
  }
  const temp = `${target}.ebrain-tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, target);
}

export interface WireReport extends WireOutcome {
  agent: string;
  configPath: string | null;
  applied: boolean;
  error?: string;
}

export function wireAgent(spec: HooksSpec, apply: boolean): WireReport {
  if (spec.format === "none" || !spec.configPath) {
    return { agent: spec.agent, configPath: spec.configPath, applied: false, next: {}, added: [], present: [], unmapped: [] };
  }
  let current: Record<string, unknown>;
  try {
    current = readJson(spec.configPath);
  } catch (error) {
    return {
      agent: spec.agent,
      configPath: spec.configPath,
      applied: false,
      next: {},
      added: [],
      present: [],
      unmapped: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const outcome = mergeHookConfig(current, spec);
  if (apply && outcome.added.length > 0) {
    writeJson(spec.configPath, outcome.next);
    return { ...outcome, agent: spec.agent, configPath: spec.configPath, applied: true };
  }
  return { ...outcome, agent: spec.agent, configPath: spec.configPath, applied: false };
}

function loadSpec(agent: string, home = homedir()): HooksSpec | null {
  const dir = process.env.EBRAIN_ADAPTERS_DIR || join(resolveEbrainHome(), "harness", "adapters");
  const file = join(dir, agent, "manifest.yaml");
  if (!existsSync(file)) return null;
  const manifest = (Bun as unknown as { YAML: { parse: (t: string) => unknown } }).YAML.parse(readFileSync(file, "utf8"));
  return parseHooksBlock(agent, manifest, home);
}

function main(): void {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const apply = argv.includes("--apply");
  const agent = argv.find((arg) => !arg.startsWith("--"));
  if (!agent) {
    console.error("usage: ebrain hooks-wire <agent> [--apply] [--json]");
    process.exit(2);
  }
  const spec = loadSpec(agent);
  if (!spec) {
    console.error(`error: no adapter manifest for '${agent}'`);
    process.exit(2);
  }
  const report = wireAgent(spec, apply);
  if (json) {
    const { next: _next, ...rest } = report;
    console.log(JSON.stringify(rest, null, 2));
    process.exit(report.error ? 1 : 0);
  }

  if (spec.format === "none") {
    console.log(`  hooks: ${agent} has no runtime hook interception (guard is advisory)`);
    return;
  }
  if (report.error) {
    console.log(`  hook ⚠ could not read ${report.configPath}: ${report.error}`);
    process.exit(1);
  }
  for (const file of report.present) console.log(`  hook ✓ '${file}' wired in ${report.configPath}`);
  for (const file of report.added) {
    console.log(report.applied ? `  hook ✓ '${file}' WIRED into ${report.configPath}` : `  hook ⚠ '${file}' not wired — run 'ebrain harness install ${agent}'`);
  }
  for (const file of report.unmapped) console.log(`  hook · '${file}' has no runtime event on this agent (invoked directly)`);
  // A wrapper we could not wire is the security control sitting inert; that is a red check.
  if (!report.applied && report.added.length > 0) process.exit(1);
}

if (import.meta.main) main();
