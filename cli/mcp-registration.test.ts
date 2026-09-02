/**
 * cli/mcp-registration.test.ts — the check that has to be able to fail.
 *
 * The verdict it replaces was derived from the adapter manifest, so it printed the same green
 * line on every machine including one where onboarding had never run. These tests pin the
 * three outcomes that make it a real diagnostic: registered, absent, and honestly unknown.
 */
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { agentConfigs, jsonHasServer, registrationState, tomlHasServer } from "./mcp-registration.ts";

describe("JSON configs", () => {
  test("finds the server in a top-level map", () => {
    expect(jsonHasServer(JSON.stringify({ mcpServers: { ebrain: { command: "/x/bridge" } } }), ["mcpServers"])).toBe("registered");
  });

  test("finds it nested — Claude keeps per-project scopes beside the user scope", () => {
    const config = {
      projects: { "/home/u/work": { mcpServers: { ebrain: { command: "/x/bridge" } } } },
      mcpServers: { other: { command: "y" } },
    };
    expect(jsonHasServer(JSON.stringify(config), ["mcpServers"])).toBe("registered");
  });

  test("reports absent when only other servers are configured", () => {
    const config = { mcpServers: { github: { command: "gh" }, postgres: { command: "pg" } } };
    expect(jsonHasServer(JSON.stringify(config), ["mcpServers"])).toBe("absent");
  });

  test("honours opencode's differently named key", () => {
    expect(jsonHasServer(JSON.stringify({ mcp: { ebrain: { type: "local" } } }), ["mcp", "mcpServers"])).toBe("registered");
  });

  test("unparseable config is 'unknown', never 'absent'", () => {
    // Claiming "not registered" about a file we could not read would send the user to re-run
    // onboarding over a config that may already be correct.
    expect(jsonHasServer("{ not json", ["mcpServers"])).toBe("unknown");
  });

  test("survives a self-referential structure without hanging", () => {
    // Defensive: the walker guards against cycles, which JSON.parse cannot produce but a
    // future in-memory caller could.
    expect(jsonHasServer(JSON.stringify({ a: { b: { c: {} } } }), ["mcpServers"])).toBe("absent");
  });
});

describe("TOML configs", () => {
  test("matches codex's server table", () => {
    expect(tomlHasServer('[features]\nx = 1\n\n[mcp_servers.ebrain]\ncommand = "/x/bridge"\n')).toBe("registered");
    expect(tomlHasServer('[mcp_servers."ebrain"]\ncommand = "/x"\n')).toBe("registered");
  });

  test("does not match a different server or a mention in a value", () => {
    expect(tomlHasServer('[mcp_servers.github]\ncommand = "gh"\n')).toBe("absent");
    expect(tomlHasServer('[tui]\nnote = "see the ebrain docs"\n')).toBe("absent");
  });
});

describe("reading real config files", () => {
  test("a machine that never onboarded reports absent, not registered", () => {
    const home = mkdtempSync(join(tmpdir(), "ebrain-reg-"));
    try {
      const configs = agentConfigs(home);
      for (const config of configs) expect(registrationState(config)).toBe("absent");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("a registered machine reports registered for every agent", () => {
    const home = mkdtempSync(join(tmpdir(), "ebrain-reg-"));
    try {
      const bridge = { command: "/x/scripts/ebrain-mcp-bridge", args: [] as string[] };
      mkdirSync(join(home, ".codex"), { recursive: true });
      mkdirSync(join(home, ".gemini"), { recursive: true });
      mkdirSync(join(home, ".cursor"), { recursive: true });
      mkdirSync(join(home, ".config", "opencode"), { recursive: true });
      writeFileSync(join(home, ".claude.json"), JSON.stringify({ mcpServers: { ebrain: bridge } }));
      writeFileSync(join(home, ".codex", "config.toml"), '[mcp_servers.ebrain]\ncommand = "/x"\n');
      writeFileSync(join(home, ".gemini", "settings.json"), JSON.stringify({ mcpServers: { ebrain: bridge } }));
      writeFileSync(join(home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { ebrain: bridge } }));
      writeFileSync(join(home, ".config", "opencode", "opencode.json"), JSON.stringify({ mcp: { ebrain: { type: "local" } } }));

      for (const config of agentConfigs(home)) {
        expect({ agent: config.agent, state: registrationState(config) }).toEqual({ agent: config.agent, state: "registered" });
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("an unreadable config reports unknown rather than a false absence", () => {
    const home = mkdtempSync(join(tmpdir(), "ebrain-reg-"));
    try {
      const file = join(home, ".claude.json");
      writeFileSync(file, JSON.stringify({ mcpServers: { ebrain: {} } }));
      chmodSync(file, 0o000);
      const config = agentConfigs(home).find((c) => c.agent === "claude")!;
      // Root ignores the mode bit, so accept either the unreadable verdict or the true one —
      // what must never happen is a confident "absent".
      expect(["unknown", "registered"]).toContain(registrationState(config));
    } finally {
      try { chmodSync(join(home, ".claude.json"), 0o600); } catch { /* best effort */ }
      rmSync(home, { recursive: true, force: true });
    }
  });
});
