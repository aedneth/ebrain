#!/usr/bin/env bun
/**
 * Daemon boot preflight.
 *
 * Runs before `gbrain serve --http` binds the shared MCP endpoint. At this
 * point the host can still open the local PGLite engine safely, so this is the
 * right place for source-isolation enforcement and for minting the separate
 * thin-client credentials used by ebrain-owned CLI wrappers.
 */
import { chmodSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { resolveEbrainHome } from "./ebrain-home.ts";
import { assertNoClientSources, isClientSource } from "./isolation.ts";
import { ensureRemoteCliConfig, type SourceLike } from "./mcp-remote.ts";
import { DEFAULT_PORT, redactSecrets, runProcess } from "./mcp-token.ts";

const HOME = homedir();
const EBRAIN_HOME = resolveEbrainHome();
const CFG = join(HOME, ".config", "ebrain");

interface GbrainSourceJson {
  sources?: Array<{
    id?: unknown;
    name?: unknown;
    local_path?: unknown;
    federated?: unknown;
  }>;
}

export function parseSourcesJson(raw: string): SourceLike[] {
  const parsed = JSON.parse(raw) as GbrainSourceJson;
  if (!Array.isArray(parsed.sources)) throw new Error("sources list JSON did not contain a sources array");
  return parsed.sources
    .map((s) => ({
      id: typeof s.id === "string" ? s.id : "",
      name: typeof s.name === "string" ? s.name : null,
      local_path: typeof s.local_path === "string" ? s.local_path : null,
      federated: s.federated === true,
    }))
    .filter((s) => s.id.length > 0);
}

export function sourceIsolationGuards(sources: readonly SourceLike[]): string[] {
  const guards: string[] = [];
  for (const source of sources) {
    guards.push(source.id);
    if (source.name) guards.push(source.name);
    if (source.local_path) guards.push(source.local_path);
  }
  return guards;
}

export function assertCleanSources(sources: readonly SourceLike[]): void {
  const guards = sourceIsolationGuards(sources);
  assertNoClientSources(guards);
}

async function listLocalSources(timeoutMs = 45_000): Promise<SourceLike[]> {
  const bunBin = process.env.BUN_BIN || process.execPath || "bun";
  const cli = join(EBRAIN_HOME, "vendor", "gbrain", "src", "cli.ts");
  const res = await runProcess(
    [bunBin, "run", cli, "sources", "list", "--json", "--timeout=45000"],
    { cwd: join(CFG, "wd"), timeoutMs },
  );
  if (res.code !== 0) {
    throw new Error(`sources list failed rc=${res.code}: ${redactSecrets(res.stderr || res.stdout).trim() || "no output"}`);
  }
  return parseSourcesJson(res.stdout);
}

function chmodGeminiSettings(): void {
  const file = join(HOME, ".gemini", "settings.json");
  if (!existsSync(file)) return;
  try {
    chmodSync(file, 0o600);
  } catch {
    // Permission hardening is best-effort at boot; `ebrain up` reports agent
    // registration failures separately.
  }
}

async function main(): Promise<void> {
  const quiet = process.argv.includes("--quiet");
  const sources = await listLocalSources();
  // assertCleanSources already throws (count-only) on the same condition. The duplicate check that
  // used to follow re-derived the same list and interpolated the denied identifiers into daemon
  // boot output — the exact pattern the isolation messages were cleaned of.
  assertCleanSources(sources);
  const remote = await ensureRemoteCliConfig({
    configDir: CFG,
    ebrainHome: EBRAIN_HOME,
    sources,
    port: Number(process.env.EBRAIN_BRAIN_PORT || DEFAULT_PORT),
    cwd: join(CFG, "wd"),
  });
  chmodGeminiSettings();
  if (!quiet) {
    const created = remote.created ? "created" : "ready";
    console.log(`daemon preflight: sources clean · CLI thin-client ${created} · write source ${remote.sourceId}`);
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`daemon preflight: ${redactSecrets(e instanceof Error ? e.message : String(e))}`);
    process.exit(1);
  });
}
