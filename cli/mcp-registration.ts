#!/usr/bin/env bun
/**
 * cli/mcp-registration.ts — is eBrain actually wired into this agent?
 *
 * The adapter doctor used to answer this from the adapter's own manifest: if the manifest
 * declared `mcp.register: ebrain onboard`, it printed `mcp ✓ http-daemon`. That string is the
 * same on every machine, so the check reported a healthy registration on a machine where
 * onboarding had never run — a diagnostic that cannot fail is not a diagnostic.
 *
 * This module reads the agent's real configuration instead. It reports three states, because
 * "I could not tell" and "it is not registered" are different answers and conflating them is
 * how the previous check went wrong.
 */
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { readAgentMcpSpecs, MCP_SERVER_NAME } from "./mcp-manifest.ts";

const HOME = homedir();
export { MCP_SERVER_NAME };

export type RegistrationState = "registered" | "absent" | "unknown";

export type ConfigFormat = "json" | "toml";

export interface AgentConfig {
  agent: string;
  file: string;
  format: ConfigFormat;
  /** JSON keys that may hold the server map. Agents disagree on the name. */
  keys: string[];
}

/**
 * Where each agent's registration can be verified — read from the adapter manifests rather than
 * restated here. This table used to be the fourth place that knew the same five facts; a sixth
 * agent now needs no edit to this file.
 *
 * An adapter with no config path declared is omitted, not invented: `main` already treats an
 * unmodelled adapter as "unknown" rather than red, and guessing a path would produce exactly the
 * kind of verdict-that-cannot-fail this module exists to remove.
 */
export function agentConfigs(home = HOME): AgentConfig[] {
  return readAgentMcpSpecs(undefined, home)
    .filter((spec) => spec.method !== "none" && spec.configPath !== null)
    .map((spec) => ({ agent: spec.agent, file: spec.configPath!, format: spec.format, keys: spec.keys }));
}

/**
 * Does any server map in this JSON hold the named server?
 *
 * The search is recursive because Claude Code keeps per-project sections alongside the user
 * scope, so a top-level-only lookup would miss a real registration and report a false absence.
 */
export function jsonHasServer(text: string, keys: readonly string[], server = MCP_SERVER_NAME): RegistrationState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "unknown"; // a config we cannot parse is one we must not make claims about
  }
  const wanted = new Set(keys);
  const seen = new Set<unknown>();
  const walk = (node: unknown): boolean => {
    if (!node || typeof node !== "object" || seen.has(node)) return false;
    seen.add(node);
    if (Array.isArray(node)) return node.some(walk);
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (wanted.has(key) && value && typeof value === "object" && !Array.isArray(value)) {
        if (Object.prototype.hasOwnProperty.call(value, server)) return true;
      }
      if (walk(value)) return true;
    }
    return false;
  };
  return walk(parsed) ? "registered" : "absent";
}

/** TOML server tables are `[mcp_servers.<name>]`, optionally quoted. */
export function tomlHasServer(text: string, table = "mcp_servers", server = MCP_SERVER_NAME): RegistrationState {
  const escaped = server.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*\\[+\\s*${table}\\s*\\.\\s*"?${escaped}"?\\s*\\]+`, "m");
  return re.test(text) ? "registered" : "absent";
}

export function registrationState(config: AgentConfig): RegistrationState {
  if (!existsSync(config.file)) return "absent";
  let text: string;
  try {
    text = readFileSync(config.file, "utf8");
  } catch {
    return "unknown"; // unreadable (permissions) is not the same as unregistered
  }
  return config.format === "toml"
    ? tomlHasServer(text, config.keys[0])
    : jsonHasServer(text, config.keys);
}

export function describe(agent: string, state: RegistrationState): string {
  if (state === "registered") return `mcp ✓ http-daemon (${agent} config carries the '${MCP_SERVER_NAME}' server)`;
  if (state === "absent") return `mcp ✗ not registered — run 'ebrain onboard ${agent}'`;
  return `mcp ? could not read ${agent}'s config to verify the registration`;
}

function main(): void {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const target = argv.find((a) => !a.startsWith("--"));
  const configs = agentConfigs().filter((c) => !target || c.agent === target);

  if (configs.length === 0) {
    // An adapter this module does not model yet is not a failing adapter. Say so and pass:
    // turning "I have no config location for this" into a red check would be the same class
    // of dishonest verdict this file exists to remove, pointed the other way.
    const row = { agent: target, file: null, state: "unknown" as RegistrationState };
    if (json) console.log(JSON.stringify({ agents: [row] }, null, 2));
    else console.log(`  mcp ? no config location known for '${target}' — cannot verify the registration`);
    return;
  }

  const rows = configs.map((c) => ({ agent: c.agent, file: c.file, state: registrationState(c) }));
  if (json) {
    console.log(JSON.stringify({ agents: rows }, null, 2));
  } else {
    for (const row of rows) console.log(`  ${describe(row.agent, row.state)}`);
  }
  // Exit 3 when a specifically requested agent is not registered, so shell callers can branch.
  if (target && rows[0].state !== "registered") process.exit(3);
}

if (import.meta.main) main();
