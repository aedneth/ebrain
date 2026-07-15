import { describe, expect, test } from "bun:test";
import {
  commandDisplay,
  commandForAgent,
  mergeCursorMcpConfig,
  mergeOpenCodeMcpConfig,
  parseOnboardTarget,
  removalCommandForAgent,
} from "./up.ts";

const TOKEN = `gbrain_${"b".repeat(64)}`;
const URL = "http://127.0.0.1:8541/mcp";
const BRIDGE = "/home/test/eBrain/scripts/ebrain-mcp-bridge";

describe("ebrain onboard plan", () => {
  test("defaults to all concrete agents", () => {
    expect(parseOnboardTarget([])).toEqual(["claude", "codex", "gemini", "cursor", "opencode"]);
    expect(parseOnboardTarget(["--all"])).toEqual(["claude", "codex", "gemini", "cursor", "opencode"]);
  });

  test("rejects unknown agents", () => {
    expect(() => parseOnboardTarget(["unknown-agent"])).toThrow("unknown agent");
  });

  test("CLI registrations use the daemon bridge and never include bearer material", () => {
    const specs = [
      commandForAgent("claude", TOKEN, URL, BRIDGE)!,
      commandForAgent("codex", TOKEN, URL, BRIDGE)!,
      commandForAgent("gemini", TOKEN, URL, BRIDGE)!,
    ];
    for (const spec of specs) {
      expect(spec.tokenInArgv).toBe(false);
      expect(spec.args.join(" ")).toContain(BRIDGE);
      expect(spec.args.join(" ")).not.toContain(TOKEN);
      expect(spec.args.join(" ")).not.toContain(URL);
      expect(commandDisplay(spec, TOKEN)).not.toContain(TOKEN);
    }
    expect(commandForAgent("opencode", TOKEN, URL, BRIDGE)).toBeNull();
  });

  test("remove commands exist only for CLIs with remove subcommand", () => {
    expect(removalCommandForAgent("claude")?.args).toEqual(["mcp", "remove", "ebrain"]);
    expect(removalCommandForAgent("codex")?.args).toEqual(["mcp", "remove", "ebrain"]);
    expect(removalCommandForAgent("gemini")?.args).toEqual(["mcp", "remove", "ebrain"]);
    expect(removalCommandForAgent("opencode")).toBeNull();
  });

  test("cursor merge preserves existing servers and writes command-only bridge config", () => {
    const current = { mcpServers: { other: { command: "x" } }, untouched: true };
    const next = mergeCursorMcpConfig(current, TOKEN, URL);
    expect(next.untouched).toBe(true);
    expect((next.mcpServers as Record<string, unknown>).other).toEqual({ command: "x" });
    expect((next.mcpServers as Record<string, any>).ebrain.command).toContain("ebrain-mcp-bridge");
    expect((next.mcpServers as Record<string, any>).ebrain.args).toEqual([]);
    expect(JSON.stringify(next)).not.toContain(TOKEN);
    expect(JSON.stringify(next)).not.toContain(URL);
  });

  test("opencode merge preserves config and writes command-only bridge config", () => {
    const current = { mcp: { other: { command: "x" } }, instructions: "/tmp/AGENTS.md", untouched: true };
    const next = mergeOpenCodeMcpConfig(current, TOKEN);
    expect(next.untouched).toBe(true);
    expect((next.mcp as Record<string, unknown>).other).toEqual({ command: "x" });
    expect((next.mcp as Record<string, any>).ebrain.type).toBe("local");
    expect((next.mcp as Record<string, any>).ebrain.command).toHaveLength(1);
    expect((next.mcp as Record<string, any>).ebrain.command[0]).toContain("ebrain-mcp-bridge");
    expect(next.instructions).toEqual(["/tmp/AGENTS.md"]);
    expect(JSON.stringify(next)).not.toContain(TOKEN);
  });

  test("opencode merge drops invalid legacy instructions type", () => {
    const next = mergeOpenCodeMcpConfig({ instructions: { path: "/tmp/AGENTS.md" } }, TOKEN);
    expect(next.instructions).toBeUndefined();
  });
});
