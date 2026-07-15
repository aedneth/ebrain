#!/usr/bin/env bun
/**
 * Small ebrain-owned remote MCP helper.
 *
 * This exists for shell wrappers that need MCP tools not exposed as visible
 * gbrain CLI commands (`sources_list`, `put_page`) while the daemon owns the
 * local PGLite lock.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { redactSecrets } from "./mcp-token.ts";
import {
  GBRAIN_REMOTE_CLIENT_SECRET_ENV,
  parseRemoteClientEnv,
  remoteClientStorePaths,
} from "./mcp-remote.ts";

const HOME = homedir();
const CFG = join(HOME, ".config", "ebrain");

function prepareThinClientEnv(): void {
  const paths = remoteClientStorePaths(CFG);
  if (!process.env.GBRAIN_HOME && existsSync(paths.thinConfigFile)) {
    process.env.GBRAIN_HOME = paths.thinHome;
  }
  if (!process.env[GBRAIN_REMOTE_CLIENT_SECRET_ENV] && existsSync(paths.secretFile)) {
    const client = parseRemoteClientEnv(readFileSync(paths.secretFile, "utf8"));
    if (client) process.env[GBRAIN_REMOTE_CLIENT_SECRET_ENV] = client.clientSecret;
  }
}

async function callTool<T>(name: string, args: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<T> {
  prepareThinClientEnv();
  const { loadConfig } = await import("../vendor/gbrain/src/core/config.ts");
  const { callRemoteTool, unpackToolResult } = await import("../vendor/gbrain/src/core/mcp-client.ts");
  const cfg = loadConfig();
  if (!cfg?.remote_mcp) throw new Error("remote MCP config missing; restart the ebrain daemon or run 'ebrain up'");
  const raw = await callRemoteTool(cfg, name, args, { timeoutMs });
  return unpackToolResult<T>(raw);
}

function argValue(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] ?? null : null;
}

async function sourcesList(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const result = await callTool<{ sources: unknown[] }>("sources_list", {});
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const s of result.sources as Array<Record<string, unknown>>) {
    const id = String(s.id ?? "");
    const fed = s.federated === true ? "federated" : "isolated";
    const pages = String(s.page_count ?? "?");
    console.log(`${id.padEnd(20)} ${fed.padEnd(10)} ${pages.padStart(6)} pages`);
  }
}

async function putPage(args: string[]): Promise<void> {
  const source = argValue(args, "--source") ?? "agent-memory";
  const slug = argValue(args, "--slug");
  const file = argValue(args, "--file");
  if (!slug || !file) throw new Error("usage: remote-tools put-page --source <id> --slug <slug> --file <path>");
  const content = readFileSync(file, "utf8");
  const result = await callTool<Record<string, unknown>>("put_page", { slug, content }, 60_000);
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(`put-page ${source}/${slug} ok`);
}

async function submitCycle(args: string[]): Promise<void> {
  const source = argValue(args, "--source");
  const phases = (argValue(args, "--phases") ?? "sync,extract,embed").split(",").map((s) => s.trim()).filter(Boolean);
  const data: Record<string, unknown> = { phases };
  if (source) data.source_id = source;
  const result = await callTool<Record<string, unknown>>("submit_job", {
    name: "autopilot-cycle",
    data,
    max_attempts: 1,
  }, 30_000);
  console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  const [cmd = "", ...args] = process.argv.slice(2);
  switch (cmd) {
    case "sources-list":
      await sourcesList(args);
      return;
    case "put-page":
      await putPage(args);
      return;
    case "submit-cycle":
      await submitCycle(args);
      return;
    default:
      throw new Error("usage: remote-tools {sources-list|put-page|submit-cycle}");
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`remote-tools: ${redactSecrets(e instanceof Error ? e.message : String(e))}`);
    process.exit(1);
  });
}
