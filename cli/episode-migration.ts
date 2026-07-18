/**
 * Internal fixture-only migration proof (F9.3 / ADR-008).
 *
 * This module intentionally accepts only already-materialized synthetic fixture values. It has no
 * CLI dispatcher, file discovery, input path, remote, transcript, provider, or daemon surface.
 * Its purpose is to prove recoverable migration semantics without touching private legacy data.
 */
import { chmod, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  DEFAULT_EPISODES_DIR,
  findEpisodeForMigrationFixture,
  normalizeEpisodeInput,
  readEpisode,
  recordEpisode,
  summarizeEpisode,
  type Episode,
  type EpisodeKind,
  type EpisodeRecordInput,
  type EpisodeSummary,
} from "./episodes.ts";

const HOME = homedir();
const CONFIG_DIR = process.env.EBRAIN_CONFIG_DIR || join(HOME, ".config", "ebrain");
export const DEFAULT_EPISODE_MIGRATIONS_DIR = process.env.EBRAIN_EPISODE_MIGRATIONS_DIR || join(CONFIG_DIR, "episode-migrations");
const LEDGER_FILE = "legacy-fixture-v1.json";
const SAFE_FIXTURE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EPISODE_ID = /^episode-[a-f0-9-]{36}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export interface LegacyEpisodeFixture {
  schema_version: 1;
  fixture_id: string;
  kind: EpisodeKind;
  occurred_at: string;
  project: string;
  agent: string;
  session?: string;
  workspace_id?: string;
  text: string;
}

interface NormalizedFixture {
  fixtureId: string;
  inputHash: string;
  episodeId: string;
  occurredAt: string;
  input: EpisodeRecordInput;
}

interface MigrationLedgerEntry {
  fixture_id: string;
  input_hash: string;
  episode_id: string;
  imported_at: string;
}

export interface MigrationLedger {
  schema_version: 1;
  source: "legacy-fixture-v1";
  entries: MigrationLedgerEntry[];
}

export interface FixtureMigrationOptions {
  episodeStoreDir?: string;
  migrationDir?: string;
  workspaceStorePath?: string;
  now?: string;
}

export interface FixtureMigrationResult {
  imported: EpisodeSummary[];
  skipped: EpisodeSummary[];
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isKind(value: unknown): value is EpisodeKind {
  return value === "learning" || value === "session-summary";
}

function episodeIdFor(inputHash: string): string {
  return `episode-${inputHash.slice(0, 8)}-${inputHash.slice(8, 12)}-${inputHash.slice(12, 16)}-${inputHash.slice(16, 20)}-${inputHash.slice(20, 32)}`;
}

function isoNow(value?: string): string {
  const resolved = value ?? new Date().toISOString();
  if (!ISO_UTC.test(resolved)) throw new Error("migration timestamp must be an ISO UTC timestamp");
  return resolved;
}

function normalizeFixture(value: unknown): NormalizedFixture {
  const allowed = ["schema_version", "fixture_id", "kind", "occurred_at", "project", "agent", "session", "workspace_id", "text"];
  if (!isObj(value) || !hasOnly(value, allowed) || value.schema_version !== 1) throw new Error("invalid legacy fixture");
  const fixtureId = typeof value.fixture_id === "string" ? value.fixture_id : "";
  const kind = value.kind;
  const occurredAt = typeof value.occurred_at === "string" ? value.occurred_at : "";
  if (!SAFE_FIXTURE_ID.test(fixtureId) || !isKind(kind) || !ISO_UTC.test(occurredAt)) throw new Error("invalid legacy fixture");
  if (Object.hasOwn(value, "session") && typeof value.session !== "string") throw new Error("invalid legacy fixture");
  if (Object.hasOwn(value, "workspace_id") && typeof value.workspace_id !== "string") throw new Error("invalid legacy fixture");
  const input = normalizeEpisodeInput({
    kind,
    source: "legacy-import",
    project: value.project as string,
    agent: value.agent as string,
    ...(typeof value.session === "string" ? { session: value.session } : {}),
    ...(typeof value.workspace_id === "string" ? { workspaceId: value.workspace_id } : {}),
    text: value.text as string,
  });
  const canonical = JSON.stringify({
    schema_version: 1,
    fixture_id: fixtureId,
    kind: input.kind,
    occurred_at: occurredAt,
    project: input.project,
    agent: input.agent,
    ...(input.session ? { session: input.session } : {}),
    ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
    text: input.text,
  });
  const inputHash = sha256(canonical);
  return { fixtureId, inputHash, episodeId: episodeIdFor(inputHash), occurredAt, input };
}

async function ensurePrivateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("migration storage directory must be a real directory");
  await chmod(dir, 0o700);
}

async function assertPrivateDir(dir: string): Promise<void> {
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error("migration storage directory is not private");
}

async function assertPrivateLedger(path: string): Promise<void> {
  await assertPrivateDir(dirname(path));
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error("migration ledger is not private");
}

function ledgerPath(dir: string): string {
  return join(dir, LEDGER_FILE);
}

function emptyLedger(): MigrationLedger {
  return { schema_version: 1, source: "legacy-fixture-v1", entries: [] };
}

function parseLedger(raw: unknown): MigrationLedger {
  if (!isObj(raw) || !hasOnly(raw, ["schema_version", "source", "entries"]) || raw.schema_version !== 1 || raw.source !== "legacy-fixture-v1" || !Array.isArray(raw.entries)) {
    throw new Error("invalid migration ledger");
  }
  const entries: MigrationLedgerEntry[] = [];
  const ids = new Set<string>();
  for (const entry of raw.entries) {
    const allowed = ["fixture_id", "input_hash", "episode_id", "imported_at"];
    if (!isObj(entry) || !hasOnly(entry, allowed) || typeof entry.fixture_id !== "string" || !SAFE_FIXTURE_ID.test(entry.fixture_id) || typeof entry.input_hash !== "string" || !SHA256.test(entry.input_hash) || typeof entry.episode_id !== "string" || !EPISODE_ID.test(entry.episode_id) || typeof entry.imported_at !== "string" || !ISO_UTC.test(entry.imported_at) || ids.has(entry.fixture_id)) {
      throw new Error("invalid migration ledger");
    }
    ids.add(entry.fixture_id);
    entries.push({ fixture_id: entry.fixture_id, input_hash: entry.input_hash, episode_id: entry.episode_id, imported_at: entry.imported_at });
  }
  return { schema_version: 1, source: "legacy-fixture-v1", entries };
}

export async function readLegacyFixtureMigrationLedger(opts: Pick<FixtureMigrationOptions, "migrationDir"> = {}): Promise<MigrationLedger> {
  const dir = opts.migrationDir ?? DEFAULT_EPISODE_MIGRATIONS_DIR;
  const path = ledgerPath(dir);
  if (!existsSync(path)) {
    if (existsSync(dir)) await assertPrivateDir(dir);
    return emptyLedger();
  }
  await assertPrivateLedger(path);
  return parseLedger(JSON.parse(await readFile(path, "utf8")));
}

async function writeLedger(ledger: MigrationLedger, dir: string): Promise<void> {
  const body = `${JSON.stringify(parseLedger(ledger), null, 2)}\n`;
  await ensurePrivateDir(dir);
  const path = ledgerPath(dir);
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temp, body, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
  await chmod(path, 0o600);
}

function matchesFixture(episode: Episode, fixture: NormalizedFixture): boolean {
  return episode.id === fixture.episodeId
    && episode.kind === fixture.input.kind
    && episode.source === "legacy-import"
    && episode.created_at === fixture.occurredAt
    && episode.project === fixture.input.project
    && episode.agent === fixture.input.agent
    && episode.session === fixture.input.session
    && episode.workspace_id === fixture.input.workspaceId
    && episode.migration?.source === "legacy-fixture-v1"
    && episode.migration.fixture_id === fixture.fixtureId
    && episode.migration.input_hash === fixture.inputHash
    && episode.text === fixture.input.text;
}

function addLedgerEntry(ledger: MigrationLedger, fixture: NormalizedFixture, importedAt: string): MigrationLedger {
  return {
    ...ledger,
    entries: [...ledger.entries, {
      fixture_id: fixture.fixtureId,
      input_hash: fixture.inputHash,
      episode_id: fixture.episodeId,
      imported_at: importedAt,
    }].sort((left, right) => left.fixture_id.localeCompare(right.fixture_id)),
  };
}

/**
 * Migrate synthetic fixtures with per-record recovery. A process interruption after an episode
 * write and before its ledger write is recovered by deterministic ID plus exact record matching.
 * This is intentionally not a public import mechanism or a cross-file transaction.
 */
export async function migrateLegacyEpisodeFixtures(fixtures: unknown[], opts: FixtureMigrationOptions = {}): Promise<FixtureMigrationResult> {
  if (!Array.isArray(fixtures)) throw new Error("legacy fixtures must be an array");
  const normalized = fixtures.map(normalizeFixture);
  const seen = new Set<string>();
  for (const fixture of normalized) {
    if (seen.has(fixture.fixtureId)) throw new Error("duplicate legacy fixture id");
    seen.add(fixture.fixtureId);
  }

  const episodeStoreDir = opts.episodeStoreDir ?? DEFAULT_EPISODES_DIR;
  const migrationDir = opts.migrationDir ?? DEFAULT_EPISODE_MIGRATIONS_DIR;
  let ledger = await readLegacyFixtureMigrationLedger({ migrationDir });
  const imported: EpisodeSummary[] = [];
  const skipped: EpisodeSummary[] = [];

  for (const fixture of normalized) {
    const entry = ledger.entries.find((candidate) => candidate.fixture_id === fixture.fixtureId);
    if (entry && (entry.input_hash !== fixture.inputHash || entry.episode_id !== fixture.episodeId)) {
      throw new Error("legacy fixture input changed after migration");
    }
    const existingForFixture = await findEpisodeForMigrationFixture(fixture.fixtureId, { dir: episodeStoreDir });
    if (existingForFixture && (!matchesFixture(existingForFixture, fixture) || existingForFixture.id !== fixture.episodeId)) {
      throw new Error("legacy fixture input changed after migration");
    }
    const existing = await readEpisode(fixture.episodeId, { dir: episodeStoreDir });
    if (entry) {
      if (!existing || !matchesFixture(existing, fixture)) throw new Error("migration ledger does not match immutable episode");
      skipped.push(summarizeEpisode(existing));
      continue;
    }
    if (existing) {
      if (!matchesFixture(existing, fixture)) throw new Error("deterministic episode does not match legacy fixture");
      skipped.push(summarizeEpisode(existing));
    } else {
      imported.push(await recordEpisode(fixture.input, {
        dir: episodeStoreDir,
        workspaceStorePath: opts.workspaceStorePath,
        now: fixture.occurredAt,
        id: fixture.episodeId,
        migration: { source: "legacy-fixture-v1", fixture_id: fixture.fixtureId, input_hash: fixture.inputHash },
      }));
    }
    ledger = addLedgerEntry(ledger, fixture, isoNow(opts.now));
    await writeLedger(ledger, migrationDir);
  }
  return { imported, skipped };
}
