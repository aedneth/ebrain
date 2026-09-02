import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  extractCreatedToken,
  isValidMcpToken,
  parseTokenEnv,
  readTokenFile,
  redactSecrets,
  removeTokenFileForTests,
  toolsCountFromMcpBody,
  writeTokenFile,
} from "./mcp-token.ts";

const TOKEN = `gbrain_${"a".repeat(64)}`;

describe("mcp token store", () => {
  test("validates gbrain bearer token shape", () => {
    expect(isValidMcpToken(TOKEN)).toBe(true);
    expect(isValidMcpToken("not-a-token")).toBe(false);
  });

  test("parses sourceable EBRAIN_MCP_TOKEN files", () => {
    expect(parseTokenEnv(`# comment\nexport EBRAIN_MCP_TOKEN='${TOKEN}'\n`)).toBe(TOKEN);
    expect(parseTokenEnv(`EBRAIN_MCP_TOKEN=${TOKEN}\n`)).toBe(TOKEN);
    expect(parseTokenEnv("EBRAIN_MCP_TOKEN=bad\n")).toBeNull();
  });

  test("writes token store with 0600 permissions", () => {
    const dir = mkdtempSync(join(tmpdir(), "ebrain-token-"));
    const file = join(dir, "mcp-token.env");
    removeTokenFileForTests(file);
    writeTokenFile(TOKEN, file);
    expect(readTokenFile(file)).toBe(TOKEN);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, "utf8")).toContain("EBRAIN_MCP_TOKEN=");
  });

  test("extracts token from gbrain auth create output", () => {
    const output = `Token created for "agent":\n\n  ${TOKEN}\n\nSave this token`;
    expect(extractCreatedToken(output)).toBe(TOKEN);
  });

  test("redacts bearer tokens and known exact secrets", () => {
    const text = `Authorization: Bearer ${TOKEN}\nraw ${TOKEN}\nknown secret-value`;
    const redacted = redactSecrets(text, ["secret-value"]);
    expect(redacted).not.toContain(TOKEN);
    expect(redacted).not.toContain("secret-value");
    expect(redacted).toContain("[REDACTED]");
  });

  test("counts tools from plain JSON and SSE MCP responses", () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "a" }, { name: "b" }] } });
    expect(toolsCountFromMcpBody(body)).toBe(2);
    expect(toolsCountFromMcpBody(`event: message\ndata: ${body}\n\n`)).toBe(2);
  });
});
