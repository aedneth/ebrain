import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { bridgeCommandConfig, bridgeCommandPath, daemonDownMessage, isDaemonUnavailable, requestTimeoutMs, resolveBridgeToken } from "./mcp-bridge.ts";
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

// The bridge's job is not only to proxy: it must let an agent tell "your memory host is gone"
// apart from "that tool returned nothing". Conflating the two is how a session runs for an hour
// with no memory and no one notices.
describe("telling a missing daemon apart from a failing tool", () => {
  test("transport-level failures are recognised as the daemon being unreachable", () => {
    for (const message of [
      "connect ECONNREFUSED 127.0.0.1:8541",
      "fetch failed",
      "read ECONNRESET",
      "socket hang up",
      "Error POSTing to endpoint (HTTP 503): Service Unavailable",
    ]) {
      expect(isDaemonUnavailable(new Error(message))).toBe(true);
    }
  });

  test("an ordinary tool error is NOT treated as a dead daemon", () => {
    // Retrying or auto-starting on these would hide a real failure behind a restart.
    for (const message of [
      // A 4xx is a real answer from a live host: retrying or restarting on it hides the problem.
      "Error POSTing to endpoint (HTTP 401): Unauthorized",
      "Tool 'remember' not found",
      "invalid arguments: query must be a string",
      "MCP error -32602: Invalid params",
      "no results",
    ]) {
      expect(isDaemonUnavailable(new Error(message))).toBe(false);
    }
  });

  test("the unreachable message names the product, the port and the exact fix", () => {
    const message = daemonDownMessage(8541);
    expect(message).toContain("eBrain daemon");
    expect(message).toContain("8541");
    expect(message).toContain("ebrain daemon start");
    expect(message).toContain("memory");
  });

  test("the request deadline is explicit and tunable, never the SDK's silent default", () => {
    const original = process.env.EBRAIN_BRIDGE_TIMEOUT_MS;
    try {
      delete process.env.EBRAIN_BRIDGE_TIMEOUT_MS;
      expect(requestTimeoutMs()).toBe(120_000);
      process.env.EBRAIN_BRIDGE_TIMEOUT_MS = "5000";
      expect(requestTimeoutMs()).toBe(5_000);
      process.env.EBRAIN_BRIDGE_TIMEOUT_MS = "nonsense";
      expect(requestTimeoutMs()).toBe(120_000);
    } finally {
      if (original === undefined) delete process.env.EBRAIN_BRIDGE_TIMEOUT_MS;
      else process.env.EBRAIN_BRIDGE_TIMEOUT_MS = original;
    }
  });
});
