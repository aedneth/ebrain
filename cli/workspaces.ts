#!/usr/bin/env bun
/**
 * ebrain workspaces -- validated local directory registry (F7.3 / ADR-006).
 *
 * This store is intentionally narrower than a terminal profile: it persists only an id, a
 * display label, and a canonical directory. It never carries a command, environment, token,
 * prompt, or session output. Session creation remains owned by `sessions new` / targets launch.
 */
import { chmod, mkdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isClientPath } from "./sessions.ts";

const HOME = homedir();
const CONFIG_DIR = process.env.EBRAIN_CONFIG_DIR || join(HOME, ".config", "ebrain");
const STORE_PATH = process.env.EBRAIN_WORKSPACE_STORE || join(CONFIG_DIR, "workspaces.json");
const SAFE_ID = /^[a-z][a-z0-9-]{0,63}$/;

export interface Workspace { id: string; label: string; cwd: string }
export interface WorkspaceStore { schema_version: 1; workspaces: Workspace[] }

function die(message: string, code = 1): never {
  console.error(`error: ${message}`);
  process.exit(code);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOnly(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

/** Resolve a submitted directory through symlinks and reject it before it can reach the store. */
/**
 * The directory a workspace points at is gone.
 *
 * Distinguished from every other validation failure on purpose. A deleted worktree is stale
 * bookkeeping, not a safety violation — but it used to be fatal to the whole store, which meant
 * one `rm -rf` of an old worktree took `list`, `add`, `rename` and, worst of all, the `remove`
 * that would have repaired it. A registry must survive the thing it is a registry of.
 */
export class WorkspaceMissingError extends Error {}

export async function canonicalWorkspacePath(input: string): Promise<string> {
  const submitted = resolve(input);
  if (isClientPath(submitted)) throw new Error("client repository paths are not allowed as workspaces");
  let canonical: string;
  try {
    canonical = await realpath(submitted);
  } catch {
    throw new WorkspaceMissingError("workspace directory does not exist");
  }
  if (isClientPath(canonical)) throw new Error("workspace resolves into a client repository");
  let info;
  try {
    info = await stat(canonical);
  } catch {
    throw new Error("workspace directory cannot be inspected");
  }
  if (!info.isDirectory()) throw new Error("workspace path is not a directory");
  return canonical;
}

function parseWorkspace(value: unknown): Workspace {
  if (!isRecord(value) || !hasOnly(value, ["id", "label", "cwd"]) || typeof value.id !== "string" || !SAFE_ID.test(value.id)) {
    throw new Error("invalid workspace record");
  }
  if (typeof value.label !== "string" || value.label.trim().length === 0 || value.label.length > 120) throw new Error("invalid workspace label");
  if (typeof value.cwd !== "string" || !value.cwd.startsWith("/") || value.cwd.length > 4096) throw new Error("invalid workspace directory");
  return { id: value.id, label: value.label.trim(), cwd: value.cwd };
}

/** Strict store parser: an unknown field could otherwise become a covert command/config channel. */
export function parseWorkspaceStore(value: unknown): WorkspaceStore {
  if (!isRecord(value) || !hasOnly(value, ["schema_version", "workspaces"]) || value.schema_version !== 1 || !Array.isArray(value.workspaces)) {
    throw new Error("invalid workspace store (schema_version=1 required)");
  }
  const workspaces = value.workspaces.map(parseWorkspace);
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const workspace of workspaces) {
    if (ids.has(workspace.id)) throw new Error(`duplicate workspace id: ${workspace.id}`);
    if (paths.has(workspace.cwd)) throw new Error(`duplicate workspace directory: ${workspace.cwd}`);
    ids.add(workspace.id);
    paths.add(workspace.cwd);
  }
  return { schema_version: 1, workspaces };
}

/** Stored directories are revalidated on every read/write. A hand-edited store cannot turn a
 * formerly harmless symlink into a client path or a non-canonical launch target. */
export async function validateWorkspaceStore(
  store: WorkspaceStore,
  opts: { tolerateMissing?: boolean } = {},
): Promise<WorkspaceStore> {
  const parsed = parseWorkspaceStore(store);
  for (const workspace of parsed.workspaces) {
    let canonical: string;
    try {
      canonical = await canonicalWorkspacePath(workspace.cwd);
    } catch (error) {
      // A vanished directory is kept as recorded so the entry stays visible and removable. The
      // safety checks it skips are the ones that need a target to resolve; the client-path guard
      // runs on the submitted path first and still applies, and anything that actually launches
      // into a workspace re-validates then, when the directory has to exist anyway.
      if (opts.tolerateMissing && error instanceof WorkspaceMissingError) continue;
      throw error;
    }
    if (canonical !== workspace.cwd) throw new Error(`workspace directory is not canonical: ${workspace.id}`);
  }
  return parsed;
}

/** Entries whose directory is gone — what `ebrain workspaces validate` reports. */
export async function missingWorkspaces(store: WorkspaceStore): Promise<Workspace[]> {
  const missing: Workspace[] = [];
  for (const workspace of store.workspaces) {
    try {
      await canonicalWorkspacePath(workspace.cwd);
    } catch (error) {
      if (error instanceof WorkspaceMissingError) missing.push(workspace);
    }
  }
  return missing;
}

export async function readWorkspaceStore(path = STORE_PATH): Promise<WorkspaceStore> {
  const file = Bun.file(path);
  if (!(await file.exists())) return { schema_version: 1, workspaces: [] };
  try {
    return await validateWorkspaceStore(parseWorkspaceStore(JSON.parse(await file.text())), { tolerateMissing: true });
  } catch (error) {
    throw new Error(`invalid workspace store: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function writeWorkspaceStore(store: WorkspaceStore, path = STORE_PATH): Promise<void> {
  // Writes tolerate a missing directory too: otherwise removing workspace A would be blocked by
  // workspace B having been deleted, which is precisely the repair the user is trying to make.
  const parsed = await validateWorkspaceStore(store, { tolerateMissing: true });
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
  await chmod(path, 0o600);
}

function idBase(label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56);
  return /^[a-z]/.test(base) ? base || "workspace" : `workspace-${base}`;
}

/** Generated safe ID. Labels are display text, never shell input. */
export function nextWorkspaceId(label: string, existing: Iterable<string>): string {
  const used = new Set(existing);
  const base = idBase(label);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const id = `${base.slice(0, 63 - String(suffix).length)}-${suffix}`;
    if (!used.has(id)) return id;
  }
  throw new Error("could not generate a unique workspace id");
}

export async function addWorkspace(store: WorkspaceStore, input: { label: string; cwd: string }): Promise<WorkspaceStore> {
  const label = input.label.trim();
  if (!label || label.length > 120) throw new Error("workspace label must be 1-120 characters");
  const cwd = await canonicalWorkspacePath(input.cwd);
  if (store.workspaces.some((workspace) => workspace.cwd === cwd)) throw new Error("workspace directory is already registered");
  const id = nextWorkspaceId(label, store.workspaces.map((workspace) => workspace.id));
  return parseWorkspaceStore({ ...store, workspaces: [...store.workspaces, { id, label, cwd }] });
}

export function renameWorkspace(store: WorkspaceStore, id: string, label: string): WorkspaceStore {
  const nextLabel = label.trim();
  if (!SAFE_ID.test(id) || !nextLabel || nextLabel.length > 120) throw new Error("invalid workspace rename");
  if (!store.workspaces.some((workspace) => workspace.id === id)) throw new Error("workspace not found");
  return parseWorkspaceStore({ ...store, workspaces: store.workspaces.map((workspace) => workspace.id === id ? { ...workspace, label: nextLabel } : workspace) });
}

export function removeWorkspace(store: WorkspaceStore, id: string): WorkspaceStore {
  if (!SAFE_ID.test(id)) throw new Error("invalid workspace id");
  if (!store.workspaces.some((workspace) => workspace.id === id)) throw new Error("workspace not found");
  return parseWorkspaceStore({ ...store, workspaces: store.workspaces.filter((workspace) => workspace.id !== id) });
}

interface WorkspaceArgs {
  command: string;
  json: boolean;
  yes: boolean;
  values: Map<"--cwd" | "--id" | "--label", string>;
}

/** Strictly parse a deliberately tiny grammar.  Unknown flags and repeated values must not
 * become silently accepted configuration surface as this command evolves. */
function parseArgs(argv: string[]): WorkspaceArgs {
  const [command = "list", ...raw] = argv;
  let json = false;
  let yes = false;
  const values = new Map<"--cwd" | "--id" | "--label", string>();
  for (let index = 0; index < raw.length; index += 1) {
    const arg = raw[index]!;
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
    if (arg === "--cwd" || arg === "--id" || arg === "--label") {
      const value = raw[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      if (values.has(arg)) throw new Error(`${arg} may be supplied only once`);
      values.set(arg, value);
      index += 1;
      continue;
    }
    throw new Error(`unknown workspace argument: ${arg}`);
  }
  return { command, json, yes, values };
}

function onlyFlags(args: WorkspaceArgs, flags: Array<"--cwd" | "--id" | "--label">): void {
  for (const flag of args.values.keys()) {
    if (!flags.includes(flag)) throw new Error(`${flag} is not valid for workspaces ${args.command}`);
  }
}

function valueOf(args: WorkspaceArgs, flag: "--cwd" | "--id" | "--label"): string | null {
  return args.values.get(flag) ?? null;
}
function print(value: unknown): void { console.log(JSON.stringify(value, null, 2)); }

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "validate") {
    onlyFlags(args, ["--cwd"]);
    if (args.yes) die("workspaces validate does not write local config", 2);
    const cwd = valueOf(args, "--cwd");
    // With `--cwd` it answers "is THIS directory a legal workspace" (unchanged). Without it, it
    // answers the question the store itself raises now that a vanished directory is tolerated
    // rather than fatal: which recorded workspaces no longer exist, and how to clear them.
    if (cwd) return print({ ok: true, cwd: await canonicalWorkspacePath(cwd) });
    const store = await readWorkspaceStore();
    const missing = await missingWorkspaces(store);
    return print({
      ok: missing.length === 0,
      workspaces: store.workspaces.length,
      missing,
      ...(missing.length === 0 ? {} : { hint: "remove a stale entry with: ebrain workspaces remove --id <id> --yes" }),
    });
  }
  if (!["list", "validate", "add", "rename", "remove"].includes(args.command)) {
    die("usage: ebrain workspaces <list|validate|add|rename|remove> [--json]", 2);
  }
  if (args.command === "list") {
    onlyFlags(args, []);
    if (args.yes) die("workspaces list does not write local config", 2);
    return print(await readWorkspaceStore());
  }
  if (!args.yes) die(`workspaces ${args.command} writes local config; confirm with --yes`, 2);
  const store = await readWorkspaceStore();
  if (args.command === "add") {
    onlyFlags(args, ["--label", "--cwd"]);
    const label = valueOf(args, "--label");
    const cwd = valueOf(args, "--cwd");
    if (!label || !cwd) die("usage: ebrain workspaces add --label LABEL --cwd DIR --yes [--json]", 2);
    const next = await addWorkspace(store, { label, cwd });
    await writeWorkspaceStore(next);
    return print({ ok: true, workspace: next.workspaces.at(-1) });
  }
  if (args.command === "rename") {
    onlyFlags(args, ["--id", "--label"]);
    const id = valueOf(args, "--id");
    const label = valueOf(args, "--label");
    if (!id || !label) die("usage: ebrain workspaces rename --id ID --label LABEL --yes [--json]", 2);
    const next = renameWorkspace(store, id, label);
    await writeWorkspaceStore(next);
    return print({ ok: true, workspace: next.workspaces.find((workspace) => workspace.id === id) });
  }
  if (args.command === "remove") {
    onlyFlags(args, ["--id"]);
    const id = valueOf(args, "--id");
    if (!id) die("usage: ebrain workspaces remove --id ID --yes [--json]", 2);
    const next = removeWorkspace(store, id);
    await writeWorkspaceStore(next);
    return print({ ok: true, removed: id });
  }
  die("usage: ebrain workspaces <list|validate|add|rename|remove> [--json]", 2);
}

if (import.meta.main) main().catch((error) => die(error instanceof Error ? error.message : String(error)));
