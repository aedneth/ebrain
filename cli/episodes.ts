#!/usr/bin/env bun
/**
 * ebrain episodes -- private, immutable, path-free local recall records (ADR-008 / F9.2).
 *
 * Episodes are not raw transcripts and do not replace daemon-backed federated knowledge. They are
 * bounded, scrubbed records created by an explicit learning or summary boundary. List and recall
 * expose summaries/excerpts only; a body requires explicit bounded `get` retrieval.
 */
import { chmod, link, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { scrubSecrets } from "./sessions.ts";
import { referencesDeniedRepo } from "./deny-policy.ts";
import { readWorkspaceStore } from "./workspaces.ts";

const HOME = homedir();
const CONFIG_DIR = process.env.EBRAIN_CONFIG_DIR || join(HOME, ".config", "ebrain");
export const DEFAULT_EPISODES_DIR = process.env.EBRAIN_EPISODES_DIR || join(CONFIG_DIR, "episodes");
const MAX_TEXT_CHARS = 6_000;
const MAX_GET_CHARS = 4_000;
const MAX_QUERY_CHARS = 240;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 12;
const MAX_EXCERPT_CHARS = 360;
const SAFE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EPISODE_ID = /^episode-[a-f0-9-]{36}$/;

export type EpisodeKind = "learning" | "session-summary";
/** `legacy-import` is internal provenance for the fixture-only F9.3 adapter. It is deliberately
 * not accepted by the public `episodes record` command. */
export type EpisodeSource = "remember" | "explicit" | "harness-summary" | "legacy-import";

export interface EpisodeRecordInput {
  kind: EpisodeKind;
  source: EpisodeSource;
  project: string;
  agent: string;
  session?: string;
  workspaceId?: string;
  text: string;
}

/** Private immutable relation used only by the fixture-only F9.3 recovery adapter. It never
 * appears in list, recall, get, or TUI output. */
export interface EpisodeMigrationProvenance {
  source: "legacy-fixture-v1";
  fixture_id: string;
  input_hash: string;
}

export interface Episode {
  schema_version: 1;
  id: string;
  kind: EpisodeKind;
  source: EpisodeSource;
  created_at: string;
  project: string;
  agent: string;
  session?: string;
  workspace_id?: string;
  migration?: EpisodeMigrationProvenance;
  content_hash: string;
  text: string;
}

export interface EpisodeSummary {
  id: string;
  kind: EpisodeKind;
  source: EpisodeSource;
  created_at: string;
  project: string;
  agent: string;
  session?: string;
  workspace_id?: string;
  chars: number;
}

export interface RecallResult extends EpisodeSummary {
  score: number;
  excerpt: string;
}

export interface EpisodeStoreOptions {
  dir?: string;
  now?: string;
  workspaceStorePath?: string;
  /** Internal only: fixture migration uses a deterministic ID for recoverable writes. */
  id?: string;
  /** Internal only: binds a legacy fixture identity to an immutable episode for ledger recovery. */
  migration?: EpisodeMigrationProvenance;
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function nowIso(value?: string): string {
  const resolved = value ?? new Date().toISOString();
  if (!ISO_UTC.test(resolved)) throw new Error("episode timestamp must be an ISO UTC timestamp");
  return resolved;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isKind(value: unknown): value is EpisodeKind {
  return value === "learning" || value === "session-summary";
}

function isSource(value: unknown): value is EpisodeSource {
  return value === "remember" || value === "explicit" || value === "harness-summary" || value === "legacy-import";
}

function assertSourceForKind(kind: EpisodeKind, source: EpisodeSource): void {
  if (kind === "learning" && source === "harness-summary") throw new Error("learning episodes cannot use harness-summary source");
  if (kind === "session-summary" && source === "remember") throw new Error("session-summary episodes cannot use remember source");
}

function isPublicRecordSource(value: unknown): value is Exclude<EpisodeSource, "legacy-import"> {
  return value === "remember" || value === "explicit" || value === "harness-summary";
}

function normalizeEpisodeMigration(value: unknown): EpisodeMigrationProvenance | undefined {
  if (value === undefined) return undefined;
  if (!isObj(value) || !hasOnly(value, ["source", "fixture_id", "input_hash"]) || value.source !== "legacy-fixture-v1" || typeof value.fixture_id !== "string" || !SAFE_ID.test(value.fixture_id) || typeof value.input_hash !== "string" || !/^[a-f0-9]{64}$/.test(value.input_hash)) {
    throw new Error("invalid episode migration provenance");
  }
  return { source: "legacy-fixture-v1", fixture_id: value.fixture_id, input_hash: value.input_hash };
}

/** Reject rather than redact at write time. A caller must know exactly what durable text is being
 * committed, and a rejected record cannot later leak a transformed secret through recall. */
export function validateEpisodeText(value: unknown): string {
  if (typeof value !== "string") throw new Error("episode text must be text");
  const text = value.trim();
  if (!text) throw new Error("episode text must not be empty");
  if (text.length > MAX_TEXT_CHARS) throw new Error("episode text exceeds the bounded limit");
  if (/\u0000/.test(text)) throw new Error("episode text contains a control byte");
  if (scrubSecrets(text) !== text) throw new Error("episode text contains secret-shaped content");
  if (referencesDeniedRepo(text)) throw new Error("episode text references a denied client repository");
  return text;
}

function validateSafeLabel(value: unknown, field: string): string {
  if (typeof value !== "string" || !SAFE_LABEL.test(value)) throw new Error(`invalid episode ${field}`);
  return value;
}

function validateSafeId(value: unknown, field: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`invalid episode ${field}`);
  return value;
}

function episodePath(dir: string, id: string): string {
  if (!EPISODE_ID.test(id)) throw new Error("invalid episode id");
  return join(dir, `${id}.json`);
}

async function ensurePrivateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("episode storage directory must be a real directory");
  await chmod(dir, 0o700);
}

async function assertPrivateDir(dir: string): Promise<void> {
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    throw new Error("episode storage directory is not private");
  }
}

async function assertPrivateRecord(path: string): Promise<void> {
  await assertPrivateDir(dirname(path));
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    throw new Error("episode record is not private");
  }
}

/** Create a new private record without replacing an existing immutable episode. `link` provides
 * the no-clobber boundary after the temporary file is fully written in the same directory. */
async function writeNewPrivateAtomic(path: string, body: string): Promise<void> {
  const dir = dirname(path);
  await ensurePrivateDir(dir);
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temp, body, { mode: 0o600 });
  await chmod(temp, 0o600);
  try {
    await link(temp, path);
  } catch (error) {
    if ((error as { code?: string }).code === "EEXIST") throw new Error("episode id already exists");
    throw error;
  } finally {
    await unlink(temp).catch(() => undefined);
  }
  await chmod(path, 0o600);
}

function parseEpisode(value: unknown): Episode {
  const allowed = ["schema_version", "id", "kind", "source", "created_at", "project", "agent", "session", "workspace_id", "migration", "content_hash", "text"];
  if (!isObj(value) || !hasOnly(value, allowed)) throw new Error("invalid episode record");
  const id = typeof value.id === "string" ? value.id : "";
  const kind = value.kind;
  const source = value.source;
  const createdAt = typeof value.created_at === "string" ? value.created_at : "";
  const hash = typeof value.content_hash === "string" ? value.content_hash : "";
  if (value.schema_version !== 1 || !EPISODE_ID.test(id) || !isKind(kind) || !isSource(source) || !ISO_UTC.test(createdAt) || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error("invalid episode record");
  }
  assertSourceForKind(kind, source);
  const project = validateSafeLabel(value.project, "project");
  const agent = validateSafeLabel(value.agent, "agent");
  if (Object.hasOwn(value, "session") && typeof value.session !== "string") throw new Error("invalid episode session");
  if (Object.hasOwn(value, "workspace_id") && typeof value.workspace_id !== "string") throw new Error("invalid episode workspace id");
  const session = typeof value.session === "string" ? validateSafeId(value.session, "session") : undefined;
  const workspaceId = typeof value.workspace_id === "string" ? validateSafeId(value.workspace_id, "workspace id") : undefined;
  const migration = Object.hasOwn(value, "migration") ? normalizeEpisodeMigration(value.migration) : undefined;
  if ((source === "legacy-import") !== Boolean(migration)) throw new Error("invalid episode migration provenance");
  const text = validateEpisodeText(value.text);
  if (sha256(text) !== hash) throw new Error("episode content hash does not match text");
  return {
    schema_version: 1,
    id,
    kind,
    source,
    created_at: createdAt,
    project,
    agent,
    ...(session ? { session } : {}),
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
    ...(migration ? { migration } : {}),
    content_hash: hash,
    text,
  };
}

export function summarizeEpisode(episode: Episode): EpisodeSummary {
  return {
    id: episode.id,
    kind: episode.kind,
    source: episode.source,
    created_at: episode.created_at,
    project: episode.project,
    agent: episode.agent,
    ...(episode.session ? { session: episode.session } : {}),
    ...(episode.workspace_id ? { workspace_id: episode.workspace_id } : {}),
    chars: episode.text.length,
  };
}

async function assertWorkspaceId(workspaceId: string, workspaceStorePath?: string): Promise<void> {
  const store = await readWorkspaceStore(workspaceStorePath);
  if (!store.workspaces.some((workspace) => workspace.id === workspaceId)) throw new Error("episode workspace id must be registered");
}

/** Normalize at the one shared write boundary so an internal fixture adapter cannot bypass the
 * same provenance, identity, and text constraints as ordinary episode creation. */
export function normalizeEpisodeInput(input: EpisodeRecordInput): EpisodeRecordInput {
  assertSourceForKind(input.kind, input.source);
  const project = validateSafeLabel(input.project, "project");
  const agent = validateSafeLabel(input.agent, "agent");
  const session = input.session === undefined ? undefined : validateSafeId(input.session, "session");
  const workspaceId = input.workspaceId === undefined ? undefined : validateSafeId(input.workspaceId, "workspace id");
  const text = validateEpisodeText(input.text);
  return {
    kind: input.kind,
    source: input.source,
    project,
    agent,
    ...(session ? { session } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    text,
  };
}

export async function recordEpisode(
  input: EpisodeRecordInput,
  opts: EpisodeStoreOptions = {},
): Promise<EpisodeSummary> {
  const normalized = normalizeEpisodeInput(input);
  const { project, agent, session, workspaceId, text } = normalized;
  const migration = normalizeEpisodeMigration(opts.migration);
  if ((normalized.source === "legacy-import") !== Boolean(migration)) throw new Error("legacy episode requires migration provenance");
  if (workspaceId) await assertWorkspaceId(workspaceId, opts.workspaceStorePath);
  const id = opts.id ?? `episode-${randomUUID()}`;
  if (!EPISODE_ID.test(id)) throw new Error("invalid episode id");
  const episode: Episode = {
    schema_version: 1,
    id,
    kind: normalized.kind,
    source: normalized.source,
    created_at: nowIso(opts.now),
    project,
    agent,
    ...(session ? { session } : {}),
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
    ...(migration ? { migration } : {}),
    content_hash: sha256(text),
    text,
  };
  const dir = opts.dir ?? DEFAULT_EPISODES_DIR;
  await writeNewPrivateAtomic(episodePath(dir, episode.id), `${JSON.stringify(episode, null, 2)}\n`);
  return summarizeEpisode(episode);
}

export async function readEpisode(id: string, opts: EpisodeStoreOptions = {}): Promise<Episode | null> {
  const dir = opts.dir ?? DEFAULT_EPISODES_DIR;
  const path = episodePath(dir, id);
  if (!existsSync(path)) return null;
  await assertPrivateRecord(path);
  return parseEpisode(JSON.parse(await readFile(path, "utf8")));
}

export async function listEpisodes(limit = DEFAULT_LIMIT, opts: EpisodeStoreOptions = {}): Promise<EpisodeSummary[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new Error("episode limit must be within the bounded range");
  const dir = opts.dir ?? DEFAULT_EPISODES_DIR;
  if (!existsSync(dir)) return [];
  await assertPrivateDir(dir);
  const filenames = (await Array.fromAsync(new Bun.Glob("episode-*.json").scan({ cwd: dir }))).sort();
  const episodes: Episode[] = [];
  for (const filename of filenames) {
    const episode = await readEpisode(filename.replace(/\.json$/, ""), { dir });
    if (episode) episodes.push(episode);
  }
  return episodes
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
    .slice(0, limit)
    .map(summarizeEpisode);
}

/** Internal recovery lookup. It scans only the private episode store and never returns its result
 * through a CLI/TUI surface. Multiple records for one fixture are corruption, not a tie to pick. */
export async function findEpisodeForMigrationFixture(fixtureId: string, opts: EpisodeStoreOptions = {}): Promise<Episode | null> {
  validateSafeId(fixtureId, "migration fixture id");
  const dir = opts.dir ?? DEFAULT_EPISODES_DIR;
  if (!existsSync(dir)) return null;
  await assertPrivateDir(dir);
  const filenames = (await Array.fromAsync(new Bun.Glob("episode-*.json").scan({ cwd: dir }))).sort();
  let match: Episode | null = null;
  for (const filename of filenames) {
    const episode = await readEpisode(filename.replace(/\.json$/, ""), { dir });
    if (!episode || episode.migration?.fixture_id !== fixtureId) continue;
    if (match) throw new Error("duplicate migration fixture provenance");
    match = episode;
  }
  return match;
}

export async function getEpisode(id: string, maxChars = MAX_GET_CHARS, opts: EpisodeStoreOptions = {}): Promise<{ episode: EpisodeSummary; text: string }> {
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > MAX_TEXT_CHARS) throw new Error("episode max chars must be within the bounded range");
  const episode = await readEpisode(id, opts);
  if (!episode) throw new Error("episode not found");
  return { episode: summarizeEpisode(episode), text: episode.text.slice(0, maxChars) };
}

function searchTerms(query: string): string[] {
  const clean = query.trim();
  if (!clean) throw new Error("episode recall query must not be empty");
  if (clean.length > MAX_QUERY_CHARS) throw new Error("episode recall query exceeds the bounded limit");
  if (scrubSecrets(clean) !== clean || /(?:brisas-del-golfo|dekko)/i.test(clean)) throw new Error("episode recall query is not allowed");
  const terms = [...new Set(clean.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 2))].slice(0, 12);
  if (terms.length === 0) throw new Error("episode recall query needs searchable text");
  return terms;
}

function excerptFor(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  const indices = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
  const center = indices.length ? Math.min(...indices) : 0;
  const start = Math.max(0, center - 80);
  const end = Math.min(text.length, start + MAX_EXCERPT_CHARS);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

export async function recallEpisodes(query: string, limit = DEFAULT_LIMIT, opts: EpisodeStoreOptions = {}): Promise<{ query: string; episodes: RecallResult[] }> {
  const terms = searchTerms(query);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new Error("episode limit must be within the bounded range");
  const dir = opts.dir ?? DEFAULT_EPISODES_DIR;
  if (!existsSync(dir)) return { query: query.trim(), episodes: [] };
  await assertPrivateDir(dir);
  const filenames = (await Array.fromAsync(new Bun.Glob("episode-*.json").scan({ cwd: dir }))).sort();
  const rows: RecallResult[] = [];
  for (const filename of filenames) {
    const episode = await readEpisode(filename.replace(/\.json$/, ""), { dir });
    if (!episode) continue;
    const searchable = `${episode.project} ${episode.agent} ${episode.kind} ${episode.source} ${episode.text}`.toLowerCase();
    const score = terms.reduce((count, term) => count + (searchable.includes(term) ? 1 : 0), 0);
    if (score === 0) continue;
    rows.push({ ...summarizeEpisode(episode), score, excerpt: excerptFor(episode.text, terms) });
  }
  rows.sort((left, right) => right.score - left.score || right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id));
  return { query: query.trim(), episodes: rows.slice(0, limit) };
}

interface ParsedArgs {
  sub: string;
  json: boolean;
  yes: boolean;
  values: Map<string, string>;
  positionals: string[];
}

const VALUE_FLAGS = new Set(["--kind", "--source", "--project", "--agent", "--session", "--workspace-id", "--text", "--limit", "--max-chars"]);

export function parseEpisodeArgs(argv: string[]): ParsedArgs {
  const [sub = "list", ...rest] = argv;
  let json = false;
  let yes = false;
  const values = new Map<string, string>();
  const positionals: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]!;
    if (arg === "--json") {
      if (json) throw new Error("--json may be supplied only once");
      json = true;
      continue;
    }
    if (arg === "--yes") {
      if (yes) throw new Error("--yes may be supplied only once");
      yes = true;
      continue;
    }
    if (VALUE_FLAGS.has(arg)) {
      const value = rest[index + 1];
      if (!value || value.startsWith("--") || values.has(arg)) throw new Error(`${arg} requires one value`);
      values.set(arg, value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`unknown episode argument: ${arg}`);
    positionals.push(arg);
  }
  return { sub, json, yes, values, positionals };
}

function onlyValues(args: ParsedArgs, allowed: readonly string[]): void {
  for (const key of args.values.keys()) if (!allowed.includes(key)) throw new Error(`${key} is not valid for episodes ${args.sub}`);
}

function value(args: ParsedArgs, flag: string): string | undefined {
  return args.values.get(flag);
}

function boundedInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error("episode bound must be a positive integer");
  return Number(value);
}

function print(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

function die(message: string, code = 1): never {
  console.error(`error: ${message}`);
  process.exit(code);
}

async function main(): Promise<void> {
  const args = parseEpisodeArgs(process.argv.slice(2));
  if (args.sub === "list") {
    onlyValues(args, ["--limit"]);
    if (args.positionals.length || args.yes) die("usage: ebrain episodes list [--limit N] [--json]", 2);
    return print({ episodes: await listEpisodes(boundedInt(value(args, "--limit"), DEFAULT_LIMIT)) });
  }
  if (args.sub === "get") {
    onlyValues(args, ["--max-chars"]);
    if (args.positionals.length !== 1 || args.yes) die("usage: ebrain episodes get <episode-id> [--max-chars N] [--json]", 2);
    return print(await getEpisode(args.positionals[0]!, boundedInt(value(args, "--max-chars"), MAX_GET_CHARS)));
  }
  if (args.sub === "recall") {
    onlyValues(args, ["--limit"]);
    if (args.positionals.length === 0 || args.yes) die("usage: ebrain episodes recall \"query\" [--limit N] [--json]", 2);
    return print(await recallEpisodes(args.positionals.join(" "), boundedInt(value(args, "--limit"), DEFAULT_LIMIT)));
  }
  if (args.sub === "record") {
    onlyValues(args, ["--kind", "--source", "--project", "--agent", "--session", "--workspace-id", "--text"]);
    if (args.positionals.length || !args.yes) die("usage: ebrain episodes record --kind learning|session-summary --source remember|explicit|harness-summary --project SAFE --agent SAFE [--session SAFE] [--workspace-id GENERATED] --text TEXT --yes [--json]", 2);
    const kind = value(args, "--kind");
    const source = value(args, "--source");
    const project = value(args, "--project");
    const agent = value(args, "--agent");
    const text = value(args, "--text");
    if (!isKind(kind) || !isPublicRecordSource(source) || !project || !agent || !text) die("episode record requires kind, source, project, agent, and text", 2);
    return print({ episode: await recordEpisode({ kind, source, project, agent, session: value(args, "--session"), workspaceId: value(args, "--workspace-id"), text }) });
  }
  die("usage: ebrain episodes <list|get|recall|record> [--json]", 2);
}

if (import.meta.main) main().catch((error) => die(error instanceof Error ? error.message : String(error)));
