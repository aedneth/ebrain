#!/usr/bin/env bun
/**
 * ebrain cost — unified, evidence-first cost ledger (F6.6E).
 *
 * `route.ts` remains the authoritative OpenRouter writer. This command normalizes its
 * legacy spend.jsonl records and optional adapter events from ~/.config/ebrain/cost.jsonl
 * into one read-only report. Adapter events intentionally require an explicit --yes:
 * no provider is guessed, no token-only usage is converted into invented USD, and no secret
 * is read by this command.
 *
 * `engine` (added: memory-ootb) folds in the memory engine's own think/dream spend ledgers
 * (`~/.gbrain/audit/`, parsed by `./engine-spend.ts`) as a separate top-level lane —
 * `{ usd, observed, partiallyObserved }`. `usd` only ever sums real, priced spend; when no
 * ledger is found `observed` is `false` and `usd` stays `0`, never a guess.
 *
 * Usage:
 *   ebrain cost --json
 *   ebrain cost record --provider openai --model gpt-4.1 --tokens-in 120 --tokens-out 80 --usd 0.001 --yes --json
 *   ebrain cost record --provider gemini --model gemini-2.5-flash --tokens-in 120 --tokens-out 80 --kind token-only --yes --json
 */
import { appendFile, chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { loadRoutingCfg, resolveEngineAuditDir } from "./spend.ts";
import { providerIds, providerStatusFor } from "./providers.ts";
import { expandHome, monthKey } from "./route.ts";
import { readEngineSpend, type EngineSpend } from "./engine-spend.ts";

const HOME = homedir();
const DEFAULT_SIDECAR_LOG = process.env.EBRAIN_COST_LOG || join(HOME, ".config", "ebrain", "cost.jsonl");
const DEFAULT_LIMIT = 20;

export type CostKind = "actual" | "estimated" | "token-only" | "untracked";
export type ProviderStatus = "metered" | "token-only" | "untracked";

export interface CostEvent {
  schema_version: 2;
  ts: string;
  provider: string;
  agent: string | null;
  model: string | null;
  session: string | null;
  workflow: string | null;
  capability: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  usd: number | null;
  cost_kind: CostKind;
  source: "route" | "adapter";
}

export interface CostBreakdown {
  key: string;
  usd: number;
  actual_usd: number;
  estimated_usd: number;
  events: number;
  tokens_in: number;
  tokens_out: number;
  untracked_events: number;
  token_only_events: number;
}

export interface ProviderBreakdown extends CostBreakdown {
  provider: string;
  status: ProviderStatus;
}

/** The memory engine's own think/dream spend, folded into `ebrain cost` (added: memory-ootb). */
export interface EngineCostLane {
  usd: number;
  observed: boolean;
  partiallyObserved: boolean;
}

export interface CostReport {
  schema_version: 2;
  month: string;
  /** `scope` is the provider the monthly cap actually governs — the one routing.yaml points at. */
  budget: { monthly_usd: number; hard_stop: boolean; scope: string };
  /** The routed provider id, so a report is readable without also reading the config. */
  routed_provider: string;
  /** Month-to-date spend on the routed provider. This is what the cap is measured against. */
  routed_mtd: number;
  remaining_routed: number;
  /**
   * Retained for consumers written when OpenRouter was the only lane. These stay literally
   * correct — spend attributed to OpenRouter, and the cap minus it — but when routing.yaml points
   * somewhere else they describe a lane that is not the one being budgeted. Prefer `routed_*`.
   */
  openrouter_mtd: number;
  known_mtd: number;
  remaining_openrouter: number;
  engine: EngineCostLane;
  providers: ProviderBreakdown[];
  agents: CostBreakdown[];
  models: CostBreakdown[];
  sessions: CostBreakdown[];
  workflows: CostBreakdown[];
  entries: CostEvent[];
  untracked_providers: string[];
}

interface RawRecord {
  ts?: unknown;
  src?: unknown;
  cap?: unknown;
  model?: unknown;
  tokens_in?: unknown;
  tokens_out?: unknown;
  usd?: unknown;
  usd_estimated?: unknown;
  provider?: unknown;
  agent?: unknown;
  session?: unknown;
  workflow?: unknown;
  capability?: unknown;
  cost_kind?: unknown;
  source?: unknown;
  schema_version?: unknown;
}

/**
 * Seed statuses for lanes with no events this month, so `ebrain cost` lists them at zero rather
 * than omitting them. Two kinds of entry live here and they are not the same thing:
 *
 *  - model providers, taken from the registry, so adding a provider needs no edit here; only one
 *    that reports real USD per request can be called "metered" before any event exists.
 *  - agent CLIs, which spend money on their own subscriptions that eBrain cannot see at all.
 */
const PROVIDER_STATUS: Record<string, ProviderStatus> = {
  ...Object.fromEntries(
    providerIds().map((id) => [id, providerStatusFor(id) === "metered" ? "metered" : "untracked"] as const),
  ),
  gemini: "untracked",
  claude: "untracked",
  cursor: "untracked",
  opencode: "untracked",
};

function die(msg: string, code = 1): never {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

function asObj(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function asNonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function asKind(value: unknown, fallback: CostKind): CostKind {
  return value === "actual" || value === "estimated" || value === "token-only" || value === "untracked" ? value : fallback;
}
function money(value: number): number {
  return +value.toFixed(6);
}
function safeId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,160}$/.test(value);
}

/** Read only valid JSONL objects; a corrupt line must never hide other real cost events. */
export async function readJsonl(path: string): Promise<RawRecord[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) return [];
  const records: RawRecord[] = [];
  for (const line of (await file.text()).split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = asObj(JSON.parse(line));
      if (record) records.push(record as RawRecord);
    } catch {
      /* Skip corrupt lines, matching the spend ledger's established behavior. */
    }
  }
  return records;
}

/** Normalize the pre-v2 `route.ts` ledger without rewriting historical records. */
export function normalizeRouteRecord(record: RawRecord): CostEvent | null {
  const ts = asString(record.ts);
  const usd = asNonnegative(record.usd);
  if (!ts || usd == null) return null;
  return {
    schema_version: 2,
    ts,
    // `route.ts` now stamps the provider it actually called. Records written before it did are
    // from the era when there was only one lane, so that is what they are attributed to — the
    // alternative, dropping them into "unknown", would rewrite spend history that is not wrong.
    provider: asString(record.provider) ?? "openrouter",
    agent: asString(record.agent) ?? "route",
    model: asString(record.model),
    session: asString(record.session),
    workflow: asString(record.workflow),
    capability: asString(record.cap),
    tokens_in: asNonnegative(record.tokens_in),
    tokens_out: asNonnegative(record.tokens_out),
    usd,
    cost_kind: record.usd_estimated === true ? "estimated" : "actual",
    source: "route",
  };
}

/** Normalize explicit provider adapter events. Missing USD remains untracked, never zero. */
export function normalizeAdapterRecord(record: RawRecord): CostEvent | null {
  const ts = asString(record.ts);
  const provider = asString(record.provider)?.toLowerCase();
  if (!ts || !provider || !safeId(provider)) return null;
  const usd = asNonnegative(record.usd);
  const hasTokens = asNonnegative(record.tokens_in) != null || asNonnegative(record.tokens_out) != null;
  const fallback: CostKind = usd != null ? "actual" : hasTokens ? "token-only" : "untracked";
  const costKind = asKind(record.cost_kind, fallback);
  return {
    schema_version: 2,
    ts,
    provider,
    agent: asString(record.agent),
    model: asString(record.model),
    session: asString(record.session),
    workflow: asString(record.workflow),
    capability: asString(record.capability),
    tokens_in: asNonnegative(record.tokens_in),
    tokens_out: asNonnegative(record.tokens_out),
    usd,
    cost_kind: costKind,
    source: "adapter",
  };
}

function emptyBreakdown(key: string): CostBreakdown {
  return { key, usd: 0, actual_usd: 0, estimated_usd: 0, events: 0, tokens_in: 0, tokens_out: 0, untracked_events: 0, token_only_events: 0 };
}

function addEvent(row: CostBreakdown, event: CostEvent): void {
  row.events += 1;
  row.tokens_in += event.tokens_in ?? 0;
  row.tokens_out += event.tokens_out ?? 0;
  if (event.cost_kind === "untracked") row.untracked_events += 1;
  if (event.cost_kind === "token-only") row.token_only_events += 1;
  if (event.usd != null) {
    row.usd += event.usd;
    if (event.cost_kind === "actual") row.actual_usd += event.usd;
    if (event.cost_kind === "estimated") row.estimated_usd += event.usd;
  }
}

function finish(row: CostBreakdown): CostBreakdown {
  return { ...row, usd: money(row.usd), actual_usd: money(row.actual_usd), estimated_usd: money(row.estimated_usd) };
}

function breakdown(events: CostEvent[], keyOf: (event: CostEvent) => string | null): CostBreakdown[] {
  const totals = new Map<string, CostBreakdown>();
  for (const event of events) {
    const key = keyOf(event);
    if (!key) continue;
    const row = totals.get(key) ?? emptyBreakdown(key);
    addEvent(row, event);
    totals.set(key, row);
  }
  return [...totals.values()].map(finish).sort((a, b) => b.usd - a.usd || b.events - a.events || a.key.localeCompare(b.key));
}

function providerStatus(provider: string, row: CostBreakdown): ProviderStatus {
  if (row.actual_usd > 0 || row.estimated_usd > 0) return "metered";
  if (row.token_only_events > 0 || row.tokens_in > 0 || row.tokens_out > 0) return "token-only";
  return PROVIDER_STATUS[provider] ?? "untracked";
}

const UNOBSERVED_ENGINE_SPEND: EngineSpend = { usd: 0, observed: false, partiallyObserved: false, files: 0, lines: 0, skipped: 0 };

export function buildCostReport(
  routeRecords: RawRecord[],
  adapterRecords: RawRecord[],
  opts: {
    month?: string;
    budget?: { monthly_usd: number; hard_stop: boolean };
    limit?: number;
    engine?: EngineSpend;
    /** Which provider routing.yaml points at. Defaults to the historical single lane. */
    routedProvider?: string;
  } = {},
): CostReport {
  const month = opts.month ?? monthKey();
  const engineSpend = opts.engine ?? UNOBSERVED_ENGINE_SPEND;
  const events = [
    ...routeRecords.map(normalizeRouteRecord),
    ...adapterRecords.map(normalizeAdapterRecord),
  ].filter((event): event is CostEvent => event !== null && event.ts.startsWith(month));
  const budget = opts.budget ?? { monthly_usd: 10, hard_stop: true };
  const providerRows = breakdown(events, (event) => event.provider);
  const providers = new Map(providerRows.map((row) => [row.key, { ...row, provider: row.key, status: providerStatus(row.key, row) }]));
  for (const [provider, status] of Object.entries(PROVIDER_STATUS)) {
    if (!providers.has(provider)) providers.set(provider, { ...emptyBreakdown(provider), provider, status });
  }
  const providerList = [...providers.values()].sort((a, b) => b.usd - a.usd || a.provider.localeCompare(b.provider));
  const routedProvider = opts.routedProvider ?? "openrouter";
  const routed = providers.get(routedProvider) ?? { ...emptyBreakdown(routedProvider), provider: routedProvider, status: providerStatus(routedProvider, emptyBreakdown(routedProvider)) };
  const openrouter = providers.get("openrouter") ?? { ...emptyBreakdown("openrouter"), provider: "openrouter", status: "metered" as const };
  const knownMtd = money(events.reduce((sum, event) => sum + (event.usd ?? 0), 0));
  const limit = Math.max(1, opts.limit ?? DEFAULT_LIMIT);
  const untracked = providerList.filter((provider) => provider.status === "untracked" || provider.untracked_events > 0).map((provider) => provider.provider);

  return {
    schema_version: 2,
    month,
    budget: { ...budget, scope: routedProvider },
    routed_provider: routedProvider,
    routed_mtd: routed.usd,
    remaining_routed: money(budget.monthly_usd - routed.usd),
    openrouter_mtd: openrouter.usd,
    known_mtd: knownMtd,
    remaining_openrouter: money(budget.monthly_usd - openrouter.usd),
    engine: {
      usd: money(engineSpend.usd),
      observed: engineSpend.observed,
      partiallyObserved: engineSpend.partiallyObserved,
    },
    providers: providerList,
    agents: breakdown(events, (event) => event.agent),
    models: breakdown(events, (event) => event.model),
    sessions: breakdown(events, (event) => event.session),
    workflows: breakdown(events, (event) => event.workflow),
    entries: events.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit),
    untracked_providers: untracked,
  };
}

export async function loadCostReport(limit = DEFAULT_LIMIT, sidecarPath = DEFAULT_SIDECAR_LOG): Promise<CostReport> {
  const cfg = await loadRoutingCfg();
  const routeLog = expandHome(cfg.budget.log);
  const [routeRecords, adapterRecords] = await Promise.all([readJsonl(routeLog), readJsonl(sidecarPath)]);
  const engine = readEngineSpend(resolveEngineAuditDir());
  return buildCostReport(routeRecords, adapterRecords, { budget: cfg.budget, limit, engine, routedProvider: cfg.provider.id });
}

export interface RecordInput {
  provider: string;
  agent?: string;
  model?: string;
  session?: string;
  workflow?: string;
  capability?: string;
  tokens_in?: number;
  tokens_out?: number;
  usd?: number;
  kind?: CostKind;
}

export function makeAdapterEvent(input: RecordInput, ts = new Date().toISOString()): CostEvent {
  const provider = input.provider.toLowerCase();
  if (!safeId(provider)) throw new Error("provider inválido");
  for (const value of [input.agent, input.model, input.session, input.workflow, input.capability]) {
    if (value != null && !safeId(value)) throw new Error("identificador de costo inválido");
  }
  for (const value of [input.tokens_in, input.tokens_out, input.usd]) {
    if (value != null && (!Number.isFinite(value) || value < 0)) throw new Error("tokens/usd debe ser número no-negativo");
  }
  const hasTokens = input.tokens_in != null || input.tokens_out != null;
  const fallback: CostKind = input.usd != null ? "actual" : hasTokens ? "token-only" : "untracked";
  const kind = input.kind ?? fallback;
  if ((kind === "actual" || kind === "estimated") && input.usd == null) throw new Error("actual/estimated requiere usd");
  if ((kind === "token-only" || kind === "untracked") && input.usd != null) throw new Error("token-only/untracked no admite usd");
  return {
    schema_version: 2,
    ts,
    provider,
    agent: input.agent ?? null,
    model: input.model ?? null,
    session: input.session ?? null,
    workflow: input.workflow ?? null,
    capability: input.capability ?? null,
    tokens_in: input.tokens_in ?? null,
    tokens_out: input.tokens_out ?? null,
    usd: input.usd ?? null,
    cost_kind: kind,
    source: "adapter",
  };
}

export async function appendAdapterEvent(event: CostEvent, path = DEFAULT_SIDECAR_LOG): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  await appendFile(path, JSON.stringify(event) + "\n", { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

function parseNumber(value: string | undefined, flag: string): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) die(`${flag} debe ser un número no-negativo`, 2);
  return n;
}

function valueOf(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseRecord(args: string[]): { input: RecordInput; yes: boolean; json: boolean } {
  const provider = valueOf(args, "--provider");
  if (!provider) die("uso: ebrain cost record --provider <provider> [--model <model>] [--tokens-in N] [--tokens-out N] [--usd N] --yes [--json]", 2);
  const kind = valueOf(args, "--kind");
  if (kind && kind !== "actual" && kind !== "estimated" && kind !== "token-only" && kind !== "untracked") die("--kind debe ser actual|estimated|token-only|untracked", 2);
  return {
    input: {
      provider,
      agent: valueOf(args, "--agent"),
      model: valueOf(args, "--model"),
      session: valueOf(args, "--session"),
      workflow: valueOf(args, "--workflow"),
      capability: valueOf(args, "--cap"),
      tokens_in: parseNumber(valueOf(args, "--tokens-in"), "--tokens-in"),
      tokens_out: parseNumber(valueOf(args, "--tokens-out"), "--tokens-out"),
      usd: parseNumber(valueOf(args, "--usd"), "--usd"),
      kind: kind as CostKind | undefined,
    },
    yes: args.includes("--yes"),
    json: args.includes("--json"),
  };
}

function printReport(report: CostReport): void {
  console.log(`ebrain cost — ${report.month}`);
  console.log(`  ${report.routed_provider} $${report.routed_mtd.toFixed(4)} / cap $${report.budget.monthly_usd} (restante $${report.remaining_routed.toFixed(4)})`);
  console.log(`  conocido total $${report.known_mtd.toFixed(4)}; cap aplica solo a OpenRouter`);
  if (report.engine.observed) {
    const note = report.engine.partiallyObserved ? " (parcial — llamadas sin precio)" : "";
    console.log(`  motor (think/dream) $${report.engine.usd.toFixed(4)}${note}`);
  }
  for (const provider of report.providers) {
    const status = provider.status === "metered" ? `$${provider.usd.toFixed(4)}` : provider.status;
    console.log(`  ${provider.provider.padEnd(12)} ${status.padEnd(14)} events=${provider.events} tokens=${provider.tokens_in}+${provider.tokens_out}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sub = args[0] === "record" ? "record" : "report";
  if (sub === "record") {
    const parsed = parseRecord(args.slice(1));
    const event = makeAdapterEvent(parsed.input);
    if (!parsed.yes) {
      const payload = { ok: false, error: { type: "confirm-required", message: "cost record escribe un evento local; repetí con --yes para aprobar" }, would: event };
      if (parsed.json) console.log(JSON.stringify(payload, null, 2));
      else console.error(`✗ ${payload.error.message}`);
      process.exit(2);
    }
    await appendAdapterEvent(event);
    if (parsed.json) console.log(JSON.stringify({ ok: true, event }, null, 2));
    else console.log(`cost event recorded: ${event.provider} (${event.cost_kind})`);
    return;
  }
  const limit = parseNumber(valueOf(args, "--limit"), "--limit") ?? DEFAULT_LIMIT;
  const report = await loadCostReport(Math.floor(limit));
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
}

if (import.meta.main) main().catch((error) => die(error instanceof Error ? error.message : String(error)));
