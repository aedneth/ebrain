/**
 * cli/mcp-manifest.ts — how each agent is wired to the brain, read from its manifest.
 *
 * Five consumers already discover agents by scanning `harness/adapters/*&#47;manifest.yaml`, which is
 * why `ebrain sessions new pi <repo>` works the moment a `pi` manifest exists. Onboarding was the
 * exception: `up.ts` had a switch over five agent names, `mcp-registration.ts` a hardcoded table of
 * five config paths, and `uninstall.ts` two more lists. Adding a sixth agent meant editing four
 * files that all knew the same fact, and the manifest's own `mcp.register` was circular — it said
 * "run `ebrain onboard cursor`", which is the thing that needed to know how.
 *
 * So the manifest now states the mechanism, and this module is the only thing that reads it.
 * Supporting a new CLI becomes what it should have been: one YAML file.
 *
 * Two mechanisms cover every agent seen so far:
 *
 *  - `method: cli` — the agent owns an MCP registry and exposes `<binary> mcp add|remove`. eBrain
 *    runs that command rather than writing into a file it does not own.
 *  - `method: json` — there is no such command, so eBrain edits the agent's JSON config directly,
 *    merging its own entry and leaving every neighbouring server untouched.
 *
 * `method: none` is a real answer, not a gap: the generic adapter has no MCP surface to register.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveEbrainHome } from "./ebrain-home.ts";

export const MCP_SERVER_NAME = "ebrain";

export type McpMethod = "cli" | "json" | "none";
export type ConfigFormat = "json" | "toml";

/** How an entry is shaped inside a JSON config. Agents disagree, so the manifest says which. */
export type EntryShape =
  /** `{ command, args }` — the plain form Cursor uses. */
  | "command-args"
  /** `{ type: "local", command: [bin, ...args] }` — OpenCode's form. */
  | "local-command";

export interface AgentMcpSpec {
  agent: string;
  method: McpMethod;
  /** The executable to probe for, and to run for `method: cli`. */
  binary: string | null;
  /** Argv after the binary, with `{name}` and `{bridge}` still to substitute. */
  addArgs: string[];
  removeArgs: string[];
  /** Absolute path of the config that proves a registration, when one is known. */
  configPath: string | null;
  format: ConfigFormat;
  /** Keys that may hold the server map. Agents disagree on the name. */
  keys: string[];
  entryShape: EntryShape;
  /**
   * Known schema quirks of this agent's config that eBrain must repair while merging, declared
   * rather than inferred: applying a repair to the wrong config would be eBrain silently
   * rewriting a file it does not own. Currently only `instructions-array`.
   */
  repairs: string[];
  /** The user-facing command that registers this agent, for messages. */
  registerHint: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `~` and `$HOME` are the only expansions a manifest path may use. */
export function expandPath(path: string, home = homedir()): string {
  if (path.startsWith("~/")) return join(home, path.slice(2));
  if (path === "~") return home;
  if (path.startsWith("$HOME/")) return join(home, path.slice(6));
  return path;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...(value as string[])] : [];
}

/**
 * Substitute the two placeholders a manifest may use. Kept deliberately tiny: a manifest describes
 * *which* arguments an agent wants, never how to compute them, so there is no expression language
 * here for a malformed manifest to smuggle something through.
 */
export function fillArgs(args: readonly string[], values: { name: string; bridge: string }): string[] {
  return args.map((arg) => arg.replaceAll("{name}", values.name).replaceAll("{bridge}", values.bridge));
}

export function parseMcpBlock(agent: string, manifest: unknown, home = homedir()): AgentMcpSpec {
  const empty: AgentMcpSpec = {
    agent,
    method: "none",
    binary: null,
    addArgs: [],
    removeArgs: [],
    configPath: null,
    format: "json",
    keys: ["mcpServers"],
    entryShape: "command-args",
    repairs: [],
    registerHint: null,
  };
  if (!isRecord(manifest) || !isRecord(manifest.mcp)) return empty;
  const mcp = manifest.mcp;

  const declared = typeof mcp.method === "string" ? mcp.method : null;
  // A manifest written before `method` existed still says something useful: a non-null `register`
  // means the agent is meant to be onboarded. Treating that as "none" would silently unregister
  // working agents on upgrade, so it resolves to the mechanism its other fields describe.
  const method: McpMethod = declared === "cli" || declared === "json" || declared === "none"
    ? declared
    : mcp.register == null
      ? "none"
      : asStringArray(mcp.add).length > 0
        ? "cli"
        : typeof mcp.config === "string"
          ? "json"
          : "none";

  const format: ConfigFormat = mcp.format === "toml" ? "toml" : "json";
  const keys = asStringArray(mcp.keys);
  const entryShape: EntryShape = mcp.entry === "local-command" ? "local-command" : "command-args";

  return {
    agent,
    method,
    binary: typeof mcp.binary === "string" && mcp.binary.length > 0 ? mcp.binary : null,
    addArgs: asStringArray(mcp.add),
    removeArgs: asStringArray(mcp.remove),
    configPath: typeof mcp.config === "string" && mcp.config.length > 0 ? expandPath(mcp.config, home) : null,
    format,
    keys: keys.length > 0 ? keys : format === "toml" ? ["mcp_servers"] : ["mcpServers"],
    entryShape,
    repairs: asStringArray(mcp.repairs),
    registerHint: typeof mcp.register === "string" && mcp.register.length > 0 ? mcp.register : null,
  };
}

export function adaptersDir(ebrainHome = resolveEbrainHome()): string {
  return process.env.EBRAIN_ADAPTERS_DIR || join(ebrainHome, "harness", "adapters");
}

/** Every adapter's MCP wiring, in a stable order. Missing or unreadable manifests are skipped. */
export function readAgentMcpSpecs(dir = adaptersDir(), home = homedir()): AgentMcpSpec[] {
  if (!existsSync(dir)) return [];
  const specs: AgentMcpSpec[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const file = join(dir, entry.name, "manifest.yaml");
    if (!existsSync(file)) continue;
    let manifest: unknown;
    try {
      manifest = (Bun as unknown as { YAML: { parse: (text: string) => unknown } }).YAML.parse(readFileSync(file, "utf8"));
    } catch {
      // A manifest we cannot parse is one we must not guess about; the adapter doctor reports it.
      continue;
    }
    const agent = isRecord(manifest) && typeof manifest.agent === "string" ? manifest.agent : entry.name;
    specs.push(parseMcpBlock(agent, manifest, home));
  }
  return specs;
}

export function findAgentSpec(agent: string, dir = adaptersDir(), home = homedir()): AgentMcpSpec | null {
  return readAgentMcpSpecs(dir, home).find((spec) => spec.agent === agent) ?? null;
}

/** Agents eBrain will try to onboard: everything with a declared mechanism. */
export function onboardableAgents(specs: AgentMcpSpec[]): AgentMcpSpec[] {
  return specs.filter((spec) => spec.method !== "none");
}

/** The entry eBrain writes into a JSON config, in the shape that agent expects. */
export function mcpEntryFor(shape: EntryShape, bridge: { command: string; args: string[] }): Record<string, unknown> {
  return shape === "local-command"
    ? { type: "local", command: [bridge.command, ...bridge.args] }
    : { command: bridge.command, args: bridge.args };
}
