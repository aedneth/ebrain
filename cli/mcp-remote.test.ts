import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  extractRegisteredOAuthClient,
  parseRemoteClientEnv,
  readRemoteClientFile,
  remoteClientStorePaths,
  selectFederatedReadSources,
  selectRemoteWriteSource,
  writeRemoteClientFile,
  writeThinClientConfig,
} from "./mcp-remote.ts";

const CLIENT_ID = `gbrain_cl_${"a".repeat(32)}`;
const CLIENT_SECRET = `gbrain_cs_${"b".repeat(32)}`;

describe("mcp remote thin-client config", () => {
  test("parses register-client output without exposing unrelated text", () => {
    const output = `OAuth client registered\n  Client ID:           ${CLIENT_ID}\n  Client Secret:       ${CLIENT_SECRET}\n`;
    expect(extractRegisteredOAuthClient(output)).toEqual({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  });

  test("writes remote client secret store with 0600 permissions", () => {
    const dir = mkdtempSync(join(tmpdir(), "ebrain-remote-client-"));
    const file = join(dir, "remote-client.env");
    writeRemoteClientFile({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }, file);
    expect(readRemoteClientFile(file)).toEqual({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    expect(parseRemoteClientEnv(readFileSync(file, "utf8"))).toEqual({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  test("writes thin config without persisting the OAuth secret", () => {
    const dir = mkdtempSync(join(tmpdir(), "ebrain-thin-config-"));
    const paths = remoteClientStorePaths(dir);
    writeThinClientConfig({
      thinConfigFile: paths.thinConfigFile,
      clientId: CLIENT_ID,
      issuerUrl: "http://127.0.0.1:8541/",
      mcpUrl: "http://127.0.0.1:8541/mcp",
    });
    const raw = readFileSync(paths.thinConfigFile, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.remote_mcp.oauth_client_id).toBe(CLIENT_ID);
    expect(parsed.remote_mcp.issuer_url).toBe("http://127.0.0.1:8541");
    expect(raw).not.toContain(CLIENT_SECRET);
    expect(statSync(paths.thinConfigFile).mode & 0o777).toBe(0o600);
  });

  test("selects agent-memory for writes and federated read sources for reads", () => {
    const sources = [
      { id: "default", federated: false },
      { id: "second-brain", federated: true },
      { id: "company-brain", federated: true },
      { id: "agent-memory", federated: true },
    ];
    const writeSource = selectRemoteWriteSource(sources);
    expect(writeSource).toBe("agent-memory");
    expect(selectFederatedReadSources(sources, writeSource).sort()).toEqual([
      "agent-memory",
      "company-brain",
      "second-brain",
    ]);
  });
});
