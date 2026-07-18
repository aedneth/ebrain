import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
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
    const client = join(dir, "brisas-del-golfo");
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
