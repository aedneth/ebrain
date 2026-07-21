// cli/bridge-path.ts — the MCP bridge command path, with NO Model Context Protocol SDK imports.
//
// Pass 6 (F-T10): bridgeCommandPath — the function that computes the exact command string written
// into every agent's MCP config, and therefore the heart of the F-S1 blocking finding — lived in
// cli/mcp-bridge.ts, which imports the MCP SDK from the vendored engine. `vendor/` is gitignored, so
// on a checkout where scripts/install.sh has not provisioned the engine, cli/mcp-bridge.test.ts and
// cli/up.test.ts could not even load — the only two tests that would catch a regression in the
// registered command string were inert on exactly the fresh checkout F-S1 is about.
//
// These functions depend on nothing but the resolver and path joining, so they belong in their own
// SDK-free module. cli/mcp-bridge.ts re-exports them for compatibility; tests import from here so
// they run without the engine.

import { join } from "path";
import { resolveEbrainHome } from "./ebrain-home.ts";

export interface BridgeCommandConfig {
  command: string;
  args: string[];
}

/** Absolute path to the stdio bridge launcher every supported agent spawns to reach eBrain. */
export function bridgeCommandPath(ebrainHome = resolveEbrainHome()): string {
  return join(ebrainHome, "scripts", "ebrain-mcp-bridge");
}

/** The `{ command, args }` shape stored in an agent's MCP config. */
export function bridgeCommandConfig(command = bridgeCommandPath()): BridgeCommandConfig {
  return { command, args: [] };
}
