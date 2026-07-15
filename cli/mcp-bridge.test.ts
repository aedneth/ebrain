import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { bridgeCommandConfig, bridgeCommandPath, resolveBridgeToken } from "./mcp-bridge.ts";
import { EBRAIN_MCP_TOKEN_ENV, writeTokenFile } from "./mcp-token.ts";

const TOKEN = `gbrain_${"c".repeat(64)}`;

describe("ebrain MCP bridge", () => {
  test("resolves token from env without touching disk", () => {
    const token = resolveBridgeToken({
      env: { [EBRAIN_MCP_TOKEN_ENV]: TOKEN },
      tokenFile: "/tmp/does-not-exist-ebrain-token",
    });
    expect(token).toBe(TOKEN);
  });

  test("resolves token from chmod-600 token store", () => {
    const dir = mkdtempSync(join(tmpdir(), "ebrain-bridge-token-"));
    const file = join(dir, "mcp-token.env");
    writeTokenFile(TOKEN, file);
    expect(resolveBridgeToken({ env: {}, tokenFile: file })).toBe(TOKEN);
  });

  test("rejects malformed token stores", () => {
    const dir = mkdtempSync(join(tmpdir(), "ebrain-bridge-bad-token-"));
    const file = join(dir, "mcp-token.env");
    writeFileSync(file, "EBRAIN_MCP_TOKEN=not-a-token\n", { mode: 0o600 });
    expect(() => resolveBridgeToken({ env: {}, tokenFile: file })).toThrow(`missing ${EBRAIN_MCP_TOKEN_ENV}`);
  });

  test("command config is command-only and argument-stable", () => {
    const cmd = bridgeCommandPath("/home/test/eBrain");
    expect(cmd).toBe("/home/test/eBrain/scripts/ebrain-mcp-bridge");
    expect(bridgeCommandConfig(cmd)).toEqual({ command: cmd, args: [] });
  });
});
