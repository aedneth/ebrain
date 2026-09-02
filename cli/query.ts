#!/usr/bin/env bun
/** Structured cross-source memory query adapter for `ebrain q`. */
import { isClientSourceRecord } from "./isolation.ts";
import { redactSecrets } from "./mcp-token.ts";
import { callTool } from "./remote-tools.ts";
import { scrubSecrets } from "./sessions.ts";

export interface QuerySource {
  id: string;
  name?: string;
  path?: string;
  federated: boolean;
}

export interface QueryResult {
  score: number;
  source: string;
  slug: string;
  snippet: string;
}

export interface QueryFailure {
  source: string;
  message: string;
}

export interface QueryResponse {
  schema_version: 1;
  query: string;
  results: QueryResult[];
  partial: boolean;
  failures: QueryFailure[];
}

interface QueryDeps {
  listSources: () => Promise<unknown>;
  querySource: (source: string, query: string, limit: number) => Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Error text from a failed source query can carry EITHER an MCP/Bearer/Authorization token
// (redactSecrets) OR a general secret shape — an API key, a PEM block, a `NAME=value` assignment
// (scrubSecrets). Compose both so a leaked assignment never survives in failures[].message or the
// top-level error (G56-F-CF-3: redactSecrets alone let a bare assignment through).
function scrubMessage(text: string): string {
  return scrubSecrets(redactSecrets(text));
}

export function parseFederatedSources(value: unknown): QuerySource[] {
  if (!isRecord(value) || !Array.isArray(value.sources)) {
    throw new Error("sources_list returned an invalid payload");
  }
  return value.sources
    .filter(isRecord)
    .map((source): QuerySource | null => {
      if (typeof source.id !== "string" || !source.id.trim() || source.federated !== true) return null;
      // gbrain `sources_list` exposes the local path as `local_path` (not `path`); reading the
      // wrong field silently disabled path-based client isolation. Carry it as `path` so
      // isClientSourceRecord() can deny a source whose local_path is under a client repo (G56-F5).
      const normalized: QuerySource = {
        id: source.id.trim(),
        federated: true,
        ...(typeof source.name === "string" ? { name: source.name } : {}),
        ...(typeof source.local_path === "string" ? { path: source.local_path } : {}),
      };
      if (normalized.id === "default" || isClientSourceRecord(normalized)) return null;
      return normalized;
    })
    .filter((source): source is QuerySource => source !== null);
}

export function parseSourceResults(source: string, value: unknown): QueryResult[] {
  if (!Array.isArray(value)) throw new Error("query returned an invalid payload");
  const out: QueryResult[] = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const score = row.score;
    const slug = row.slug;
    const snippet = row.chunk_text;
    if (typeof score !== "number" || !Number.isFinite(score) || typeof slug !== "string" || !slug.trim()) continue;
    out.push({
      score,
      source,
      slug: scrubSecrets(slug.trim()),
      snippet: scrubSecrets(typeof snippet === "string" ? snippet : ""),
    });
  }
  return out;
}

export function mergeQueryResults(results: QueryResult[], limit: number): QueryResult[] {
  const sorted = [...results].sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  const seen = new Set<string>();
  const out: QueryResult[] = [];
  for (const result of sorted) {
    if (seen.has(result.slug)) continue;
    seen.add(result.slug);
    out.push(result);
    if (out.length >= limit) break;
  }
  return out;
}

const DEFAULT_DEPS: QueryDeps = {
  listSources: () => callTool("sources_list", {}),
  querySource: (source, query, limit) => callTool("query", {
    query,
    source_id: source,
    limit,
    expand: false,
  }, 30_000),
};

export async function queryAcrossSources(
  query: string,
  limit = 10,
  deps: QueryDeps = DEFAULT_DEPS,
): Promise<QueryResponse> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("query cannot be empty");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be an integer between 1 and 100");

  const sources = parseFederatedSources(await deps.listSources());
  if (sources.length === 0) throw new Error("no eligible federated sources are available");

  const rows: QueryResult[] = [];
  const failures: QueryFailure[] = [];
  for (const source of sources) {
    try {
      rows.push(...parseSourceResults(source.id, await deps.querySource(source.id, trimmed, limit)));
    } catch (error) {
      failures.push({
        source: source.id,
        message: scrubMessage(error instanceof Error ? error.message : String(error)),
      });
    }
  }
  if (failures.length === sources.length) {
    throw new Error(`all federated source queries failed (${failures.map((failure) => failure.source).join(", ")})`);
  }
  return {
    schema_version: 1,
    query: trimmed,
    results: mergeQueryResults(rows, limit),
    partial: failures.length > 0,
    failures,
  };
}

function parseArgs(argv: string[]): { query: string; limit: number; json: boolean } {
  const json = argv.includes("--json");
  const positional = argv.filter((arg) => arg !== "--json");
  const query = positional[0] ?? "";
  const limit = positional[1] == null ? 10 : Number(positional[1]);
  return { query, limit, json };
}

function printText(payload: QueryResponse): void {
  for (const result of payload.results) {
    console.log(`${result.source.padEnd(14)} [${result.score.toFixed(4)}] ${result.slug} -- ${result.snippet}`);
  }
  if (payload.partial) {
    console.error(`warning: ${payload.failures.length} federated source query failed`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.query) throw new Error('usage: ebrain q "<question>" [topN] [--json]');
  const payload = await queryAcrossSources(args.query, args.limit);
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else printText(payload);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`ebrain q: ${scrubMessage(error instanceof Error ? error.message : String(error))}`);
    process.exit(1);
  });
}
