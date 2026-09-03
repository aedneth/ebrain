#!/usr/bin/env bun
/**
 * cli/adapters.ts — the adapter contract, stated once and checked.
 *
 * By this point every part of eBrain that touches an agent reads `harness/adapters/*&#47;manifest.yaml`:
 * sessions, launch, targets, norms, the fleet view, onboarding, hook wiring, uninstall. What none
 * of them had was a definition of what a manifest *is*. Each consumer poked at the fields it cared
 * about and quietly ignored the rest, so a typo in a manifest surfaced as a feature not working —
 * an adapter that would not launch, a guard that was never wired — rather than as an error naming
 * the line.
 *
 * That is fine while the only author of manifests is the person who wrote the consumers. It stops
 * being fine the moment someone else adds an adapter, which is exactly what the previous phase
 * made possible. So this module is the contract:
 *
 *   - a schema that says what a manifest may contain, with unknown keys REJECTED rather than
 *     ignored — a mistyped `lauch:` should be an error, not silence;
 *   - `AgentAdapter`, one typed object per agent, carrying every capability the harness actually
 *     has: how to detect it, how it registers, how its hooks wire, where its norms go, how to
 *     launch it, and whether its secret guard is enforced or advisory;
 *   - `ebrain adapters validate`, so a contributor can check their YAML before opening a PR
 *     instead of discovering the problem through a feature that silently does nothing.
 *
 * The interface deliberately describes what exists. It would have been easy to declare a broader
 * one — a `parseInteraction` for every agent, say — but the harness's write-back is a shell hook
 * per adapter, not a function, and a method that nothing calls is a promise the code does not
 * keep. What is here is what the harness can really do for an agent today.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { access, constants } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { resolveEbrainHome } from "./ebrain-home.ts";
import { expandPath, parseMcpBlock, type AgentMcpSpec } from "./mcp-manifest.ts";
import { parseHooksBlock, type HooksSpec } from "./hooks-wire.ts";
import { parseCommandsBlock, type CommandsSpec } from "./harness-commands.ts";
import { registrationState, type RegistrationState } from "./mcp-registration.ts";

/** Agent ids, capability names and model slugs share one shape across the codebase. */
const AGENT_ID = /^[a-z][a-z0-9-]{0,63}$/;

const WrapperSchema = z.object({
  file: z.string().min(1),
  core: z.string().min(1),
  event: z.string().min(1),
  /** Which tool calls the hook applies to. Absent means all of them. */
  matcher: z.string().optional(),
});

const HooksSchema = z.object({
  config: z.string().nullable().optional(),
  format: z.enum(["claude-json", "none"]),
  /** Top-level key the events nest under; absent or null means they sit at the root. */
  root: z.string().nullable().optional(),
  dir: z.string().nullable().optional(),
  events: z.record(z.string(), z.string()).default({}),
  wrappers: z.array(WrapperSchema).default([]),
  /** Hooks another system owns. Documentation only — the harness does not touch these. */
  external: z.array(z.string()).optional(),
});

const McpSchema = z.object({
  register: z.string().nullable().optional(),
  method: z.enum(["cli", "json", "none"]).optional(),
  binary: z.string().optional(),
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
  config: z.string().optional(),
  format: z.enum(["json", "toml"]).optional(),
  keys: z.array(z.string()).optional(),
  entry: z.enum(["command-args", "local-command"]).optional(),
  repairs: z.array(z.string()).optional(),
});

const TargetSchema = z.object({
  id: z.string().regex(AGENT_ID),
  provider: z.string().regex(AGENT_ID),
  argv: z.array(z.string().min(1)).min(1),
  model: z.object({ flag: z.string().min(1), prefix: z.string() }),
});

export const AdapterManifestSchema = z.strictObject({
  agent: z.string().regex(AGENT_ID, "agent must be a lowercase slug"),
  class: z.enum(["heavy", "light"]).optional(),
  description: z.string().min(1),
  norms: z.object({
    target: z.string().nullable(),
    mode: z.enum(["managed-block", "none"]),
  }).optional(),
  hooks: HooksSchema.optional(),
  mcp: McpSchema.optional(),
  env: z.record(z.string(), z.string()).optional(),
  /** A command that proves the agent is installed and healthy, or null when there is none. */
  doctor: z.string().nullable().optional(),
  launch: z.string().nullable().optional(),
  /**
   * Whether the secret guard is technically enforced (a runtime hook denies the call) or advisory
   * (a norm the agent is asked to follow). Recorded so the fleet view cannot imply protection the
   * adapter does not have.
   */
  guard: z.enum(["enforced", "advisory"]).optional(),
  targets: z.array(TargetSchema).optional(),
});

export type AdapterManifest = z.infer<typeof AdapterManifestSchema>;

export type RamClass = "heavy" | "light" | "unknown";
export type GuardMode = "enforced" | "advisory";

export interface DetectResult {
  /** Is the agent's own binary on PATH? */
  installed: boolean;
  /** Absolute path of that binary, when found. */
  path: string | null;
  /** Is eBrain actually registered in its config? */
  registration: RegistrationState;
}

/**
 * One agent, as the harness understands it. Every field is derived from the manifest; nothing here
 * is inferred from the agent's name.
 */
export interface AgentAdapter {
  agent: string;
  description: string;
  ramClass: RamClass;
  /** How this agent connects to the shared brain. */
  mcp: AgentMcpSpec;
  /** How its hooks are wired, and which core scripts they run. */
  hooks: HooksSpec;
  /** Where the shared norms block is rendered, and how. */
  norms: { target: string | null; mode: "managed-block" | "none" };
  /** Whether the secret guard is technically enforced or only a norm. */
  guard: GuardMode;
  /** A command that proves the agent is installed, or null. */
  doctorCommand: string | null;
  /** The command a new session launches, or null when the adapter has no CLI of its own. */
  launch: string | null;
  /** Environment the harness stamps into this agent's wrappers. */
  env: Record<string, string>;
  detect(): Promise<DetectResult>;
}

export class AdapterManifestError extends Error {
  readonly agent: string;
  readonly issues: string[];
  constructor(agent: string, file: string, issues: string[]) {
    super(`${file} is not a valid adapter manifest:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "AdapterManifestError";
    this.agent = agent;
    this.issues = issues;
  }
}

function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

async function onPath(binary: string, pathValue = process.env.PATH || ""): Promise<string | null> {
  for (const dir of pathValue.split(":")) {
    if (!dir) continue;
    try {
      await access(join(dir, binary), constants.X_OK);
      return join(dir, binary);
    } catch { /* keep searching */ }
  }
  return null;
}

/**
 * Build the typed adapter from a validated manifest.
 *
 * `guard` defaults by mechanism rather than by declaration: an adapter with no hook runtime cannot
 * technically enforce anything, so calling its guard "enforced" because a field was omitted would
 * be the fleet view claiming protection that does not exist.
 */
export function toAdapter(manifest: AdapterManifest, raw: unknown, home = homedir()): AgentAdapter {
  const hooks = parseHooksBlock(manifest.agent, raw, home);
  const mcp = parseMcpBlock(manifest.agent, raw, home);
  const hasRuntimeHooks = hooks.format !== "none" && hooks.wrappers.some((wrapper) => wrapper.core === "guard-secrets.sh");
  return {
    agent: manifest.agent,
    description: manifest.description,
    ramClass: manifest.class ?? "unknown",
    mcp,
    hooks,
    norms: {
      target: manifest.norms?.target ? expandPath(manifest.norms.target, home) : null,
      mode: manifest.norms?.mode ?? "none",
    },
    guard: manifest.guard ?? (hasRuntimeHooks ? "enforced" : "advisory"),
    doctorCommand: manifest.doctor ?? null,
    launch: manifest.launch ?? null,
    env: manifest.env ?? {},
    async detect(): Promise<DetectResult> {
      // The binary to probe is the one the agent is actually invoked as — Cursor's is `agent`,
      // not `cursor`, which is why this comes from the manifest and not from the adapter's name.
      const binary = mcp.binary ?? manifest.launch?.split(/\s+/)[0] ?? null;
      const found = binary ? await onPath(binary) : null;
      const registration: RegistrationState = mcp.configPath
        ? registrationState({ agent: manifest.agent, file: mcp.configPath, format: mcp.format, keys: mcp.keys })
        : "unknown";
      return { installed: found !== null, path: found, registration };
    },
  };
}

export function adaptersDir(ebrainHome = resolveEbrainHome()): string {
  return process.env.EBRAIN_ADAPTERS_DIR || join(ebrainHome, "harness", "adapters");
}

export interface ValidationResult {
  agent: string;
  file: string;
  ok: boolean;
  issues: string[];
}

/** Parse one manifest file. Throws `AdapterManifestError` naming every problem at once. */
export function loadAdapterFile(file: string, fallbackAgent: string, home = homedir()): AgentAdapter {
  let raw: unknown;
  try {
    raw = (Bun as unknown as { YAML: { parse: (text: string) => unknown } }).YAML.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new AdapterManifestError(fallbackAgent, file, [`could not be read as YAML: ${error instanceof Error ? error.message : String(error)}`]);
  }
  const parsed = AdapterManifestSchema.safeParse(raw);
  if (!parsed.success) throw new AdapterManifestError(fallbackAgent, file, describeIssues(parsed.error));
  return toAdapter(parsed.data, raw, home);
}

/** Every adapter that parses. Invalid ones are skipped here and reported by `validateAdapters`. */
export function loadAdapters(dir = adaptersDir(), home = homedir()): AgentAdapter[] {
  if (!existsSync(dir)) return [];
  const adapters: AgentAdapter[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const file = join(dir, entry.name, "manifest.yaml");
    if (!existsSync(file)) continue;
    try {
      adapters.push(loadAdapterFile(file, entry.name, home));
    } catch { /* reported by validateAdapters, which is the command for this question */ }
  }
  return adapters;
}

export function validateAdapters(dir = adaptersDir(), home = homedir()): ValidationResult[] {
  if (!existsSync(dir)) return [];
  const results: ValidationResult[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const file = join(dir, entry.name, "manifest.yaml");
    if (!existsSync(file)) {
      results.push({ agent: entry.name, file, ok: false, issues: ["no manifest.yaml in this adapter directory"] });
      continue;
    }
    try {
      const adapter = loadAdapterFile(file, entry.name, home);
      const issues: string[] = [];
      // Cross-field checks the schema cannot express: a directory name that disagrees with the
      // declared agent makes every path-based lookup silently miss.
      if (adapter.agent !== entry.name) issues.push(`declares agent '${adapter.agent}' but lives in directory '${entry.name}'`);
      if (adapter.mcp.method === "cli" && !adapter.mcp.binary) issues.push("mcp.method is 'cli' but no mcp.binary is declared");
      if (adapter.mcp.method === "cli" && adapter.mcp.addArgs.length === 0) issues.push("mcp.method is 'cli' but no mcp.add argv is declared");
      if (adapter.mcp.method === "json" && !adapter.mcp.configPath) issues.push("mcp.method is 'json' but no mcp.config path is declared");
      if (adapter.mcp.method !== "none" && !adapter.mcp.configPath) issues.push("no mcp.config path, so a registration can never be verified");
      if (adapter.hooks.format !== "none" && !adapter.hooks.hooksDir) issues.push("hooks.format is set but no hooks.dir is declared");
      for (const wrapper of adapter.hooks.wrappers) {
        if (adapter.hooks.format !== "none" && !adapter.hooks.events[wrapper.event]) {
          issues.push(`wrapper '${wrapper.file}' uses event '${wrapper.event}', which hooks.events does not map`);
        }
      }
      results.push({ agent: adapter.agent, file, ok: issues.length === 0, issues });
    } catch (error) {
      results.push({
        agent: entry.name,
        file,
        ok: false,
        issues: error instanceof AdapterManifestError ? error.issues : [error instanceof Error ? error.message : String(error)],
      });
    }
  }
  return results;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const command = positional[0] ?? "list";

  if (command === "validate") {
    const results = validateAdapters();
    if (json) {
      console.log(JSON.stringify({ schema_version: 1, adapters: results, ok: results.every((r) => r.ok) }, null, 2));
    } else {
      for (const result of results) {
        if (result.ok) console.log(`  ok   ${result.agent}`);
        else {
          console.log(`  FAIL ${result.agent}  (${result.file})`);
          for (const issue of result.issues) console.log(`         ${issue}`);
        }
      }
      const bad = results.filter((r) => !r.ok).length;
      console.log(bad === 0 ? `\n  ${results.length} adapter manifests, all valid.` : `\n  ${bad} of ${results.length} manifests need fixing.`);
    }
    process.exit(results.every((r) => r.ok) ? 0 : 1);
  }

  if (command === "show") {
    const wanted = positional[1];
    const adapter = loadAdapters().find((candidate) => candidate.agent === wanted);
    if (!adapter) {
      console.error(`error: unknown adapter '${wanted ?? "(missing)"}'`);
      process.exit(2);
    }
    const { detect, ...data } = adapter;
    console.log(JSON.stringify({ ...data, detected: await adapter.detect() }, null, 2));
    return;
  }

  if (command === "list") {
    const adapters = loadAdapters();
    const rows = await Promise.all(adapters.map(async (adapter) => ({
      agent: adapter.agent,
      ram_class: adapter.ramClass,
      mcp: adapter.mcp.method,
      guard: adapter.guard,
      launch: adapter.launch,
      detected: await adapter.detect(),
    })));
    if (json) {
      console.log(JSON.stringify({ schema_version: 1, adapters: rows }, null, 2));
      return;
    }
    console.log("  agent        class    mcp    guard      installed  registered");
    for (const row of rows) {
      console.log(
        `  ${row.agent.padEnd(12)} ${row.ram_class.padEnd(8)} ${row.mcp.padEnd(6)} ${row.guard.padEnd(10)} ` +
        `${(row.detected.installed ? "yes" : "no").padEnd(10)} ${row.detected.registration}`,
      );
    }
    console.log("\n  guard 'advisory' = no runtime hook can deny a call; the norm is the only control.");
    console.log("  Add an agent by dropping harness/adapters/<name>/manifest.yaml — then: ebrain adapters validate");
    return;
  }

  console.error(`error: unknown subcommand '${command}' (expected: list, show, validate)`);
  process.exit(2);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`ebrain adapters: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
