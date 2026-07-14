import { describe, expect, test } from "bun:test";
import {
  commandDisplay,
  commandForAgent,
  mergeCursorMcpConfig,
  parseOnboardTarget,
  removalCommandForAgent,
} from "./up.ts";
import { EBRAIN_MCP_TOKEN_ENV } from "./mcp-token.ts";

const TOKEN = `gbrain_${"b".repeat(64)}`;
const URL = "http://127.0.0.1:8541/mcp";

describe("ebrain onboard plan", () => {
  test("defaults to all concrete agents", () => {
    expect(parseOnboardTarget([])).toEqual(["claude", "codex", "gemini", "cursor", "opencode"]);
    expect(parseOnboardTarget(["--all"])).toEqual(["claude", "codex", "gemini", "cursor", "opencode"]);
  });

  test("rejects unknown agents", () => {
    expect(() => parseOnboardTarget(["unknown-agent"])).toThrow("unknown agent");
  });

  test("codex uses EBRAIN_MCP_TOKEN env var, not a literal bearer in argv", () => {
    const spec = commandForAgent("codex", TOKEN, URL)!;
    expect(spec.binary).toBe("codex");
    expect(spec.args).toContain("--bearer-token-env-var");
    expect(spec.args).toContain(EBRAIN_MCP_TOKEN_ENV);
    expect(spec.args.join(" ")).not.toContain(TOKEN);
  });

  test("claude/gemini/opencode HTTP registrations redact literal bearer display", () => {
    for (const agent of ["claude", "gemini", "opencode"] as const) {
      const spec = commandForAgent(agent, TOKEN, URL)!;
      expect(spec.args.join(" ")).toContain(TOKEN);
      expect(commandDisplay(spec, TOKEN)).not.toContain(TOKEN);
      expect(commandDisplay(spec, TOKEN)).toContain("[REDACTED]");
    }
  });

  test("remove commands exist only for CLIs with remove subcommand", () => {
    expect(removalCommandForAgent("claude")?.args).toEqual(["mcp", "remove", "ebrain"]);
    expect(removalCommandForAgent("codex")?.args).toEqual(["mcp", "remove", "ebrain"]);
    expect(removalCommandForAgent("gemini")?.args).toEqual(["mcp", "remove", "ebrain"]);
    expect(removalCommandForAgent("opencode")).toBeNull();
  });

  test("cursor merge preserves existing servers and writes HTTP bearer config", () => {
    const current = { mcpServers: { other: { command: "x" } }, untouched: true };
    const next = mergeCursorMcpConfig(current, TOKEN, URL);
    expect(next.untouched).toBe(true);
    expect((next.mcpServers as Record<string, unknown>).other).toEqual({ command: "x" });
    expect((next.mcpServers as Record<string, any>).ebrain.url).toBe(URL);
    expect((next.mcpServers as Record<string, any>).ebrain.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });
});
