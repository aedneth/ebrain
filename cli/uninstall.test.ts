/**
 * cli/uninstall.test.ts — the teardown contract.
 *
 * Two properties matter more than the mechanics: eBrain must never take a user's other MCP
 * servers with it, and it must never delete the brain store unless explicitly told to.
 */
import { describe, expect, test } from "bun:test";
import { removeServerFromConfig, uninstallPlan } from "./uninstall.ts";

describe("removing the eBrain entry from an agent config", () => {
  test("leaves every other MCP server exactly as it was", () => {
    const current = {
      mcpServers: {
        ebrain: { command: "/x/scripts/ebrain-mcp-bridge", args: [] },
        github: { command: "gh-mcp", args: ["--stdio"] },
        postgres: { command: "pg-mcp" },
      },
      editor: { theme: "dark" },
    };
    const next = removeServerFromConfig(current, "mcpServers") as any;
    expect(next.mcpServers.ebrain).toBeUndefined();
    expect(next.mcpServers.github).toEqual({ command: "gh-mcp", args: ["--stdio"] });
    expect(next.mcpServers.postgres).toEqual({ command: "pg-mcp" });
    expect(next.editor).toEqual({ theme: "dark" });
  });

  test("handles opencode's differently named key", () => {
    const next = removeServerFromConfig({ mcp: { ebrain: { type: "local" }, other: { type: "local" } } }, "mcp") as any;
    expect(next.mcp.ebrain).toBeUndefined();
    expect(next.mcp.other).toEqual({ type: "local" });
  });

  test("a config with no server map is returned untouched", () => {
    const current = { unrelated: true };
    expect(removeServerFromConfig(current, "mcpServers")).toEqual(current);
    expect(removeServerFromConfig({ mcpServers: "not-an-object" }, "mcpServers")).toEqual({ mcpServers: "not-an-object" });
  });
});

describe("the uninstall plan", () => {
  const plan = uninstallPlan();

  test("accounts for every surface an install writes to", () => {
    const kinds = new Set(plan.map((p) => p.kind));
    for (const kind of ["daemon", "service", "agent-cli", "agent-config", "path", "config", "timer", "brain"]) {
      expect(kinds.has(kind as any)).toBe(true);
    }
  });

  test("the brain store is purge-only — a plain uninstall never deletes what was remembered", () => {
    const brain = plan.filter((p) => p.kind === "brain");
    expect(brain).toHaveLength(1);
    expect(brain[0].purgeOnly).toBe(true);
    // Nothing else may be marked purge-only: everything else is eBrain's own footprint.
    expect(plan.filter((p) => p.purgeOnly).map((p) => p.kind)).toEqual(["brain"]);
  });

  test("lists absent artifacts too, so the plan answers 'what did this put on my machine?'", () => {
    expect(plan.every((p) => typeof p.present === "boolean")).toBe(true);
    expect(plan.every((p) => p.target.length > 0 && p.label.length > 0)).toBe(true);
  });

  test("covers all five supported agents", () => {
    const targets = plan.map((p) => p.target).join(" ");
    for (const agent of ["claude", "codex", "gemini", "cursor", "opencode"]) {
      expect(targets).toContain(agent);
    }
  });
});
