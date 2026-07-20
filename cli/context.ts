#!/usr/bin/env bun
/**
 * ebrain context -- human-governed operating context packs (ADR-008 / F9.1).
 *
 * Packs are private local Markdown. Agents may propose a scrubbed replacement, but only the
 * explicit review operation can activate it. The CLI intentionally has no free-form path,
 * command, environment, provider, model, or daemon input.
 */
import { chmod, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { scrubSecrets } from "./sessions.ts";
import { referencesDeniedRepo } from "./deny-policy.ts";
import { readWorkspaceStore } from "./workspaces.ts";

const HOME = homedir();
const CONFIG_DIR = process.env.EBRAIN_CONFIG_DIR || join(HOME, ".config", "ebrain");
export const DEFAULT_CONTEXT_DIR = process.env.EBRAIN_CONTEXT_DIR || join(CONFIG_DIR, "context-packs");
const MAX_CONTENT_CHARS = 8_000;
const MAX_EVIDENCE_CHARS = 1_200;
const DEFAULT_GET_CHARS = 4_000;
const SAFE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type ContextScope = "operator" | "workspace";
export type ProposalStatus = "pending" | "accepted" | "rejected";

export interface ContextPack {
  schema_version: 1;
  id: string;
  scope: ContextScope;
  workspace_id?: string;
  version: number;
  updated_at: string;
  content_hash: string;
  content: string;
}

export interface ContextPackSummary {
  id: string;
  scope: ContextScope;
  workspace_id?: string;
  version: number;
  updated_at: string;
  chars: number;
}

export interface ContextProposal {
  schema_version: 1;
  id: string;
  pack_id: string;
  base_version: number;
  base_hash: string;
  agent: string;
  session: string;
  evidence: string;
  content: string;
  content_hash: string;
  status: ProposalStatus;
  created_at: string;
  reviewed_at?: string;
}

export interface ContextProposalSummary {
  id: string;
  pack_id: string;
  base_version: number;
  agent: string;
  session: string;
  status: ProposalStatus;
  created_at: string;
  reviewed_at?: string;
}

export interface ContextStoreOptions {
  dir?: string;
  now?: string;
  workspaceStorePath?: string;
}

function nowIso(value?: string): string {
  return value ?? new Date().toISOString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScope(value: unknown): value is ContextScope {
  return value === "operator" || value === "workspace";
}

function isStatus(value: unknown): value is ProposalStatus {
  return value === "pending" || value === "accepted" || value === "rejected";
}

function hasOnly(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

/** Reject rather than redact a proposed active-context value. A visible redaction would make the
 * reviewer accept text different from what the proposer supplied. */
export function validateContextText(value: unknown, maxChars: number, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be text`);
  const text = value.trim();
  if (!text) throw new Error(`${field} must not be empty`);
  if (text.length > maxChars) throw new Error(`${field} exceeds the bounded limit`);
  if (/\u0000/.test(text)) throw new Error(`${field} contains a control byte`);
  if (scrubSecrets(text) !== text) throw new Error(`${field} contains secret-shaped content`);
  // Context is an eBrain-wide memory input. Do not allow a user/agent to smuggle a denied
  // path or repository identity into an otherwise local store.
  if (referencesDeniedRepo(text)) throw new Error(`${field} references a denied client repository`);
  return text;
}

function packId(scope: ContextScope, workspaceId?: string): string {
  if (scope === "operator") {
    if (workspaceId) throw new Error("operator context does not accept a workspace id");
    return "operator";
  }
  if (!workspaceId || !SAFE_ID.test(workspaceId)) throw new Error("workspace context requires a generated workspace id");
  return `workspace-${workspaceId}`;
}

function packPath(dir: string, id: string): string {
  if (id !== "operator" && !(id.startsWith("workspace-") && SAFE_ID.test(id.slice("workspace-".length)))) {
    throw new Error("invalid context pack id");
  }
  return join(dir, `${id}.md`);
}

function proposalsDir(dir: string): string {
  return join(dir, "proposals");
}

function proposalPath(dir: string, id: string): string {
  if (!/^proposal-[a-f0-9-]{36}$/.test(id)) throw new Error("invalid context proposal id");
  return join(proposalsDir(dir), `${id}.json`);
}

function asPositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function parsePackMeta(meta: unknown, body: string): ContextPack {
  if (!isObj(meta) || !hasOnly(meta, ["schema_version", "id", "scope", "workspace_id", "version", "updated_at", "content_hash"])) {
    throw new Error("invalid context pack metadata");
  }
  const id = typeof meta.id === "string" ? meta.id : "";
  const scope = meta.scope;
  if (Object.hasOwn(meta, "workspace_id") && typeof meta.workspace_id !== "string") throw new Error("invalid context pack identity");
  const workspaceId = typeof meta.workspace_id === "string" ? meta.workspace_id : undefined;
  const version = asPositiveInt(meta.version);
  const updatedAt = typeof meta.updated_at === "string" ? meta.updated_at : "";
  const contentHash = typeof meta.content_hash === "string" ? meta.content_hash : "";
  if (meta.schema_version !== 1 || !isScope(scope) || !version || !ISO_UTC.test(updatedAt) || !/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new Error("invalid context pack metadata");
  }
  const expectedId = packId(scope, workspaceId);
  if (id !== expectedId || (scope === "operator" && workspaceId !== undefined) || (scope === "workspace" && !workspaceId)) {
    throw new Error("invalid context pack identity");
  }
  const content = validateContextText(body, MAX_CONTENT_CHARS, "context content");
  if (sha256(content) !== contentHash) throw new Error("context pack hash does not match content");
  return { schema_version: 1, id, scope, ...(workspaceId ? { workspace_id: workspaceId } : {}), version, updated_at: updatedAt, content_hash: contentHash, content };
}

function parsePackMarkdown(text: string): ContextPack {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error("context pack requires frontmatter");
  let meta: unknown;
  try {
    meta = (Bun as unknown as { YAML: { parse: (source: string) => unknown } }).YAML.parse(match[1]);
  } catch {
    throw new Error("context pack frontmatter is invalid");
  }
  return parsePackMeta(meta, match[2].trim());
}

function markdownForPack(pack: ContextPack): string {
  const workspace = pack.workspace_id ? `workspace_id: ${pack.workspace_id}\n` : "";
  return [
    "---",
    "schema_version: 1",
    `id: ${pack.id}`,
    `scope: ${pack.scope}`,
    workspace.trimEnd(),
    `version: ${pack.version}`,
    `updated_at: ${pack.updated_at}`,
    `content_hash: ${pack.content_hash}`,
    "---",
    "",
    pack.content,
    "",
  ].filter((line, index) => line !== "" || index > 0).join("\n");
}

function parseProposal(value: unknown): ContextProposal {
  if (!isObj(value) || !hasOnly(value, ["schema_version", "id", "pack_id", "base_version", "base_hash", "agent", "session", "evidence", "content", "content_hash", "status", "created_at", "reviewed_at"])) {
    throw new Error("invalid context proposal");
  }
  const id = typeof value.id === "string" ? value.id : "";
  const packIdValue = typeof value.pack_id === "string" ? value.pack_id : "";
  const baseVersion = asPositiveInt(value.base_version);
  const baseHash = typeof value.base_hash === "string" ? value.base_hash : "";
  const agent = typeof value.agent === "string" ? value.agent : "";
  const session = typeof value.session === "string" ? value.session : "";
  const status = value.status;
  const createdAt = typeof value.created_at === "string" ? value.created_at : "";
  if (Object.hasOwn(value, "reviewed_at") && typeof value.reviewed_at !== "string") throw new Error("invalid context proposal identity");
  const reviewedAt = typeof value.reviewed_at === "string" ? value.reviewed_at : undefined;
  const contentHash = typeof value.content_hash === "string" ? value.content_hash : "";
  if (!/^proposal-[a-f0-9-]{36}$/.test(id) || !baseVersion || !/^[a-f0-9]{64}$/.test(baseHash) || !SAFE_ID.test(agent) || !SAFE_ID.test(session) || !isStatus(status) || !ISO_UTC.test(createdAt) || (reviewedAt !== undefined && !ISO_UTC.test(reviewedAt)) || !/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new Error("invalid context proposal identity");
  }
  // packPath also validates the generated pack identity without performing I/O.
  packPath("/context", packIdValue);
  const evidence = validateContextText(value.evidence, MAX_EVIDENCE_CHARS, "proposal evidence");
  const content = validateContextText(value.content, MAX_CONTENT_CHARS, "proposal content");
  if (sha256(content) !== contentHash) throw new Error("context proposal hash does not match content");
  return { schema_version: 1, id, pack_id: packIdValue, base_version: baseVersion, base_hash: baseHash, agent, session, evidence, content, content_hash: contentHash, status, created_at: createdAt, ...(reviewedAt ? { reviewed_at: reviewedAt } : {}) };
}

async function ensurePrivateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("context storage directory must be a real directory");
  await chmod(dir, 0o700);
}

async function assertPrivateDir(dir: string): Promise<void> {
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    throw new Error("context storage directory is not private");
  }
}

async function assertPrivateRecord(path: string): Promise<void> {
  await assertPrivateDir(dirname(path));
  const record = await lstat(path);
  if (!record.isFile() || record.isSymbolicLink() || (record.mode & 0o077) !== 0) {
    throw new Error("context record is not private");
  }
}

async function writePrivateAtomic(path: string, body: string): Promise<void> {
  const dir = dirname(path);
  await ensurePrivateDir(dir);
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temp, body, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
  await chmod(path, 0o600);
}

export function summarizePack(pack: ContextPack): ContextPackSummary {
  return { id: pack.id, scope: pack.scope, ...(pack.workspace_id ? { workspace_id: pack.workspace_id } : {}), version: pack.version, updated_at: pack.updated_at, chars: pack.content.length };
}

export function summarizeProposal(proposal: ContextProposal): ContextProposalSummary {
  return { id: proposal.id, pack_id: proposal.pack_id, base_version: proposal.base_version, agent: proposal.agent, session: proposal.session, status: proposal.status, created_at: proposal.created_at, ...(proposal.reviewed_at ? { reviewed_at: proposal.reviewed_at } : {}) };
}

export async function readContextPack(id: string, opts: ContextStoreOptions = {}): Promise<ContextPack | null> {
  const path = packPath(opts.dir ?? DEFAULT_CONTEXT_DIR, id);
  if (!existsSync(path)) return null;
  await assertPrivateRecord(path);
  return parsePackMarkdown(await readFile(path, "utf8"));
}

export async function listContextPacks(opts: ContextStoreOptions = {}): Promise<ContextPackSummary[]> {
  const dir = opts.dir ?? DEFAULT_CONTEXT_DIR;
  const ids = existsSync(dir)
    ? (await assertPrivateDir(dir), await Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: dir }))).sort()
    : [];
  const packs: ContextPackSummary[] = [];
  for (const filename of ids) {
    const id = filename.replace(/\.md$/, "");
    const pack = await readContextPack(id, { dir });
    if (pack) packs.push(summarizePack(pack));
  }
  return packs.sort((left, right) => left.id.localeCompare(right.id));
}

async function assertWorkspaceId(workspaceId: string, workspaceStorePath?: string): Promise<void> {
  const store = await readWorkspaceStore(workspaceStorePath);
  if (!store.workspaces.some((workspace) => workspace.id === workspaceId)) throw new Error("workspace context requires a registered workspace");
}

export async function initializeContextPack(input: { scope: ContextScope; workspaceId?: string }, opts: ContextStoreOptions = {}): Promise<{ created: boolean; pack: ContextPackSummary }> {
  const dir = opts.dir ?? DEFAULT_CONTEXT_DIR;
  const id = packId(input.scope, input.workspaceId);
  if (input.scope === "workspace") await assertWorkspaceId(input.workspaceId!, opts.workspaceStorePath);
  const existing = await readContextPack(id, { dir });
  if (existing) return { created: false, pack: summarizePack(existing) };
  const content = input.scope === "operator"
    ? "# Operator context\n\nAdd stable working preferences here. Keep this bounded, factual, and free of secrets."
    : "# Workspace context\n\nAdd stable instructions for this registered workspace. Keep this bounded, factual, and free of secrets.";
  const checked = validateContextText(content, MAX_CONTENT_CHARS, "context content");
  const pack: ContextPack = {
    schema_version: 1,
    id,
    scope: input.scope,
    ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
    version: 1,
    updated_at: nowIso(opts.now),
    content_hash: sha256(checked),
    content: checked,
  };
  await writePrivateAtomic(packPath(dir, id), markdownForPack(pack));
  return { created: true, pack: summarizePack(pack) };
}

export async function getContextPack(id: string, maxChars = DEFAULT_GET_CHARS, opts: ContextStoreOptions = {}): Promise<{ pack: ContextPackSummary; content: string }> {
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > MAX_CONTENT_CHARS) throw new Error("max chars must be within the bounded limit");
  const pack = await readContextPack(id, opts);
  if (!pack) throw new Error("context pack not found");
  return { pack: summarizePack(pack), content: pack.content.slice(0, maxChars) };
}

/** A direct human edit is an explicit versioned write. It never accepts a filesystem path or
 * bypasses pending-proposal stale checks: existing proposals retain the old base and must refresh. */
export async function updateContextPack(id: string, content: string, opts: ContextStoreOptions = {}): Promise<ContextPackSummary> {
  const dir = opts.dir ?? DEFAULT_CONTEXT_DIR;
  const pack = await readContextPack(id, { dir });
  if (!pack) throw new Error("context pack not found");
  const checked = validateContextText(content, MAX_CONTENT_CHARS, "context content");
  const next: ContextPack = {
    ...pack,
    version: pack.version + 1,
    updated_at: nowIso(opts.now),
    content_hash: sha256(checked),
    content: checked,
  };
  await writePrivateAtomic(packPath(dir, next.id), markdownForPack(next));
  return summarizePack(next);
}

export async function createContextProposal(input: { packId: string; agent: string; session: string; evidence: string; content: string }, opts: ContextStoreOptions = {}): Promise<ContextProposalSummary> {
  const dir = opts.dir ?? DEFAULT_CONTEXT_DIR;
  const pack = await readContextPack(input.packId, { dir });
  if (!pack) throw new Error("context pack not found");
  if (!SAFE_ID.test(input.agent) || !SAFE_ID.test(input.session)) throw new Error("agent and session must be generated safe identifiers");
  const evidence = validateContextText(input.evidence, MAX_EVIDENCE_CHARS, "proposal evidence");
  const content = validateContextText(input.content, MAX_CONTENT_CHARS, "proposal content");
  const proposal: ContextProposal = {
    schema_version: 1,
    id: `proposal-${randomUUID()}`,
    pack_id: pack.id,
    base_version: pack.version,
    base_hash: pack.content_hash,
    agent: input.agent,
    session: input.session,
    evidence,
    content,
    content_hash: sha256(content),
    status: "pending",
    created_at: nowIso(opts.now),
  };
  await writePrivateAtomic(proposalPath(dir, proposal.id), `${JSON.stringify(proposal, null, 2)}\n`);
  return summarizeProposal(proposal);
}

export async function readContextProposal(id: string, opts: ContextStoreOptions = {}): Promise<ContextProposal | null> {
  const root = opts.dir ?? DEFAULT_CONTEXT_DIR;
  const path = proposalPath(root, id);
  if (!existsSync(path)) return null;
  await assertPrivateDir(root);
  await assertPrivateRecord(path);
  return parseProposal(JSON.parse(await readFile(path, "utf8")));
}

export async function listContextProposals(opts: ContextStoreOptions = {}): Promise<ContextProposalSummary[]> {
  const root = opts.dir ?? DEFAULT_CONTEXT_DIR;
  const dir = proposalsDir(root);
  if (existsSync(root)) await assertPrivateDir(root);
  const ids = existsSync(dir)
    ? (await assertPrivateDir(dir), await Array.fromAsync(new Bun.Glob("proposal-*.json").scan({ cwd: dir }))).sort()
    : [];
  const proposals: ContextProposalSummary[] = [];
  for (const filename of ids) {
    const proposal = await readContextProposal(filename.replace(/\.json$/, ""), opts);
    if (proposal) proposals.push(summarizeProposal(proposal));
  }
  return proposals.sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export async function reviewContextProposal(id: string, action: "accept" | "reject", opts: ContextStoreOptions = {}): Promise<{ proposal: ContextProposalSummary; pack?: ContextPackSummary }> {
  const dir = opts.dir ?? DEFAULT_CONTEXT_DIR;
  const proposal = await readContextProposal(id, { dir });
  if (!proposal) throw new Error("context proposal not found");
  if (proposal.status !== "pending") throw new Error("context proposal is already reviewed");
  const reviewedAt = nowIso(opts.now);
  if (action === "reject") {
    const reviewed: ContextProposal = { ...proposal, status: "rejected", reviewed_at: reviewedAt };
    await writePrivateAtomic(proposalPath(dir, id), `${JSON.stringify(reviewed, null, 2)}\n`);
    return { proposal: summarizeProposal(reviewed) };
  }
  const pack = await readContextPack(proposal.pack_id, { dir });
  if (!pack || pack.version !== proposal.base_version || pack.content_hash !== proposal.base_hash) {
    throw new Error("context proposal is stale; review a fresh proposal");
  }
  const next: ContextPack = {
    ...pack,
    version: pack.version + 1,
    updated_at: reviewedAt,
    content_hash: proposal.content_hash,
    content: proposal.content,
  };
  await writePrivateAtomic(packPath(dir, next.id), markdownForPack(next));
  const reviewed: ContextProposal = { ...proposal, status: "accepted", reviewed_at: reviewedAt };
  await writePrivateAtomic(proposalPath(dir, id), `${JSON.stringify(reviewed, null, 2)}\n`);
  return { proposal: summarizeProposal(reviewed), pack: summarizePack(next) };
}

interface ParsedArgs {
  sub: string;
  json: boolean;
  yes: boolean;
  values: Map<string, string>;
  positionals: string[];
}

const VALUE_FLAGS = new Set(["--scope", "--workspace-id", "--agent", "--session", "--evidence", "--content", "--action", "--max-chars"]);

export function parseContextArgs(argv: string[]): ParsedArgs {
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
    if (arg.startsWith("--")) throw new Error(`unknown context argument: ${arg}`);
    positionals.push(arg);
  }
  return { sub, json, yes, values, positionals };
}

function onlyValues(args: ParsedArgs, allowed: readonly string[]): void {
  for (const key of args.values.keys()) if (!allowed.includes(key)) throw new Error(`${key} is not valid for context ${args.sub}`);
}

function value(args: ParsedArgs, flag: string): string | undefined {
  return args.values.get(flag);
}

function print(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

function die(message: string, code = 1): never {
  console.error(`error: ${message}`);
  process.exit(code);
}

// Pass-3 F-P6: docs/reference/memory-commands.md documents `ebrain context --help`, and it used to
// fall through to the unrecognized-subcommand path — printing the usage line as an `error:` on
// stderr with exit 2. A reader following the docs saw a failure instead of help.
const USAGE = "usage: ebrain context <list|proposals|init|get|update|propose|review> [--json]";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const args = parseContextArgs(argv);
  if (args.sub === "list") {
    onlyValues(args, []);
    if (args.positionals.length || args.yes) die("usage: ebrain context list [--json]", 2);
    return print({ packs: await listContextPacks() });
  }
  if (args.sub === "proposals") {
    onlyValues(args, []);
    if (args.positionals.length || args.yes) die("usage: ebrain context proposals [--json]", 2);
    return print({ proposals: await listContextProposals() });
  }
  if (args.sub === "init") {
    onlyValues(args, ["--scope", "--workspace-id"]);
    if (args.positionals.length || !args.yes) die("usage: ebrain context init --scope <operator|workspace> [--workspace-id ID] --yes [--json]", 2);
    const scope = value(args, "--scope");
    if (!isScope(scope)) die("context scope must be operator or workspace", 2);
    return print(await initializeContextPack({ scope, workspaceId: value(args, "--workspace-id") }));
  }
  if (args.sub === "get") {
    onlyValues(args, ["--max-chars"]);
    if (args.positionals.length !== 1 || args.yes) die("usage: ebrain context get <pack-id> [--max-chars N] [--json]", 2);
    const maxChars = value(args, "--max-chars") ? Number(value(args, "--max-chars")) : DEFAULT_GET_CHARS;
    return print(await getContextPack(args.positionals[0]!, maxChars));
  }
  if (args.sub === "update") {
    onlyValues(args, ["--content"]);
    if (args.positionals.length !== 1 || !args.yes) die("usage: ebrain context update <pack-id> --content TEXT --yes [--json]", 2);
    const content = value(args, "--content");
    if (!content) die("context update requires replacement content", 2);
    return print({ pack: await updateContextPack(args.positionals[0]!, content) });
  }
  if (args.sub === "propose") {
    onlyValues(args, ["--agent", "--session", "--evidence", "--content"]);
    if (args.positionals.length !== 1 || !args.yes) die("usage: ebrain context propose <pack-id> --agent ID --session ID --evidence TEXT --content TEXT --yes [--json]", 2);
    const agent = value(args, "--agent");
    const session = value(args, "--session");
    const evidence = value(args, "--evidence");
    const content = value(args, "--content");
    if (!agent || !session || !evidence || !content) die("context proposal requires agent, session, evidence, and content", 2);
    return print({ proposal: await createContextProposal({ packId: args.positionals[0]!, agent, session, evidence, content }) });
  }
  if (args.sub === "review") {
    onlyValues(args, ["--action"]);
    if (args.positionals.length !== 1 || !args.yes) die("usage: ebrain context review <proposal-id> --action <accept|reject> --yes [--json]", 2);
    const action = value(args, "--action");
    if (action !== "accept" && action !== "reject") die("context review action must be accept or reject", 2);
    return print(await reviewContextProposal(args.positionals[0]!, action));
  }
  die(USAGE, 2);
}

if (import.meta.main) main().catch((error) => die(error instanceof Error ? error.message : String(error)));
