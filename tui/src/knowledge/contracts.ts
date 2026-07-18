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

import { scrubSecrets } from "../../../cli/scrub.ts";

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

export interface SearchResult { score: number; source: string; slug: string; snippet: string }
export interface SearchData { query: string; results: SearchResult[] }
export function parseSearch(j: unknown): SearchData | null {
  if (!isObj(j) || typeof j.query !== "string" || !Array.isArray(j.results)) return null;
  // Defense in depth (G56-F4): scrub slug + snippet at THIS trusted boundary before any row is
  // stored or rendered. `ebrain q` already scrubs at source, but the TUI must never trust the
  // content of subprocess output — a source regression or a different producer must not leak a
  // secret onto the terminal. Same scrubber as the CLI (single source of truth: cli/scrub.ts).
  return { query: j.query, results: j.results.filter(isObj).map((row) => ({ score: asNum(row.score), source: asStr(row.source), slug: scrubSecrets(asStr(row.slug)), snippet: scrubSecrets(asStr(row.snippet)) })).filter((row) => Boolean(row.source && row.slug)) };
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
}

// No per-token price snapshot and no cost estimate: those were undated/unsourced numbers that
// read like verified billing (G56-F8). Cost surfaces ONLY as factual MTD spend + the cost ledger.
export interface RoutingCapability {
  capability: string;
  mtd: number;
  routes: number;
  command: string;
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
      models: asArr(c.models).filter(isObj).map((m) => ({
        role: asRoutingRole(m.role),
        slug: asStr(m.slug, "?"),
        free: asBool(m.free),
        frontier: asBool(m.frontier),
      })),
    }));
  return {
    ...base,
    byCap: capabilities.map((c) => ({ capability: c.capability, mtd: c.mtd, routes: c.routes })),
    capabilities,
  };
}

// ---------------------------------------------------------------------------
// Unified cost ledger (cost --json) — known USD separated from token-only usage
// ---------------------------------------------------------------------------

export type CostProviderStatus = "metered" | "token-only" | "untracked";

export interface CostBreakdownData {
  key: string;
  usd: number;
  actualUsd: number;
  estimatedUsd: number;
  events: number;
  tokensIn: number;
  tokensOut: number;
  untrackedEvents: number;
  tokenOnlyEvents: number;
}

export interface CostProviderData extends CostBreakdownData {
  provider: string;
  status: CostProviderStatus;
}

export interface CostData {
  month: string;
  budget: { monthlyUsd: number; hardStop: boolean; scope: string };
  openrouterMtd: number;
  knownMtd: number;
  remainingOpenrouter: number;
  providers: CostProviderData[];
  agents: CostBreakdownData[];
  models: CostBreakdownData[];
  sessions: CostBreakdownData[];
  workflows: CostBreakdownData[];
  untrackedProviders: string[];
}

function asCostStatus(value: unknown): CostProviderStatus {
  return value === "metered" || value === "token-only" ? value : "untracked";
}

function parseCostBreakdown(value: unknown): CostBreakdownData | null {
  if (!isObj(value)) return null;
  const key = asStr(value.key);
  if (!key) return null;
  return {
    key,
    usd: asNum(value.usd),
    actualUsd: asNum(value.actual_usd),
    estimatedUsd: asNum(value.estimated_usd),
    events: asNum(value.events),
    tokensIn: asNum(value.tokens_in),
    tokensOut: asNum(value.tokens_out),
    untrackedEvents: asNum(value.untracked_events),
    tokenOnlyEvents: asNum(value.token_only_events),
  };
}

export function parseCost(j: unknown): CostData | null {
  if (!isObj(j)) return null;
  const budget = isObj(j.budget) ? j.budget : {};
  const providers: CostProviderData[] = asArr(j.providers).filter(isObj).map((provider) => {
    const parsed = parseCostBreakdown(provider);
    if (!parsed) return null;
    return { ...parsed, provider: asStr(provider.provider, parsed.key), status: asCostStatus(provider.status) };
  }).filter((provider): provider is CostProviderData => provider !== null);
  const list = (value: unknown) => asArr(value).map(parseCostBreakdown).filter((row): row is CostBreakdownData => row !== null);
  return {
    month: asStr(j.month),
    budget: { monthlyUsd: asNum(budget.monthly_usd, 10), hardStop: asBool(budget.hard_stop), scope: asStr(budget.scope, "openrouter") },
    openrouterMtd: asNum(j.openrouter_mtd),
    knownMtd: asNum(j.known_mtd),
    remainingOpenrouter: asNum(j.remaining_openrouter),
    providers,
    agents: list(j.agents),
    models: list(j.models),
    sessions: list(j.sessions),
    workflows: list(j.workflows),
    untrackedProviders: asArr(j.untracked_providers).map((provider) => asStr(provider)).filter(Boolean),
  };
}

export interface TaskProfileData {
  task: string;
  signals: { capability: string; matched: string[] }[];
  selectedCapability: string;
  compatibleTargets: string[];
  disclaimer: string;
}

export function parseTaskProfile(j: unknown): TaskProfileData | null {
  if (!isObj(j)) return null;
  const selected = asStr(j.selected_capability, "general");
  if (!selected) return null;
  return {
    task: asStr(j.task),
    signals: asArr(j.signals).filter(isObj).map((signal) => ({
      capability: asStr(signal.capability, "general"),
      matched: asArr(signal.matched).map((keyword) => asStr(keyword)).filter(Boolean),
    })),
    selectedCapability: selected,
    compatibleTargets: asArr(j.compatible_targets).map((target) => asStr(target)).filter(Boolean),
    disclaimer: asStr(j.disclaimer),
  };
}

export interface WorkspaceData { id: string; label: string; cwd: string }
export interface WorkspacesData { schemaVersion: 1; workspaces: WorkspaceData[] }

function parseWorkspaceData(value: unknown): WorkspaceData | null {
  if (!isObj(value)) return null;
  const id = asStr(value.id);
  const label = scrubSecrets(asStr(value.label));
  const cwd = scrubSecrets(asStr(value.cwd));
  return id && label && cwd.startsWith("/") ? { id, label, cwd } : null;
}

/** TUI consumes the registry only through the CLI contract. Scrub labels and paths at the
 * subprocess boundary just like search results, even though the registry itself rejects secrets. */
export function parseWorkspaces(j: unknown): WorkspacesData | null {
  if (!isObj(j) || j.schema_version !== 1 || !Array.isArray(j.workspaces)) return null;
  const workspaces = j.workspaces.map(parseWorkspaceData).filter((workspace): workspace is WorkspaceData => workspace !== null);
  if (workspaces.length !== j.workspaces.length) return null;
  return { schemaVersion: 1, workspaces };
}

/** `workspaces validate` returns only the canonical, validated directory. */
export function parseWorkspaceValidation(j: unknown): { cwd: string } | null {
  if (!isObj(j) || j.ok !== true) return null;
  const cwd = scrubSecrets(asStr(j.cwd));
  return cwd.startsWith("/") ? { cwd } : null;
}

/** `workspaces add` returns the stored record after the CLI has canonicalized it. */
export function parseWorkspaceMutation(j: unknown): WorkspaceData | null {
  if (!isObj(j) || j.ok !== true) return null;
  return parseWorkspaceData(j.workspace);
}

/** `workspaces remove` deliberately returns only the removed generated id. */
export function parseWorkspaceRemoval(j: unknown): { removed: string } | null {
  if (!isObj(j) || j.ok !== true) return null;
  const removed = asStr(j.removed);
  return /^[a-z][a-z0-9-]{0,63}$/.test(removed) ? { removed } : null;
}

// ---------------------------------------------------------------------------
// Context packs (ADR-008 / F9.1) -- summaries only. Pack bodies remain behind an
// explicit bounded CLI retrieval and are never stored in the TUI state.
// ---------------------------------------------------------------------------

export interface ContextPackData {
  id: string;
  scope: "operator" | "workspace";
  workspaceId?: string;
  version: number;
  updatedAt: string;
  chars: number;
}
export interface ContextPacksData { packs: ContextPackData[] }

export function parseContextPacks(j: unknown): ContextPacksData | null {
  if (!isObj(j) || !Object.keys(j).every((key) => key === "packs") || !Array.isArray(j.packs)) return null;
  const packs: ContextPackData[] = [];
  for (const value of j.packs) {
    if (!isObj(value) || !Object.keys(value).every((key) => ["id", "scope", "workspace_id", "version", "updated_at", "chars"].includes(key))) return null;
    const id = asStr(value.id);
    const scope = value.scope;
    const workspaceId = typeof value.workspace_id === "string" ? value.workspace_id : undefined;
    const version = asNum(value.version);
    const updatedAt = asStr(value.updated_at);
    const chars = asNum(value.chars, -1);
    if (!/^(?:operator|workspace-[a-z][a-z0-9-]{0,63})$/.test(id) || (scope !== "operator" && scope !== "workspace") || !Number.isInteger(version) || version < 1 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(updatedAt) || !Number.isInteger(chars) || chars < 0) return null;
    if ((scope === "operator" && (id !== "operator" || workspaceId !== undefined)) || (scope === "workspace" && (!workspaceId || id !== `workspace-${workspaceId}` || !/^[a-z][a-z0-9-]{0,63}$/.test(workspaceId)))) return null;
    packs.push({ id, scope, ...(workspaceId ? { workspaceId } : {}), version, updatedAt, chars });
  }
  return { packs };
}

export interface ProfileSummaryData {
  id: string;
  label: string;
  provider: string;
  capabilities: string[];
  models: number;
  evidence: { source: string; asOf: string };
}
export interface ProfilesData { initialized: boolean; profiles: ProfileSummaryData[] }

export function parseProfiles(j: unknown): ProfilesData | null {
  if (!isObj(j) || typeof j.initialized !== "boolean") return null;
  return {
    initialized: j.initialized,
    profiles: asArr(j.profiles).filter(isObj).map((profile) => {
      const evidence = isObj(profile.evidence) ? profile.evidence : {};
      return {
        id: asStr(profile.id), label: asStr(profile.label), provider: asStr(profile.provider),
        capabilities: asArr(profile.capabilities).map((capability) => asStr(capability)).filter(Boolean),
        models: asNum(profile.models), evidence: { source: asStr(evidence.source), asOf: asStr(evidence.as_of) },
      };
    }).filter((profile) => Boolean(profile.id)),
  };
}

export interface TargetData { id: string; agent: string; provider: string; ramClass: string }
export function parseTargets(j: unknown): TargetData[] | null {
  if (!isObj(j)) return null;
  return asArr(j.targets).filter(isObj).map((target) => ({
    id: asStr(target.id), agent: asStr(target.agent), provider: asStr(target.provider), ramClass: asStr(target.ram_class, "unknown"),
  })).filter((target) => Boolean(target.id && target.agent));
}

export interface TargetPlanData {
  target: string; agent: string; profile: string; capability: string; model: string;
  fallbackModels: string[]; cwd: string; ramClass: string; costStatus: string;
}
export function parseTargetPlan(j: unknown): TargetPlanData | null {
  if (!isObj(j)) return null;
  const target = asStr(j.target); const agent = asStr(j.agent); const profile = asStr(j.profile); const capability = asStr(j.capability); const model = asStr(j.model);
  if (!target || !agent || !profile || !capability || !model) return null;
  return { target, agent, profile, capability, model, fallbackModels: asArr(j.fallback_models).map((value) => asStr(value)).filter(Boolean), cwd: asStr(j.cwd), ramClass: asStr(j.ram_class, "unknown"), costStatus: asStr(j.cost_status, "untracked") };
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
  if (!isObj(j) || !Object.keys(j).every((key) => ["learnings", "sessions"].includes(key))) return null;
  if ((j.learnings !== undefined && !Array.isArray(j.learnings)) || (j.sessions !== undefined && !Array.isArray(j.sessions))) return null;
  const learnings: MemoryLearning[] = [];
  for (const value of asArr(j.learnings)) {
    if (!isObj(value) || !Object.keys(value).every((key) => ["project", "agent", "date", "tags", "text"].includes(key))) return null;
    if (typeof value.project !== "string" || typeof value.agent !== "string" || typeof value.date !== "string" || !Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === "string") || typeof value.text !== "string") return null;
    learnings.push({ project: value.project, agent: value.agent, date: value.date, tags: value.tags, text: value.text });
  }
  const sessions: MemorySession[] = [];
  for (const value of asArr(j.sessions)) {
    if (!isObj(value) || !Object.keys(value).every((key) => ["ts", "project", "agent", "commit", "summary"].includes(key))) return null;
    if (typeof value.ts !== "string" || typeof value.project !== "string" || typeof value.agent !== "string" || typeof value.commit !== "string" || typeof value.summary !== "string") return null;
    sessions.push({ ts: value.ts, project: value.project, agent: value.agent, commit: value.commit, summary: value.summary });
  }
  return { learnings, sessions };
}

// ---------------------------------------------------------------------------
// Episodes (episodes list --json) -- summary-only local recall records (F9.2)
// ---------------------------------------------------------------------------

export interface EpisodeSummaryData {
  id: string;
  kind: "learning" | "session-summary";
  source: "remember" | "explicit" | "harness-summary" | "legacy-import";
  createdAt: string;
  project: string;
  agent: string;
  session?: string;
  workspaceId?: string;
  chars: number;
}

export interface EpisodesData { episodes: EpisodeSummaryData[] }

/** Passive episode reads must never carry an episode body, content hash, or filesystem path. */
export function parseEpisodes(j: unknown): EpisodesData | null {
  if (!isObj(j) || !Object.keys(j).every((key) => key === "episodes") || !Array.isArray(j.episodes)) return null;
  const episodes: EpisodeSummaryData[] = [];
  for (const value of j.episodes) {
    const allowed = ["id", "kind", "source", "created_at", "project", "agent", "session", "workspace_id", "chars"];
    if (!isObj(value) || !Object.keys(value).every((key) => allowed.includes(key))) return null;
    const id = asStr(value.id);
    const kind = value.kind;
    const source = value.source;
    const createdAt = asStr(value.created_at);
    const project = asStr(value.project);
    const agent = asStr(value.agent);
    const session = typeof value.session === "string" ? value.session : undefined;
    const workspaceId = typeof value.workspace_id === "string" ? value.workspace_id : undefined;
    const chars = asNum(value.chars, -1);
    if (!/^episode-[a-f0-9-]{36}$/.test(id) || (kind !== "learning" && kind !== "session-summary") || (source !== "remember" && source !== "explicit" && source !== "harness-summary" && source !== "legacy-import") || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(project) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(agent) || (session !== undefined && !/^[a-z][a-z0-9-]{0,63}$/.test(session)) || (workspaceId !== undefined && !/^[a-z][a-z0-9-]{0,63}$/.test(workspaceId)) || !Number.isInteger(chars) || chars < 0) return null;
    episodes.push({ id, kind, source, createdAt, project, agent, ...(session ? { session } : {}), ...(workspaceId ? { workspaceId } : {}), chars });
  }
  return { episodes };
}

// ---------------------------------------------------------------------------
// Workflows (workflows list/run --json) — user-local SOPs with explicit execution
// ---------------------------------------------------------------------------

export interface WorkflowSummaryData {
  id: string;
  title: string;
  source: string;
  version: number;
  trigger: string;
  summary: string;
  tags: string[];
  steps: number;
  gates: number;
}

export interface WorkflowsData {
  workflows: WorkflowSummaryData[];
}

export interface WorkflowRunData {
  id: string;
  title: string;
  version: number;
  prompt: string;
  checklist: string[];
}

function parseWorkflowSummary(v: unknown): WorkflowSummaryData | null {
  if (!isObj(v)) return null;
  const id = asStr(v.id);
  const title = asStr(v.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    source: asStr(v.source, "local"),
    version: asNum(v.version, 1),
    trigger: asStr(v.trigger),
    summary: asStr(v.summary),
    tags: asArr(v.tags).map((tag) => asStr(tag)).filter(Boolean),
    steps: asNum(v.steps),
    gates: asNum(v.gates),
  };
}

/** Parse `ebrain workflows list --json`; malformed rows are ignored defensively. */
export function parseWorkflows(j: unknown): WorkflowsData | null {
  if (!isObj(j)) return null;
  return {
    workflows: asArr(j.workflows).map(parseWorkflowSummary).filter((w): w is WorkflowSummaryData => w !== null),
  };
}

// ---------------------------------------------------------------------------
// Procedures (procedures list --json) -- workflow summaries plus reviewed state
// ---------------------------------------------------------------------------

export interface ProcedureSummaryData extends WorkflowSummaryData {
  state: "active" | "stale" | "archived";
  useCount: number;
  lastUsedAt?: string;
  reviewedAt?: string;
  skillified: boolean;
}

export interface ProceduresData { procedures: ProcedureSummaryData[] }

/** Passive procedure rows intentionally exclude events, source paths, prompts, commands, and models. */
export function parseProcedures(j: unknown): ProceduresData | null {
  if (!isObj(j) || !Object.keys(j).every((key) => key === "procedures") || !Array.isArray(j.procedures)) return null;
  const procedures: ProcedureSummaryData[] = [];
  for (const value of j.procedures) {
    const allowed = ["id", "title", "source", "version", "trigger", "summary", "tags", "steps", "gates", "state", "use_count", "last_used_at", "reviewed_at", "skillified"];
    if (!isObj(value) || !Object.keys(value).every((key) => allowed.includes(key)) || !Array.isArray(value.tags)) return null;
    const id = asStr(value.id);
    const title = scrubSecrets(asStr(value.title));
    const source = scrubSecrets(asStr(value.source));
    const version = asNum(value.version, -1);
    const trigger = scrubSecrets(asStr(value.trigger));
    const summary = scrubSecrets(asStr(value.summary));
    const tags = value.tags.map((tag) => scrubSecrets(asStr(tag)));
    const steps = asNum(value.steps, -1);
    const gates = asNum(value.gates, -1);
    const state = value.state;
    const useCount = asNum(value.use_count, -1);
    const lastUsedAt = typeof value.last_used_at === "string" ? value.last_used_at : undefined;
    const reviewedAt = typeof value.reviewed_at === "string" ? value.reviewed_at : undefined;
    if (!/^[a-z][a-z0-9-]{0,127}$/.test(id) || !title || !source || !Number.isInteger(version) || version < 1 || tags.some((tag) => !tag) || !Number.isInteger(steps) || steps < 0 || !Number.isInteger(gates) || gates < 0 || (state !== "active" && state !== "stale" && state !== "archived") || !Number.isInteger(useCount) || useCount < 0 || typeof value.skillified !== "boolean" || (lastUsedAt !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(lastUsedAt)) || (reviewedAt !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(reviewedAt))) return null;
    procedures.push({ id, title, source, version, trigger, summary, tags, steps, gates, state, useCount, ...(lastUsedAt ? { lastUsedAt } : {}), ...(reviewedAt ? { reviewedAt } : {}), skillified: value.skillified });
  }
  return { procedures };
}

/** Parse `ebrain workflows run <id> --json`; run only materializes a prompt, never executes it. */
export function parseWorkflowRun(j: unknown): WorkflowRunData | null {
  if (!isObj(j)) return null;
  const id = asStr(j.id);
  const title = asStr(j.title);
  const prompt = asStr(j.prompt);
  if (!id || !title || !prompt) return null;
  return {
    id,
    title,
    version: asNum(j.version, 1),
    prompt,
    checklist: asArr(j.checklist).map((item) => asStr(item)).filter(Boolean),
  };
}
