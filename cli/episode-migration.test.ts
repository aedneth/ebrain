import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  migrateLegacyEpisodeFixtures,
  readLegacyFixtureMigrationLedger,
} from "./episode-migration.ts";
import { listEpisodes, readEpisode } from "./episodes.ts";
import { addWorkspace, writeWorkspaceStore } from "./workspaces.ts";

const roots: string[] = [];
function root(): string {
  const value = mkdtempSync(join(tmpdir(), "ebrain-fixture-migration-"));
  roots.push(value);
  return value;
}

function paths(base: string): { episodes: string; migrations: string; workspaceStore: string } {
  return {
    episodes: join(base, "episodes"),
    migrations: join(base, "episode-migrations"),
    workspaceStore: join(base, "config", "workspaces.json"),
  };
}

function learning(id = "learning-one", text = "Keep migration fixtures synthetic and bounded."): unknown {
  return {
    schema_version: 1,
    fixture_id: id,
    kind: "learning",
    occurred_at: "2026-07-18T04:00:00.000Z",
    project: "ebrain",
    agent: "codex",
    text,
  };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("F9.3 fixture-only episode migration", () => {
  test("imports bounded synthetic provenance, preserves timestamps, and keeps the ledger path/text-free", async () => {
    const base = root();
    const p = paths(base);
    const fixtures = [
      learning(),
      {
        schema_version: 1,
        fixture_id: "session-one",
        kind: "session-summary",
        occurred_at: "2026-07-18T04:01:00.000Z",
        project: "ebrain",
        agent: "claude",
        session: "ebr-claude-memory",
        text: "The synthetic session ended with a reviewed checklist.",
      },
    ];
    const result = await migrateLegacyEpisodeFixtures(fixtures, {
      episodeStoreDir: p.episodes,
      migrationDir: p.migrations,
      now: "2026-07-18T05:00:00.000Z",
    });
    expect(result.imported).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    const episodes = await listEpisodes(10, { dir: p.episodes });
    expect(episodes).toHaveLength(2);
    expect(episodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "legacy-import", created_at: "2026-07-18T04:00:00.000Z", project: "ebrain", agent: "codex" }),
      expect.objectContaining({ source: "legacy-import", created_at: "2026-07-18T04:01:00.000Z", session: "ebr-claude-memory" }),
    ]));
    expect("migration" in episodes[0]!).toBe(false);
    const stored = await readEpisode(result.imported[0]!.id, { dir: p.episodes });
    expect(stored?.migration).toMatchObject({ source: "legacy-fixture-v1", fixture_id: "learning-one" });
    expect(statSync(p.episodes).mode & 0o777).toBe(0o700);
    expect(statSync(p.migrations).mode & 0o777).toBe(0o700);
    expect(statSync(join(p.migrations, "legacy-fixture-v1.json")).mode & 0o777).toBe(0o600);
    const ledger = await readLegacyFixtureMigrationLedger({ migrationDir: p.migrations });
    expect(ledger.entries).toHaveLength(2);
    expect(JSON.stringify(ledger)).not.toContain("Keep migration fixtures");
    expect(JSON.stringify(ledger)).not.toContain("path");
    expect(Object.keys(ledger.entries[0]!).sort()).toEqual(["episode_id", "fixture_id", "imported_at", "input_hash"]);
  });

  test("is idempotent and repairs a missing ledger entry from an exact immutable episode", async () => {
    const base = root();
    const p = paths(base);
    const fixtures = [learning()];
    const first = await migrateLegacyEpisodeFixtures(fixtures, { episodeStoreDir: p.episodes, migrationDir: p.migrations, now: "2026-07-18T05:00:00.000Z" });
    expect(first.imported).toHaveLength(1);
    const second = await migrateLegacyEpisodeFixtures(fixtures, { episodeStoreDir: p.episodes, migrationDir: p.migrations, now: "2026-07-18T05:01:00.000Z" });
    expect(second.imported).toHaveLength(0);
    expect(second.skipped).toHaveLength(1);

    rmSync(join(p.migrations, "legacy-fixture-v1.json"));
    const repaired = await migrateLegacyEpisodeFixtures(fixtures, { episodeStoreDir: p.episodes, migrationDir: p.migrations, now: "2026-07-18T05:02:00.000Z" });
    expect(repaired.imported).toHaveLength(0);
    expect(repaired.skipped).toHaveLength(1);
    expect(await listEpisodes(10, { dir: p.episodes })).toHaveLength(1);
    expect((await readLegacyFixtureMigrationLedger({ migrationDir: p.migrations })).entries).toHaveLength(1);

    rmSync(join(p.migrations, "legacy-fixture-v1.json"));
    await expect(migrateLegacyEpisodeFixtures([learning("learning-one", "A changed fixture remains blocked after ledger loss.")], { episodeStoreDir: p.episodes, migrationDir: p.migrations })).rejects.toThrow("input changed");
    expect(await listEpisodes(10, { dir: p.episodes })).toHaveLength(1);
  });

  test("refuses a changed fixture, duplicate fixture IDs, unknown fields, unsafe text, and denied clients before a partial write", async () => {
    const base = root();
    const p = paths(base);
    await migrateLegacyEpisodeFixtures([learning()], { episodeStoreDir: p.episodes, migrationDir: p.migrations });
    await expect(migrateLegacyEpisodeFixtures([learning("learning-one", "Changed content must not overwrite history.")], { episodeStoreDir: p.episodes, migrationDir: p.migrations })).rejects.toThrow("input changed");

    const invalidSets: unknown[][] = [
      [learning("duplicate"), learning("duplicate")],
      [{ ...learning("unknown"), extra: "not accepted" }],
      [{ ...learning("secret"), text: "OPENROUTER_API_KEY=example-placeholder" }],
      [{ ...learning("client"), text: "A denied client repository is not migration input: dekko." }],
    ];
    for (const fixtures of invalidSets) {
      await expect(migrateLegacyEpisodeFixtures(fixtures, { episodeStoreDir: join(base, `episodes-${fixtures.length}-${String((fixtures[0] as { fixture_id?: string }).fixture_id)}`), migrationDir: join(base, `migrations-${String((fixtures[0] as { fixture_id?: string }).fixture_id)}`) })).rejects.toThrow();
    }
    expect(await listEpisodes(10, { dir: p.episodes })).toHaveLength(1);
  });

  test("requires a generated registered workspace identity and fails closed on private-ledger mode or symlink violations", async () => {
    const base = root();
    const p = paths(base);
    const workspaceDir = join(base, "workspace");
    mkdirSync(workspaceDir);
    const store = await addWorkspace({ schema_version: 1, workspaces: [] }, { label: "API", cwd: workspaceDir });
    await writeWorkspaceStore(store, p.workspaceStore);
    const fixture = {
      ...learning("workspace-one"),
      workspace_id: "api",
    };
    await expect(migrateLegacyEpisodeFixtures([fixture], { episodeStoreDir: p.episodes, migrationDir: p.migrations, workspaceStorePath: p.workspaceStore })).resolves.toMatchObject({ imported: [expect.objectContaining({ workspace_id: "api" })] });
    await expect(migrateLegacyEpisodeFixtures([{ ...learning("workspace-missing"), workspace_id: "missing" }], { episodeStoreDir: p.episodes, migrationDir: p.migrations, workspaceStorePath: p.workspaceStore })).rejects.toThrow("must be registered");

    const widened = paths(root());
    mkdirSync(widened.migrations, { recursive: true, mode: 0o700 });
    chmodSync(widened.migrations, 0o755);
    await expect(migrateLegacyEpisodeFixtures([learning("widened")], { episodeStoreDir: widened.episodes, migrationDir: widened.migrations })).rejects.toThrow("not private");

    const linked = paths(root());
    const target = join(root(), "ledger-target");
    mkdirSync(target, { recursive: true, mode: 0o700 });
    symlinkSync(target, linked.migrations);
    await expect(migrateLegacyEpisodeFixtures([learning("linked")], { episodeStoreDir: linked.episodes, migrationDir: linked.migrations })).rejects.toThrow("not private");
  });

  test("has no public dispatcher import or migration command surface", async () => {
    const dispatcher = readFileSync(join(import.meta.dir, "ebrain"), "utf8");
    expect(dispatcher).not.toContain("episode-migration");
    expect(dispatcher).not.toContain("episodes import");
    expect(dispatcher).not.toContain("episodes migrate");
    expect(existsSync(join(import.meta.dir, "episode-migration.ts"))).toBe(true);

    const base = root();
    const p = paths(base);
    const proc = Bun.spawn([
      "bun", join(import.meta.dir, "episodes.ts"), "record",
      "--kind", "learning", "--source", "legacy-import", "--project", "ebrain", "--agent", "codex", "--text", "fixture-only", "--yes",
    ], {
      env: { ...process.env, EBRAIN_EPISODES_DIR: p.episodes },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    expect(code).toBe(2);
    expect(stderr).toContain("requires kind, source, project, agent, and text");
    expect(await listEpisodes(10, { dir: p.episodes })).toEqual([]);
  });
});
