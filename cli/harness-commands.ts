#!/usr/bin/env bun
/**
 * cli/harness-commands.ts — the command surface: one canonical catalog, rendered into every agent.
 *
 * eBrain's primitives were reachable from an agent only when the agent was told to reach for them:
 * `ebrain remember` is a shell command, the MCP tools answer when queried, and a skill is read when
 * something asks for it. Nothing in any harness let the person at the keyboard type one thing and
 * have the agent do the right thing with memory. Every supported CLI does have a place for that —
 * a directory of user-defined command files it loads as slash commands — but each has its own path,
 * file shape and argument placeholder, and until now eBrain wrote to none of them.
 *
 * So the manifest declares the convention (`commands:`), the catalog under `harness/commands/`
 * states each command once, and this module renders the catalog into the agent's directory:
 *
 *  - **One source.** A command's text lives in one Markdown file; the per-agent differences
 *    (frontmatter keys, TOML versus Markdown, `$ARGUMENTS` versus `{{args}}`) are data in the
 *    manifest, not copies of the prose.
 *  - **Idempotent.** A rendered file is compared to what is on disk; an identical file is left
 *    alone, a drifted one that eBrain wrote is refreshed.
 *  - **Never a clobber.** A file at the same path that does not carry the `ebrain-managed:`
 *    marker is the user's own command. It is reported and never rewritten or removed.
 *  - **Removable.** `ebrain uninstall` removes exactly the marked files, nothing beside them.
 *
 * The commands are a convenience layer. The `ebrain` CLI and the MCP tools are the primitives, and
 * an adapter with no command-file convention (the generic floor) simply has none of these files.
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { adaptersDir, expandPath } from "./mcp-manifest.ts";
import { resolveEbrainHome } from "./ebrain-home.ts";

export type CommandFormat = "markdown" | "toml" | "none";
export type FrontmatterKey = "description" | "argument-hint";
/** How the on-disk convention was confirmed: the agent's documentation, or its own CLI bundle. */
export type CommandVerification = "docs" | "binary";

export interface CommandsSpec {
  agent: string;
  format: CommandFormat;
  /** The user-level directory the agent loads command files from, or null when it has none. */
  dir: string | null;
  /** Frontmatter keys this agent understands. Markdown only; anything else is left out. */
  frontmatter: FrontmatterKey[];
  /** The placeholder the agent substitutes with what the user typed after the command. */
  args: string;
  /** How the user invokes a command; `{name}` stands for the command name. */
  invoke: string;
  verified: CommandVerification | null;
}

export interface CommandDefinition {
  name: string;
  description: string;
  argumentHint: string;
  /** Markdown body with `{{ARGUMENTS}}` and `{{AGENT}}` still unsubstituted. */
  body: string;
}

export type CommandFileState = "missing" | "current" | "stale" | "foreign";

export interface CommandPlanItem {
  name: string;
  /** The command as the user types it in this agent. */
  invoke: string;
  path: string;
  state: CommandFileState;
}

export interface CommandsReport {
  agent: string;
  format: CommandFormat;
  dir: string | null;
  verified: CommandVerification | null;
  items: CommandPlanItem[];
  /** Files written by this call (missing or stale ones, when applying). */
  written: string[];
  applied: boolean;
}

/** Every rendered file carries this, so eBrain can tell its own files from a user's. */
export const MANAGED_MARKER = "ebrain-managed:";
export const COMMAND_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const ARGUMENTS_PLACEHOLDER = "{{ARGUMENTS}}";
const AGENT_PLACEHOLDER = "{{AGENT}}";
const FRONTMATTER_KEYS: readonly FrontmatterKey[] = ["description", "argument-hint"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function noCommands(agent: string): CommandsSpec {
  return { agent, format: "none", dir: null, frontmatter: [], args: "", invoke: "", verified: null };
}

/** Read the `commands:` block of a manifest. Absent or unusable means "no command surface". */
export function parseCommandsBlock(agent: string, manifest: unknown, home = homedir()): CommandsSpec {
  if (!isRecord(manifest) || !isRecord(manifest.commands)) return noCommands(agent);
  const block = manifest.commands;
  const format = block.format;
  if (format !== "markdown" && format !== "toml") return noCommands(agent);
  if (typeof block.dir !== "string" || block.dir.length === 0) return noCommands(agent);
  if (typeof block.args !== "string" || block.args.length === 0) return noCommands(agent);
  if (typeof block.invoke !== "string" || block.invoke.length === 0) return noCommands(agent);
  const frontmatter: FrontmatterKey[] = [];
  if (Array.isArray(block.frontmatter)) {
    for (const key of block.frontmatter) {
      if (FRONTMATTER_KEYS.includes(key as FrontmatterKey) && !frontmatter.includes(key as FrontmatterKey)) frontmatter.push(key as FrontmatterKey);
    }
  }
  return {
    agent,
    format,
    dir: expandPath(block.dir, home),
    frontmatter,
    args: block.args,
    invoke: block.invoke,
    verified: block.verified === "docs" || block.verified === "binary" ? block.verified : null,
  };
}

export function commandsCatalogDir(ebrainHome = resolveEbrainHome()): string {
  return process.env.EBRAIN_COMMANDS_DIR || join(ebrainHome, "harness", "commands");
}

function parseFrontmatter(text: string): { meta: Record<string, unknown>; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text.trim() };
  let meta: unknown = {};
  try {
    meta = (Bun as unknown as { YAML: { parse: (source: string) => unknown } }).YAML.parse(match[1]!);
  } catch {
    meta = {};
  }
  return { meta: isRecord(meta) ? meta : {}, body: match[2]!.trim() };
}

/**
 * The catalog: one command per `*.md` under `harness/commands/`. A file that is not a command (the
 * README, a name that is not a slug, a missing description) is skipped rather than rendered into
 * five agents as a broken prompt.
 */
export function loadCommandCatalog(dir = commandsCatalogDir()): CommandDefinition[] {
  if (!existsSync(dir)) return [];
  const out: CommandDefinition[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const name = entry.name.slice(0, -".md".length);
    if (!COMMAND_NAME.test(name)) continue;
    const { meta, body } = parseFrontmatter(readFileSync(join(dir, entry.name), "utf8"));
    const description = typeof meta.description === "string" ? meta.description.trim() : "";
    if (!description || !body) continue;
    const argumentHint = typeof meta["argument-hint"] === "string" ? meta["argument-hint"].trim() : "";
    out.push({ name, description, argumentHint, body });
  }
  return out;
}

function markerLine(agent: string, name: string): string {
  return `${MANAGED_MARKER} generated by \`ebrain harness install ${agent}\` from harness/commands/${name}.md — edit the source, not this file.`;
}

/** A TOML basic multi-line string body: backslashes and triple quotes are the only things to escape. */
export function tomlMultiline(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"""/g, '""\\"');
}

function tomlString(text: string): string {
  return JSON.stringify(text);
}

/** Substitute the two placeholders. Everything else in the body is the command's own text. */
export function substitutePlaceholders(body: string, spec: CommandsSpec): string {
  return body.replaceAll(ARGUMENTS_PLACEHOLDER, spec.args).replaceAll(AGENT_PLACEHOLDER, spec.agent);
}

/** The exact file eBrain writes for one command into one agent. Pure. */
export function renderCommandFile(def: CommandDefinition, spec: CommandsSpec): string {
  if (spec.format === "none") throw new Error(`${spec.agent} declares no command surface`);
  const body = substitutePlaceholders(def.body, spec);
  if (spec.format === "toml") {
    return [
      `# ${markerLine(spec.agent, def.name)}`,
      `description = ${tomlString(def.description)}`,
      'prompt = """',
      tomlMultiline(body),
      '"""',
      "",
    ].join("\n");
  }
  const lines: string[] = [];
  if (spec.frontmatter.length > 0) {
    lines.push("---");
    for (const key of spec.frontmatter) {
      const value = key === "description" ? def.description : def.argumentHint;
      if (value) lines.push(`${key}: ${JSON.stringify(value)}`);
    }
    lines.push("---");
  }
  lines.push(`<!-- ${markerLine(spec.agent, def.name)} -->`, "", body, "");
  return lines.join("\n");
}

export function commandFilePath(spec: CommandsSpec, name: string): string {
  if (!spec.dir || spec.format === "none") throw new Error(`${spec.agent} declares no command surface`);
  return join(spec.dir, `${name}.${spec.format === "toml" ? "toml" : "md"}`);
}

/** What is at the path: nothing, our current render, our drifted render, or someone else's file. */
export function inspectCommandFile(path: string, rendered: string): CommandFileState {
  if (!existsSync(path)) return "missing";
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return "foreign";
  }
  if (!text.includes(MANAGED_MARKER)) return "foreign";
  return text === rendered ? "current" : "stale";
}

export function planCommands(spec: CommandsSpec, catalog: CommandDefinition[]): CommandPlanItem[] {
  if (spec.format === "none" || !spec.dir) return [];
  return catalog.map((def) => {
    const path = commandFilePath(spec, def.name);
    return { name: def.name, invoke: spec.invoke.replace("{name}", def.name), path, state: inspectCommandFile(path, renderCommandFile(def, spec)) };
  });
}

/** Atomic write, through a symlink rather than over it, so a dotfiles-managed directory survives. */
function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  let target = path;
  try {
    target = realpathSync(path);
  } catch {
    /* not yet a file; write where asked */
  }
  const temp = `${target}.ebrain-tmp-${process.pid}`;
  writeFileSync(temp, text, { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, target);
}

/**
 * Render the catalog into the agent's directory. Without `apply` this is a report; with it, missing
 * and stale files are written. A foreign file is never touched in either mode.
 */
export function installCommands(spec: CommandsSpec, catalog: CommandDefinition[], apply: boolean): CommandsReport {
  const items = planCommands(spec, catalog);
  const written: string[] = [];
  if (apply) {
    for (const item of items) {
      if (item.state !== "missing" && item.state !== "stale") continue;
      const def = catalog.find((candidate) => candidate.name === item.name)!;
      writeAtomic(item.path, renderCommandFile(def, spec));
      written.push(item.path);
      item.state = "current";
    }
  }
  return { agent: spec.agent, format: spec.format, dir: spec.dir, verified: spec.verified, items, written, applied: apply && written.length > 0 };
}

/** Remove the files eBrain wrote. A foreign file at one of our paths is kept and named. */
export function removeCommands(spec: CommandsSpec, catalog: CommandDefinition[]): { removed: string[]; kept: string[] } {
  const removed: string[] = [];
  const kept: string[] = [];
  for (const item of planCommands(spec, catalog)) {
    if (item.state === "missing") continue;
    if (item.state === "foreign") {
      kept.push(item.path);
      continue;
    }
    rmSync(item.path, { force: true });
    removed.push(item.path);
  }
  return { removed, kept };
}

/** Every adapter's command spec, read from the same manifests that declare everything else. */
export function readCommandSpecs(dir = adaptersDir(), home = homedir()): CommandsSpec[] {
  if (!existsSync(dir)) return [];
  const specs: CommandsSpec[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const file = join(dir, entry.name, "manifest.yaml");
    if (!existsSync(file)) continue;
    try {
      const manifest = (Bun as unknown as { YAML: { parse: (text: string) => unknown } }).YAML.parse(readFileSync(file, "utf8"));
      specs.push(parseCommandsBlock(entry.name, manifest, home));
    } catch {
      /* an unparseable manifest is reported by `ebrain adapters validate`, not here */
    }
  }
  return specs;
}

function loadSpec(agent: string, home = homedir()): CommandsSpec | null {
  const file = join(adaptersDir(), agent, "manifest.yaml");
  if (!existsSync(file)) return null;
  const manifest = (Bun as unknown as { YAML: { parse: (text: string) => unknown } }).YAML.parse(readFileSync(file, "utf8"));
  return parseCommandsBlock(agent, manifest, home);
}

function main(): void {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const apply = argv.includes("--apply");
  const remove = argv.includes("--remove");
  const agent = argv.find((arg) => !arg.startsWith("--"));
  if (!agent) {
    console.error("usage: ebrain harness-commands <agent> [--apply|--remove] [--json]");
    process.exit(2);
  }
  const spec = loadSpec(agent);
  if (!spec) {
    console.error(`error: no adapter manifest for '${agent}'`);
    process.exit(2);
  }
  const catalog = loadCommandCatalog();

  if (remove) {
    const outcome = spec.format === "none" ? { removed: [], kept: [] } : removeCommands(spec, catalog);
    if (json) console.log(JSON.stringify({ agent, ...outcome }, null, 2));
    else {
      for (const path of outcome.removed) console.log(`  command × removed ${path}`);
      for (const path of outcome.kept) console.log(`  command · kept ${path} (not eBrain's)`);
    }
    return;
  }

  const report = installCommands(spec, catalog, apply);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.items.some((item) => item.state === "missing" || item.state === "stale") ? 1 : 0);
  }

  if (spec.format === "none") {
    console.log(`  commands: ${agent} declares no command-file convention (the MCP tools and the ebrain CLI remain the surface)`);
    return;
  }
  if (spec.verified === "binary") {
    console.log("  commands: convention confirmed from the agent's own CLI bundle, not its documentation — presence is reported, loading is not");
  }
  for (const item of report.items) {
    if (report.written.includes(item.path)) console.log(`  command ✓ '${item.invoke}' WRITTEN → ${item.path}`);
    else if (item.state === "current") console.log(`  command ✓ '${item.invoke}' current in ${spec.dir}`);
    else if (item.state === "foreign") console.log(`  command · '${item.invoke}' left alone: ${item.path} is not eBrain's (no ${MANAGED_MARKER} marker)`);
    else console.log(`  command ⚠ '${item.invoke}' ${item.state} — run 'ebrain harness install ${agent}'`);
  }
  if (report.items.some((item) => item.state === "missing" || item.state === "stale")) process.exit(1);
}

if (import.meta.main) main();
