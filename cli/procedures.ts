#!/usr/bin/env bun
/**
 * ebrain procedures -- reviewed lifecycle metadata for existing local workflows (ADR-008 / F9.2).
 *
 * Workflow Markdown and normalized workflow records remain procedure content source of truth. This
 * module stores only bounded local lifecycle evidence. It never executes a workflow, command, or
 * provider/model action, and it never changes state automatically.
 */
import { chmod, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { findWorkflow, loadWorkflows, summarizeWorkflow, type WorkflowRecord, type WorkflowSummary } from "./workflows.ts";

const HOME = homedir();
const CONFIG_DIR = process.env.EBRAIN_CONFIG_DIR || join(HOME, ".config", "ebrain");
export const DEFAULT_PROCEDURES_DIR = process.env.EBRAIN_PROCEDURES_DIR || join(CONFIG_DIR, "procedures");
const DEFAULT_WORKFLOWS_DIR = process.env.EBRAIN_WORKFLOWS_DIR || join(CONFIG_DIR, "workflows");
const DEFAULT_SKILLS_DIR = process.env.EBRAIN_SKILLS_DIR || join(CONFIG_DIR, "skills");
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const MAX_EVENTS = 64;
const SAFE_WORKFLOW_ID = /^[a-z][a-z0-9-]{0,127}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type ProcedureState = "active" | "stale" | "archived";
export type ProcedureEventKind = "used" | "reviewed";

export interface ProcedureEvent {
  kind: ProcedureEventKind;
  at: string;
  workflow_version: number;
  state?: ProcedureState;
}

export interface ProcedureMetadata {
  schema_version: 1;
  workflow_id: string;
  state: ProcedureState;
  use_count: number;
  last_used_at?: string;
  reviewed_at?: string;
  events: ProcedureEvent[];
}

export interface ProcedureSummary extends WorkflowSummary {
  state: ProcedureState;
  use_count: number;
  last_used_at?: string;
  reviewed_at?: string;
  skillified: boolean;
}

export interface ProcedureDetail extends ProcedureSummary {
  events: ProcedureEvent[];
}

export interface ProcedureStoreOptions {
  dir?: string;
  workflowStoreDir?: string;
  skillsDir?: string;
  now?: string;
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function nowIso(value?: string): string {
  return value ?? new Date().toISOString();
}

function isState(value: unknown): value is ProcedureState {
  return value === "active" || value === "stale" || value === "archived";
}

function isEventKind(value: unknown): value is ProcedureEventKind {
  return value === "used" || value === "reviewed";
}

function validateWorkflowId(value: unknown): string {
  if (typeof value !== "string" || !SAFE_WORKFLOW_ID.test(value)) throw new Error("invalid procedure workflow id");
  return value;
}

function metadataPath(dir: string, workflowId: string): string {
  return join(dir, `${validateWorkflowId(workflowId)}.procedure.json`);
}

async function ensurePrivateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("procedure storage directory must be a real directory");
  await chmod(dir, 0o700);
}

async function assertPrivateDir(dir: string): Promise<void> {
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    throw new Error("procedure storage directory is not private");
  }
}

async function assertPrivateRecord(path: string): Promise<void> {
  await assertPrivateDir(dirname(path));
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    throw new Error("procedure record is not private");
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

function parseEvent(value: unknown): ProcedureEvent {
  if (!isObj(value) || !hasOnly(value, ["kind", "at", "workflow_version", "state"])) throw new Error("invalid procedure event");
  const kind = value.kind;
  const at = typeof value.at === "string" ? value.at : "";
  const workflowVersion = value.workflow_version;
  const state = value.state;
  if (!isEventKind(kind) || !ISO_UTC.test(at) || typeof workflowVersion !== "number" || !Number.isInteger(workflowVersion) || workflowVersion < 1) {
    throw new Error("invalid procedure event");
  }
  if (kind === "reviewed" && !isState(state)) throw new Error("review event requires a lifecycle state");
  if (kind === "used" && state !== undefined) throw new Error("use event cannot set lifecycle state");
  return { kind, at, workflow_version: workflowVersion, ...(kind === "reviewed" ? { state } : {}) };
}

export function parseProcedureMetadata(value: unknown): ProcedureMetadata {
  const allowed = ["schema_version", "workflow_id", "state", "use_count", "last_used_at", "reviewed_at", "events"];
  if (!isObj(value) || !hasOnly(value, allowed) || value.schema_version !== 1 || !isState(value.state) || !Array.isArray(value.events) || typeof value.use_count !== "number" || !Number.isInteger(value.use_count) || value.use_count < 0) {
    throw new Error("invalid procedure metadata");
  }
  const workflowId = validateWorkflowId(value.workflow_id);
  const events = value.events.map(parseEvent);
  if (events.length > MAX_EVENTS) throw new Error("procedure metadata exceeds the event bound");
  if (value.use_count < events.filter((event) => event.kind === "used").length) throw new Error("procedure use count is below retained history");
  if (Object.hasOwn(value, "last_used_at") && (typeof value.last_used_at !== "string" || !ISO_UTC.test(value.last_used_at))) throw new Error("invalid procedure last use time");
  if (Object.hasOwn(value, "reviewed_at") && (typeof value.reviewed_at !== "string" || !ISO_UTC.test(value.reviewed_at))) throw new Error("invalid procedure review time");
  const lastUse = events.filter((event) => event.kind === "used").at(-1)?.at;
  const lastReview = events.filter((event) => event.kind === "reviewed").at(-1)?.at;
  if ((lastUse && value.last_used_at !== lastUse) || (lastReview && value.reviewed_at !== lastReview)) throw new Error("procedure timestamps do not match retained history");
  const retainedState = events.filter((event) => event.kind === "reviewed").at(-1)?.state;
  if ((retainedState && value.state !== retainedState) || (!retainedState && value.state !== "active" && value.reviewed_at === undefined)) {
    throw new Error("procedure state does not match review history");
  }
  return {
    schema_version: 1,
    workflow_id: workflowId,
    state: value.state,
    use_count: value.use_count,
    ...(typeof value.last_used_at === "string" ? { last_used_at: value.last_used_at } : {}),
    ...(typeof value.reviewed_at === "string" ? { reviewed_at: value.reviewed_at } : {}),
    events,
  };
}

function initialMetadata(workflowId: string): ProcedureMetadata {
  return { schema_version: 1, workflow_id: validateWorkflowId(workflowId), state: "active", use_count: 0, events: [] };
}

async function readMetadataRecord(workflowId: string, opts: ProcedureStoreOptions = {}): Promise<ProcedureMetadata | null> {
  const dir = opts.dir ?? DEFAULT_PROCEDURES_DIR;
  const path = metadataPath(dir, workflowId);
  if (!existsSync(path)) return null;
  await assertPrivateRecord(path);
  return parseProcedureMetadata(JSON.parse(await readFile(path, "utf8")));
}

export async function readProcedureMetadata(workflowId: string, opts: ProcedureStoreOptions = {}): Promise<ProcedureMetadata> {
  return (await readMetadataRecord(workflowId, opts)) ?? initialMetadata(workflowId);
}

async function writeMetadata(metadata: ProcedureMetadata, opts: ProcedureStoreOptions = {}): Promise<void> {
  const dir = opts.dir ?? DEFAULT_PROCEDURES_DIR;
  const checked = parseProcedureMetadata(metadata);
  await writePrivateAtomic(metadataPath(dir, checked.workflow_id), `${JSON.stringify(checked, null, 2)}\n`);
}

function toSummary(workflow: WorkflowRecord, metadata: ProcedureMetadata, skillsDir: string): ProcedureSummary {
  return {
    ...summarizeWorkflow(workflow),
    state: metadata.state,
    use_count: metadata.use_count,
    ...(metadata.last_used_at ? { last_used_at: metadata.last_used_at } : {}),
    ...(metadata.reviewed_at ? { reviewed_at: metadata.reviewed_at } : {}),
    // The actual local SKILL.md is the sole truth for skill presence. No duplicate mutable flag.
    skillified: existsSync(join(skillsDir, workflow.id, "SKILL.md")),
  };
}

async function requireWorkflow(workflowId: string, opts: ProcedureStoreOptions): Promise<WorkflowRecord> {
  const workflow = await findWorkflow(validateWorkflowId(workflowId), opts.workflowStoreDir ?? DEFAULT_WORKFLOWS_DIR);
  if (!workflow) throw new Error("procedure workflow not found");
  return workflow;
}

function appendEvent(metadata: ProcedureMetadata, event: ProcedureEvent): ProcedureMetadata {
  const events = [...metadata.events, event].slice(-MAX_EVENTS);
  const state = event.kind === "reviewed" ? event.state! : metadata.state;
  return parseProcedureMetadata({
    ...metadata,
    state,
    use_count: metadata.use_count + (event.kind === "used" ? 1 : 0),
    ...(event.kind === "used" ? { last_used_at: event.at } : {}),
    ...(event.kind === "reviewed" ? { reviewed_at: event.at } : {}),
    events,
  });
}

export async function listProcedures(limit = DEFAULT_LIMIT, opts: ProcedureStoreOptions = {}): Promise<ProcedureSummary[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new Error("procedure limit must be within the bounded range");
  const dir = opts.dir ?? DEFAULT_PROCEDURES_DIR;
  if (existsSync(dir)) await assertPrivateDir(dir);
  const workflows = await loadWorkflows(opts.workflowStoreDir ?? DEFAULT_WORKFLOWS_DIR);
  const skillsDir = opts.skillsDir ?? DEFAULT_SKILLS_DIR;
  const rows: ProcedureSummary[] = [];
  for (const workflow of workflows) {
    const metadata = await readProcedureMetadata(workflow.id, { ...opts, dir });
    rows.push(toSummary(workflow, metadata, skillsDir));
  }
  return rows.sort((left, right) => left.title.localeCompare(right.title)).slice(0, limit);
}

export async function showProcedure(workflowId: string, opts: ProcedureStoreOptions = {}): Promise<ProcedureDetail> {
  const workflow = await requireWorkflow(workflowId, opts);
  const metadata = await readProcedureMetadata(workflow.id, opts);
  return { ...toSummary(workflow, metadata, opts.skillsDir ?? DEFAULT_SKILLS_DIR), events: metadata.events };
}

export async function recordProcedureUse(workflowId: string, opts: ProcedureStoreOptions = {}): Promise<ProcedureSummary> {
  const workflow = await requireWorkflow(workflowId, opts);
  const metadata = await readProcedureMetadata(workflow.id, opts);
  const next = appendEvent(metadata, { kind: "used", at: nowIso(opts.now), workflow_version: workflow.version });
  await writeMetadata(next, opts);
  return toSummary(workflow, next, opts.skillsDir ?? DEFAULT_SKILLS_DIR);
}

export async function reviewProcedure(workflowId: string, state: ProcedureState, opts: ProcedureStoreOptions = {}): Promise<ProcedureSummary> {
  if (!isState(state)) throw new Error("invalid procedure state");
  const workflow = await requireWorkflow(workflowId, opts);
  const metadata = await readProcedureMetadata(workflow.id, opts);
  const next = appendEvent(metadata, { kind: "reviewed", at: nowIso(opts.now), workflow_version: workflow.version, state });
  await writeMetadata(next, opts);
  return toSummary(workflow, next, opts.skillsDir ?? DEFAULT_SKILLS_DIR);
}

interface ParsedArgs {
  sub: string;
  json: boolean;
  yes: boolean;
  values: Map<string, string>;
  positionals: string[];
}

const VALUE_FLAGS = new Set(["--limit", "--state"]);

export function parseProcedureArgs(argv: string[]): ParsedArgs {
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
    if (arg.startsWith("--")) throw new Error(`unknown procedure argument: ${arg}`);
    positionals.push(arg);
  }
  return { sub, json, yes, values, positionals };
}

function onlyValues(args: ParsedArgs, allowed: readonly string[]): void {
  for (const key of args.values.keys()) if (!allowed.includes(key)) throw new Error(`${key} is not valid for procedures ${args.sub}`);
}

function value(args: ParsedArgs, flag: string): string | undefined {
  return args.values.get(flag);
}

function limitFrom(value: string | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) throw new Error("procedure limit must be a positive integer");
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
  const args = parseProcedureArgs(process.argv.slice(2));
  if (args.sub === "list") {
    onlyValues(args, ["--limit"]);
    if (args.positionals.length || args.yes) die("usage: ebrain procedures list [--limit N] [--json]", 2);
    return print({ procedures: await listProcedures(limitFrom(value(args, "--limit"))) });
  }
  if (args.sub === "show") {
    onlyValues(args, []);
    if (args.positionals.length !== 1 || args.yes) die("usage: ebrain procedures show <workflow-id> [--json]", 2);
    return print(await showProcedure(args.positionals[0]!));
  }
  if (args.sub === "use") {
    onlyValues(args, []);
    if (args.positionals.length !== 1 || !args.yes) die("usage: ebrain procedures use <workflow-id> --yes [--json]", 2);
    return print({ procedure: await recordProcedureUse(args.positionals[0]!) });
  }
  if (args.sub === "review") {
    onlyValues(args, ["--state"]);
    if (args.positionals.length !== 1 || !args.yes) die("usage: ebrain procedures review <workflow-id> --state active|stale|archived --yes [--json]", 2);
    const state = value(args, "--state");
    if (!isState(state)) die("procedure review requires a valid lifecycle state", 2);
    return print({ procedure: await reviewProcedure(args.positionals[0]!, state) });
  }
  die("usage: ebrain procedures <list|show|use|review> [--json]", 2);
}

if (import.meta.main) main().catch((error) => die(error instanceof Error ? error.message : String(error)));
