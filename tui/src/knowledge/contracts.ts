/**
 * tui/src/knowledge/contracts.ts — PURE view-models + parsers for the F6.5 knowledge
 * panels (Overview / Memory / Routing / Doctor).
 *
 * The knowledge panels obey the same rule the Sessions panel does: buildFrame is PURE,
 * so it never shells out. The impure loop (knowledge/run.ts) invokes the SAME
 * contract-tested `ebrain <sub> --json` subcommands the CLI phase (F6.1) shipped, and
 * these functions turn that raw JSON into normalized, defensively-typed view-models the
 * pure views render. Zero orphan logic (gate criterion #2): the TUI parses JSON, it
 * never re-computes what a subcommand already computes.
 *
 * Every parser takes `unknown` (subprocess JSON can be any shape) and returns either a
 * normalized model or `null` — the loop turns `null` into an "error" panel status. That
 * makes the whole file testable with pure JSON fixtures, no network / brain / tmux
 * (spec 6.5.6). See tui/test/knowledge/contracts.test.ts.
 */

// ---------------------------------------------------------------------------
// Tiny defensive JSON accessors — never trust the shape of subprocess output.
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNum(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function asBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

// ---------------------------------------------------------------------------
// Overview (status --json) — the home panel's live summary (6.5.1)
// ---------------------------------------------------------------------------

export interface OverviewData {
  brain: {
    /** "up" | "down" | ... — whatever status.sh reports. */
    state: string;
    /** e.g. "mcp:8541" when the brain is served by an MCP process. */
    servedBy: string;
    /** true when the read came from a cache because the brain lock was held (6.5.5). */
    cached: boolean;
  };
  spend: { mtd: number; cap: number; remaining: number };
  fleet: { total: number; online: number };
  memory: { learnings: number; sessions: number };
}

/** Parse `ebrain status --json`. Returns null only if the top-level shape is unusable. */
export function parseStatus(j: unknown): OverviewData | null {
  if (!isObj(j)) return null;
  const brain = isObj(j.brain) ? j.brain : {};
  const spend = isObj(j.spend) ? j.spend : {};
  const fleet = isObj(j.fleet) ? j.fleet : {};
  const memory = isObj(j.memory) ? j.memory : {};
  const agents = asArr(fleet.agents);
  const online = agents.filter((a) => isObj(a) && asBool(a.ok)).length;
  return {
    brain: {
      state: asStr(brain.state, "unknown"),
      servedBy: asStr(brain.served_by),
      cached: asBool(brain.cached),
    },
    spend: {
      mtd: asNum(spend.mtd),
      cap: asNum(spend.cap, 10),
      remaining: asNum(spend.remaining),
    },
    fleet: { total: agents.length, online },
    memory: {
      learnings: asNum(memory.learnings),
      sessions: asNum(memory.sessions),
    },
  };
}

// ---------------------------------------------------------------------------
// Fleet (fleet --json) — per-adapter online state + RAM class (6.5.4)
// ---------------------------------------------------------------------------

export type RamClass = "heavy" | "light" | "unknown";

export interface FleetAgent {
  name: string;
  ok: boolean;
  cls: RamClass;
}
export interface FleetData {
  agents: FleetAgent[];
  online: number;
  total: number;
}

function asRamClass(v: unknown): RamClass {
  return v === "heavy" || v === "light" ? v : "unknown";
}

export function parseFleet(j: unknown): FleetData | null {
  if (!isObj(j)) return null;
  const agents: FleetAgent[] = asArr(j.agents)
    .filter(isObj)
    .map((a) => ({ name: asStr(a.name, "?"), ok: asBool(a.ok), cls: asRamClass(a.class) }));
  return { agents, online: agents.filter((a) => a.ok).length, total: agents.length };
}

// ---------------------------------------------------------------------------
// Doctor (doctor --json) — health checks by level (6.5.4)
// ---------------------------------------------------------------------------

export type DoctorLevel = "ok" | "warn" | "fail";

export interface DoctorCheck {
  id: string;
  level: DoctorLevel;
  msg: string;
}
export interface DoctorData {
  checks: DoctorCheck[];
  ok: number;
  warn: number;
  fail: number;
}

function asDoctorLevel(v: unknown): DoctorLevel {
  return v === "ok" || v === "warn" || v === "fail" ? v : "warn";
}

export function parseDoctor(j: unknown): DoctorData | null {
  if (!isObj(j)) return null;
  const checks: DoctorCheck[] = asArr(j.checks)
    .filter(isObj)
    .map((c) => ({ id: asStr(c.id, "?"), level: asDoctorLevel(c.level), msg: asStr(c.msg) }));
  const count = (lvl: DoctorLevel) => checks.filter((c) => c.level === lvl).length;
  return { checks, ok: count("ok"), warn: count("warn"), fail: count("fail") };
}

// ---------------------------------------------------------------------------
// Spend / Routing (spend --json) — MTD by capability + budget (6.5.3)
// ---------------------------------------------------------------------------

export interface SpendCap {
  capability: string;
  mtd: number;
  routes: number;
}
export interface SpendData {
  month: string;
  mtd: number;
  cap: number;
  remaining: number;
  hardStop: boolean;
  byCap: SpendCap[];
  /** Known gbrain spend the router can't attribute to a cap — surfaced as a flag (6.5.3). */
  gbrainUntracked: boolean;
}

export type RoutingModelRole = "winner" | "fallback" | "floor";

export interface RoutingModel {
  role: RoutingModelRole;
  slug: string;
  free: boolean;
  frontier: boolean;
  pricing: { inputPerM: number; outputPerM: number } | null;
}

export interface RoutingCapability {
  capability: string;
  mtd: number;
  routes: number;
  command: string;
  estTypicalUsd: number | null;
  models: RoutingModel[];
}

export interface RoutingData extends SpendData {
  capabilities: RoutingCapability[];
}

export function parseSpend(j: unknown): SpendData | null {
  if (!isObj(j)) return null;
  const budget = isObj(j.budget) ? j.budget : {};
  const byCap: SpendCap[] = asArr(j.by_capability)
    .filter(isObj)
    .map((c) => ({ capability: asStr(c.capability, "?"), mtd: asNum(c.mtd), routes: asNum(c.routes) }));
  return {
    month: asStr(j.month),
    mtd: asNum(j.mtd),
    cap: asNum(budget.monthly_usd, 10),
    remaining: asNum(j.remaining),
    hardStop: asBool(budget.hard_stop),
    byCap,
    gbrainUntracked: asBool(j.gbrain_untracked),
  };
}

function asRoutingRole(v: unknown): RoutingModelRole {
  return v === "winner" || v === "fallback" || v === "floor" ? v : "fallback";
}

export function parseRouting(j: unknown): RoutingData | null {
  if (!isObj(j)) return null;
  const base = parseSpend({
    month: j.month,
    budget: j.budget,
    mtd: j.mtd,
    remaining: j.remaining,
    by_capability: [],
    gbrain_untracked: j.gbrain_untracked,
  });
  if (!base) return null;
  const capabilities: RoutingCapability[] = asArr(j.capabilities)
    .filter(isObj)
    .map((c) => ({
      capability: asStr(c.capability, "?"),
      mtd: asNum(c.mtd),
      routes: asNum(c.routes),
      command: asStr(c.command),
      estTypicalUsd: typeof c.est_typical_usd === "number" ? c.est_typical_usd : null,
      models: asArr(c.models).filter(isObj).map((m) => {
        const pricing = isObj(m.pricing) ? m.pricing : null;
        return {
          role: asRoutingRole(m.role),
          slug: asStr(m.slug, "?"),
          free: asBool(m.free),
          frontier: asBool(m.frontier),
          pricing: pricing
            ? { inputPerM: asNum(pricing.input_per_m), outputPerM: asNum(pricing.output_per_m) }
            : null,
        };
      }),
    }));
  return {
    ...base,
    byCap: capabilities.map((c) => ({ capability: c.capability, mtd: c.mtd, routes: c.routes })),
    capabilities,
  };
}

export interface AdviceData {
  task: string;
  capability: string;
  lane: string;
  agent: string;
  model: string;
  reason: string;
  estCost: { usd: number | null; note: string };
  alternatives: { lane: string; agent: string; model: string; note: string }[];
  frontier: boolean;
}

export function parseAdvice(j: unknown): AdviceData | null {
  if (!isObj(j)) return null;
  const est = isObj(j.est_cost) ? j.est_cost : {};
  return {
    task: asStr(j.task),
    capability: asStr(j.capability, "general"),
    lane: asStr(j.lane),
    agent: asStr(j.agent),
    model: asStr(j.model),
    reason: asStr(j.reason),
    estCost: {
      usd: typeof est.usd === "number" ? est.usd : null,
      note: asStr(est.note),
    },
    alternatives: asArr(j.alternatives).filter(isObj).map((a) => ({
      lane: asStr(a.lane),
      agent: asStr(a.agent),
      model: asStr(a.model),
      note: asStr(a.note),
    })),
    frontier: asBool(j.frontier),
  };
}

export interface RouteRunData {
  ts: string;
  cap: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  usd: number;
  estimated: boolean;
  content: string;
}

export function parseRouteRun(j: unknown): RouteRunData | null {
  if (!isObj(j)) return null;
  return {
    ts: asStr(j.ts),
    cap: asStr(j.cap),
    model: asStr(j.model, "?"),
    tokensIn: asNum(j.tokens_in),
    tokensOut: asNum(j.tokens_out),
    usd: asNum(j.usd),
    estimated: asBool(j.usd_estimated),
    content: asStr(j.content),
  };
}

// ---------------------------------------------------------------------------
// Memory (memory recent --json) — learnings + cross-.brain session logs (6.5.2)
// ---------------------------------------------------------------------------

export interface MemoryLearning {
  project: string;
  agent: string;
  date: string;
  tags: string[];
  text: string;
}
export interface MemorySession {
  ts: string;
  project: string;
  agent: string;
  commit: string;
  summary: string;
}
export interface MemoryData {
  learnings: MemoryLearning[];
  sessions: MemorySession[];
}

export function parseMemory(j: unknown): MemoryData | null {
  if (!isObj(j)) return null;
  const learnings: MemoryLearning[] = asArr(j.learnings)
    .filter(isObj)
    .map((l) => ({
      project: asStr(l.project, "?"),
      agent: asStr(l.agent, "unknown"),
      date: asStr(l.date),
      tags: asArr(l.tags).map((t) => asStr(t)).filter(Boolean),
      text: asStr(l.text),
    }));
  const sessions: MemorySession[] = asArr(j.sessions)
    .filter(isObj)
    .map((s) => ({
      ts: asStr(s.ts),
      project: asStr(s.project, "?"),
      agent: asStr(s.agent, "unknown"),
      commit: asStr(s.commit),
      summary: asStr(s.summary),
    }));
  return { learnings, sessions };
}
