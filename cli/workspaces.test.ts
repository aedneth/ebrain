import { afterEach, describe, expect, test } from "bun:test";

// Deny policy is operator configuration; this suite declares its own neutral fixture policy.
process.env.EBRAIN_DENIED_REPOS = "denied-alpha,denied-beta";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addWorkspace,
  canonicalWorkspacePath,
  nextWorkspaceId,
  parseWorkspaceStore,
  readWorkspaceStore,
  renameWorkspace,
  removeWorkspace,
  writeWorkspaceStore,
} from "./workspaces.ts";
import { SESSION_PREFIX, killSession, listSessions, newSession } from "./sessions.ts";

const roots: string[] = [];
function root(): string {
  const value = mkdtempSync(join(tmpdir(), "ebrain-workspaces-"));
  roots.push(value);
  return value;
}
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("workspace store schema", () => {
  test("rejects unknown fields so the registry cannot become an execution/config channel", () => {
    expect(() => parseWorkspaceStore({ schema_version: 1, workspaces: [], command: "sh -c anything" })).toThrow("invalid workspace store");
    expect(() => parseWorkspaceStore({ schema_version: 1, workspaces: [{ id: "project", label: "Project", cwd: "/tmp/project", env: {} }] })).toThrow("invalid workspace record");
  });

  test("generates safe stable IDs without accepting one from the caller", () => {
    expect(nextWorkspaceId("My Project!", [])).toBe("my-project");
    expect(nextWorkspaceId("My Project!", ["my-project"])).toBe("my-project-2");
  });
});

describe("workspace path isolation", () => {
  test("canonicalizes a normal symlinked directory before persistence", async () => {
    const dir = root();
    const actual = join(dir, "actual");
    const link = join(dir, "shortcut");
    mkdirSync(actual);
    symlinkSync(actual, link);
    expect(await canonicalWorkspacePath(link)).toBe(actual);
  });

  test("rejects literal and symlinked client directories before they enter the registry", async () => {
    const dir = root();
    const client = join(dir, "denied-alpha");
    const link = join(dir, "innocent-link");
    mkdirSync(client);
    symlinkSync(client, link);
    await expect(canonicalWorkspacePath(client)).rejects.toThrow("client repository");
    await expect(canonicalWorkspacePath(link)).rejects.toThrow("client repository");
  });

  test("rejects missing paths and non-directory paths", async () => {
    const dir = root();
    await expect(canonicalWorkspacePath(join(dir, "missing"))).rejects.toThrow("does not exist");
    const file = join(dir, "file.txt");
    writeFileSync(file, "x");
    await expect(canonicalWorkspacePath(file)).rejects.toThrow("not a directory");
  });
});

describe("workspace mutations", () => {
  test("adds canonical directories, rejects duplicates, then renames/removes by generated id", async () => {
    const dir = root();
    const project = join(dir, "project");
    mkdirSync(project);
    const empty = { schema_version: 1 as const, workspaces: [] };
    const added = await addWorkspace(empty, { label: "My Project", cwd: project });
    expect(added.workspaces).toEqual([{ id: "my-project", label: "My Project", cwd: project }]);
    await expect(addWorkspace(added, { label: "Again", cwd: project })).rejects.toThrow("already registered");
    const renamed = renameWorkspace(added, "my-project", "Renamed Project");
    expect(renamed.workspaces[0]?.label).toBe("Renamed Project");
    expect(removeWorkspace(renamed, "my-project").workspaces).toEqual([]);
  });

  test("writes an atomic private store and refuses a non-canonical hand-edited record on read", async () => {
    const dir = root();
    const project = join(dir, "project");
    const shortcut = join(dir, "shortcut");
    const storePath = join(dir, "config", "workspaces.json");
    mkdirSync(project);
    symlinkSync(project, shortcut);
    const store = await addWorkspace({ schema_version: 1, workspaces: [] }, { label: "Project", cwd: project });
    await writeWorkspaceStore(store, storePath);
    expect(statSync(storePath).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, "config")).mode & 0o777).toBe(0o700);
    expect(await readWorkspaceStore(storePath)).toEqual(store);

    chmodSync(project, 0o755);
    writeFileSync(storePath, JSON.stringify({ schema_version: 1, workspaces: [{ id: "project", label: "Project", cwd: shortcut }] }));
    await expect(readWorkspaceStore(storePath)).rejects.toThrow("not canonical");
  });
});

let hasTmux = false;
try {
  execSync("command -v tmux", { stdio: "ignore" });
  hasTmux = true;
} catch {
  hasTmux = false;
}

const tmuxTest = hasTmux ? test : test.skip;

tmuxTest("validated workspace records launch independent fake-agent sessions in their own cwd", async () => {
  const dir = root();
  const alpha = join(dir, "alpha");
  const beta = join(dir, "beta");
  mkdirSync(alpha);
  mkdirSync(beta);
  const storePath = join(dir, "config", "workspaces.json");
  const fakeAgent = join(import.meta.dir, "..", "scripts", "fake-agent.sh");
  const suffix = `workspace-${Date.now().toString(36)}`;
  const alphaName = `${SESSION_PREFIX}test-${suffix}-a`;
  const betaName = `${SESSION_PREFIX}test-${suffix}-b`;
  try {
    const first = await addWorkspace({ schema_version: 1, workspaces: [] }, { label: "Alpha", cwd: alpha });
    const store = await addWorkspace(first, { label: "Beta", cwd: beta });
    await writeWorkspaceStore(store, storePath);
    const registered = await readWorkspaceStore(storePath);
    const alphaWorkspace = registered.workspaces.find((workspace) => workspace.label === "Alpha")!;
    const betaWorkspace = registered.workspaces.find((workspace) => workspace.label === "Beta")!;

    // launchArgv, not an interpolated launchCmd string: quotes each token so a checkout path with a
    // space does not split (pass 6, F-T6).
    const [left, right] = await Promise.all([
      newSession("test", `${suffix}-a`, { cwd: alphaWorkspace.cwd, launchArgv: ["bash", fakeAgent] }),
      newSession("test", `${suffix}-b`, { cwd: betaWorkspace.cwd, launchArgv: ["bash", fakeAgent] }),
    ]);
    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    const listed = await listSessions();
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.sessions.find((session) => session.name === alphaName)?.cwd).toBe(alphaWorkspace.cwd);
      expect(listed.sessions.find((session) => session.name === betaName)?.cwd).toBe(betaWorkspace.cwd);
    }
  } finally {
    await killSession(alphaName, true);
    await killSession(betaName, true);
  }
});
