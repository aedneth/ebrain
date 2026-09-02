import { afterEach, describe, expect, test } from "bun:test";

// Deny policy is operator configuration; this suite declares its own neutral fixture policy.
process.env.EBRAIN_DENIED_REPOS = "denied-alpha,denied-beta";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  getEpisode,
  listEpisodes,
  parseEpisodeArgs,
  readEpisode,
  recallEpisodes,
  recordEpisode,
  validateEpisodeText,
} from "./episodes.ts";
import { addWorkspace, writeWorkspaceStore } from "./workspaces.ts";

const roots: string[] = [];
function root(): string {
  const value = mkdtempSync(join(tmpdir(), "ebrain-episodes-"));
  roots.push(value);
  return value;
}

const REPO_ROOT = join(import.meta.dir, "..");
const REMEMBER_SCRIPT = join(REPO_ROOT, "harness", "core", "remember.sh");

async function runRemember(home: string, bunBin: string): Promise<{ code: number; stdout: string; stderr: string }> {
  // EBRAIN_HOME locates the CODE (trust policy, episode mirror) and must stay the real checkout;
  // EBRAIN_MEMORY_HOME locates USER DATA and is what the sandbox redirects. Keeping them separate
  // is why a non-default checkout no longer drags the memory store along with it. The real trust
  // policy runs here — the suite's neutral fixture policy (top of file) is what it loads.
  const proc = Bun.spawn(["bash", REMEMBER_SCRIPT, "--no-sync", "--project", "fixture", "A durable explicit learning."], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      HOME: home,
      EBRAIN_HOME: REPO_ROOT,
      EBRAIN_MEMORY_HOME: join(home, "eBrain", "memory"),
      EBRAIN_CONFIG_DIR: join(home, "config"),
      BUN_BIN: bunBin,
      AGENT_NAME: "codex",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, stdout, stderr };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("immutable local episodes", () => {
  test("records private summaries, retrieves explicitly, and recalls bounded excerpts", async () => {
    const dir = root();
    const opts = { dir: join(dir, "episodes"), now: "2026-07-18T00:00:00.000Z" };
    const first = await recordEpisode({
      kind: "learning", source: "explicit", project: "ebrain", agent: "codex", session: "ebr-codex-memory", text: "Prefer explicit verification after a structural change.",
    }, opts);
    const second = await recordEpisode({
      kind: "learning", source: "explicit", project: "ebrain", agent: "codex", text: "Prefer explicit verification after a structural change.",
    }, { ...opts, now: "2026-07-18T00:01:00.000Z" });
    expect(first.id).not.toBe(second.id);
    expect(statSync(opts.dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(opts.dir, `${first.id}.json`)).mode & 0o777).toBe(0o600);

    const listed = await listEpisodes(10, opts);
    expect(listed).toHaveLength(2);
    expect(listed[0]).toMatchObject({ id: second.id, kind: "learning", source: "explicit" });
    expect("text" in listed[0]!).toBe(false);
    expect("path" in listed[0]!).toBe(false);

    const fetched = await getEpisode(first.id, 18, opts);
    expect(fetched.text).toHaveLength(18);
    expect(fetched.episode.id).toBe(first.id);
    const recalled = await recallEpisodes("explicit verification", 5, opts);
    expect(recalled.episodes).toHaveLength(2);
    expect(recalled.episodes[0]).toMatchObject({ score: 2 });
    expect(recalled.episodes[0]!.excerpt).toContain("explicit verification");
    expect("text" in recalled.episodes[0]!).toBe(false);
    expect("path" in recalled.episodes[0]!).toBe(false);
  });

  test("requires a registered generated workspace identity but keeps historical provenance path-free", async () => {
    const dir = root();
    const workspaceDir = join(dir, "workspace");
    const workspaceStorePath = join(dir, "config", "workspaces.json");
    mkdirSync(workspaceDir);
    const store = await addWorkspace({ schema_version: 1, workspaces: [] }, { label: "API", cwd: workspaceDir });
    await writeWorkspaceStore(store, workspaceStorePath);
    const opts = { dir: join(dir, "episodes"), workspaceStorePath, now: "2026-07-18T00:00:00.000Z" };
    const episode = await recordEpisode({
      kind: "session-summary", source: "harness-summary", project: "ebrain", agent: "claude", workspaceId: "api", text: "Session ended with a reviewed migration checklist.",
    }, opts);
    expect(episode.workspace_id).toBe("api");
    await expect(recordEpisode({
      kind: "learning", source: "explicit", project: "ebrain", agent: "codex", workspaceId: "missing", text: "A bounded learning.",
    }, opts)).rejects.toThrow("must be registered");
  });

  test("rejects secret-shaped, denied-client, malformed-source, and oversized inputs", async () => {
    const dir = root();
    const opts = { dir: join(dir, "episodes"), now: "2026-07-18T00:00:00.000Z" };
    await expect(recordEpisode({
      kind: "learning", source: "explicit", project: "ebrain", agent: "codex", text: "OPENROUTER_API_KEY=example-placeholder",
    }, opts)).rejects.toThrow("secret-shaped");
    await expect(recordEpisode({
      kind: "learning", source: "explicit", project: "ebrain", agent: "codex", text: "Work in denied-alpha.",
    }, opts)).rejects.toThrow("denied client");
    await expect(recordEpisode({
      kind: "learning", source: "harness-summary", project: "ebrain", agent: "codex", text: "A bounded learning.",
    }, opts)).rejects.toThrow("cannot use harness-summary");
    expect(() => validateEpisodeText("x".repeat(6_001))).toThrow("bounded limit");
  });

  test("fails closed on malformed records, widened permissions, and symlink records", async () => {
    const dir = root();
    const episodesDir = join(dir, "episodes");
    mkdirSync(episodesDir, { recursive: true, mode: 0o700 });
    chmodSync(episodesDir, 0o700);
    const id = "episode-00000000-0000-4000-8000-000000000000";
    writeFileSync(join(episodesDir, `${id}.json`), JSON.stringify({ schema_version: 1, id, unknown: true }) + "\n", { mode: 0o600 });
    chmodSync(join(episodesDir, `${id}.json`), 0o600);
    await expect(readEpisode(id, { dir: episodesDir })).rejects.toThrow("invalid episode record");

    const valid = await recordEpisode({ kind: "learning", source: "explicit", project: "ebrain", agent: "codex", text: "Private record." }, { dir: join(dir, "private"), now: "2026-07-18T00:00:00.000Z" });
    const privateDir = join(dir, "private");
    chmodSync(join(privateDir, `${valid.id}.json`), 0o644);
    await expect(readEpisode(valid.id, { dir: privateDir })).rejects.toThrow("record is not private");
    chmodSync(join(privateDir, `${valid.id}.json`), 0o600);
    chmodSync(privateDir, 0o755);
    await expect(listEpisodes(10, { dir: privateDir })).rejects.toThrow("directory is not private");

    const target = join(dir, "target.json");
    writeFileSync(target, "{}\n", { mode: 0o600 });
    const linkDir = join(dir, "links");
    mkdirSync(linkDir, { mode: 0o700 });
    chmodSync(linkDir, 0o700);
    symlinkSync(target, join(linkDir, `${id}.json`));
    await expect(readEpisode(id, { dir: linkDir })).rejects.toThrow("record is not private");
  });

  test("clean stores degrade locally and argument grammar rejects ambiguity", async () => {
    const dir = root();
    expect(await listEpisodes(5, { dir: join(dir, "missing") })).toEqual([]);
    expect(await recallEpisodes("verification", 5, { dir: join(dir, "missing") })).toEqual({ query: "verification", episodes: [] });
    expect(parseEpisodeArgs(["record", "--kind", "learning", "--source", "explicit", "--project", "ebrain", "--agent", "codex", "--text", "safe", "--yes", "--json"]).values.get("--kind")).toBe("learning");
    expect(() => parseEpisodeArgs(["list", "--limit", "4", "--limit", "5"])).toThrow("requires one value");
  });

  test("record files are immutable in practice: only new IDs are created", async () => {
    const dir = root();
    const opts = { dir: join(dir, "episodes"), now: "2026-07-18T00:00:00.000Z" };
    const one = await recordEpisode({ kind: "learning", source: "explicit", project: "ebrain", agent: "codex", text: "First immutable episode." }, opts);
    const two = await recordEpisode({ kind: "learning", source: "explicit", project: "ebrain", agent: "codex", text: "Second immutable episode." }, opts);
    expect(existsSync(join(opts.dir, `${one.id}.json`))).toBe(true);
    expect(existsSync(join(opts.dir, `${two.id}.json`))).toBe(true);
    expect(one.id).not.toBe(two.id);
  });

  test("remember mirrors an explicit durable learning into bounded local recall", async () => {
    const home = root();
    const result = await runRemember(home, "bun");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("episode mirror ✓");
    const episodes = await listEpisodes(10, { dir: join(home, "config", "episodes") });
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({ kind: "learning", source: "remember", project: "fixture", agent: "codex" });
  });

  test("episode mirror failure never invalidates an already-written remember learning", async () => {
    const home = root();
    const result = await runRemember(home, "false");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("episode mirror failed");
    expect(existsSync(join(home, "eBrain", "memory", "learnings", "fixture"))).toBe(true);
    expect(await listEpisodes(10, { dir: join(home, "config", "episodes") })).toEqual([]);
  });
});
