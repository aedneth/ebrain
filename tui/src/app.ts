#!/usr/bin/env bun
/**
 * tui/src/app.ts — ebrain UI: pure frame builder + main loop (SPRINT-TUI 6.3.3 + 6.3.6).
 *
 * Two halves, deliberately separated:
 *   - `buildFrame` (pure): state + size + theme -> exactly `size.rows` rows of exactly
 *     `size.cols` display-width each. No I/O, no Date.now(), no process.* reads inside
 *     it — everything it needs comes through its three parameters, so it's testable
 *     without a TTY (see tui/test/app.test.ts).
 *   - `runUi` (impure): owns the alt-screen lifecycle, the raw-mode key reader, resize/
 *     signal handling, and the ONE guarantee that matters more than any feature — the
 *     terminal is ALWAYS restored (`screen.exit()`) on quit AND on crash. Ported from
 *     FlowClock's `runDashboardApp` shape (~/flowclock-cli/src/tui/app.ts): a `cleanup()`
 *     called from every exit path + `process.on("SIGINT"/"SIGTERM")`, plus a global
 *     `uncaughtException` handler (new for ebrain — flowclock doesn't have one) that
 *     restores the terminal before rethrowing so a crash never leaves the alt-screen up.
 *
 * Shell layout matches design-system/ui_kits/ebrain/shell.jsx's `Screen` scaffold
 * (statusbar -> tabbar -> hairline -> content -> hintbar -> footer). Home matches
 * screens-a.jsx's `HomeScreen`. The other 5 tabs (sessions/launch/memory/routing/doctor)
 * are stub panels this chunk — they become real views in F6.4+.
 *
 * Everything renders through the kit + the 16 widgets + `theme.ts` — zero hardcoded hex.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CAPABILITIES, type Capability } from "../../cli/task-profile.ts";

import { makeTheme, type Theme, type AgentName } from "./theme.js";
import { Screen } from "./kit/screen.js";
import { splitV, splitH, type Rect } from "./kit/layout.js";
import { padTo, truncate, displayWidth, stripAnsi, ellipsize } from "./kit/draw.js";
import { startNavReader, type Key } from "./kit/input.js";
import { composerApplyKey, composerFrom, composerViewport, type ComposerGeometry, type ComposerState, type ComposerVisualRow } from "./kit/composer.js";

import { wordmark } from "./widgets/brand/wordmark.js";
import { statusBar, statusSep, tabBar, hintBar, footer, keyHint } from "./widgets/chrome/index.js";
import { panel } from "./widgets/layout/panel.js";
import { gauge } from "./widgets/core/gauge.js";

import { TABS, type TabName, hintsForTab, COMMANDS, type Command, type HintEntry } from "./commands.js";
import {
  type PaletteState,
  emptyPaletteState,
  paletteApplyKey,
  filterCommands,
  toItems,
} from "./palette.js";
import { commandPalette } from "./widgets/input/commandpalette.js";
import { renderHelpLayout, type HelpContext } from "./help.js";

import { scrolllist } from "./widgets/data/scrolllist.js";
import { terminalPeek } from "./widgets/layout/terminalpeek.js";
import { badge } from "./widgets/core/badge.js";
import { confirmLayout } from "./widgets/dialog/confirm.js";
import { responsiveDialog, type DialogBlock } from "./widgets/dialog/responsive.js";
import { promptBox } from "./widgets/input/promptbox.js";
import { table } from "./widgets/data/table.js";
import { spinner } from "./widgets/core/spinner.js";

// Knowledge data plane (F6.5) — the panels read the SAME contract-tested `--json`
// subcommands the CLI phase shipped (zero orphan logic). Pure parsers + view-models in
// knowledge/contracts.ts; only runUi (impure) calls the fetchers in knowledge/run.ts.
import type {
  OverviewData,
  MemoryData,
  MemoryLearning,
  MemorySession,
  EpisodesData,
  WorkflowsData,
  ProcedureSummaryData,
  ProceduresData,
  RoutingData,
  CostData,
  ProfilesData,
  WorkspacesData,
  WorkspaceData,
  ContextPacksData,
  TargetData,
  TargetPlanData,
  ProfileSummaryData,
  SearchData,
  SearchResult,
  FleetData,
  DoctorData,
  DoctorCheck,
  DoctorLevel,
} from "./knowledge/contracts.js";
import {
  fetchStatus,
  fetchMemory,
  fetchEpisodes,
  fetchProcedures,
  runWorkflow,
  fetchRouting,
  fetchCost,
  fetchFleet,
  fetchDoctor,
  runRemember,
  fetchProfiles,
  initializeProfiles,
  fetchTargets,
  fetchTargetPlan,
  fetchSearch,
  fetchWorkspaces,
  validateWorkspace,
  createWorkspace,
  renameWorkspace,
  removeWorkspace,
  fetchContextPacks,
} from "./knowledge/run.js";

// Sessions data plane (F6.4) — REUSED from cli/sessions.ts via the control-plane
// wrapper (zero orphan logic). Only runUi (impure) calls these; buildFrame stays pure.
import {
  listSessions,
  peekSession,
  killSession,
  sendToSession,
  newSession,
  hasServer,
  attachTarget,
} from "./sessions/tmux.js";
import { shouldCapture, tailLines, uptimeFromIso } from "./sessions/peek.js";
import {
  governLaunch,
  classOf,
  countLiveHeavy,
  readAvailableMb,
  logOverride,
} from "./sessions/governor.js";
import { lineFrom, lineApplyKey, type LineState } from "./kit/lineedit.js";

export { TABS, type TabName } from "./commands.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum terminal size the app requires; below this, buildFrame returns a
 * guidance message instead of the real shell (see buildMinSizeFrame). */
export const MIN_COLS = 80;
export const MIN_ROWS = 24;

/** No canonical version source exists in the repo yet (no package.json "version",
 * no VERSION file) — this is a placeholder until F6.3+ wires one up. */
const EBRAIN_UI_VERSION = "0.1.0-dev";
const EBRAIN = join(import.meta.dir, "..", "..", "cli", "ebrain");

const BOLD = "\x1b[1m";
const CTRL_C = "\x03";
const CTRL_D = "\x04";
const CTRL_L = "\x0c";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface FrameSize {
  cols: number;
  rows: number;
}

/** Explicit display input to the pure reducer. The runtime supplies current terminal geometry;
 * unit callers can omit it and get the conservative editor default. */
export interface ReduceOptions {
  composer?: ComposerGeometry;
}

// ── Sessions panel state (F6.4.3) ──────────────────────────────────────────

/** One fleet-list row as the panel renders it. `uptime` is precomputed in the loop
 * (buildFrame is PURE — no Date.now()); `agent` is whatever was parsed from the
 * session name and is validated by badge(). */
export interface SessionListItem {
  name: string;
  agent: string;
  uptime: string;
  attached: boolean;
  /** Immutable tmux creation timestamp, used only for live workspace detail. */
  created?: string;
  /** Ephemeral tmux snapshot used only for workspace activity grouping. */
  cwd?: string;
  /** Present only when immutable cwd matches a registered canonical workspace. */
  workspaceLabel?: string;
}

/** Scrubbed capture of the selected session's pane (peekSession already scrubs it). */
export interface PeekState {
  name: string;
  text: string;
  /** Date.now() of the capture — drives the ≤1Hz throttle (see sessions/peek.ts). */
  at: number;
}

export type SessionsStatus = "idle" | "loading" | "ready" | "no-server" | "no-tmux" | "error";

/** Live Sessions-panel state, refreshed by the impure loop. Optional on AppState so
 * fixtures and pre-6.4 tests can omit it — sessionsOf() supplies an empty slice. */
export interface SessionsSlice {
  rows: SessionListItem[];
  selected: number;
  peek: PeekState | null;
  status: SessionsStatus;
  error?: string;
}

export function emptySessions(): SessionsSlice {
  return { rows: [], selected: 0, peek: null, status: "idle" };
}

/** A tmux server can disappear after list succeeds but before the next capture. Keep
 * that race visible and clear the stale pane instead of presenting old output as live. */
export function failSessionPeek(slice: SessionsSlice, error: string): SessionsSlice {
  return { ...slice, peek: null, status: "error", error };
}

function sessionsOf(state: AppState): SessionsSlice {
  return state.sessions ?? emptySessions();
}

// ── Knowledge-panel slices (F6.5) ───────────────────────────────────────────
// Each panel owns an async slice the impure loop refreshes. `status` drives a
// three-state render (loading / ready / error) so a panel NEVER spins forever
// (spec 6.5.5). `at` stamps the last successful fetch — the lock-awareness banner
// shows it when the brain read came back cached.

export type LoadStatus = "idle" | "loading" | "ready" | "error";

/** Overview/home (status --json) + last-3 memory + a bare session list (6.5.1). */
export interface OverviewSlice {
  data: OverviewData | null;
  memory: MemoryData | null;
  /** Focused row in the home "latest memories" box (F6.6 focus model). */
  memSelected: number;
  status: LoadStatus;
  error?: string;
  /** HH:MM of the last successful fetch, precomputed by the loop so buildFrame stays
   * pure/deterministic (like sessions' uptime). Feeds the lock-awareness banner (6.5.5). */
  atLabel: string | null;
}

/** Memory panel: governed recall + context metadata + reviewed procedures (F9.2).
 * `selected` is the combined recall cursor (episode summaries first, legacy learnings after);
 * `searchSelected` remains its own cursor; `workflowSelected` selects a procedure's underlying
 * workflow; `logSelected` is retained for legacy session summaries until F9.3 migration. */
export interface MemorySlice {
  data: MemoryData | null;
  episodes?: EpisodesData | null;
  contexts?: ContextPacksData | null;
  procedures?: ProceduresData | null;
  search: SearchData | null;
  searchStatus: LoadStatus;
  searchError?: string;
  searchSelected: number;
  workflows: WorkflowsData | null;
  selected: number;
  workflowSelected: number;
  logSelected: number;
  status: LoadStatus;
  error?: string;
}

/** Routing panel (routing --json): by-capability spend + OpenRouter chains (6.6A). */
export interface RoutingSlice {
  data: RoutingData | null;
  cost: CostData | null;
  mode: "routing" | "cost";
  selected: number;
  costSelected: number;
  status: LoadStatus;
  error?: string;
}

/** Fleet+Doctor panel (fleet --json + doctor --json), `r` re-runs doctor (6.5.4). */
export interface DoctorSlice {
  fleet: FleetData | null;
  doctor: DoctorData | null;
  /** `selected` = focused check; `fleetSelected` = focused fleet agent (F6.6 focus model). */
  selected: number;
  fleetSelected: number;
  status: LoadStatus;
  error?: string;
  /** A doctor re-run is in flight — drives the spinner (advanced by the loop). */
  running: boolean;
  spinnerFrame: number;
  atLabel: string | null;
}

export function emptyOverview(): OverviewSlice {
  return { data: null, memory: null, memSelected: 0, status: "idle", atLabel: null };
}
export function emptyMemory(): MemorySlice {
  return { data: null, episodes: null, contexts: null, procedures: null, search: null, searchStatus: "idle", searchSelected: 0, workflows: null, selected: 0, workflowSelected: 0, logSelected: 0, status: "idle" };
}
export function emptyRouting(): RoutingSlice {
  return { data: null, cost: null, mode: "routing", selected: 0, costSelected: 0, status: "idle" };
}
export function emptyDoctor(): DoctorSlice {
  return { fleet: null, doctor: null, selected: 0, fleetSelected: 0, status: "idle", running: false, spinnerFrame: 0, atLabel: null };
}

function overviewOf(state: AppState): OverviewSlice {
  return state.overview ?? emptyOverview();
}
function memoryOf(state: AppState): MemorySlice {
  return state.memory ?? emptyMemory();
}

type RecallRow =
  | { kind: "episode"; episode: NonNullable<EpisodesData>["episodes"][number] }
  | { kind: "learning"; learning: MemoryLearning };

/** Episodes are intentionally ordered before legacy learnings. An episode can be inspected for
 * provenance but its body remains outside passive TUI state (F9.2 privacy boundary). */
function recallRows(memory: MemorySlice): RecallRow[] {
  return [
    ...(memory.episodes?.episodes ?? []).map((episode): RecallRow => ({ kind: "episode", episode })),
    ...(memory.data?.learnings ?? []).map((learning): RecallRow => ({ kind: "learning", learning })),
  ];
}

/** Existing workflows stay as a fixture/migration fallback; live TUI refreshes use procedures. */
function procedureRows(memory: MemorySlice): ProcedureSummaryData[] {
  if (memory.procedures) return memory.procedures.procedures;
  return (memory.workflows?.workflows ?? []).map((workflow) => ({ ...workflow, state: "active", useCount: 0, skillified: false }));
}

function routingOf(state: AppState): RoutingSlice {
  return state.routing ?? emptyRouting();
}
function doctorOf(state: AppState): DoctorSlice {
  return state.doctor ?? emptyDoctor();
}

/** A transient modal overlay composited over the base view. palette/help (6.3.4/6.3.5);
 * confirmKill/prompt are the Sessions panel's `k`/`p` actions (6.4.3); remember is the
 * Memory panel's `r` action (6.5.2). */
export type Overlay = { scroll?: number } & (
  | { kind: "palette"; palette: PaletteState }
  | { kind: "help" }
  | { kind: "confirmKill"; name: string }
  | { kind: "prompt"; name: string; draft: ComposerState }
  | { kind: "confirmSend"; name: string; text: string }
  | { kind: "confirmLaunch"; agent: string; cwd: string; reason: string }
  /** The guided target/profile workflow. Its selections live in LaunchSlice. */
  | { kind: "launchWizard" }
  /** Searchable picker backed by the validated local workspace registry. */
  | { kind: "workspacePicker"; selected: number; query: string; search: LineState | null; returnToWizard: boolean }
  /** Two explicit fields: a path is validated by the CLI before it can become selectable. */
  | { kind: "workspaceAdd"; cwd: LineState; label: LineState; focus: "cwd" | "label"; returnToWizard: boolean; origin?: "picker" | "cockpit" }
  /** Label-only change over the same strict workspace CLI contract. */
  | { kind: "workspaceRename"; id: string; label: LineState }
  /** Removal is destructive only to the local registry entry, never to the directory or sessions. */
  | { kind: "confirmWorkspaceRemove"; id: string; label: string }
  | { kind: "confirmTargetLaunch"; plan: TargetPlanData; intent: LaunchIntent }
  | { kind: "confirmTargetGovernor"; plan: TargetPlanData; intent: LaunchIntent; reason: string }
  | { kind: "confirmProfilesInit" }
  /** Deterministic category chooser for the optional task prompt. */
  | { kind: "taskSetup"; selected: number }
  /** Wrapped single-line editor; escape returns to the category chooser. */
  | { kind: "taskPrompt"; line: LineState; selected: number }
  | { kind: "remember"; line: LineState }
  | { kind: "memorySearch"; line: LineState }
  /** Read-only drill-in detail (Enter on a memory/check) — a titled, word-wrapped modal. */
  | { kind: "detail"; title: string; body: string }
);

export interface LaunchSlice {
  selected: number;
  task: string;
  /** Explicit and reversible Task Setup choice; it never writes an execution profile. */
  taskCapability?: Capability;
  /** Workflow attribution survives attach -> the explicit wizard in F6.6.4. */
  workflowId?: string;
  wizard: LaunchWizard | null;
  /** Summary-only context metadata. Pack bodies never enter the TUI state. */
  contexts: ContextPacksData | null;
  contextStatus: LoadStatus;
  contextError?: string;
  status: LoadStatus | "running";
  error?: string;
}

export interface LaunchWizard {
  targets: TargetData[];
  profiles: ProfilesData;
  targetSelected: number;
  profileSelected: number;
  capability: string;
  cwd: string;
  /** Tab cycles all four user-owned fields in the dialog. */
  focus: "target" | "profile" | "capability" | "cwd";
  plan: TargetPlanData | null;
}

export function emptyLaunch(): LaunchSlice {
  return { selected: 0, task: "", taskCapability: "general", wizard: null, contexts: null, contextStatus: "idle", status: "idle" };
}

function launchOf(state: AppState): LaunchSlice {
  return state.launch ? { ...emptyLaunch(), ...state.launch } : emptyLaunch();
}

/** Older in-memory fixtures and pre-F7 state have no explicit setup yet. Treat that as General
 * rather than making a missing preference behave like an implicit classifier result. */
function taskCapabilityOf(launch: LaunchSlice): Capability {
  return launch.taskCapability ?? "general";
}

/** A workspace is only a labeled, validated directory. It deliberately has no command,
 * environment, provider, or session payload: tmux remains the session data plane. */
export interface WorkspaceSelection {
  id?: string;
  label: string;
  cwd: string;
  persistent: boolean;
  /** False only while the caller directory has not yet made a round trip through the CLI validator. */
  validated: boolean;
}

export interface WorkspaceSlice {
  data: WorkspacesData | null;
  /** The directory where the TUI itself was started. It is always a non-persistent candidate. */
  current: WorkspaceSelection;
  /** The directory snapshotted by the next launch; existing sessions never observe changes here. */
  active: WorkspaceSelection;
  /** Selected rows are transient navigation state, never registry fields. */
  selected: number;
  activitySelected: number;
  status: LoadStatus;
  error?: string;
}

function currentWorkspace(cwd: string, validated = false): WorkspaceSelection {
  return { label: "Current directory", cwd, persistent: false, validated };
}

export function emptyWorkspace(cwd: string): WorkspaceSlice {
  const current = currentWorkspace(cwd);
  return { data: null, current, active: current, selected: 0, activitySelected: 0, status: "idle" };
}

/** This fallback is pure for legacy test fixtures. Real runtime state always initializes an
 * absolute caller cwd in initialState(), then validates it before any launch. */
function workspaceOf(state: AppState): WorkspaceSlice {
  const empty = emptyWorkspace(state.cwd);
  const workspace = state.workspace;
  return workspace
    ? { ...empty, ...workspace, selected: workspace.selected ?? 0, activitySelected: workspace.activitySelected ?? 0 }
    : empty;
}

function selectionFromRecord(workspace: WorkspaceData): WorkspaceSelection {
  return { ...workspace, persistent: true, validated: true };
}

/** Current first, then registered workspaces. Duplicate canonical directories are impossible in
 * the store, but the current directory can equal one of them, so suppress its duplicate row. */
function workspaceCandidatesFromSlice(workspace: WorkspaceSlice): WorkspaceSelection[] {
  const candidates: WorkspaceSelection[] = workspace.current.validated ? [workspace.current] : [];
  for (const entry of workspace.data?.workspaces ?? []) {
    if (!candidates.some((candidate) => candidate.cwd === entry.cwd)) candidates.push(selectionFromRecord(entry));
  }
  if (workspace.active.validated && !candidates.some((candidate) => candidate.cwd === workspace.active.cwd)) candidates.push(workspace.active);
  return candidates;
}

function workspaceCandidates(state: AppState): WorkspaceSelection[] {
  return workspaceCandidatesFromSlice(workspaceOf(state));
}

function workspaceDisplay(workspace: WorkspaceSelection, fallbackCwd: string): string {
  if (!workspace.validated) return `${workspace.label} · validating…`;
  const cwd = workspace.persistent ? workspace.cwd : fallbackCwd;
  return `${workspace.label} · ${cwd}`;
}

/** A Sessions row may name a workspace only after the immutable tmux cwd exactly matches a
 * registered canonical directory. The caller directory is intentionally not a label source. */
function registeredWorkspaceLabel(cwd: string | undefined, workspace: WorkspaceSlice): string | undefined {
  if (!cwd) return undefined;
  return workspace.data?.workspaces.find((entry) => entry.cwd === cwd)?.label;
}

function relabelSessionRows(rows: SessionListItem[], workspace: WorkspaceSlice): SessionListItem[] {
  return rows.map((row) => ({ ...row, workspaceLabel: registeredWorkspaceLabel(row.cwd, workspace) }));
}

export interface WorkspaceActivity {
  cwd: string;
  label?: string;
  sessions: SessionListItem[];
  /** Latest live tmux creation timestamp, never persisted as activity history. */
  latestCreated?: string;
  selection?: WorkspaceSelection;
}

/** Activity is an ephemeral projection of the tmux list, not a history store. Empty registered
 * workspaces are shown so the cockpit can still describe their current live count as zero. */
export function workspaceActivity(workspace: WorkspaceSlice, sessions: SessionListItem[]): WorkspaceActivity[] {
  const candidates = workspaceCandidatesFromSlice(workspace);
  const known = candidates.map((candidate) => ({
    cwd: candidate.cwd,
    // The caller directory is valid for the next launch but deliberately not a registered
    // workspace. Naming it here makes the live projection legible without granting a Sessions
    // row a workspace label (that stricter rule remains in registeredWorkspaceLabel()).
    label: candidate.label,
    sessions: sessions.filter((session) => session.cwd === candidate.cwd),
    selection: candidate,
  }));
  const unknown = new Map<string, SessionListItem[]>();
  for (const session of sessions) {
    if (!session.cwd || candidates.some((candidate) => candidate.cwd === session.cwd)) continue;
    const group = unknown.get(session.cwd) ?? [];
    group.push(session);
    unknown.set(session.cwd, group);
  }
  return [...known, ...[...unknown.entries()].map(([cwd, grouped]) => ({ cwd, sessions: grouped }))].map((entry) => ({
    ...entry,
    latestCreated: entry.sessions.map((session) => session.created).filter((created): created is string => Boolean(created)).sort().at(-1),
  }));
}

/**
 * Immutable snapshot of the reviewed work, captured at the reducer boundary (G56-F2): the task
 * prompt plus optional workflow attribution. It is carried through every confirmation overlay,
 * the RAM governor and the launch await, so the created session receives exactly what the user
 * reviewed — instead of a task re-read from mutable state after an async hop.
 */
export interface LaunchIntent { prompt: string; workflowId?: string }
function launchIntentOf(launch: LaunchSlice): LaunchIntent {
  return launch.workflowId ? { prompt: launch.task, workflowId: launch.workflowId } : { prompt: launch.task };
}

/**
 * Build the argv (+ optional stdin payload) for `ebrain targets launch` from a plan and the
 * reviewed intent (G56-F2). The task travels over stdin (`--prompt-stdin`) so it never appears in
 * argv/process listings; the workflow id is a separate flag for ledger attribution. Pure + tested.
 */
export function buildTargetLaunchArgs(plan: TargetPlanData, intent: LaunchIntent, slug: string): { args: string[]; stdin: string | null } {
  const args = ["targets", "launch", "--target", plan.target, "--profile", plan.profile, "--cap", plan.capability, "--cwd", plan.cwd, "--slug", slug, "--yes", "--json"];
  if (intent.workflowId) args.push("--workflow", intent.workflowId);
  const stdin = intent.prompt.length > 0 ? intent.prompt : null;
  if (stdin !== null) args.push("--prompt-stdin");
  return { args, stdin };
}

export interface AppState {
  tab: TabName;
  /** true after a first Ctrl-C — a second Ctrl-C quits ("ctrl+c x2" per the registry). */
  confirmQuit: boolean;
  /** Compatibility display of the caller cwd. The workspace slice owns launch identity. */
  cwd: string;
  branch?: string;
  /** Open command palette / help / confirm / prompt overlay, or null when none. */
  overlay?: Overlay | null;
  /** Live tmux session data (F6.4). Optional — sessionsOf() defaults an empty slice. */
  sessions?: SessionsSlice;
  /** Launch-panel state (F6.4.5 + F6.6B task router). Optional — defaults empty. */
  launch?: LaunchSlice;
  /** Selected workspace plus registry cache. The state is serializable and carries no shell data. */
  workspace?: WorkspaceSlice;
  /** Knowledge-panel slices (F6.5). Optional — the *Of() helpers default empties. */
  overview?: OverviewSlice;
  memory?: MemorySlice;
  routing?: RoutingSlice;
  doctor?: DoctorSlice;
  /** Which focusable box within the current view holds the focus ring (F6.6 focus model).
   * Index into regionsFor(tab); Tab/Shift+Tab cycle it, reset to 0 on view change. */
  focusRegion?: number;
}

/** Caller's cwd: cli/ebrain exports EBRAIN_CALLER_CWD before cd-ing to run_bun's
 * neutral dir (so a foreign .env never loads) — this recovers "where you actually are"
 * for the footer. Falls back to process.cwd() when run outside that dispatcher (tests,
 * `bun run tui/src/app.ts` directly). */
function callerCwd(): string {
  return process.env.EBRAIN_CALLER_CWD || process.cwd();
}

function collapseHome(p: string): string {
  const home = process.env.HOME;
  if (home && p.startsWith(home)) return "~" + p.slice(home.length);
  return p;
}

/** Best-effort branch name from `.git/HEAD` — no subprocess spawn (cheap, safe to
 * call once at startup). Returns undefined on any failure (not a git dir, detached
 * with an unreadable HEAD, etc.) — the footer just omits the branch segment then. */
function detectBranch(dir: string): string | undefined {
  try {
    const head = readFileSync(join(dir, ".git", "HEAD"), "utf8").trim();
    const m = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    if (m?.[1]) return m[1];
    return head.length > 0 ? head.slice(0, 7) : undefined; // detached HEAD: short SHA
  } catch {
    return undefined;
  }
}

export function initialState(): AppState {
  const dir = callerCwd();
  return {
    tab: "home",
    confirmQuit: false,
    cwd: collapseHome(dir),
    branch: detectBranch(dir),
    overlay: null,
    sessions: emptySessions(),
    launch: emptyLaunch(),
    workspace: emptyWorkspace(dir),
    overview: emptyOverview(),
    memory: emptyMemory(),
    routing: emptyRouting(),
    doctor: emptyDoctor(),
    focusRegion: 0,
  };
}

// ── Focus model (F6.6): a two-level model over the single-key view jump (1-7) ──
// `1-7` jumps views; Tab/Shift+Tab move the focus RING between the boxes of the current
// view; ↑↓ navigate items in the focused box; Enter drills into the focused box. Each
// view lists its focusable regions in view order (left→right, top→bottom).

const REGIONS: Record<TabName, readonly string[]> = {
  home: ["sessions", "memories", "system"],
  sessions: ["list"],
  launch: ["agents", "guided", "task"],
  workspaces: ["registry", "activity", "detail"],
  memory: ["results", "procedures", "logs"],
  routing: ["caps"],
  doctor: ["checks", "fleet"],
};

function regionsFor(tab: TabName): readonly string[] {
  return REGIONS[tab] ?? ["main"];
}

/** The id of the box that currently holds focus in `state`'s view. */
function focusedRegion(state: AppState): string {
  const regions = regionsFor(state.tab);
  const i = clampIndex(state.focusRegion ?? 0, regions.length);
  return regions[i] ?? regions[0]!;
}

// ---------------------------------------------------------------------------
// reduce — pure key -> state transition (testable without a TTY)
// ---------------------------------------------------------------------------

/**
 * A side-effect that the PURE reduce() REQUESTS but never performs — the impure runUi
 * loop interprets these (async tmux I/O). This is what keeps reduce fully testable: a
 * test asserts `reduce(...).effect` with no tmux running (see tui/test/sessions/panel).
 */
export type AppEffect =
  | { type: "refreshSessions" }
  | { type: "peek"; name: string }
  | { type: "attach"; name: string }
  | { type: "kill"; name: string }
  | { type: "send"; name: string; text: string }
  /** Launch `agent` — the loop runs the RAM governor, which may open a confirm. */
  | { type: "launch"; agent: string; prompt?: string }
  /** Launch confirmed through the governor's dialog (an override that gets logged). */
  | { type: "launchConfirmed"; agent: string; cwd: string; reason: string; prompt?: string }
  | { type: "openLaunchWizard" }
  | { type: "refreshLaunchContext" }
  | { type: "openWorkspacePicker"; returnToWizard: boolean }
  | { type: "refreshWorkspaces" }
  | { type: "addWorkspace"; cwd: string; label: string; returnToWizard: boolean; origin: "picker" | "cockpit" }
  | { type: "renameWorkspace"; id: string; label: string }
  | { type: "removeWorkspace"; id: string }
  | { type: "initializeProfiles" }
  | { type: "planLaunchWizard" }
  | { type: "requestTargetLaunch"; plan: TargetPlanData; intent: LaunchIntent }
  | { type: "launchTarget"; plan: TargetPlanData; intent: LaunchIntent; reason?: string }
  // Knowledge panels (F6.5): each landing refreshes its slice from its subcommand.
  | { type: "refreshStatus" }
  | { type: "refreshMemory" }
  /** Materialize a workflow prompt; never executes the workflow. */
  | { type: "runWorkflow"; id: string }
  /** Materialize then place the workflow prompt in Launch for explicit routing/launch. */
  | { type: "attachWorkflow"; id: string }
  | { type: "refreshRouting" }
  | { type: "refreshFleetDoctor" }
  /** Doctor `r`: re-run `doctor --json` (async, spinner) without leaving the view. */
  | { type: "rerunDoctor" }
  /** Write `text` to permanent agentic memory via `ebrain remember`, then refresh. */
  | { type: "remember"; text: string }
  | { type: "searchMemory"; query: string };

export interface ReduceResult {
  state: AppState;
  quit: boolean;
  /** true when the terminal should be fully re-entered (clear + repaint), not just
   * diffed — the ctrl+l "redraw" command. */
  forceRedraw: boolean;
  /** An async side-effect for the loop to perform (tmux list/peek/attach/kill/send). */
  effect?: AppEffect;
}

function withTab(state: AppState, tab: TabName): AppState {
  return { ...state, tab, confirmQuit: false, overlay: null, focusRegion: 0 };
}

/** Navigate to `tab`, requesting the matching data refresh when landing on a live view
 * so its data is current the moment you arrive (the loop performs the refresh). Each
 * knowledge panel (6.5) refreshes from its own contract-tested subcommand. */
function goTab(state: AppState, tab: TabName): ReduceResult {
  return settle(withTab(state, tab), refreshEffectFor(tab));
}

function refreshEffectFor(tab: TabName): AppEffect | undefined {
  switch (tab) {
    case "launch":
      return { type: "refreshLaunchContext" };
    case "sessions":
      return { type: "refreshSessions" };
    case "workspaces":
      return { type: "refreshWorkspaces" };
    case "home":
      return { type: "refreshStatus" };
    case "memory":
      return { type: "refreshMemory" };
    case "routing":
      return { type: "refreshRouting" };
    case "doctor":
      return { type: "refreshFleetDoctor" };
    default:
      return undefined;
  }
}

function openPalette(state: AppState): ReduceResult {
  return settle({ ...state, confirmQuit: false, overlay: { kind: "palette", palette: { open: true, query: "", selected: 0 } } });
}

function openHelp(state: AppState): ReduceResult {
  return settle({ ...state, confirmQuit: false, overlay: { kind: "help" } });
}

/**
 * Execute a registry command selected from the palette. Maps `Command.id` to the
 * same transitions the raw keybinds produce — so the palette and the keyboard can
 * never diverge (both are views over `COMMANDS`). `state` arrives with the overlay
 * already cleared by the caller.
 */
function runCommand(state: AppState, command: Command): ReduceResult {
  const id = command.id;
  if (id === "app.quit") return { state, quit: true, forceRedraw: false };
  if (id === "app.redraw") return { state, quit: false, forceRedraw: true };
  if (id === "app.help") return openHelp(state);
  if (id === "palette.open") return openPalette(state);
  if (id.startsWith("nav.")) {
    const suffix = id.slice(4);
    if ((TABS as readonly string[]).includes(suffix)) return goTab(state, suffix as TabName);
  }
  return settle(state);
}

function settle(state: AppState, effect?: AppEffect): ReduceResult {
  return { state, quit: false, forceRedraw: false, effect };
}

/** Read-only dialogs and confirmation copy can be taller than a compact terminal. The renderer
 * clamps the offset against its semantic content; the reducer deliberately needs no frame size. */
function scrollDialog(state: AppState, overlay: Overlay, key: Key): ReduceResult | null {
  const delta = key.name === "up" || key.name === "left" ? -1 : key.name === "down" || key.name === "right" ? 1 : 0;
  if (delta === 0) return null;
  return settle({ ...state, overlay: { ...overlay, scroll: Math.max(0, (overlay.scroll ?? 0) + delta) } });
}

/** Clamp `i` into [0, count-1] (count>0 assumed by callers). */
function clampIndex(i: number, count: number): number {
  return Math.min(Math.max(0, i), count - 1);
}

/** Wrap a full-width, ANSI-colored row in the selection-cursor background — the bg is
 * re-asserted after every internal reset so it spans the whole row (matches the Table /
 * ScrollList selected-row contrast). Callers pass content already padded to row width. */
function highlightRow(content: string, theme: Theme): string {
  const bg = theme.selectedBg;
  return bg + content.split(theme.reset).join(theme.reset + bg) + theme.reset;
}

/** ↑↓ within the FOCUSED box: move that box's selection by `delta` (routes by view +
 * focused region). A session move also emits a peek so the right pane tracks it. */
function moveSelection(state: AppState, delta: number): ReduceResult {
  const region = focusedRegion(state);
  const clear = { ...state, confirmQuit: false };

  if (state.tab === "sessions" || (state.tab === "home" && region === "sessions")) {
    const s = sessionsOf(state);
    if (s.rows.length === 0) return settle(clear);
    const selected = clampIndex(s.selected + delta, s.rows.length);
    if (selected === s.selected) return settle(clear);
    const next = settle({ ...clear, sessions: { ...s, selected } });
    // Only the Sessions view has a live peek pane to keep in sync.
    return state.tab === "sessions" ? settle(next.state, { type: "peek", name: s.rows[selected]!.name }) : next;
  }

  if (state.tab === "home" && region === "memories") {
    const o = overviewOf(state);
    const n = o.memory?.learnings.length ?? 0;
    if (n === 0) return settle(clear);
    return settle({ ...clear, overview: { ...o, memSelected: clampIndex(o.memSelected + delta, n) } });
  }

  if (state.tab === "workspaces") {
    const workspace = workspaceOf(state);
    if (region === "registry") {
      const candidates = workspaceCandidates(state);
      if (candidates.length === 0) return settle(clear);
      return settle({ ...clear, workspace: { ...workspace, selected: clampIndex(workspace.selected + delta, candidates.length) } });
    }
    if (region === "activity") {
      const activity = workspaceActivity(workspace, sessionsOf(state).rows);
      if (activity.length === 0) return settle(clear);
      return settle({ ...clear, workspace: { ...workspace, activitySelected: clampIndex(workspace.activitySelected + delta, activity.length) } });
    }
    return settle(clear);
  }

  if (state.tab === "memory") {
    const m = memoryOf(state);
    if (region === "procedures") {
      const n = procedureRows(m).length;
      if (n === 0) return settle(clear);
      return settle({ ...clear, memory: { ...m, workflowSelected: clampIndex(m.workflowSelected + delta, n) } });
    }
    if (region === "logs") {
      const n = m.data?.sessions.length ?? 0;
      if (n === 0) return settle(clear);
      return settle({ ...clear, memory: { ...m, logSelected: clampIndex(m.logSelected + delta, n) } });
    }
    // The results box swaps collections: when a search is active it navigates its own
    // cursor over search results, not the recent learnings underneath (G56-F3).
    if (m.search) {
      const n = m.search.results.length;
      if (n === 0) return settle(clear);
      return settle({ ...clear, memory: { ...m, searchSelected: clampIndex(m.searchSelected + delta, n) } });
    }
    const n = recallRows(m).length;
    if (n === 0) return settle(clear);
    return settle({ ...clear, memory: { ...m, selected: clampIndex(m.selected + delta, n) } });
  }

  if (state.tab === "routing") {
    const r = routingOf(state);
    if (r.mode === "cost") {
      const n = r.cost?.providers.length ?? 0;
      if (n === 0) return settle(clear);
      return settle({ ...clear, routing: { ...r, costSelected: clampIndex(r.costSelected + delta, n) } });
    }
    const n = r.data?.capabilities.length ?? 0;
    if (n === 0) return settle(clear);
    return settle({ ...clear, routing: { ...r, selected: clampIndex(r.selected + delta, n) } });
  }

  if (state.tab === "doctor") {
    const d = doctorOf(state);
    if (region === "fleet") {
      const n = d.fleet?.agents.length ?? 0;
      if (n === 0) return settle(clear);
      return settle({ ...clear, doctor: { ...d, fleetSelected: clampIndex(d.fleetSelected + delta, n) } });
    }
    const n = d.doctor?.checks.length ?? 0;
    if (n === 0) return settle(clear);
    return settle({ ...clear, doctor: { ...d, selected: clampIndex(d.selected + delta, n) } });
  }

  return settle(clear);
}

/** Enter drills into the FOCUSED box: attach a selected session, open a read-only detail
 * modal, or jump to the box's dedicated view (home summary boxes). */
function drillIn(state: AppState): ReduceResult {
  const region = focusedRegion(state);
  const clear = { ...state, confirmQuit: false };

  // Launch has three explicit decision areas. Enter acts only on the focused area,
  // so selecting a task or guided configuration can never accidentally start an agent.
  if (state.tab === "launch") {
    if (region === "agents") return launchEnter(state);
    if (region === "guided") return settle(clear, { type: "openLaunchWizard" });
    if (region === "task") return settle({ ...clear, overlay: { kind: "taskSetup", selected: taskSetupIndex(taskCapabilityOf(launchOf(state))) } });
  }

  if (state.tab === "workspaces") {
    const workspace = workspaceOf(state);
    if (region === "activity") {
      const activity = workspaceActivity(workspace, sessionsOf(state).rows);
      const selected = activity[clampIndex(workspace.activitySelected, activity.length)];
      if (!selected?.selection) return settle(clear);
      const candidates = workspaceCandidates(state);
      const index = candidates.findIndex((candidate) => candidate.cwd === selected.selection!.cwd);
      return settle({ ...clear, workspace: { ...workspace, selected: Math.max(0, index) } });
    }
    const selected = selectedCockpitWorkspace(state);
    return selected ? settle(selectWorkspace(clear, selected, false)) : settle(clear);
  }

  // Attach the selected session — from the Sessions list OR home's active-sessions box.
  if ((state.tab === "sessions" && region === "list") || (state.tab === "home" && region === "sessions")) {
    const sel = sessionsOf(state).rows[sessionsOf(state).selected];
    if (sel) return settle(clear, { type: "attach", name: sel.name });
    return settle(clear);
  }
  // Home summary boxes jump to their dedicated view.
  if (state.tab === "home" && region === "memories") return goTab(state, "memory");
  if (state.tab === "home" && region === "system") return goTab(state, "routing");

  // Memory result → read-only detail. When a search is active the results box shows search
  // rows, so Enter must open the SELECTED search row (its own cursor), never the recent
  // learning that happens to sit at the same index underneath (G56-F3).
  if (state.tab === "memory" && region === "results") {
    const m = memoryOf(state);
    if (m.search) {
      const r = m.search.results[m.searchSelected];
      if (r) return settle({ ...clear, overlay: { kind: "detail", title: `search · ${r.source}`, body: `${r.slug}\n\n${r.snippet}` } });
      return settle(clear);
    }
    const selected = recallRows(m)[m.selected];
    if (selected?.kind === "episode") {
      const e = selected.episode;
      const workspace = e.workspaceId ? `\nworkspace ${e.workspaceId}` : "";
      const session = e.session ? `\nsession ${e.session}` : "";
      return settle({ ...clear, overlay: { kind: "detail", title: `episode · ${e.project}`, body: `${e.kind} · ${e.source}\n${e.createdAt}\n${e.agent} · ${e.chars} chars${workspace}${session}\n\nEpisode text is available only through explicit bounded retrieval.` } });
    }
    if (selected?.kind === "learning") return settle({ ...clear, overlay: { kind: "detail", title: `memory · ${selected.learning.project}`, body: selected.learning.text } });
    return settle(clear);
  }
  // Workflow run only materializes a reviewable prompt. The user still attaches it to
  // Launch and confirms a route/session there; no workflow command executes here.
  if (state.tab === "memory" && region === "procedures") {
    const w = procedureRows(memoryOf(state))[memoryOf(state).workflowSelected];
    if (w) return settle(clear, { type: "runWorkflow", id: w.id });
    return settle(clear);
  }
  // Doctor check → read-only detail of the check's message.
  if (state.tab === "doctor" && region === "checks") {
    const c = doctorOf(state).doctor?.checks[doctorOf(state).selected];
    if (c) return settle({ ...clear, overlay: { kind: "detail", title: `check · ${c.id}`, body: `[${c.level}] ${c.msg}` } });
  }

  return settle(clear);
}

function launchEnter(state: AppState): ReduceResult {
  const l = launchOf(state);
  const clear = { ...state, confirmQuit: false };
  const it = LAUNCHABLE[l.selected];
  // Snapshot the reviewed task at the reducer boundary so it survives the async launch (G56-F2).
  return it ? settle(clear, { type: "launch", agent: it.agent, prompt: l.task }) : settle(clear);
}

function wizardOf(launch: LaunchSlice): LaunchWizard | null { return launch.wizard ?? null; }
function selectedWizardTarget(wizard: LaunchWizard): TargetData | undefined { return wizard.targets[wizard.targetSelected]; }
function selectedWizardProfile(wizard: LaunchWizard): ProfileSummaryData | undefined { return wizard.profiles.profiles[wizard.profileSelected]; }

const WIZARD_FIELDS: readonly LaunchWizard["focus"][] = ["target", "profile", "capability", "cwd"];

function cycleWizardFocus(focus: LaunchWizard["focus"], delta: number): LaunchWizard["focus"] {
  const current = Math.max(0, WIZARD_FIELDS.indexOf(focus));
  return WIZARD_FIELDS[(current + delta + WIZARD_FIELDS.length) % WIZARD_FIELDS.length]!;
}

function cycleIndex(current: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  return (current + delta + count) % count;
}

function wizardChoiceCount(wizard: LaunchWizard): number {
  if (wizard.focus === "target") return wizard.targets.length;
  if (wizard.focus === "profile") return wizard.profiles.profiles.length;
  if (wizard.focus === "capability") return selectedWizardProfile(wizard)?.capabilities.length ?? 0;
  return 0;
}

function filteredWorkspaces(state: AppState, query: string): WorkspaceSelection[] {
  const needle = query.trim().toLowerCase();
  const candidates = workspaceCandidates(state);
  if (!needle) return candidates;
  return candidates.filter((workspace) => `${workspace.label}\n${workspace.cwd}`.toLowerCase().includes(needle));
}

function selectedCockpitWorkspace(state: AppState): WorkspaceSelection | null {
  const candidates = workspaceCandidates(state);
  return candidates[clampIndex(workspaceOf(state).selected, candidates.length)] ?? null;
}

/** Select through a known candidate only. Guided Launch receives a validated snapshot rather
 * than a free-form directory, so its plan cannot escape the workspace contract. */
function selectWorkspace(state: AppState, candidate: WorkspaceSelection, returnToWizard: boolean): AppState {
  const workspace = workspaceOf(state);
  const selected = Math.max(0, workspaceCandidates(state).findIndex((entry) => entry.cwd === candidate.cwd));
  const nextWorkspace: WorkspaceSlice = { ...workspace, active: candidate, selected, status: "ready", error: undefined };
  if (!returnToWizard) return { ...state, workspace: nextWorkspace, overlay: null };
  const launch = launchOf(state);
  const wizard = wizardOf(launch);
  if (!wizard) return { ...state, workspace: nextWorkspace, overlay: null };
  return {
    ...state,
    workspace: nextWorkspace,
    overlay: { kind: "launchWizard" },
    launch: { ...launch, wizard: { ...wizard, cwd: candidate.cwd, plan: null }, status: "ready", error: undefined },
  };
}

/** Compact, contextual controls: the footer is intentionally capped at six actions.
 * More complete per-view guidance stays available through the action reference (`?`). */
export function hintsForState(state: AppState): HintEntry[] {
  const overlay = state.overlay;
  if (overlay?.kind === "launchWizard") {
    const wizard = wizardOf(launchOf(state));
    const choices = wizard ? wizardChoiceCount(wizard) : 0;
    return [
      { k: "tab", label: "field" },
      ...(choices > 1 ? [{ k: "↑↓", label: "select" }] : []),
      { k: "c", label: "workspace" },
      { k: "enter", label: "preview" },
      { k: "esc", label: "cancel" },
    ];
  }
  if (overlay?.kind === "workspacePicker") {
    if (overlay.search) return [{ k: "enter", label: "apply filter" }, { k: "esc", label: "back" }];
    return [{ k: "↑↓", label: "choose" }, { k: "enter", label: "select" }, { k: "s", label: "filter" }, { k: "a", label: "add" }, { k: "esc", label: "cancel" }];
  }
  if (overlay?.kind === "workspaceAdd") return [{ k: "tab", label: "field" }, { k: "enter", label: overlay.focus === "cwd" ? "next" : "add" }, { k: "esc", label: "back" }];
  if (overlay?.kind === "workspaceRename") return [{ k: "enter", label: "rename" }, { k: "esc", label: "cancel" }];
  if (overlay?.kind === "taskSetup") return [{ k: "↑↓", label: "choose type" }, { k: "enter", label: "add task" }, { k: "esc", label: "cancel" }];
  if (overlay?.kind === "taskPrompt") return [{ k: "↑↓", label: "scroll" }, { k: "enter", label: "save" }, { k: "esc", label: "back" }];
  if (overlay?.kind === "confirmKill" || overlay?.kind === "confirmLaunch" || overlay?.kind === "confirmSend" || overlay?.kind === "confirmTargetLaunch" || overlay?.kind === "confirmTargetGovernor" || overlay?.kind === "confirmProfilesInit" || overlay?.kind === "confirmWorkspaceRemove") {
    return [{ k: "y", label: "confirm" }, { k: "n", label: "cancel" }];
  }
  if (overlay?.kind === "palette") return [{ k: "↑↓", label: "select" }, { k: "enter", label: "run" }, { k: "esc", label: "close" }];
  if (overlay?.kind === "help" || overlay?.kind === "detail") return [{ k: "esc", label: "close" }];
  if (overlay?.kind === "prompt") return [{ k: "alt+enter", label: "line" }, { k: "enter", label: "review" }, { k: "esc", label: "cancel" }];
  if (overlay?.kind === "remember") return [{ k: "enter", label: "save" }, { k: "esc", label: "cancel" }];
  if (overlay?.kind === "memorySearch") return [{ k: "enter", label: "search" }, { k: "esc", label: "cancel" }];
  if (overlay) return [];

  if (state.tab === "launch") {
    switch (focusedRegion(state)) {
      case "task":
        return [
          { k: "g", label: "workspace" },
          { k: "t", label: "task setup" },
          { k: "r", label: "reset task" },
          { k: "tab", label: "next box" },
          { k: "enter", label: "open" },
          { k: "?", label: "actions" },
        ];
      case "guided":
        return [
          { k: "g", label: "workspace" },
          { k: "w", label: "open wizard" },
          { k: "tab", label: "next box" },
          { k: "enter", label: "open" },
          { k: "?", label: "actions" },
        ];
      default:
        return [
          { k: "g", label: "workspace" },
          { k: "↑↓←→", label: "agent" },
          { k: "tab", label: "next box" },
          { k: "enter", label: "launch" },
          { k: "?", label: "actions" },
        ];
    }
  }
  if (state.tab === "workspaces") {
    const region = focusedRegion(state);
    return region === "registry"
      ? [{ k: "↑↓", label: "select" }, { k: "enter", label: "use in launch" }, { k: "a", label: "add" }, { k: "e", label: "rename" }, { k: "x", label: "remove" }, { k: "?", label: "actions" }]
      : region === "activity"
        ? [{ k: "↑↓", label: "select activity" }, { k: "enter", label: "show workspace" }, { k: "r", label: "refresh" }, { k: "tab", label: "next box" }, { k: "?", label: "actions" }]
        : [{ k: "enter", label: "use in launch" }, { k: "g", label: "open launch" }, { k: "tab", label: "next box" }, { k: "?", label: "actions" }];
  }
  if (state.tab === "memory" && memoryOf(state).search) {
    return [
      { k: "s", label: "search" },
      { k: "esc", label: "back to recent" },
      { k: "enter", label: "open" },
      { k: "↑↓", label: "navigate" },
      { k: "tab", label: "focus box" },
      { k: "r", label: "remember" },
    ];
  }
  return hintsForTab(state.tab).slice(0, 6);
}

/** The complete local action list behind `[?] actions`. This is the overflow path
 * for compact terminals: the footer remains scannable while every real interaction
 * stays discoverable in English and without invented model recommendations. */
function actionReferenceFor(state: AppState): HelpContext {
  if (state.tab === "launch") {
    const action = focusedRegion(state) === "agents"
      ? "launch selected agent"
      : focusedRegion(state) === "guided"
        ? "open guided launch"
        : "open task setup";
    return {
      title: "launch actions",
      actions: [
        { key: "tab", title: "focus box", summary: "move between manual agents, guided launch, and task setup" },
        { key: "t", title: "task setup", summary: "choose a work category and optional prompt" },
        { key: "r", title: "reset task", summary: "clear the transient category, prompt, and workflow attribution" },
        { key: "g", title: "workspace", summary: "choose or register the validated directory for the next launch" },
        { key: "w", title: "guided launch", summary: "choose your target, profile, capability, and workspace" },
        { key: "↑↓←→", title: "choose agent", summary: "move selection when manual agents has focus" },
        { key: "enter", title: action, summary: "act only on the focused box" },
      ],
    };
  }
  if (state.tab === "memory") {
    return {
      title: "memory actions",
      actions: [
        { key: "s", title: "search", summary: "search the shared memory index" },
        { key: "r", title: "remember", summary: "store a durable learning" },
        { key: "a", title: "attach procedure", summary: "place its materialized workflow prompt in Launch" },
        { key: "tab", title: "focus box", summary: "move between recall, procedures, and legacy session logs" },
        { key: "↑↓", title: "select", summary: "move within the focused collection" },
        { key: "enter", title: "open or run", summary: "open recall metadata or materialize a procedure prompt" },
        { key: "esc", title: "clear search", summary: "return from search results to recent memory" },
      ],
    };
  }
  if (state.tab === "sessions") {
    return {
      title: "session actions",
      actions: [
        { key: "↑↓", title: "select", summary: "move through active sessions" },
        { key: "enter/a", title: "attach", summary: "attach in a plain terminal" },
        { key: "p", title: "prompt", summary: "review before sending a literal prompt" },
        { key: "k", title: "kill", summary: "request an explicit destructive confirmation" },
        { key: "r", title: "refresh", summary: "refresh the active session list" },
      ],
    };
  }
  if (state.tab === "workspaces") {
    return {
      title: "workspace actions",
      actions: [
        { key: "↑↓", title: "select", summary: "move within the focused workspace collection" },
        { key: "tab", title: "focus box", summary: "move between registry, activity, and details" },
        { key: "enter", title: "use in launch", summary: "make the selected validated directory the next launch workspace" },
        { key: "a", title: "add", summary: "register a directory after strict validation" },
        { key: "e", title: "rename", summary: "change only a registered workspace label" },
        { key: "x", title: "remove", summary: "remove only the registry entry after explicit confirmation" },
        { key: "r", title: "refresh", summary: "re-read the local workspace registry and live sessions" },
        { key: "g", title: "open launch", summary: "go to Launch with the selected workspace available" },
      ],
    };
  }
  return {
    title: `${state.tab} actions`,
    actions: hintsForTab(state.tab).map((hint) => ({ key: hint.k, title: hint.label, summary: "available in this view" })),
  };
}

/**
 * Apply one key to the current state. Pure — no I/O, no rendering. Mirrors the
 * key-handling switch in FlowClock's runDashboardApp, but as a standalone function
 * so app.test.ts can drive it directly without a fake TTY.
 */
export function reduce(state: AppState, key: Key, options: ReduceOptions = {}): ReduceResult {
  // Overlay routing takes precedence over every base keybind while open.
  if (state.overlay) {
    const ov = state.overlay;

    if (ov.kind === "palette") {
      const r = paletteApplyKey(ov.palette, key);
      if (r.action?.type === "run") return runCommand({ ...state, overlay: null }, r.action.command);
      if (r.action?.type === "close") return settle({ ...state, overlay: null });
      return settle({ ...state, overlay: { kind: "palette", palette: r.state } });
    }

    if (ov.kind === "help") {
      // esc / enter / ? / q dismiss it; any other key leaves it open.
      if (
        key.name === "escape" ||
        key.name === "enter" ||
        (key.name === "char" && (key.char === "?" || key.char === "q"))
      ) {
        return settle({ ...state, overlay: null });
      }
      const scrolled = scrollDialog(state, ov, key);
      if (scrolled) return scrolled;
      return settle(state);
    }

    if (ov.kind === "detail") {
      // Read-only drill-in — esc / enter / q dismiss it.
      if (key.name === "escape" || key.name === "enter" || (key.name === "char" && key.char === "q")) {
        return settle({ ...state, overlay: null });
      }
      const scrolled = scrollDialog(state, ov, key);
      if (scrolled) return scrolled;
      return settle(state);
    }

    if (ov.kind === "confirmKill") {
      // A destructive default must be EXPLICIT: only `y` confirms (emits the kill
      // effect). n / esc / q cancel. Enter does NOT confirm.
      if (key.name === "char" && (key.char === "y" || key.char === "Y")) {
        return { state: { ...state, overlay: null }, quit: false, forceRedraw: false, effect: { type: "kill", name: ov.name } };
      }
      if (
        key.name === "escape" ||
        (key.name === "char" && (key.char === "n" || key.char === "N" || key.char === "q"))
      ) {
        return settle({ ...state, overlay: null });
      }
      const scrolled = scrollDialog(state, ov, key);
      if (scrolled) return scrolled;
      return settle(state);
    }

    if (ov.kind === "confirmLaunch") {
      // The RAM governor's override gate: only `y` proceeds (emits launchConfirmed,
      // which the loop logs as an override). n / esc / q back out.
      if (key.name === "char" && (key.char === "y" || key.char === "Y")) {
        return {
          state: { ...state, overlay: null },
          quit: false,
          forceRedraw: false,
          effect: { type: "launchConfirmed", agent: ov.agent, cwd: ov.cwd, reason: ov.reason, prompt: launchOf(state).task },
        };
      }
      if (
        key.name === "escape" ||
        (key.name === "char" && (key.char === "n" || key.char === "N" || key.char === "q"))
      ) {
        return settle({ ...state, overlay: null });
      }
      const scrolled = scrollDialog(state, ov, key);
      if (scrolled) return scrolled;
      return settle(state);
    }

    if (ov.kind === "launchWizard") {
      const launch = launchOf(state);
      const wizard = wizardOf(launch);
      if (!wizard) return settle({ ...state, overlay: null });
      if (key.name === "escape" || (key.name === "char" && key.char === "q")) return settle({ ...state, overlay: null });
      if (key.name === "tab" || key.name === "shifttab") {
        const delta = key.name === "tab" ? 1 : -1;
        return settle({ ...state, launch: { ...launch, wizard: { ...wizard, focus: cycleWizardFocus(wizard.focus, delta) } } });
      }
      if (key.name === "up" || key.name === "down" || key.name === "left" || key.name === "right") {
        const delta = key.name === "up" || key.name === "left" ? -1 : 1;
        if (wizard.focus === "target") {
          if (wizard.targets.length <= 1) return settle(state);
          return settle({ ...state, launch: { ...launch, wizard: { ...wizard, targetSelected: cycleIndex(wizard.targetSelected, wizard.targets.length, delta), plan: null } } });
        }
        if (wizard.focus === "profile") {
          if (wizard.profiles.profiles.length <= 1) return settle(state);
          const profileSelected = cycleIndex(wizard.profileSelected, wizard.profiles.profiles.length, delta);
          const profile = wizard.profiles.profiles[profileSelected];
          const capability = profile?.capabilities.includes(wizard.capability) ? wizard.capability : (profile?.capabilities[0] ?? wizard.capability);
          return settle({ ...state, launch: { ...launch, wizard: { ...wizard, profileSelected, capability, plan: null } } });
        }
        if (wizard.focus === "capability") {
          const capabilities = selectedWizardProfile(wizard)?.capabilities ?? [];
          if (capabilities.length <= 1) return settle(state);
          const capability = capabilities.length
            ? capabilities[cycleIndex(Math.max(0, capabilities.indexOf(wizard.capability)), capabilities.length, delta)]!
            : wizard.capability;
          return settle({ ...state, launch: { ...launch, wizard: { ...wizard, capability, plan: null } } });
        }
        return settle(state);
      }
      if (key.name === "char" && key.char === "c") {
        return settle(
          { ...state, overlay: { kind: "workspacePicker", selected: 0, query: "", search: null, returnToWizard: true }, workspace: { ...workspaceOf(state), status: "loading", error: undefined } },
          { type: "openWorkspacePicker", returnToWizard: true },
        );
      }
      if (key.name === "enter") {
        if (wizard.focus === "cwd") {
          return settle(
            { ...state, overlay: { kind: "workspacePicker", selected: 0, query: "", search: null, returnToWizard: true }, workspace: { ...workspaceOf(state), status: "loading", error: undefined } },
            { type: "openWorkspacePicker", returnToWizard: true },
          );
        }
        return wizard.plan
          ? settle({ ...state, overlay: { kind: "confirmTargetLaunch", plan: wizard.plan, intent: launchIntentOf(launch) } })
          : settle(state, { type: "planLaunchWizard" });
      }
      return settle(state);
    }

    if (ov.kind === "workspacePicker") {
      if (ov.search) {
        if (key.name === "escape") return settle({ ...state, overlay: { ...ov, search: null } });
        if (key.name === "enter") return settle({ ...state, overlay: { ...ov, query: ov.search.text, search: null, selected: 0 } });
        const edited = lineApplyKey(ov.search, key);
        if (edited.handled) return settle({ ...state, overlay: { ...ov, search: edited.state } });
        return settle(state);
      }
      if (key.name === "escape" || (key.name === "char" && key.char === "q")) {
        return settle({ ...state, overlay: ov.returnToWizard && wizardOf(launchOf(state)) ? { kind: "launchWizard" } : null });
      }
      const candidates = filteredWorkspaces(state, ov.query);
      if (key.name === "up" || key.name === "down") {
        const delta = key.name === "up" ? -1 : 1;
        return settle({ ...state, overlay: { ...ov, selected: cycleIndex(ov.selected, candidates.length, delta) } });
      }
      if (key.name === "enter") {
        const selected = candidates[clampIndex(ov.selected, candidates.length)];
        return selected ? settle(selectWorkspace(state, selected, ov.returnToWizard)) : settle(state);
      }
      if (key.name === "char" && key.char === "s") return settle({ ...state, overlay: { ...ov, search: lineFrom(ov.query) } });
      if (key.name === "char" && key.char === "a") {
        return settle({ ...state, overlay: { kind: "workspaceAdd", cwd: lineFrom(""), label: lineFrom(""), focus: "cwd", returnToWizard: ov.returnToWizard, origin: "picker" } });
      }
      if (key.name === "char" && key.char === "r") {
        return settle({ ...state, workspace: { ...workspaceOf(state), status: "loading", error: undefined } }, { type: "openWorkspacePicker", returnToWizard: ov.returnToWizard });
      }
      return settle(state);
    }

    if (ov.kind === "workspaceAdd") {
      if (key.name === "escape") {
        return settle({ ...state, overlay: ov.origin === "cockpit" ? null : { kind: "workspacePicker", selected: 0, query: "", search: null, returnToWizard: ov.returnToWizard } });
      }
      if (key.name === "tab" || key.name === "shifttab") {
        const focus = ov.focus === "cwd" ? "label" : "cwd";
        return settle({ ...state, overlay: { ...ov, focus } });
      }
      if (key.name === "enter") {
        if (ov.focus === "cwd") return settle({ ...state, overlay: { ...ov, focus: "label" } });
        const cwd = ov.cwd.text.trim();
        const label = ov.label.text.trim();
        if (!cwd || !label) return settle({ ...state, workspace: { ...workspaceOf(state), status: "error", error: "Enter both a directory and a label." } });
        return settle({ ...state, workspace: { ...workspaceOf(state), status: "loading", error: undefined } }, { type: "addWorkspace", cwd, label, returnToWizard: ov.returnToWizard, origin: ov.origin ?? "picker" });
      }
      const line = ov.focus === "cwd" ? ov.cwd : ov.label;
      const edited = lineApplyKey(line, key);
      if (!edited.handled) return settle(state);
      return settle({ ...state, overlay: ov.focus === "cwd" ? { ...ov, cwd: edited.state } : { ...ov, label: edited.state } });
    }

    if (ov.kind === "workspaceRename") {
      if (key.name === "escape" || (key.name === "char" && key.char === "q")) return settle({ ...state, overlay: null });
      if (key.name === "enter") {
        const label = ov.label.text.trim();
        if (!label) return settle({ ...state, workspace: { ...workspaceOf(state), status: "error", error: "Enter a workspace label." } });
        return settle({ ...state, overlay: null, workspace: { ...workspaceOf(state), status: "loading", error: undefined } }, { type: "renameWorkspace", id: ov.id, label });
      }
      const edited = lineApplyKey(ov.label, key);
      return edited.handled ? settle({ ...state, overlay: { ...ov, label: edited.state } }) : settle(state);
    }

    if (ov.kind === "confirmWorkspaceRemove") {
      if (key.name === "char" && (key.char === "y" || key.char === "Y")) return settle({ ...state, overlay: null }, { type: "removeWorkspace", id: ov.id });
      if (key.name === "escape" || (key.name === "char" && /[nNq]/.test(key.char))) return settle({ ...state, overlay: null });
      return settle(state);
    }

    if (ov.kind === "confirmTargetLaunch") {
      if (key.name === "char" && (key.char === "y" || key.char === "Y")) return settle({ ...state, overlay: null }, { type: "requestTargetLaunch", plan: ov.plan, intent: ov.intent });
      if (key.name === "escape" || (key.name === "char" && /[nNq]/.test(key.char))) return settle({ ...state, overlay: wizardOf(launchOf(state)) ? { kind: "launchWizard" } : null });
      const scrolled = scrollDialog(state, ov, key);
      if (scrolled) return scrolled;
      return settle(state);
    }
    if (ov.kind === "confirmTargetGovernor") {
      if (key.name === "char" && (key.char === "y" || key.char === "Y")) return settle({ ...state, overlay: null }, { type: "launchTarget", plan: ov.plan, intent: ov.intent, reason: ov.reason });
      if (key.name === "escape" || (key.name === "char" && /[nNq]/.test(key.char))) return settle({ ...state, overlay: wizardOf(launchOf(state)) ? { kind: "launchWizard" } : null });
      const scrolled = scrollDialog(state, ov, key);
      if (scrolled) return scrolled;
      return settle(state);
    }
    if (ov.kind === "confirmProfilesInit") {
      if (key.name === "char" && (key.char === "y" || key.char === "Y")) return settle({ ...state, overlay: null }, { type: "initializeProfiles" });
      if (key.name === "escape" || (key.name === "char" && /[nNq]/.test(key.char))) return settle({ ...state, overlay: null });
      const scrolled = scrollDialog(state, ov, key);
      if (scrolled) return scrolled;
      return settle(state);
    }

    if (ov.kind === "confirmSend") {
      if (key.name === "char" && (key.char === "y" || key.char === "Y")) return settle({ ...state, overlay: null }, { type: "send", name: ov.name, text: ov.text });
      if (key.name === "escape" || (key.name === "char" && /[nNq]/.test(key.char))) return settle({ ...state, overlay: null });
      const scrolled = scrollDialog(state, ov, key);
      if (scrolled) return scrolled;
      return settle(state);
    }

    if (ov.kind === "taskSetup") {
      if (key.name === "escape" || (key.name === "char" && key.char === "q")) return settle({ ...state, overlay: null });
      if (key.name === "up" || key.name === "down") {
        const delta = key.name === "up" ? -1 : 1;
        return settle({ ...state, overlay: { kind: "taskSetup", selected: cycleIndex(ov.selected, TASK_SETUP_OPTIONS.length, delta) } });
      }
      if (key.name === "enter") {
        const selected = clampIndex(ov.selected, TASK_SETUP_OPTIONS.length);
        return settle({ ...state, overlay: { kind: "taskPrompt", selected, line: lineFrom(launchOf(state).task) } });
      }
      return settle(state);
    }

    if (ov.kind === "taskPrompt") {
      if (key.name === "escape") return settle({ ...state, overlay: { kind: "taskSetup", selected: ov.selected } });
      if (key.name === "enter") {
        const option = TASK_SETUP_OPTIONS[clampIndex(ov.selected, TASK_SETUP_OPTIONS.length)]!;
        return settle({ ...state, overlay: null, launch: applyTaskSetup(launchOf(state), option.capability, ov.line.text.trim()) });
      }
      const scrolled = scrollDialog(state, ov, key);
      if (scrolled) return scrolled;
      const edited = lineApplyKey(ov.line, key);
      if (edited.handled) return settle({ ...state, overlay: { ...ov, line: edited.state } });
      return settle(state);
    }

    if (ov.kind === "remember") {
      // Write to permanent agentic memory (6.5.2): enter submits · esc cancels.
      if (key.name === "escape") return settle({ ...state, overlay: null });
      if (key.name === "enter") {
        const text = ov.line.text.trim();
        if (text.length === 0) return settle({ ...state, overlay: null }); // empty → just close
        return { state: { ...state, overlay: null }, quit: false, forceRedraw: false, effect: { type: "remember", text } };
      }
      const ed = lineApplyKey(ov.line, key);
      if (ed.handled) return settle({ ...state, overlay: { kind: "remember", line: ed.state } });
      return settle(state);
    }

    if (ov.kind === "memorySearch") {
      if (key.name === "escape") return settle({ ...state, overlay: null });
      if (key.name === "enter") {
        const query = ov.line.text.trim();
        return query ? settle({ ...state, overlay: null }, { type: "searchMemory", query }) : settle({ ...state, overlay: null });
      }
      const edited = lineApplyKey(ov.line, key);
      if (edited.handled) return settle({ ...state, overlay: { kind: "memorySearch", line: edited.state } });
      return settle(state);
    }

    // Prompt drafts stay in memory only. Enter opens a review; only y sends exact bytes.
    if (key.name === "escape") return settle({ ...state, overlay: null });
    if (key.name === "enter") {
      const text = ov.draft.text;
      if (text.length === 0) return settle({ ...state, overlay: null }); // empty → just close
      return settle({ ...state, overlay: { kind: "confirmSend", name: ov.name, text } });
    }
    const edited = composerApplyKey(ov.draft, key, options.composer);
    if (edited.handled) return settle({ ...state, overlay: { kind: "prompt", name: ov.name, draft: edited.state } });
    return settle(state);
  }

  // Tab / Shift+Tab move the focus RING between the boxes of the current view — they no
  // longer switch views (1-7 does that). Single-region views: a harmless no-op.
  if (key.name === "tab" || key.name === "shifttab") {
    const regions = regionsFor(state.tab);
    if (regions.length <= 1) return settle({ ...state, confirmQuit: false });
    const delta = key.name === "tab" ? 1 : -1;
    const cur = clampIndex(state.focusRegion ?? 0, regions.length);
    return settle({ ...state, confirmQuit: false, focusRegion: (cur + delta + regions.length) % regions.length });
  }

  // Launch arrows stay inside the manual-agent grid. The task and guided-launch
  // panels use Enter to open their respective modal flows, preventing accidental runs.
  if (state.tab === "launch") {
    const launch = launchOf(state);
    if (focusedRegion(state) === "agents" && (key.name === "up" || key.name === "down" || key.name === "left" || key.name === "right")) {
      const cur = state.launch?.selected ?? 0;
      const delta =
        key.name === "left" ? -1 : key.name === "right" ? 1 : key.name === "up" ? -LAUNCH_COLS : LAUNCH_COLS;
      const selected = Math.min(Math.max(0, cur + delta), LAUNCHABLE.length - 1);
      return settle({ ...state, confirmQuit: false, launch: { ...launch, selected } });
    }
    if (key.name === "enter") return drillIn(state);
  }

  // Memory: esc exits an active search back to recent memory (G56-F3 — the results box
  // swaps its collection, so there must be a way to switch back; also resets the cursor).
  if (key.name === "escape" && state.tab === "memory" && memoryOf(state).search) {
    const m = memoryOf(state);
    return settle({ ...state, confirmQuit: false, memory: { ...m, search: null, searchStatus: "idle", searchError: undefined, searchSelected: 0 } });
  }

  // ↑↓ navigate items within the FOCUSED box; Enter drills into it (attach / open / nav).
  if (key.name === "up" || key.name === "down") return moveSelection(state, key.name === "down" ? 1 : -1);
  if (key.name === "enter") return drillIn(state);

  if (key.name === "char") {
    const ch = key.char;

    if (ch === CTRL_C) {
      if (state.confirmQuit) return { state, quit: true, forceRedraw: false };
      return settle({ ...state, confirmQuit: true });
    }
    if (ch === CTRL_D) return { state, quit: true, forceRedraw: false };
    if (ch === "q") return { state, quit: true, forceRedraw: false };
    if (ch === CTRL_L) return { state: { ...state, confirmQuit: false }, quit: false, forceRedraw: true };

    if (ch >= "1" && ch <= "7") {
      const tab = TABS[Number(ch) - 1];
      if (tab) return goTab(state, tab);
    }
    if (ch === "l") return goTab(state, "launch");

    // Overlays: "/" or ctrl+p ("\x10") open the command palette; "?" opens help.
    if (ch === "/" || ch === "\x10") return openPalette(state);
    if (ch === "?") return openHelp(state);

    if (state.tab === "launch") {
      if (ch === "t") return settle({ ...state, confirmQuit: false, overlay: { kind: "taskSetup", selected: taskSetupIndex(taskCapabilityOf(launchOf(state))) } });
      if (ch === "r") return settle({ ...state, confirmQuit: false, launch: resetTaskSetup(launchOf(state)) });
      if (ch === "w") return settle({ ...state, confirmQuit: false }, { type: "openLaunchWizard" });
      if (ch === "g") {
        return settle(
          { ...state, confirmQuit: false, overlay: { kind: "workspacePicker", selected: 0, query: "", search: null, returnToWizard: false }, workspace: { ...workspaceOf(state), status: "loading", error: undefined } },
          { type: "openWorkspacePicker", returnToWizard: false },
        );
      }
    }

    if (state.tab === "workspaces") {
      const workspace = workspaceOf(state);
      const selected = selectedCockpitWorkspace(state);
      if (ch === "r") return settle({ ...state, confirmQuit: false, workspace: { ...workspace, status: "loading", error: undefined } }, { type: "refreshWorkspaces" });
      if (ch === "g") return goTab({ ...state, confirmQuit: false }, "launch");
      if (ch === "a") return settle({ ...state, confirmQuit: false, overlay: { kind: "workspaceAdd", cwd: lineFrom(""), label: lineFrom(""), focus: "cwd", returnToWizard: false, origin: "cockpit" } });
      if (ch === "e" && selected?.persistent && selected.id) return settle({ ...state, confirmQuit: false, overlay: { kind: "workspaceRename", id: selected.id, label: lineFrom(selected.label) } });
      if (ch === "x" && selected?.persistent && selected.id) return settle({ ...state, confirmQuit: false, overlay: { kind: "confirmWorkspaceRemove", id: selected.id, label: selected.label } });
    }

    // Sessions panel actions (only on that tab): a attach · k kill · p prompt · r refrescar.
    if (state.tab === "sessions") {
      const s = sessionsOf(state);
      const sel = s.rows[s.selected];
      if (ch === "r") return settle({ ...state, confirmQuit: false }, { type: "refreshSessions" });
      if (sel) {
        if (ch === "a") return settle({ ...state, confirmQuit: false }, { type: "attach", name: sel.name });
        if (ch === "k") return settle({ ...state, confirmQuit: false, overlay: { kind: "confirmKill", name: sel.name } });
        if (ch === "p") return settle({ ...state, confirmQuit: false, overlay: { kind: "prompt", name: sel.name, draft: composerFrom("") } });
      }
    }

    // Memory panel: r opens the remember composer (writes to permanent agentic memory).
    if (state.tab === "memory" && ch === "r") {
      return settle({ ...state, confirmQuit: false, overlay: { kind: "remember", line: lineFrom("") } });
    }
    if (state.tab === "memory" && ch === "s") {
      return settle({ ...state, confirmQuit: false, overlay: { kind: "memorySearch", line: lineFrom(memoryOf(state).search?.query ?? "") } });
    }
    // Attach a selected procedure's workflow as a Launch task. This only materializes text; it
    // does not invoke OpenRouter or start an agent until the user acts in Launch.
    if (state.tab === "memory" && ch === "a" && focusedRegion(state) === "procedures") {
      const w = procedureRows(memoryOf(state))[memoryOf(state).workflowSelected];
      if (w) return settle({ ...state, confirmQuit: false }, { type: "attachWorkflow", id: w.id });
    }
    if (state.tab === "routing" && ch === "c") {
      const r = routingOf(state);
      const mode = r.mode === "routing" ? "cost" : "routing";
      return settle({ ...state, confirmQuit: false, routing: { ...r, mode } }, { type: "refreshRouting" });
    }
    // Doctor panel: r re-runs the diagnostics in place (async spinner, never blocks).
    if (state.tab === "doctor" && ch === "r") {
      return settle({ ...state, confirmQuit: false }, { type: "rerunDoctor" });
    }

    // Any other printable char: no-op beyond clearing the quit-confirm arm.
    return settle({ ...state, confirmQuit: false });
  }

  // Any other key not yet bound (enter, escape on a base view, ...): clear the
  // quit-confirm arm (only a repeated, consecutive Ctrl-C quits) and no-op otherwise.
  return settle({ ...state, confirmQuit: false });
}

// ---------------------------------------------------------------------------
// buildFrame — pure frame composer
// ---------------------------------------------------------------------------

/**
 * Build the full frame as an array of row strings.
 *
 * Returns exactly `size.rows` rows, each of exact display width `size.cols` —
 * except below MIN_COLS/MIN_ROWS, where it returns a guidance-message frame of
 * the same exact dimensions instead of the real shell.
 */
export function buildFrame(state: AppState, size: FrameSize, theme: Theme): string[] {
  const { cols, rows } = size;

  if (cols < MIN_COLS || rows < MIN_ROWS) {
    return buildMinSizeFrame(size, theme);
  }

  const full: Rect = { top: 0, left: 0, width: cols, height: rows };
  const [, , , middleRect] = splitV(full, [1, 1, 1, { flex: 1 }, 1, 1]);

  const frame: string[] = [];
  frame.push(buildStatusRow(overviewOf(state), theme, cols));
  frame.push(padTo(tabBar({ tabs: [...TABS], active: TABS.indexOf(state.tab) }, theme, cols), cols));
  frame.push(buildHairlineRow(theme, cols));
  frame.push(...buildMiddle(state, middleRect, theme));
  // While a modal owns the keyboard its own actions row is the one place that lists the keys; the
  // bar goes quiet rather than echoing the same four hints ten rows lower.
  frame.push(state.overlay ? " ".repeat(cols) : hintBar({ hints: hintsForState(state) }, theme, cols));
  // The footer names the selected workspace, never the incidental shell cwd from which the
  // TUI happened to start. A registered workspace can be different from the caller project.
  const workspace = workspaceOf(state);
  frame.push(footer({ cwd: workspaceDisplay(workspace.active, state.cwd), right: `ebrain ${EBRAIN_UI_VERSION}` }, theme, cols));

  // Defensive: guarantee exactly `rows` rows of exactly `cols` width regardless of
  // how the section arithmetic above landed.
  while (frame.length < rows) frame.push(" ".repeat(cols));
  const base = frame.slice(0, rows).map((r) => padTo(truncate(r, cols), cols));

  if (state.overlay) return compositeOverlay(base, state.overlay, size, theme, state);
  return base;
}

// ---------------------------------------------------------------------------
// Overlay compositing — palette (6.3.4) + help (6.3.5) modals.
//
// A band-clear composite: the box's row band is cleared to a plain void scrim and
// the centered box placed on it; rows above/below keep the base view (so you still
// see the tab context behind the modal). Exact width/height preserved.
// ---------------------------------------------------------------------------

/** Where an overlay sits inside the view region: confirmations and read-only references centre;
 * anything with a cursor or a selection (composers, pickers, forms) anchors near the top so it
 * holds still while its content grows instead of re-centring under the user's hands. */
type OverlayAnchor = "center" | "upper";

interface BuiltOverlay {
  box: string[];
  anchor: OverlayAnchor;
}

/** The rows an overlay may occupy: the view region between the hairline and the hint bar. The
 * status bar, tabs and footer stay in place (dimmed) around every modal and no modal can paint
 * over them; placed against the whole frame, the palette used to cover both at 80x24. */
function overlayRegion(rows: number): { top: number; height: number } {
  return { top: 3, height: Math.max(1, rows - 5) };
}

function placeOverlay(built: BuiltOverlay, cols: number, rows: number): { box: string[]; top: number; left: number } {
  const region = overlayRegion(rows);
  const box = built.box.slice(0, region.height);
  const width = box.reduce((w, row) => Math.max(w, displayWidth(row)), 0);
  const left = Math.max(0, Math.floor((cols - width) / 2));
  const free = Math.max(0, region.height - box.length);
  const offset = built.anchor === "center" ? Math.floor(free / 2) : Math.min(Math.floor(region.height / 5), free);
  return { box, top: region.top + offset, left };
}

/**
 * Build the box for `overlay`, or null when the overlay edits the view in place rather than
 * opening a second surface (the memory search types into the view's own search bar).
 */
function overlayBox(overlay: Overlay, state: AppState, cols: number, rows: number, theme: Theme): BuiltOverlay | null {
  const maxDialogHeight = overlayRegion(rows).height;
  const centered = (box: string[]): BuiltOverlay => ({ box, anchor: "center" });
  const upper = (box: string[]): BuiltOverlay => ({ box, anchor: "upper" });

  if (overlay.kind === "palette") {
    const width = Math.min(64, Math.max(20, cols - 4));
    // The list shares the box with the prompt row, its hairline, the footer hint and two borders.
    const maxItems = Math.max(1, maxDialogHeight - 5);
    const items = toItems(filterCommands(overlay.palette.query)).slice(0, maxItems);
    const selected = Math.min(Math.max(0, overlay.palette.selected), Math.max(0, items.length - 1));
    return upper(commandPalette({ query: overlay.palette.query, items, selected, width }, theme));
  }

  if (overlay.kind === "confirmKill") {
    const width = Math.min(52, Math.max(30, cols - 8));
    return centered(confirmLayout(
      {
        title: "kill session",
        message: `kill ${overlay.name}? this cannot be undone.`,
        danger: true,
        confirmKey: "y",
        confirmLabel: "kill",
        cancelKey: "n",
        cancelLabel: "cancel",
        width,
        maxHeight: maxDialogHeight,
        scroll: overlay.scroll,
      },
      theme,
    ).rows);
  }

  if (overlay.kind === "confirmLaunch") {
    const width = Math.min(80, Math.max(40, cols - 6));
    return centered(confirmLayout(
      {
        title: "RAM governor",
        message: overlay.reason,
        danger: false,
        confirmKey: "y",
        confirmLabel: `launch ${overlay.agent} anyway`,
        cancelKey: "n",
        cancelLabel: "cancel",
        width,
        maxHeight: maxDialogHeight,
        scroll: overlay.scroll,
      },
      theme,
    ).rows);
  }

  if (overlay.kind === "prompt") {
    const width = Math.min(64, Math.max(30, cols - 6));
    return upper(buildPromptBox(overlay, width, maxDialogHeight, theme));
  }

  if (overlay.kind === "confirmSend") {
    const width = Math.min(84, Math.max(44, cols - 6));
    return centered(buildSendPreviewBox(overlay, width, maxDialogHeight, theme));
  }

  if (overlay.kind === "taskSetup") {
    const width = Math.min(88, Math.max(48, cols - 6));
    return upper(buildTaskSetupBox(overlay, width, maxDialogHeight, theme));
  }

  if (overlay.kind === "taskPrompt") {
    const width = Math.min(88, Math.max(48, cols - 6));
    return upper(buildTaskPromptBox(overlay, width, maxDialogHeight, theme));
  }

  if (overlay.kind === "launchWizard") {
    const width = Math.min(88, Math.max(48, cols - 6));
    return upper(buildLaunchWizardBox(launchOf(state), width, maxDialogHeight, theme));
  }

  if (overlay.kind === "workspacePicker") {
    const width = Math.min(88, Math.max(48, cols - 6));
    return upper(buildWorkspacePickerBox(state, overlay, width, maxDialogHeight, theme));
  }
  if (overlay.kind === "workspaceAdd") {
    const width = Math.min(88, Math.max(48, cols - 6));
    return upper(buildWorkspaceAddBox(state, overlay, width, maxDialogHeight, theme));
  }
  if (overlay.kind === "workspaceRename") {
    const width = Math.min(72, Math.max(36, cols - 6));
    return upper(buildWorkspaceRenameBox(state, overlay, width, maxDialogHeight, theme));
  }
  if (overlay.kind === "confirmWorkspaceRemove") {
    const width = Math.min(72, Math.max(36, cols - 6));
    return centered(confirmLayout({
      title: "remove workspace",
      message: `Remove ${overlay.label} from the local workspace registry? The directory and existing sessions are unchanged.`,
      danger: true,
      confirmKey: "y",
      confirmLabel: "remove entry",
      cancelKey: "n",
      cancelLabel: "cancel",
      width,
      maxHeight: maxDialogHeight,
      scroll: overlay.scroll,
    }, theme).rows);
  }
  if (overlay.kind === "confirmTargetLaunch" || overlay.kind === "confirmTargetGovernor") {
    const plan = overlay.plan;
    const governor = overlay.kind === "confirmTargetGovernor";
    const width = Math.min(84, Math.max(44, cols - 6));
    // Show the exact task being delivered (G56-F2): the full payload is delivered on launch; the
    // preview shows its first line + a multi-line hint, never substituting the payload.
    const task = overlay.intent.prompt.trim();
    const taskLines = task ? task.split("\n") : [];
    const extra = Math.max(0, taskLines.length - 1);
    const taskLine = task
      ? `task: ${taskLines[0]}${extra > 0 ? ` (+${extra} more line${extra === 1 ? "" : "s"})` : ""}`
      : "task: (none — nothing will be delivered)";
    const wfLine = overlay.intent.workflowId ? `workflow: ${overlay.intent.workflowId}` : "";
    const head = governor ? overlay.reason : `${plan.target} · ${plan.profile} · ${plan.model} · ${plan.costStatus}`;
    const message = [head, taskLine, wfLine].filter(Boolean).join("\n");
    return centered(confirmLayout({ title: governor ? "RAM governor" : "launch target", message, danger: governor, confirmKey: "y", confirmLabel: governor ? "launch anyway" : "launch", cancelKey: "n", cancelLabel: "cancel", width, maxHeight: maxDialogHeight, scroll: overlay.scroll }, theme).rows);
  }
  if (overlay.kind === "confirmProfilesInit") {
    const width = Math.min(84, Math.max(44, cols - 6));
    return centered(confirmLayout({ title: "Initialize execution profile", message: "Create a local profile from existing ebrain routing? No provider call or credential is stored.", danger: false, confirmKey: "y", confirmLabel: "initialize", cancelKey: "n", cancelLabel: "cancel", width, maxHeight: maxDialogHeight, scroll: overlay.scroll }, theme).rows);
  }

  if (overlay.kind === "remember") {
    const width = Math.min(72, Math.max(30, cols - 6));
    return upper(buildRememberBox(overlay, width, maxDialogHeight, theme));
  }

  // The memory search edits the view's own search bar (buildMemoryView), so there is no box.
  if (overlay.kind === "memorySearch") return null;

  if (overlay.kind === "detail") {
    const width = Math.min(76, Math.max(36, cols - 8));
    return centered(buildDetailBox(overlay, width, maxDialogHeight, theme));
  }

  // help (fallthrough): `?` is a focused action reference, while direct unit
  // callers can still render the full command registry without a context.
  const width = Math.min(66, Math.max(20, cols - 4));
  return centered(renderHelpLayout(theme, COMMANDS, width, actionReferenceFor(state), maxDialogHeight, overlay.scroll).rows);
}

/** The prompt bar and cursor consume three cells inside a panel's content area. Keep the
 * geometry shared between rendering and the key reducer so Up/Down always mean visual rows. */
function promptComposerGeometry(width: number, maxDialogHeight: number): ComposerGeometry {
  const contentWidth = Math.max(1, width - 4); // two borders + horizontal panel padding
  return {
    textWidth: Math.max(2, contentWidth - 3), // `┃ ` plus a one-cell caret
    // Two immutable instruction rows and two panel borders are reserved before the editor grows.
    viewportRows: Math.max(1, Math.floor(maxDialogHeight) - 4),
  };
}

function promptComposerGeometryForFrame(size: FrameSize): ComposerGeometry {
  const width = Math.min(64, Math.max(30, size.cols - 6));
  return promptComposerGeometry(width, overlayRegion(size.rows).height);
}

function composerInputRow(
  row: ComposerVisualRow,
  rowIndex: number,
  cursorRow: number,
  cursor: number,
  theme: Theme,
): string {
  const active = rowIndex === cursorRow;
  const localCursor = Math.max(0, Math.min(cursor - row.start, row.text.length));
  const before = active ? row.text.slice(0, localCursor) : row.text;
  const after = active ? row.text.slice(localCursor) : "";
  const bar = theme.fg(active ? "accent.teal" : "background.border") + "┃" + theme.reset;
  const text = theme.fg("text.primary") + before + theme.reset;
  const caret = active ? theme.fg("accent.teal") + "▏" + theme.reset : "";
  return bar + " " + text + caret + (after ? theme.fg("text.primary") + after + theme.reset : "");
}

/** Prompt overlay: an editor, not a clipped stack of PromptBox rows. The exact draft remains
 * memory-only until the existing y-only confirmation boundary. */
function buildPromptBox(
  overlay: Extract<Overlay, { kind: "prompt" }>,
  width: number,
  maxDialogHeight: number,
  theme: Theme,
): string[] {
  const maximum = promptComposerGeometry(width, maxDialogHeight);
  // Grow from one row to the safe cap. Recompute the viewport with that actual height so a
  // resize or shorter draft never reserves a blank modal and a long draft keeps its cursor seen.
  const all = composerViewport(overlay.draft, { ...maximum, viewportRows: Number.MAX_SAFE_INTEGER });
  const viewportRows = Math.max(1, Math.min(maximum.viewportRows, all.rows.length));
  const viewport = composerViewport(overlay.draft, { ...maximum, viewportRows });
  const start = viewport.scrollTop;
  const editorRows = viewport.visibleRows.map((row, index) => composerInputRow(row, start + index, viewport.cursorRow, overlay.draft.cursor, theme));
  const position = viewport.maxScroll > 0
    ? `Visual rows ${start + 1}-${Math.min(viewport.rows.length, start + viewportRows)} of ${viewport.rows.length} · arrows move the cursor`
    : "Alt+Enter adds a line · arrows move the cursor";
  const field = [
    theme.fg("text.muted") + "Draft stays in memory until you review it." + theme.reset,
    ...editorRows,
    theme.fg("text.muted") + position + theme.reset,
  ];
  const target = overlay.name.startsWith("ebr-") ? overlay.name.slice(4) : overlay.name;
  return panel(
    { title: `prompt → ${target}`, dialog: true, focus: true, width, height: field.length + 2, body: field },
    theme,
  );
}

function buildSendPreviewBox(overlay: Extract<Overlay, { kind: "confirmSend" }>, width: number, maxHeight: number, theme: Theme): string[] {
  const target = overlay.name.startsWith("ebr-") ? overlay.name.slice(4) : overlay.name;
  return responsiveDialog({
    title: `review prompt → ${target}`,
    focus: true,
    width,
    maxHeight,
    scroll: overlay.scroll,
    blocks: [
      { kind: "pre", text: overlay.text, tone: "text.primary" },
      { kind: "spacer" },
      { kind: "line", text: "Exact payload · not saved", tone: "text.muted" },
      { kind: "actions", items: [{ key: "y", label: "send" }, { key: "n", label: "cancel", tone: "text.primary", labelTone: "text.muted" }] },
    ],
  }, theme).rows;
}

function buildTaskSetupBox(overlay: Extract<Overlay, { kind: "taskSetup" }>, width: number, maxHeight: number, theme: Theme): string[] {
  const selected = clampIndex(overlay.selected, TASK_SETUP_OPTIONS.length);
  const blocks: DialogBlock[] = [
    { kind: "paragraph", text: "Choose the type of work you want to launch. This is a reversible capability preset, not a model or profile recommendation.", tone: "text.muted" },
    { kind: "spacer" },
    ...TASK_SETUP_OPTIONS.map((option, index) => ({
      kind: "line" as const,
      text: `${index === selected ? "▸" : " "} ${option.label} -- ${option.description}`,
      tone: index === selected ? "text.primary" as const : "text.secondary" as const,
      bold: index === selected,
    })),
    { kind: "spacer" },
    { kind: "actions", items: [{ key: "↑↓", label: "choose type" }, { key: "enter", label: "add optional task" }, { key: "esc", label: "cancel", labelTone: "text.muted" }] },
  ];
  return responsiveDialog({ title: "task setup", focus: true, width, maxHeight, blocks }, theme).rows;
}

function buildTaskPromptBox(overlay: Extract<Overlay, { kind: "taskPrompt" }>, width: number, maxHeight: number, theme: Theme): string[] {
  const option = TASK_SETUP_OPTIONS[clampIndex(overlay.selected, TASK_SETUP_OPTIONS.length)]!;
  return responsiveDialog({
    title: "task prompt",
    focus: true,
    width,
    maxHeight,
    scroll: overlay.scroll,
    blocks: [
      { kind: "keyValue", key: "type", value: `${option.label} -- ${option.description}`, keyTone: "accent.teal", valueTone: "text.secondary" },
      { kind: "paragraph", text: "Add an optional task for the new session. It is delivered exactly as reviewed and never infers a provider or model.", tone: "text.muted" },
      { kind: "spacer" },
      { kind: "input", value: overlay.line.text, cursor: overlay.line.cursor, placeholder: "optional task prompt" },
      { kind: "spacer" },
      { kind: "actions", items: [{ key: "↑↓", label: "scroll" }, { key: "enter", label: "save" }, { key: "esc", label: "back", labelTone: "text.muted" }] },
    ],
  }, theme).rows;
}

/** Keep the selected workspace and nearby matches visible without creating an unscrollable
 * modal. Search controls the complete candidate list; this is only the visual window. */
function workspaceWindow<T>(items: readonly T[], selected: number, limit = 5): { start: number; items: readonly T[] } {
  if (items.length <= limit) return { start: 0, items };
  const start = Math.max(0, Math.min(selected - Math.floor(limit / 2), items.length - limit));
  return { start, items: items.slice(start, start + limit) };
}

function buildWorkspacePickerBox(state: AppState, overlay: Extract<Overlay, { kind: "workspacePicker" }>, width: number, maxHeight: number, theme: Theme): string[] {
  if (overlay.search) {
    return responsiveDialog({
      title: "filter workspaces",
      focus: true,
      width,
      maxHeight,
      blocks: [
        { kind: "paragraph", text: "Filter by workspace label or directory. This only narrows the local validated registry.", tone: "text.muted" },
        { kind: "spacer" },
        { kind: "input", value: overlay.search.text, cursor: overlay.search.cursor, placeholder: "workspace label or directory" },
        { kind: "spacer" },
        { kind: "actions", items: [{ key: "enter", label: "apply filter" }, { key: "esc", label: "back", labelTone: "text.muted" }] },
      ],
    }, theme).rows;
  }

  const all = filteredWorkspaces(state, overlay.query);
  const selected = clampIndex(overlay.selected, all.length);
  const window = workspaceWindow(all, selected);
  const workspace = workspaceOf(state);
  const blocks: DialogBlock[] = [
    { kind: "paragraph", text: "Choose the validated directory for the next launch. Existing sessions keep their own directory. Client repositories are never selectable.", tone: "text.muted" },
    { kind: "spacer" },
  ];
  if (overlay.query) blocks.push({ kind: "keyValue", key: "filter", value: overlay.query, keyTone: "accent.teal", valueTone: "text.secondary" });
  if (workspace.status === "loading") blocks.push({ kind: "line", text: "Refreshing local workspace registry...", tone: "text.muted" });
  if (workspace.error) blocks.push({ kind: "line", text: workspace.error, tone: "semantic.error" });
  if (all.length === 0) {
    blocks.push({ kind: "line", text: "No validated workspace matches. Add one or clear the filter.", tone: "text.secondary" });
  } else {
    if (window.start > 0) blocks.push({ kind: "line", text: `↑ ${window.start} earlier workspace${window.start === 1 ? "" : "s"}`, tone: "text.muted" });
    window.items.forEach((candidate, index) => {
      const absoluteIndex = window.start + index;
      const active = absoluteIndex === selected;
      const current = candidate.cwd === workspace.active.cwd;
      blocks.push({ kind: "keyValue", key: `${active ? "▸" : " "} ${candidate.label}${current ? " (active)" : ""}`, value: candidate.cwd, keyTone: active ? "accent.teal" : "text.secondary", valueTone: active ? "text.primary" : "text.muted" });
    });
    const after = all.length - (window.start + window.items.length);
    if (after > 0) blocks.push({ kind: "line", text: `↓ ${after} more workspace${after === 1 ? "" : "s"}`, tone: "text.muted" });
  }
  blocks.push(
    { kind: "spacer" },
    { kind: "actions", items: [
      { key: "↑↓", label: "choose" },
      { key: "enter", label: "select" },
      { key: "s", label: "filter" },
      { key: "a", label: "add" },
      { key: "r", label: "refresh" },
      { key: "esc", label: "cancel", labelTone: "text.muted" },
    ] },
  );
  return responsiveDialog({ title: overlay.returnToWizard ? "guided launch workspace" : "launch workspace", focus: true, width, maxHeight, blocks }, theme).rows;
}

function buildWorkspaceAddBox(state: AppState, overlay: Extract<Overlay, { kind: "workspaceAdd" }>, width: number, maxHeight: number, theme: Theme): string[] {
  const workspace = workspaceOf(state);
  const blocks: DialogBlock[] = [
    { kind: "paragraph", text: "Register a local directory for future launches. The directory must exist, resolve to a real directory, and pass the client-repository isolation check before it is stored.", tone: "text.muted" },
    { kind: "spacer" },
    { kind: "keyValue", key: `${overlay.focus === "cwd" ? "▸" : " "} directory`, value: overlay.focus === "cwd" ? "editing" : "", keyTone: overlay.focus === "cwd" ? "accent.teal" : "text.secondary", valueTone: "text.muted" },
    { kind: "input", value: overlay.cwd.text, cursor: overlay.focus === "cwd" ? overlay.cwd.cursor : undefined, placeholder: "absolute or relative directory" },
    { kind: "keyValue", key: `${overlay.focus === "label" ? "▸" : " "} label`, value: overlay.focus === "label" ? "editing" : "", keyTone: overlay.focus === "label" ? "accent.teal" : "text.secondary", valueTone: "text.muted" },
    { kind: "input", value: overlay.label.text, cursor: overlay.focus === "label" ? overlay.label.cursor : undefined, placeholder: "short workspace label" },
  ];
  if (workspace.error) blocks.push({ kind: "line", text: workspace.error, tone: "semantic.error" });
  blocks.push(
    { kind: "spacer" },
    { kind: "actions", items: [{ key: "tab", label: "field" }, { key: "enter", label: overlay.focus === "cwd" ? "next" : "add workspace" }, { key: "esc", label: "back", labelTone: "text.muted" }] },
  );
  return responsiveDialog({ title: "add workspace", focus: true, width, maxHeight, blocks }, theme).rows;
}

function buildWorkspaceRenameBox(state: AppState, overlay: Extract<Overlay, { kind: "workspaceRename" }>, width: number, maxHeight: number, theme: Theme): string[] {
  const workspace = workspaceOf(state);
  const current = workspace.data?.workspaces.find((entry) => entry.id === overlay.id);
  const blocks: DialogBlock[] = [
    { kind: "paragraph", text: "Change only the display label. The canonical directory, active sessions, and launch-time validation remain unchanged.", tone: "text.muted" },
    { kind: "spacer" },
    { kind: "keyValue", key: "directory", value: current?.cwd ?? "workspace no longer available", keyTone: "text.secondary", valueTone: "text.muted" },
    { kind: "spacer" },
    { kind: "input", value: overlay.label.text, cursor: overlay.label.cursor, placeholder: "workspace label" },
  ];
  if (workspace.error) blocks.push({ kind: "line", text: workspace.error, tone: "semantic.error" });
  blocks.push({ kind: "spacer" }, { kind: "actions", items: [{ key: "enter", label: "rename" }, { key: "esc", label: "cancel", labelTone: "text.muted" }] });
  return responsiveDialog({ title: "rename workspace", focus: true, width, maxHeight, blocks }, theme).rows;
}

function wizardChoiceLabel(value: string, count: number, noun: string): string {
  if (count === 0) return `${value || "Unavailable"} -- no ${noun} available`;
  if (count === 1) return `${value} -- 1 ${noun}; locked`;
  const plural = noun.endsWith("y") ? noun.slice(0, -1) + "ies" : noun + "s";
  return `${value} -- ${count} ${plural}; arrows change selection`;
}

function wizardBlock(label: string, value: string, focused: boolean, count?: number, noun?: string): DialogBlock {
  return {
    kind: "keyValue",
    key: `${focused ? "▸" : " "} ${label}`,
    value: count === undefined ? value : wizardChoiceLabel(value, count, noun ?? "choices"),
    keyTone: focused ? "accent.teal" : "text.secondary",
    valueTone: focused ? "text.primary" : "text.secondary",
  };
}

/** Guided-launch dialog. Target, profile, capability and workspace remain explicit
 * user decisions. It renders the active value plus an honest count rather than a fake
 * arrow affordance when the local installation has only one choice. */
function buildLaunchWizardBox(launch: LaunchSlice, width: number, maxHeight: number, theme: Theme): string[] {
  const wizard = wizardOf(launch);
  if (!wizard) {
    return responsiveDialog({ title: "guided launch", focus: true, width, maxHeight, blocks: [{ kind: "line", text: "Wizard data is no longer available.", tone: "semantic.error" }, { kind: "actions", items: [{ key: "esc", label: "close" }] }] }, theme).rows;
  }
  const target = selectedWizardTarget(wizard);
  const profile = selectedWizardProfile(wizard);
  const capabilities = profile?.capabilities ?? [];
  const choices = wizardChoiceCount(wizard);
  const blocks: DialogBlock[] = [
    { kind: "paragraph", text: "Choose a declared target and an execution profile you control. This wizard does not recommend a provider or model.", tone: "text.muted" },
    { kind: "spacer" },
    wizardBlock("target", target ? `${target.id} -- ${target.provider} / ${target.agent}` : "Unavailable", wizard.focus === "target", wizard.targets.length, "declared target"),
    wizardBlock("profile", profile ? `${profile.label} -- ${profile.provider} / ${profile.models} models` : "Unavailable", wizard.focus === "profile", wizard.profiles.profiles.length, "execution profile"),
    wizardBlock("capability", wizard.capability, wizard.focus === "capability", capabilities.length, "capability"),
    wizardBlock("workspace", wizard.cwd, wizard.focus === "cwd"),
  ];
  if (wizard.plan) blocks.push({ kind: "line", text: `Preview ready -- ${wizard.plan.model} -- ${wizard.plan.costStatus}`, tone: "semantic.ok" });
  if (wizard.focus !== "cwd" && choices <= 1) {
    blocks.push({ kind: "line", text: "This field has no alternative selection. Use Tab to continue.", tone: "text.muted" });
  }
  blocks.push({ kind: "spacer" }, { kind: "actions", items: [
    { key: "tab", label: "field" },
    ...(choices > 1 ? [{ key: "↑↓", label: "choose" }] : []),
    { key: "c", label: "workspace" },
    { key: "enter", label: wizard.plan ? "review launch" : "preview" },
    { key: "esc", label: "cancel", labelTone: "text.muted" },
  ] });
  return responsiveDialog({ title: "guided launch", focus: true, width, maxHeight, blocks }, theme).rows;
}

/** Read-only detail modal (Enter drill-in): a teal-bordered dialog with the title and a
 * word-wrapped body, capped in height so it never overflows the screen. */
function buildDetailBox(overlay: Extract<Overlay, { kind: "detail" }>, width: number, maxHeight: number, theme: Theme): string[] {
  return responsiveDialog({
    title: overlay.title,
    focus: true,
    width,
    maxHeight,
    scroll: overlay.scroll,
    blocks: [
      { kind: "paragraph", text: overlay.body, tone: "text.primary" },
      { kind: "spacer" },
      { kind: "line", text: "esc close", tone: "text.muted" },
    ],
  }, theme).rows;
}

/** Remember overlay: a titled composer that explains where the text goes, then takes it. Writes
 * to permanent agentic memory on enter — single-line here (the multiline RememberForm of the
 * mockup is the composer work in F6.6.3). */
function buildRememberBox(overlay: Extract<Overlay, { kind: "remember" }>, width: number, maxHeight: number, theme: Theme): string[] {
  return responsiveDialog({
    title: "remember",
    focus: true,
    width,
    maxHeight,
    blocks: [
      { kind: "paragraph", text: "One durable, self-contained learning. It is written to permanent agentic memory and shared with every agent.", tone: "text.muted" },
      { kind: "spacer" },
      { kind: "input", value: overlay.line.text, cursor: overlay.line.cursor, placeholder: "a durable, self-contained learning" },
      { kind: "spacer" },
      { kind: "actions", items: [{ key: "enter", label: "save" }, { key: "esc", label: "cancel", labelTone: "text.muted" }] },
    ],
  }, theme).rows;
}

/**
 * Draw `overlay` over `base`. Everything behind the modal keeps its text and loses its colour,
 * so exactly one box on screen is lit and it is the one that owns the keyboard; the modal is
 * spliced into the dimmed rows rather than clearing a band, so the view stays legible around it.
 */
function compositeOverlay(base: string[], overlay: Overlay, size: FrameSize, theme: Theme, state: AppState): string[] {
  const { cols, rows } = size;
  const built = overlayBox(overlay, state, cols, rows, theme);
  if (!built) return base;
  const { box, top, left } = placeOverlay(built, cols, rows);
  const dim = theme.fg("text.muted");
  const out = base.map((row) => dim + stripAnsi(row) + theme.reset);
  for (let i = 0; i < box.length; i++) {
    const y = top + i;
    if (y < 0 || y >= rows) continue;
    const boxRow = box[i]!;
    const cells = [...stripAnsi(base[y] ?? "")];
    const before = cells.slice(0, left).join("");
    const after = cells.slice(left + displayWidth(boxRow)).join("");
    out[y] = padTo(truncate(dim + before + theme.reset + boxRow + dim + after + theme.reset, cols), cols);
  }
  return out;
}

/** Global status bar (chrome on every tab). Wired to the LIVE `status --json` summary
 * (6.5.1) — brain state, fleet online/total, spend MTD/cap — with a neutral placeholder
 * before the first fetch lands (never a stale hardcoded number). */
function buildStatusRow(o: OverviewSlice, theme: Theme, cols: number): string {
  const left = wordmark({ variant: "compact" }, theme)[0] ?? "";
  const d = o.data;
  let right: string;
  if (d) {
    const brainColor = d.brain.state === "up" ? theme.fg("semantic.ok") : theme.fg("semantic.warn");
    const fleetColor = d.fleet.online === d.fleet.total ? theme.reset : theme.fg("semantic.warn");
    right =
      "brain " + brainColor + BOLD + d.brain.state.toUpperCase() + theme.reset +
      statusSep(theme) +
      fleetColor + `fleet ${d.fleet.online}/${d.fleet.total}` + theme.reset +
      statusSep(theme) +
      `$${d.spend.mtd.toFixed(2)}/$${d.spend.cap}`;
  } else {
    const dim = theme.fg("text.muted");
    right = "brain " + dim + "…" + theme.reset + statusSep(theme) + dim + "fleet —" + theme.reset + statusSep(theme) + dim + "$—" + theme.reset;
  }
  return statusBar({ left, right }, theme, cols);
}

function buildHairlineRow(theme: Theme, cols: number): string {
  const inner = Math.max(0, cols - 2);
  return theme.fg("background.border") + " " + "─".repeat(inner) + " " + theme.reset;
}

function centerLine(line: string, width: number): string {
  const w = displayWidth(line);
  const left = Math.max(0, Math.floor((width - w) / 2));
  return padTo(" ".repeat(left) + line, width);
}

function buildMiddle(state: AppState, rect: Rect, theme: Theme): string[] {
  if (rect.height <= 0) return [];
  const focused = focusedRegion(state);
  let rows: string[];
  if (state.tab === "home") rows = buildOverviewView(overviewOf(state), sessionsOf(state), focused, rect, theme);
  else if (state.tab === "sessions") rows = buildSessionsView(sessionsOf(state), rect, theme);
  else if (state.tab === "launch") rows = buildLaunchView(launchOf(state), workspaceOf(state).active, state.cwd, focused, rect, theme);
  else if (state.tab === "workspaces") rows = buildWorkspacesView(workspaceOf(state), sessionsOf(state), focused, rect, theme);
  else if (state.tab === "memory") rows = buildMemoryView(memoryOf(state), focused, rect, theme, state.overlay?.kind === "memorySearch" ? state.overlay.line : undefined);
  else if (state.tab === "routing") rows = buildRoutingView(routingOf(state), rect, theme);
  else rows = buildDoctorView(doctorOf(state), focused, rect, theme);
  return rows.slice(0, rect.height).map((r) => padTo(truncate(r, rect.width), rect.width));
}

// ---------------------------------------------------------------------------
// Overview view (F6.5.1) — screens-a.jsx's HomeScreen wired to LIVE data: the
// `status --json` summary (brain/spend/fleet/memory), the active tmux sessions (a
// bare list from the same refresh), and the last 3 learnings from `memory recent`.
// Renders PURELY from the overview + sessions slices; the loop fetches them. NEVER a
// spinner-forever: null data degrades to a "cargando…"/error message, and a cached
// brain read raises the lock banner (6.5.5) instead of blocking.
// ---------------------------------------------------------------------------

function labelCell(text: string, theme: Theme): string {
  return theme.fg("text.secondary") + padTo(text, 8) + theme.reset;
}

/** A key the user can press right now, named inside a box: teal, like the focus border and the
 * selection marker. The footer's keys stay quiet because they are always there; these are not. */
function keyName(k: string, theme: Theme): string {
  return theme.fg("accent.teal") + BOLD + k + theme.reset;
}

/** An empty-state or teaching line: dim prose around teal key names. `parts` alternate freely. */
function teachLine(theme: Theme, ...parts: Array<string | { key: string }>): string {
  const dim = theme.fg("text.secondary");
  return parts.map((part) => (typeof part === "string" ? dim + part + theme.reset : keyName(part.key, theme))).join("");
}

/** System box body: the status bar's three facts with the detail the bar has no room for — who
 * serves the brain, the spend gauge with what is left, the fleet count, the memory size — plus one
 * warn row when the brain read was a cached snapshot because an MCP server held the lock (6.5.5).
 * Four rows, five when cached; the box claims exactly that. */
function buildSistemaBody(d: OverviewData, atLabel: string | null, contentW: number, theme: Theme): string[] {
  const ok = theme.fg("semantic.ok");
  const warnC = theme.fg("semantic.warn");
  const dim = theme.fg("text.secondary");
  const muted = theme.fg("text.muted");
  const primary = theme.fg("text.primary");
  const reset = theme.reset;

  const up = d.brain.state === "up";
  const brainState = (up ? BOLD + ok : warnC) + d.brain.state.toUpperCase() + reset;
  const served = d.brain.servedBy ? muted + "  " + d.brain.servedBy + reset : "";
  const brainLine = labelCell("brain", theme) + brainState + served;

  // Zero spend is a state, not a missing number: say so instead of drawing $0.00 beside an empty bar.
  const suffix = d.spend.mtd > 0
    ? `$${d.spend.mtd.toFixed(2)} · $${d.spend.remaining.toFixed(2)} left`
    : `none · $${d.spend.cap} cap`;
  const gaugeW = Math.max(8, contentW - 8 - 1 - displayWidth(suffix));
  const spendLine = labelCell("spend", theme) + gauge({ value: d.spend.mtd, max: d.spend.cap, width: gaugeW, suffix }, theme);

  const online = d.fleet.online === d.fleet.total ? ok : warnC;
  const fleetLine =
    labelCell("fleet", theme) + primary + `${d.fleet.online}/${d.fleet.total} ` + reset + online + "online" + reset;

  const memLine =
    labelCell("memory", theme) +
    theme.fg("memory.violet") + `${d.memory.learnings} ` + reset + dim + "learnings · " + reset +
    primary + `${d.memory.sessions} ` + reset + dim + "sessions" + reset;

  const rows = [brainLine, spendLine, fleetLine, memLine];
  if (d.brain.cached) {
    rows.push(labelCell("cached", theme) + warnC + (atLabel ?? "now") + reset + muted + ` · lock held by ${d.brain.servedBy || "mcp"}` + reset);
  }
  return rows;
}

/** One home "latest memories" row from a real learning: violet bullet + text + dim source
 * (project). No fabricated score — `memory recent` carries none. Text that does not fit ends in
 * an ellipsis rather than mid-word. */
function formatOverviewMemoryRow(l: MemoryLearning, contentW: number, theme: Theme): string {
  const violet = theme.fg("memory.violet");
  const primary = theme.fg("text.primary");
  const dim = theme.fg("text.secondary");
  const reset = theme.reset;

  const glyph = theme.glyph("badgeDot");
  const sourceW = 12;
  const gapW = 2;
  const bulletW = 2;
  const textW = Math.max(0, contentW - bulletW - gapW - sourceW);
  const src = l.project || l.date || "";

  const textCell = padTo(ellipsize(oneLine(l.text), textW), textW);
  const sourceCell = " ".repeat(gapW) + padTo(truncate(src, sourceW), sourceW, "right");
  return violet + glyph + " " + reset + primary + textCell + reset + dim + sourceCell + reset;
}

/** Collapse a possibly multi-line learning into a single display line. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Home. Top to bottom: the block wordmark when there is room for it; the first-run cue when
 * there is nothing yet; a band with active sessions (what you came to check) beside the system
 * detail, each claiming the height its content needs; and the latest memories taking every row
 * that is left, because they are the one thing here you cannot read off a shell prompt.
 */
function buildOverviewView(o: OverviewSlice, sessions: SessionsSlice, focused: string, rect: Rect, theme: Theme): string[] {
  const cols = rect.width;
  const blank = " ".repeat(cols);
  const out: string[] = [];

  // The wordmark is the right thing to show once, on a screen with room for it. On a compact
  // terminal it would take a fifth of the view from the content; the compact wordmark in the
  // status bar carries the identity there.
  const wmBlock = rect.height >= 24
    ? [...wordmark({ variant: "block" }, theme).map((line) => centerLine(line, cols)), blank]
    : [];

  // No data yet: a single status line where the panels would be (never a spinner-forever).
  if (!o.data) {
    out.push(...wmBlock);
    const msg =
      o.status === "error"
        ? theme.fg("semantic.error") + `error: ${o.error ?? "querying ebrain status"}` + theme.reset
        : theme.fg("text.secondary") + "loading system status…" + theme.reset;
    while (out.length < Math.floor(rect.height / 2)) out.push(blank);
    out.push(centerLine(msg, cols));
    while (out.length < rect.height) out.push(blank);
    return out.slice(0, rect.height);
  }

  // First-run "start here" cue: brain is up but there is nothing to show yet (no live sessions,
  // no saved memories). One understated line names the first keys to try, so a brand-new user is
  // never staring at empty boxes with no next step.
  const firstRun = o.data.brain.state === "up" && sessions.rows.length === 0 && (o.memory?.learnings?.length ?? 0) === 0;
  const cue = firstRun
    ? [centerLine(teachLine(theme, "start here · ", { key: "l" }, " launch · ", { key: "4" }, " then ", { key: "a" }, " add workspace · ", { key: "5" }, " then ", { key: "r" }, " save memory"), cols)]
    : [];

  // The band. The system box is as tall as its rows; the sessions box grows with its list up to
  // the point where the memories below would fall under three rows.
  const systemW = cols >= 100 ? 48 : 44;
  const [sessionsRect, systemRect] = splitH({ top: 0, left: 0, width: cols, height: 1 }, [{ flex: 1 }, systemW], 1);
  const systemBody = buildSistemaBody(o.data, o.atLabel, Math.max(0, systemRect.width - 4), theme);
  const available = rect.height - wmBlock.length - cue.length;
  const memoriesMin = 5; // two borders + three rows
  const systemH = systemBody.length + 2;
  const sessionsWant = Math.max(1, sessions.rows.length) + 2;
  const bandH = Math.max(systemH, Math.min(sessionsWant, Math.max(systemH, available - memoriesMin)));
  const bandRoom = bandH - 2;

  const rowW = Math.max(8, sessionsRect.width - 4);
  const sSel = clampIndex(sessions.selected, Math.max(1, sessions.rows.length));
  let sessionBody: string[];
  if (sessions.rows.length === 0) {
    sessionBody = [teachLine(theme, "none · press ", { key: "l" }, " to launch")];
  } else {
    const shown = sessions.rows.length > bandRoom ? Math.max(1, bandRoom - 1) : sessions.rows.length;
    sessionBody = sessions.rows.slice(0, shown).map((r, i) => {
      const row = renderFleetRow(r, rowW, i === sSel, theme);
      return focused === "sessions" && i === sSel ? highlightRow(padTo(row, rowW), theme) : row;
    });
    if (shown < sessions.rows.length) {
      sessionBody.push(teachLine(theme, `+${sessions.rows.length - shown} more · `, { key: "3" }, " for every session"));
    }
  }
  const sessionsPanel = panel(
    { title: `active sessions · ${sessions.rows.length}`, focus: focused === "sessions", width: sessionsRect.width, height: bandH, body: sessionBody },
    theme,
  );
  const systemPanel = panel(
    { title: "system", focus: focused === "system", width: systemRect.width, height: bandH, body: systemBody },
    theme,
  );

  out.push(...wmBlock, ...cue);
  for (let i = 0; i < bandH; i++) out.push((sessionsPanel[i] ?? "") + " " + (systemPanel[i] ?? ""));

  // Memories take the rest: as many learnings as fit, ellipsized rather than cut mid-word.
  const memH = rect.height - out.length;
  if (memH >= 3) {
    const learnings = o.memory?.learnings ?? [];
    const mSel = clampIndex(o.memSelected, Math.max(1, learnings.length));
    const memW = Math.max(0, cols - 4);
    const memoriesBody =
      learnings.length > 0
        ? learnings.slice(0, memH - 2).map((l, i) => {
            const row = formatOverviewMemoryRow(l, memW, theme);
            return focused === "memories" && i === mSel ? highlightRow(padTo(row, memW), theme) : row;
          })
        : [teachLine(theme, "no recent memories · press ", { key: "5" }, " then ", { key: "r" }, " to save one")];
    out.push(
      ...panel(
        { title: "latest memories", focus: focused === "memories", width: cols, height: memH, body: memoriesBody },
        theme,
      ),
    );
  }

  while (out.length < rect.height) out.push(blank);
  return out.slice(0, rect.height);
}

// ---------------------------------------------------------------------------
// Sessions view (F6.4.3) — reproduces screens-a.jsx's SessionsScreen: a focused
// "fleet · N sesiones" Panel wrapping a ScrollList of live tmux sessions (Badge +
// name + uptime) on the left, and a live TerminalPeek of the selected session on the
// right. It renders PURELY from the sessions slice — the impure loop (runUi) refreshes
// that slice and throttles the peek to ≤1Hz (sessions/peek.ts).
// ---------------------------------------------------------------------------

const SESSIONS_LEFT_MAX = 46; // mockup: Panel width="46ch"

function scrollOffset(selected: number, height: number, count: number): number {
  if (count <= height) return 0;
  const half = Math.floor(height / 2);
  return Math.max(0, Math.min(selected - half, count - height));
}

function renderFleetRow(it: SessionListItem, width: number, sel: boolean, theme: Theme): string {
  const reset = theme.reset;
  // mockup renderItem: [Badge 11ch][name flex: text-1 bold if sel else text-2][uptime text-3].
  const badgeCell = padTo(badge({ agent: it.agent as AgentName }, theme), 11);
  const uptimeW = displayWidth(it.uptime);
  const nameW = Math.max(0, width - 11 - 1 - uptimeW);
  const nameColor = sel ? theme.fg("text.primary") + BOLD : theme.fg("text.secondary");
  const displayName = it.workspaceLabel ? `${it.name} · ${it.workspaceLabel}` : it.name;
  const nameCell = nameColor + padTo(truncate(displayName, nameW), nameW) + reset;
  const uptimeCell = " " + theme.fg("text.muted") + it.uptime + reset;
  return badgeCell + nameCell + uptimeCell;
}

function buildCenteredMessagePanel(title: string, message: string, rect: Rect, theme: Theme): string[] {
  const contentW = Math.max(0, rect.width - 4);
  const bodyRows = Math.max(0, rect.height - 2);
  const mid = Math.floor(bodyRows / 2);
  const colored = theme.fg("text.secondary") + message + theme.reset;
  const body: string[] = [];
  for (let i = 0; i < bodyRows; i++) body.push(i === mid ? centerLine(colored, contentW) : "");
  return panel({ title, width: rect.width, height: rect.height, body }, theme);
}

export function buildSessionsView(s: SessionsSlice, rect: Rect, theme: Theme): string[] {
  const cols = rect.width;
  const height = rect.height;
  if (height <= 0) return [];

  if (s.status === "error") {
    return buildCenteredMessagePanel("sessions", `error: ${s.error ?? "tmux became unavailable"}`, rect, theme);
  }

  // Empty / status states — a single centered message panel (NEVER a spinner-forever).
  if (s.rows.length === 0) {
    const msg =
      s.status === "no-tmux"
        ? "tmux is not installed in this environment"
        : s.status === "loading" || s.status === "idle"
          ? "loading sessions…"
          : s.status === "error"
            ? `error: ${s.error ?? "querying tmux"}`
            : "no active sessions · press l to launch one";
    return buildCenteredMessagePanel("sessions", msg, rect, theme);
  }

  const leftW = Math.min(SESSIONS_LEFT_MAX, Math.max(24, Math.floor(cols * 0.42)));
  const [leftRect, rightRect] = splitH(
    { top: 0, left: 0, width: cols, height },
    [leftW, { flex: 1 }],
    2,
  );

  // Left: focused fleet ScrollList inside a Panel.
  const selected = Math.min(Math.max(0, s.selected), s.rows.length - 1);
  const listHeight = Math.max(1, height - 2); // minus panel borders
  const offset = scrollOffset(selected, listHeight, s.rows.length);
  const rowW = Math.max(8, leftRect.width - 4 - 3); // panel content − scrolllist marker(2)+scrollbar(1)
  const listBody = scrolllist(
    {
      items: s.rows,
      selected,
      height: listHeight,
      offset,
      renderItem: (it, idx) => renderFleetRow(it, rowW, idx === selected, theme),
    },
    theme,
  );
  const noun = s.rows.length === 1 ? "session" : "sessions";
  const leftPanel = panel(
    {
      title: `fleet · ${s.rows.length} ${noun}`,
      focus: true,
      width: leftRect.width,
      height,
      body: listBody,
    },
    theme,
  );

  // Right: live TerminalPeek of the selected session (foreign output → always dim border).
  const selRow = s.rows[selected]!;
  const peekBody =
    s.peek && s.peek.name === selRow.name
      ? tailLines(s.peek.text, Math.max(1, height - 2))
      : ["  (capturing output…)"];
  const rightPanel = terminalPeek(
    { title: `peek · ${selRow.name}`, live: true, width: rightRect.width, height, body: peekBody },
    theme,
  );

  const gap = " ".repeat(Math.max(0, cols - leftRect.width - rightRect.width));
  const out: string[] = [];
  for (let i = 0; i < height; i++) out.push((leftPanel[i] ?? "") + gap + (rightPanel[i] ?? ""));
  return out;
}

// ---------------------------------------------------------------------------
// Workspaces cockpit (F8.2) -- one validated directory registry, live tmux-derived
// activity, and a selected-directory detail. No shell command, output, or environment
// enters this view or its state.
// ---------------------------------------------------------------------------

function workspaceRow(candidate: WorkspaceSelection, active: WorkspaceSelection, width: number, selected: boolean, theme: Theme): string {
  const reset = theme.reset;
  const title = `${candidate.label}${candidate.cwd === active.cwd ? " · active" : ""}`;
  const text = `${title}  ${candidate.cwd}`;
  return (selected ? theme.fg("text.primary") + BOLD : theme.fg("text.secondary")) + truncate(text, width) + reset;
}

function activityRow(activity: WorkspaceActivity, width: number, selected: boolean, theme: Theme): string {
  const reset = theme.reset;
  const label = activity.label ?? "unregistered directory";
  const count = `${activity.sessions.length} active`;
  const countW = displayWidth(count);
  const nameW = Math.max(1, width - countW - 2);
  const name = activity.label ? label : `${label} · ${activity.cwd || "unknown"}`;
  const color = selected ? theme.fg("text.primary") + BOLD : theme.fg("text.secondary");
  return color + padTo(truncate(name, nameW), nameW) + reset + "  " + theme.fg("text.muted") + count + reset;
}

function workspacePanelBody(
  workspace: WorkspaceSlice,
  candidates: WorkspaceSelection[],
  focused: boolean,
  height: number,
  width: number,
  theme: Theme,
): string[] {
  if (workspace.status === "loading" && candidates.length === 0) return [theme.fg("text.secondary") + "validating workspace registry..." + theme.reset];
  if (candidates.length === 0) return [theme.fg("text.secondary") + "no validated workspaces · press a to add one" + theme.reset];
  const selected = clampIndex(workspace.selected, candidates.length);
  const room = Math.max(1, height - 2);
  const offset = scrollOffset(selected, room, candidates.length);
  const rowW = Math.max(8, width - 4 - 3);
  return scrolllist({
    items: candidates,
    selected,
    height: room,
    offset,
    renderItem: (candidate, index) => workspaceRow(candidate, workspace.active, rowW, focused && index === selected, theme),
  }, theme);
}

function workspaceActivityBody(
  workspace: WorkspaceSlice,
  sessions: SessionsSlice,
  focused: boolean,
  height: number,
  width: number,
  theme: Theme,
): string[] {
  const activity = workspaceActivity(workspace, sessions.rows);
  if (activity.length === 0) return [theme.fg("text.secondary") + "no workspace activity yet" + theme.reset];
  const selected = clampIndex(workspace.activitySelected, activity.length);
  const room = Math.max(1, height - 2);
  const offset = scrollOffset(selected, room, activity.length);
  const rowW = Math.max(8, width - 4 - 3);
  return scrolllist({
    items: activity,
    selected,
    height: room,
    offset,
    renderItem: (entry, index) => activityRow(entry, rowW, focused && index === selected, theme),
  }, theme);
}

function workspaceDetailBody(workspace: WorkspaceSlice, sessions: SessionsSlice, width: number, theme: Theme): string[] {
  const candidates = workspaceCandidatesFromSlice(workspace);
  const selected = candidates[clampIndex(workspace.selected, candidates.length)];
  if (!selected) return [theme.fg("text.secondary") + "select or register a workspace to inspect it" + theme.reset];
  const matching = sessions.rows.filter((session) => session.cwd === selected.cwd);
  const latestCreated = matching.map((session) => session.created).filter((created): created is string => Boolean(created)).sort().at(-1);
  const reset = theme.reset;
  const lines = [
    theme.fg("text.secondary") + "directory  " + reset + theme.fg("text.primary") + selected.cwd + reset,
    theme.fg("text.secondary") + "next launch " + reset + (selected.cwd === workspace.active.cwd ? theme.fg("semantic.ok") + "selected" : theme.fg("text.muted") + "not selected") + reset,
    theme.fg("text.secondary") + "active sessions  " + reset + theme.fg("text.primary") + String(matching.length) + reset,
    ...(latestCreated ? [theme.fg("text.secondary") + "latest active session  " + reset + theme.fg("text.muted") + latestCreated + reset] : []),
  ];
  for (const session of matching.slice(0, 2)) lines.push(theme.fg("text.muted") + `· ${session.name}` + reset);
  if (matching.length > 2) lines.push(theme.fg("text.muted") + `+${matching.length - 2} more active session${matching.length === 3 ? "" : "s"}` + reset);
  return lines.map((line) => truncate(line, Math.max(1, width - 4)));
}

function buildWorkspacesView(workspace: WorkspaceSlice, sessions: SessionsSlice, focused: string, rect: Rect, theme: Theme): string[] {
  const candidates = workspaceCandidatesFromSlice(workspace);
  const registryTitle = `workspaces · ${workspace.data?.workspaces.length ?? 0} registered`;
  const renderRegistry = (box: Rect): string[] => panel({
    title: registryTitle,
    focus: focused === "registry",
    width: box.width,
    height: box.height,
    body: workspacePanelBody(workspace, candidates, focused === "registry", box.height, box.width, theme),
  }, theme);
  const renderActivity = (box: Rect): string[] => panel({
    title: `live activity · ${sessions.rows.length}`,
    focus: focused === "activity",
    width: box.width,
    height: box.height,
    body: workspaceActivityBody(workspace, sessions, focused === "activity", box.height, box.width, theme),
  }, theme);
  const renderDetail = (box: Rect): string[] => panel({
    title: "selected workspace",
    focus: focused === "detail",
    width: box.width,
    height: box.height,
    body: [
      ...workspaceDetailBody(workspace, sessions, box.width, theme),
      ...(workspace.error ? [theme.fg("semantic.error") + workspace.error + theme.reset] : []),
    ],
  }, theme);

  const out: string[] = [];
  // 100 columns still leaves two 49-column panels after the divider. That is enough to keep
  // the primary desktop cockpit hierarchy; the 80-column minimum remains intentionally stacked.
  if (rect.width >= 100) {
    const [topRect, detailRect] = splitV(rect, [{ flex: 3 }, { flex: 2 }], 1);
    const [registryRect, activityRect] = splitH(topRect, [{ flex: 1 }, { flex: 1 }], 2);
    const registry = renderRegistry(registryRect);
    const live = renderActivity(activityRect);
    const gap = " ".repeat(Math.max(0, topRect.width - registryRect.width - activityRect.width));
    for (let index = 0; index < topRect.height; index += 1) out.push((registry[index] ?? "") + gap + (live[index] ?? ""));
    if (detailRect.top > topRect.top + topRect.height) out.push(" ".repeat(rect.width));
    out.push(...renderDetail(detailRect));
  } else {
    const [registryRect, activityRect, detailRect] = splitV(rect, [{ flex: 3 }, { flex: 2 }, { flex: 2 }], 1);
    out.push(...renderRegistry(registryRect));
    if (activityRect.top > registryRect.top + registryRect.height) out.push(" ".repeat(rect.width));
    out.push(...renderActivity(activityRect));
    if (detailRect.top > activityRect.top + activityRect.height) out.push(" ".repeat(rect.width));
    out.push(...renderDetail(detailRect));
  }
  while (out.length < rect.height) out.push(" ".repeat(rect.width));
  return out.slice(0, rect.height);
}

// ---------------------------------------------------------------------------
// Launch view (F6.4.5) — the "agente" grid of screens-a.jsx's LaunchScreen (the
// básico subset: pick an adapter, enter to launch; the RAM governor gates it). The
// full advisor wizard — task PromptBox + advisor panel + context preview — is F6.6.1.
// ---------------------------------------------------------------------------

const LAUNCH_COLS = 2;

/** Launchable adapters with their manifest RAM class (for the badge only; the governor
 * reads the AUTHORITATIVE class via readClass at launch time). The 6 adapters that have
 * a `launch:` command — route/free aren't tmux sessions. */
const LAUNCHABLE: Array<{ agent: AgentName; cls: "heavy" | "light" }> = [
  { agent: "claude", cls: "heavy" },
  { agent: "codex", cls: "heavy" },
  { agent: "gemini", cls: "light" },
  { agent: "opencode", cls: "heavy" },
  { agent: "cursor", cls: "heavy" },
  { agent: "generic", cls: "light" },
];

export interface TaskSetupOption {
  capability: Capability;
  label: string;
  description: string;
}

const TASK_SETUP_COPY: Record<Capability, Omit<TaskSetupOption, "capability">> = {
  coding: { label: "Coding", description: "Implement, test, debug, or refactor software." },
  agentic: { label: "Agentic systems", description: "Build tool-using agents, orchestration, or evaluation loops." },
  web_design: { label: "Web design", description: "Design interfaces, frontend components, pages, or product flows." },
  long_context: { label: "Long-context research", description: "Analyze, synthesize, or plan from substantial source material." },
  terminal: { label: "Terminal automation", description: "Automate developer tools, command-line workflows, or scripts." },
  general: { label: "General", description: "Use when work spans categories or you are still framing it." },
};

/** Fixed, user-readable categories. The shared CLI exports the capability identifiers so this
 * onboarding cannot drift from the profiles/targets contract. */
export const TASK_SETUP_OPTIONS: readonly TaskSetupOption[] = CAPABILITIES.map((capability) => ({ capability, ...TASK_SETUP_COPY[capability] }));

function taskSetupIndex(capability: Capability): number {
  const index = TASK_SETUP_OPTIONS.findIndex((option) => option.capability === capability);
  return index < 0 ? TASK_SETUP_OPTIONS.length - 1 : index;
}

function wizardCapabilityFor(wizard: LaunchWizard, capability: Capability): string {
  const available = selectedWizardProfile(wizard)?.capabilities ?? [];
  return available.includes(capability) ? capability : (available[0] ?? capability);
}

/** Apply the explicit transient setup without changing a user-owned profile. Any old preview is
 * invalid because the capability and/or reviewed prompt may have changed. */
function applyTaskSetup(launch: LaunchSlice, capability: Capability, task: string): LaunchSlice {
  const wizard = launch.wizard
    ? { ...launch.wizard, capability: wizardCapabilityFor(launch.wizard, capability), plan: null }
    : null;
  return { ...launch, task, taskCapability: capability, workflowId: undefined, wizard, status: "ready", error: undefined };
}

function resetTaskSetup(launch: LaunchSlice): LaunchSlice {
  return applyTaskSetup(launch, "general", "");
}

function buildLaunchView(launch: LaunchSlice, workspace: WorkspaceSelection, callerDisplayCwd: string, focused: string, rect: Rect, theme: Theme): string[] {
  const reset = theme.reset;
  const wizard = launch.wizard;
  const target = wizard ? selectedWizardTarget(wizard) : undefined;
  const selectedProfile = wizard ? selectedWizardProfile(wizard) : undefined;
  const selected = Math.min(Math.max(0, launch.selected), LAUNCHABLE.length - 1);
  // Context is deliberately summary-only here. It tells the user which bounded, reviewed packs
  // are available to the next launch without copying a pack body into terminal state or prompts.
  const contextPacks = launch.contexts?.packs.filter((pack) =>
    pack.scope === "operator" || (pack.scope === "workspace" && workspace.persistent && pack.workspaceId === workspace.id),
  ) ?? [];
  const contextLine = launch.contextStatus === "loading"
    ? "context packs loading..."
    : launch.contextStatus === "error"
      ? "context packs unavailable"
      : contextPacks.length === 0
        ? "context  no reviewed packs"
        : `context  ${contextPacks.map((pack) => `${pack.id} v${pack.version}`).join(" · ")}`;

  const manualPanel = (panelRect: Rect): string[] => {
    const contentW = Math.max(0, panelRect.width - 4);
    const colGap = 2;
    const cellW = Math.max(10, Math.floor((contentW - colGap) / LAUNCH_COLS));
    const grid: string[] = [];
    for (let row = 0; row < Math.ceil(LAUNCHABLE.length / LAUNCH_COLS); row++) {
      let line = "";
      for (let col = 0; col < LAUNCH_COLS; col++) {
        const index = row * LAUNCH_COLS + col;
        if (col > 0) line += " ".repeat(colGap);
        if (index >= LAUNCHABLE.length) {
          line += " ".repeat(cellW);
          continue;
        }
        const agent = LAUNCHABLE[index]!;
        const active = index === selected;
        const marker = active ? theme.fg("accent.teal") + "▸ " + reset : "  ";
        const clsColor = agent.cls === "heavy" ? theme.fg("semantic.warn") : theme.fg("text.muted");
        line += padTo(truncate(marker + badge({ agent: agent.agent }, theme) + "  " + clsColor + agent.cls + reset, cellW), cellW);
      }
      grid.push(line);
    }
    const selectedAgent = LAUNCHABLE[selected]!.agent;
    const body = [
      keyHint({ k: "g", label: "workspace" }, theme) + "  " + theme.fg("text.secondary") + truncate(workspaceDisplay(workspace, callerDisplayCwd), Math.max(0, contentW - 14)) + reset,
      theme.fg(launch.contextStatus === "error" ? "semantic.warn" : "text.muted") + truncate(contextLine, contentW) + reset,
      ...grid,
      theme.fg("text.muted") + (launch.task ? "Task will be sent to " : "New session with ") + reset + theme.fg("text.primary") + selectedAgent + reset,
    ];
    return panel({ title: "1 · manual agents", focus: focused === "agents", width: panelRect.width, height: panelRect.height, body }, theme);
  };

  const guidedPanel = (panelRect: Rect): string[] => {
    const contentW = Math.max(0, panelRect.width - 4);
    const body: string[] = [keyHint({ k: "w", label: "open guided launch" }, theme)];
    if (wizard) {
      body.push(theme.fg("text.secondary") + "target  " + reset + theme.fg("text.primary") + truncate(target?.id ?? "Unavailable", contentW - 8) + reset);
      body.push(theme.fg("text.secondary") + "profile " + reset + theme.fg("text.primary") + truncate(selectedProfile?.label ?? "Unavailable", contentW - 9) + reset + theme.fg("text.muted") + ` · ${wizard.capability}` + reset);
      if (wizard.plan) body.push(theme.fg("semantic.ok") + "Preview ready" + reset + theme.fg("text.muted") + ` · ${truncate(`${wizard.plan.model} · ${wizard.plan.costStatus}`, Math.max(0, contentW - 17))}` + reset);
      else body.push(theme.fg("text.muted") + "Open to review or change this configuration." + reset);
    } else if (launch.status === "loading") {
      body.push(spinner({ label: "loading launch options", active: true, frame: 1 }, theme));
    } else {
      body.push(theme.fg("text.muted") + "Choose target, profile, capability, and workspace." + reset);
    }
    if (launch.status === "error") body.push(theme.fg("semantic.error") + truncate(launch.error ?? "guided launch unavailable", contentW) + reset);
    return panel({ title: "2 · guided launch", focus: focused === "guided", width: panelRect.width, height: panelRect.height, body }, theme);
  };

  const taskPanel = (panelRect: Rect): string[] => {
    const contentW = Math.max(0, panelRect.width - 4);
    const option = TASK_SETUP_OPTIONS[taskSetupIndex(taskCapabilityOf(launch))]!;
    const body: string[] = [
      keyHint({ k: "t", label: "task setup" }, theme) + "  " + keyHint({ k: "r", label: "reset" }, theme),
      theme.fg("text.secondary") + "type  " + reset + theme.fg("text.primary") + option.label + reset,
      launch.task
        ? theme.fg("text.secondary") + "task  " + reset + theme.fg("text.primary") + truncate(launch.task, contentW - 6) + reset
        : theme.fg("text.muted") + "Choose a type, then add an optional task prompt." + reset,
    ];
    if (launch.workflowId) body.push(theme.fg("text.muted") + `workflow  ${truncate(launch.workflowId, contentW - 10)}` + reset);
    return panel({ title: "3 · task setup", focus: focused === "task", width: panelRect.width, height: panelRect.height, body }, theme);
  };

  // The priority changes at wide widths: manual launch gets the dominant left region. At the
  // supported compact minimum, panels stack but keep the full six-agent grid visible first.
  if (rect.width >= 100 && rect.height >= 18) {
    const [agentsRect, rightRect] = splitH(rect, [{ flex: 2 }, { flex: 1 }], 1);
    const [guidedRect, taskRect] = splitV(rightRect!, [{ flex: 1 }, { flex: 1 }], 1);
    const left = manualPanel(agentsRect!);
    const right = [...guidedPanel(guidedRect!), " ".repeat(rightRect!.width), ...taskPanel(taskRect!)];
    const gap = " ";
    return Array.from({ length: rect.height }, (_, index) => (left[index] ?? " ".repeat(agentsRect!.width)) + gap + (right[index] ?? " ".repeat(rightRect!.width)));
  }

  const [agentsRect, guidedRect, taskRect] = splitV(rect, [8, 4, { flex: 1 }], 1);
  return [
    ...manualPanel(agentsRect!),
    " ".repeat(rect.width),
    ...guidedPanel(guidedRect!),
    " ".repeat(rect.width),
    ...taskPanel(taskRect!),
  ];
}

// ---------------------------------------------------------------------------
// Memory view (F9.2) — governed recall records, human context metadata, reviewed procedures,
// and legacy session summaries during the fixture-only migration window. Every passive source is
// summary-only; body retrieval remains an explicit bounded CLI action.
// ---------------------------------------------------------------------------

/** MM-DD HH:MM from an ISO ts, by pure slicing (no Date — buildFrame stays pure). */
function fmtLogTs(ts: string): string {
  const date = ts.length >= 10 ? ts.slice(5, 10) : ts; // "07-14"
  const time = ts.length >= 16 ? ts.slice(11, 16) : ""; // "12:45"
  return (date + " " + time).trim();
}

function renderLearningRow(l: MemoryLearning, width: number, sel: boolean, theme: Theme): string {
  const reset = theme.reset;
  const violet = theme.fg("memory.violet");
  const dot = theme.glyph("badgeDot");
  const srcW = 12;
  const gap = 2;
  const textW = Math.max(0, width - 2 - gap - srcW);
  const textColor = sel ? theme.fg("text.primary") + BOLD : theme.fg("text.secondary");
  const src = l.project || l.date || "";
  const textCell = textColor + padTo(truncate(oneLine(l.text), textW), textW) + reset;
  const srcCell = " ".repeat(gap) + theme.fg("text.muted") + padTo(truncate(src, srcW), srcW, "right") + reset;
  return violet + dot + " " + reset + textCell + srcCell;
}

function renderEpisodeRow(e: NonNullable<EpisodesData>["episodes"][number], width: number, sel: boolean, theme: Theme): string {
  const reset = theme.reset;
  const violet = theme.fg("memory.violet");
  const dot = theme.glyph("badgeDot");
  const meta = `${e.source} · ${e.chars} chars`;
  const metaW = Math.min(20, Math.max(10, Math.floor(width * 0.36)));
  const labelW = Math.max(0, width - 2 - metaW);
  const label = `${e.kind === "session-summary" ? "summary" : "learning"} · ${e.project}`;
  const text = (sel ? theme.fg("text.primary") + BOLD : theme.fg("text.secondary")) +
    padTo(truncate(label, labelW), labelW) + reset;
  return violet + dot + " " + reset + text + theme.fg("text.muted") + padTo(truncate(meta, metaW), metaW, "right") + reset;
}

function renderContextRow(pack: NonNullable<ContextPacksData>["packs"][number], width: number, theme: Theme): string {
  const reset = theme.reset;
  const scope = pack.scope === "operator" ? "operator" : `workspace ${pack.workspaceId ?? ""}`.trim();
  return theme.fg("accent.teal") + theme.glyph("badgeDot") + " " + reset +
    theme.fg("text.secondary") + truncate(`${scope} · v${pack.version}`, Math.max(0, width - 2)) + reset;
}

/** One federated-search result row (source · score · slug -- snippet). The selection
 * cursor/scrollbar are applied by scrolllist; this only colors the content (G56-F3). */
function renderSearchRow(r: SearchResult, width: number, sel: boolean, theme: Theme): string {
  const reset = theme.reset;
  const textColor = sel ? theme.fg("text.primary") + BOLD : theme.fg("text.secondary");
  return textColor + truncate(`${r.source} [${r.score.toFixed(3)}] ${r.slug} -- ${r.snippet}`, width) + reset;
}

function renderLogRow(s: MemorySession, width: number, theme: Theme): string {
  const reset = theme.reset;
  const ts = theme.fg("text.muted") + padTo(fmtLogTs(s.ts), 11) + reset;
  const b = badge({ agent: s.agent as AgentName, label: oneLine(s.summary) }, theme);
  return truncate(ts + " " + b, width);
}

function renderProcedureRow(w: ProcedureSummaryData, width: number, sel: boolean, theme: Theme): string {
  const reset = theme.reset;
  const tone = theme.fg("accent.teal");
  const meta = `${w.state} · ${w.useCount} uses${w.skillified ? " · skill" : ""}`;
  // Reserve enough room at normal widths for state, explicit use evidence, and derived skill
  // presence. Compact terminals may truncate metadata, but Recall remains the priority there.
  const metaW = Math.min(23, Math.max(10, width - 13));
  const titleW = Math.max(0, width - 3 - metaW);
  const title = (sel ? theme.fg("text.primary") + BOLD : theme.fg("text.secondary")) +
    padTo(truncate(w.title, titleW), titleW) + reset;
  return tone + theme.glyph("badgeDot") + " " + reset + title + theme.fg("text.muted") +
    " " + padTo(truncate(meta, metaW), metaW, "right") + reset;
}

export function buildMemoryView(m: MemorySlice, focused: string, rect: Rect, theme: Theme, searchDraft?: LineState): string[] {
  const cols = rect.width;
  const height = rect.height;
  if (height <= 0) return [];

  if (!m.data) {
    const msg =
      m.status === "error" ? `error: ${m.error ?? "querying memory"}` : "loading memory…";
    return buildCenteredMessagePanel("memory", msg, rect, theme);
  }

  const learnings = m.data.learnings;
  const episodes = m.episodes?.episodes ?? [];
  const recall = recallRows(m);
  const procedures = procedureRows(m);
  const contexts = m.contexts?.packs ?? [];
  const sessions = m.data.sessions;
  const [, midRect] = splitV(rect, [1, { flex: 1 }]);

  const out: string[] = [];

  // Search stays on the `ebrain q --json` contract; no direct memory/daemon reads here. While the
  // `s` composer is open it edits THIS bar in place: one search field on screen, not a second one
  // floating over the first.
  const editing = searchDraft != null;
  out.push(
    padTo(
      promptBox(
        {
          value: editing ? searchDraft.text : m.search?.query ?? "",
          focus: editing,
          placeholder: "shared memory search",
          hint: editing ? "enter search · esc cancel" : "s search",
          width: cols,
        },
        theme,
      ),
      cols,
    ),
  );

  // Recall stays dominant. Context has no focus because it is metadata only; Procedures and
  // legacy session logs remain the two selectable support collections.
  const rightW = Math.min(50, Math.max(30, Math.floor(cols * 0.42)));
  const [leftRect, rightRect] = splitH({ top: 0, left: 0, width: cols, height: midRect.height }, [{ flex: 1 }, rightW], 2);

  const selected = clampIndex(m.selected, Math.max(1, recall.length));
  const listHeight = Math.max(1, midRect.height - 2);
  const offset = scrollOffset(selected, listHeight, recall.length);
  const rowW = Math.max(8, leftRect.width - 4 - 3);
  const searchResults = m.search?.results ?? [];
  const searchSel = clampIndex(m.searchSelected, Math.max(1, searchResults.length));
  const searchOff = scrollOffset(searchSel, listHeight, searchResults.length);
  const resultsBody =
    m.searchStatus === "error"
      ? [theme.fg("semantic.error") + `error: ${m.searchError ?? "search failed"}` + theme.reset]
      : m.search
        ? searchResults.length > 0
          // Search results carry their OWN selection cursor (G56-F3): the highlighted row is
          // exactly the one Enter opens, so the panel never renders one row and opens another.
          ? scrolllist(
              {
                items: searchResults,
                selected: searchSel,
                height: listHeight,
                offset: searchOff,
                renderItem: (r, idx) => renderSearchRow(r, rowW, idx === searchSel, theme),
              },
              theme,
            )
          : [theme.fg("text.secondary") + "no search results" + theme.reset]
        : recall.length > 0
      ? scrolllist(
          {
            items: recall,
            selected,
            height: listHeight,
            offset,
            renderItem: (row, idx) => row.kind === "episode"
              ? renderEpisodeRow(row.episode, rowW, idx === selected, theme)
              : renderLearningRow(row.learning, rowW, idx === selected, theme),
          },
          theme,
        )
      : [theme.fg("text.secondary") + "no memories yet · press r to save one" + theme.reset];
  const leftPanel = panel(
    { title: m.search ? `search results · ${searchResults.length}` : `recall · ${episodes.length} episodes · ${learnings.length} learnings`, focus: focused === "results", width: leftRect.width, height: midRect.height, body: resultsBody },
    theme,
  );

  const contextHeight = rightRect.height >= 13 ? 5 : 4;
  const [contextRect, procedureRect, logsRect] = splitV(rightRect, [contextHeight, { flex: 1 }, { flex: 1 }], 1);
  const contextW = Math.max(8, contextRect.width - 4);
  const contextRoom = Math.max(1, contextRect.height - 2);
  const contextBody = contexts.length > 0
    ? contexts.slice(0, contextRoom).map((pack) => renderContextRow(pack, contextW, theme))
    : [theme.fg("text.secondary") + "no packs · ebrain context" + theme.reset];
  const contextsPanel = panel(
    { title: `context · ${contexts.length}`, focus: false, width: contextRect.width, height: contextRect.height, body: contextBody },
    theme,
  );

  const procedureW = Math.max(8, procedureRect.width - 4);
  const workflowSel = clampIndex(m.workflowSelected, Math.max(1, procedures.length));
  const procedureRoom = Math.max(1, procedureRect.height - 2);
  const procedureOff = scrollOffset(workflowSel, procedureRoom, procedures.length);
  const proceduresBody =
    procedures.length > 0
      ? procedures.slice(procedureOff, procedureOff + procedureRoom).map((procedure, i) => {
          const isSelected = focused === "procedures" && procedureOff + i === workflowSel;
          const row = renderProcedureRow(procedure, procedureW, isSelected, theme);
          return isSelected ? highlightRow(padTo(row, procedureW), theme) : row;
        })
      : [theme.fg("text.secondary") + "none · ebrain procedures" + theme.reset];
  const proceduresPanel = panel(
    { title: `procedures · ${procedures.length}`, focus: focused === "procedures", width: procedureRect.width, height: procedureRect.height, body: proceduresBody },
    theme,
  );

  const logW = Math.max(8, logsRect.width - 4);
  const logSel = clampIndex(m.logSelected, Math.max(1, sessions.length));
  const logRoom = Math.max(1, logsRect.height - 2);
  const logOff = scrollOffset(logSel, logRoom, sessions.length);
  const logsBody =
    sessions.length > 0
      ? sessions.slice(logOff, logOff + logRoom).map((s, i) => {
          const row = renderLogRow(s, logW, theme);
          return focused === "logs" && logOff + i === logSel ? highlightRow(padTo(row, logW), theme) : row;
        })
      : [theme.fg("text.secondary") + "no sessions" + theme.reset];
  const rightPanel = panel(
    { title: `legacy session logs · ${sessions.length}`, focus: focused === "logs", width: logsRect.width, height: logsRect.height, body: logsBody },
    theme,
  );

  const rightRows = [
    ...contextsPanel,
    " ".repeat(rightRect.width),
    ...proceduresPanel,
    " ".repeat(rightRect.width),
    ...rightPanel,
  ];
  const gap = " ".repeat(Math.max(0, cols - leftRect.width - rightRect.width));
  for (let i = 0; i < midRect.height; i++) {
    const right = rightRows[i] ?? " ".repeat(rightRect.width);
    out.push((leftPanel[i] ?? "") + gap + right);
  }

  while (out.length < height) out.push(" ".repeat(cols));
  return out.slice(0, height);
}

// ---------------------------------------------------------------------------
// Routing view (F6.6A) — consumes `routing --json`: per-capability spend plus the
// OpenRouter winner/fallback/floor chains as operable rows. The TUI still never reads
// routing.yaml/spend.jsonl directly.
// ---------------------------------------------------------------------------

function costStatusLabel(status: "metered" | "token-only" | "untracked"): string {
  return status === "metered" ? "metered" : status === "token-only" ? "token-only" : "untracked";
}

function costBreakdownRows(rows: { key: string; usd: number; events: number; tokensIn: number; tokensOut: number; tokenOnlyEvents: number; untrackedEvents: number }[], width: number, theme: Theme): string[] {
  if (rows.length === 0) return [theme.fg("text.secondary") + "no attributed events" + theme.reset];
  return rows.slice(0, Math.max(1, Math.floor(width / 8))).map((row) => {
    const status = row.usd > 0 ? `$${row.usd.toFixed(4)}` : row.tokenOnlyEvents > 0 ? `${row.tokensIn + row.tokensOut} tok` : "untracked";
    const leftW = Math.max(8, width - 14);
    return theme.fg("text.secondary") + padTo(truncate(row.key, leftW), leftW) + theme.reset +
      theme.fg("text.muted") + padTo(status, 14, "right") + theme.reset;
  });
}

/** Cost ledger subview inside Routing: known metered USD, token-only and untracked data
 * stay visually distinct. It consumes only `ebrain cost --json`. */
export function buildCostView(c: CostData, selectedIndex: number, rect: Rect, theme: Theme): string[] {
  const cols = rect.width;
  const height = rect.height;
  const rightW = Math.min(42, Math.max(28, Math.floor(cols * 0.36)));
  const [leftRect, rightRect] = splitH({ top: 0, left: 0, width: cols, height }, [{ flex: 1 }, rightW], 2);
  const selected = clampIndex(selectedIndex, Math.max(1, c.providers.length));
  const providerRows = c.providers.map((provider) => ({
    provider: provider.provider,
    status: costStatusLabel(provider.status),
    usd: provider.usd > 0 ? "$" + provider.usd.toFixed(4) : "--",
    tokens: `${provider.tokensIn}+${provider.tokensOut}`,
  }));
  const leftBody = table(
    {
      columns: [
        { key: "provider", label: "provider", width: 15 },
        { key: "status", label: "mode", width: 13 },
        { key: "usd", label: "known", width: 10, align: "right" },
        { key: "tokens", label: "tokens", width: 12, align: "right" },
      ],
      rows: providerRows,
      selected,
    },
    theme,
  );
  leftBody.push("");
  leftBody.push(theme.fg("text.muted") + "known all  " + theme.reset + theme.fg("text.primary") + `$${c.knownMtd.toFixed(4)}` + theme.reset);
  leftBody.push(theme.fg("text.muted") + "OpenRouter  " + theme.reset + spendTone(c.openrouterMtd, c.budget.monthlyUsd, theme) + `$${c.openrouterMtd.toFixed(4)}` + theme.reset + theme.fg("text.muted") + ` / $${c.budget.monthlyUsd.toFixed(2)}` + theme.reset);
  leftBody.push(theme.fg("text.muted") + `cap scope: ${c.budget.scope}; token-only/untracked are not USD` + theme.reset);
  const leftPanel = panel(
    { title: `cost ledger · ${c.month}`, focus: true, width: leftRect.width, height, body: leftBody },
    theme,
  );

  const [modelRect, workflowRect, sessionRect] = splitV(rightRect, [{ flex: 1 }, { flex: 1 }, { flex: 1 }], 1);
  const modelAgentRows = [
    ...c.models.map((row) => ({ ...row, key: `model · ${row.key}` })),
    ...c.agents.map((row) => ({ ...row, key: `agent · ${row.key}` })),
  ];
  const modelPanel = panel(
    { title: `models + agents · ${modelAgentRows.length}`, width: modelRect.width, height: modelRect.height, body: costBreakdownRows(modelAgentRows, Math.max(8, modelRect.width - 4), theme) },
    theme,
  );
  const workflowPanel = panel(
    { title: `workflows · ${c.workflows.length}`, width: workflowRect.width, height: workflowRect.height, body: costBreakdownRows(c.workflows, Math.max(8, workflowRect.width - 4), theme) },
    theme,
  );
  const sessionPanel = panel(
    { title: `sessions · ${c.sessions.length}`, width: sessionRect.width, height: sessionRect.height, body: costBreakdownRows(c.sessions, Math.max(8, sessionRect.width - 4), theme) },
    theme,
  );
  const gap = " ".repeat(Math.max(0, cols - leftRect.width - rightRect.width));
  const out: string[] = [];
  for (let i = 0; i < height; i++) {
    const workflowStart = modelRect.height + 1;
    const sessionStart = workflowStart + workflowRect.height + 1;
    const right = i < modelRect.height
      ? modelPanel[i] ?? ""
      : i === modelRect.height || i === workflowStart + workflowRect.height
        ? " ".repeat(rightRect.width)
        : i < sessionStart
          ? workflowPanel[i - workflowStart] ?? ""
          : sessionPanel[i - sessionStart] ?? "";
    out.push((leftPanel[i] ?? "") + gap + right);
  }
  return out;
}

export function buildRoutingView(r: RoutingSlice, rect: Rect, theme: Theme): string[] {
  const cols = rect.width;
  const height = rect.height;
  if (height <= 0) return [];

  if (r.mode === "cost") {
    if (!r.cost) {
      const msg = r.status === "error" ? `error: ${r.error ?? "querying cost"}` : "loading cost ledger…";
      return buildCenteredMessagePanel("cost", msg, rect, theme);
    }
    return buildCostView(r.cost, r.costSelected, rect, theme);
  }

  if (!r.data) {
    const msg = r.status === "error" ? `error: ${r.error ?? "querying spend"}` : "loading spend…";
    return buildCenteredMessagePanel("routing", msg, rect, theme);
  }

  const d = r.data;
  const rightW = Math.min(42, Math.max(28, Math.floor(cols * 0.36)));
  const [leftRect, rightRect] = splitH({ top: 0, left: 0, width: cols, height }, [{ flex: 1 }, rightW], 2);

  // Left: per-capability spend table + total line.
  const selected = clampIndex(r.selected, Math.max(1, d.capabilities.length));
  // Only factual, provider-reported MTD spend is shown — no undated cost estimate (G56-F8).
  const rows = d.capabilities.map((c) => ({
    cap: c.capability,
    routes: String(c.routes),
    mtd: "$" + c.mtd.toFixed(3),
  }));
  const tableRows = table(
    {
      columns: [
        { key: "cap", label: "capability", width: 18 },
        { key: "routes", label: "routes", width: 8, align: "right" },
        { key: "mtd", label: "mtd", width: 10, align: "right" },
      ],
      rows,
      selected,
    },
    theme,
  );
  const totalLine =
    theme.fg("text.muted") + "total today  " + theme.reset +
    spendTone(d.mtd, d.cap, theme) + "$" + d.mtd.toFixed(3) + theme.reset +
    theme.fg("text.muted") + " / $" + d.cap.toFixed(2) + theme.reset;
  const leftBody = [...tableRows, "", totalLine];
  const leftPanel = panel(
    { title: "OpenRouter caps · spend", focus: true, width: leftRect.width, height, body: leftBody },
    theme,
  );

  // Right: budget gauge + selected capability chain.
  const selectedCap = d.capabilities[selected];
  const budgetBody: string[] = [];
  budgetBody.push(gauge({ value: d.mtd, max: d.cap, width: Math.max(8, rightRect.width - 6), suffix: "", tone: "auto" }, theme));
  budgetBody.push("");
  budgetBody.push(theme.fg("text.secondary") + "remaining  " + theme.fg("text.primary") + "$" + d.remaining.toFixed(2) + theme.reset);
  budgetBody.push(
    theme.fg("text.secondary") + "hard-stop " +
      (d.hardStop ? theme.fg("semantic.ok") + "yes" : theme.fg("semantic.warn") + "no") + theme.reset,
  );
  if (d.gbrainUntracked) {
    budgetBody.push("");
    budgetBody.push(theme.fg("semantic.warn") + theme.glyph("badgeDot") + " gbrain: untracked spend" + theme.reset);
  }
  if (selectedCap) {
    budgetBody.push("");
    budgetBody.push(theme.fg("text.primary") + selectedCap.capability + theme.reset);
    for (const m of selectedCap.models.slice(0, 3)) {
      const tone = m.role === "winner" ? "semantic.ok" : m.role === "floor" ? "text.muted" : "text.secondary";
      // Only factual, slug/chain-derived flags — no price snapshot (G56-F8).
      const tag = m.free ? " · free" : m.frontier ? " · frontier" : "";
      const slugW = Math.max(8, rightRect.width - 8 - displayWidth(tag) - 2);
      budgetBody.push(theme.fg(tone as any) + m.role.padEnd(8) + theme.reset + truncate(m.slug, slugW) + theme.fg("text.muted") + tag + theme.reset);
    }
    budgetBody.push("");
    budgetBody.push(theme.fg("text.secondary") + truncate(selectedCap.command, Math.max(10, rightRect.width - 4)) + theme.reset);
  }
  const rightPanel = panel(
    { title: `chain · ${d.month}`, width: rightRect.width, height, body: budgetBody },
    theme,
  );

  const gap = " ".repeat(Math.max(0, cols - leftRect.width - rightRect.width));
  const out: string[] = [];
  for (let i = 0; i < height; i++) out.push((leftPanel[i] ?? "") + gap + (rightPanel[i] ?? ""));
  return out;
}

/** Spend color by fraction of cap (mirrors gauge auto thresholds: 75% warn, 90% error). */
function spendTone(mtd: number, cap: number, theme: Theme): string {
  const frac = cap > 0 ? mtd / cap : 0;
  if (frac >= 0.9) return theme.fg("semantic.error");
  if (frac >= 0.75) return theme.fg("semantic.warn");
  return theme.fg("text.primary");
}

// ---------------------------------------------------------------------------
// Doctor view (F6.5.4) — screens-b.jsx's DoctorScreen wired to `doctor --json` +
// `fleet --json`: checks colorized by level (✓/!/✗, DS-sanctioned, ASCII fallback), a
// fleet side panel with each adapter's online state + RAM class, and `r` to re-run the
// diagnostics in place (async spinner — NEVER a spinner-forever: a real result or an
// error always replaces it).
// ---------------------------------------------------------------------------

function doctorTone(level: DoctorLevel, theme: Theme): { glyph: string; color: string } {
  if (level === "ok") return { glyph: theme.ascii ? "v" : "✓", color: theme.fg("semantic.ok") };
  if (level === "fail") return { glyph: theme.ascii ? "x" : "✗", color: theme.fg("semantic.error") };
  return { glyph: "!", color: theme.fg("semantic.warn") };
}

function renderCheckRow(c: DoctorCheck, width: number, sel: boolean, theme: Theme): string {
  const reset = theme.reset;
  const tone = doctorTone(c.level, theme);
  const glyphCell = tone.color + BOLD + padTo(tone.glyph, 2) + reset;
  const idW = 24;
  const msgW = Math.max(0, width - 2 - idW - 1);
  const idColor = sel ? theme.fg("text.primary") + BOLD : theme.fg("text.primary");
  const idCell = idColor + padTo(truncate(c.id, idW), idW) + reset;
  const msgCell = " " + theme.fg("text.muted") + truncate(c.msg, msgW) + reset;
  const row = glyphCell + idCell + msgCell;
  // Doctor renders checks manually (not via ScrollList), so apply the selection cursor here.
  return sel ? highlightRow(padTo(row, width), theme) : row;
}

export function buildDoctorView(d: DoctorSlice, focused: string, rect: Rect, theme: Theme): string[] {
  const cols = rect.width;
  const height = rect.height;
  if (height <= 0) return [];

  if (!d.doctor && !d.fleet) {
    const msg =
      d.status === "error"
        ? `error: ${d.error ?? "querying doctor"}`
        : d.running
          ? "running diagnostics…"
          : "loading diagnostics…";
    return buildCenteredMessagePanel("doctor", msg, rect, theme);
  }

  const rightW = Math.min(38, Math.max(24, Math.floor(cols * 0.32)));
  const [leftRect, rightRect] = splitH({ top: 0, left: 0, width: cols, height }, [{ flex: 1 }, rightW], 2);

  // Left: diagnostics list (spinner row while re-running).
  const checks = d.doctor?.checks ?? [];
  const selected = clampIndex(d.selected, Math.max(1, checks.length));
  const leftBody: string[] = [];
  if (d.running) {
    leftBody.push(spinner({ label: "re-running checks…", frame: d.spinnerFrame }, theme));
    leftBody.push("");
  }
  const listRoom = Math.max(1, height - 2 - leftBody.length);
  const rowW = Math.max(8, leftRect.width - 4);
  const offset = scrollOffset(selected, listRoom, checks.length);
  const windowed = checks.slice(offset, offset + listRoom);
  for (let i = 0; i < windowed.length; i++) {
    leftBody.push(renderCheckRow(windowed[i]!, rowW, offset + i === selected, theme));
  }
  const title = d.running ? "diagnostics" : d.atLabel ? `diagnostics · last ${d.atLabel}` : "diagnostics";
  const leftPanel = panel(
    { title, focus: focused === "checks", width: leftRect.width, height, body: leftBody },
    theme,
  );

  // Right: fleet online state + RAM class, plus a warn/fail summary.
  const agents = d.fleet?.agents ?? [];
  const online = d.fleet?.online ?? 0;
  const total = d.fleet?.total ?? 0;
  const fleetSel = clampIndex(d.fleetSelected, Math.max(1, agents.length));
  const fleetW = Math.max(0, rightRect.width - 4);
  const fleetBody: string[] = [];
  for (let ai = 0; ai < agents.length; ai++) {
    const a = agents[ai]!;
    const b = badge({ agent: a.name as AgentName, label: a.name }, theme);
    const state = a.ok ? theme.fg("semantic.ok") + "online" : theme.fg("semantic.error") + "offline";
    const cls = theme.fg("text.muted") + " " + a.cls + theme.reset;
    const bw = Math.max(0, rightRect.width - 4 - 7 - displayWidth(a.cls) - 1);
    const row = padTo(b, bw) + state + theme.reset + cls;
    fleetBody.push(focused === "fleet" && ai === fleetSel ? highlightRow(padTo(row, fleetW), theme) : row);
  }
  if (d.doctor) {
    fleetBody.push("");
    fleetBody.push(
      theme.fg("text.muted") + `${d.doctor.warn} warn · ${d.doctor.fail} fail` + theme.reset,
    );
  }
  const rightPanel = panel(
    { title: `fleet ${online}/${total}`, focus: focused === "fleet", width: rightRect.width, height, body: fleetBody },
    theme,
  );

  const gap = " ".repeat(Math.max(0, cols - leftRect.width - rightRect.width));
  const out: string[] = [];
  for (let i = 0; i < height; i++) out.push((leftPanel[i] ?? "") + gap + (rightPanel[i] ?? ""));
  return out;
}

// ---------------------------------------------------------------------------
// Min-size guard
// ---------------------------------------------------------------------------

function buildMinSizeFrame(size: FrameSize, theme: Theme): string[] {
  const { cols, rows } = size;
  const total = Math.max(0, rows);
  if (cols <= 0) return Array.from({ length: total }, () => "");

  const message = `ebrain ui requires ≥80×24 — current ${cols}×${rows}`;
  const colored = theme.fg("semantic.warn") + message + theme.reset;
  const blank = " ".repeat(cols);
  const midRow = Math.floor(total / 2);

  const out: string[] = [];
  for (let i = 0; i < total; i++) out.push(i === midRow ? centerLine(colored, cols) : blank);
  return out;
}

// ---------------------------------------------------------------------------
// runUi — main loop (impure)
// ---------------------------------------------------------------------------

export interface RunUiOptions {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
}

/**
 * Run the interactive TUI. Resolves when the user quits (q / Ctrl-C x2 / Ctrl-D)
 * or a SIGINT/SIGTERM arrives.
 *
 * The terminal is ALWAYS restored via `restoreTerminal()` (which calls
 * `screen.exit()`) — from the normal quit path, from SIGINT/SIGTERM, and from a
 * global `uncaughtException` handler that restores the terminal and then rethrows
 * (so a genuine bug still surfaces as a crash — it just never leaves the alt-screen
 * up when it does).
 */
export async function runUi(opts: RunUiOptions = {}): Promise<void> {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;

  return new Promise<void>((resolve) => {
    const theme = makeTheme();
    const screen = new Screen(output);
    let state = initialState();
    let stopReader: (() => void) | null = null;
    // Sessions data plane (F6.4): a 1Hz peek tick, a ≤1Hz throttle stamp, and an
    // `attaching` flag that suppresses our repaints while tmux owns the terminal.
    let peekTimer: ReturnType<typeof setInterval> | null = null;
    let lastPeekAt: number | null = null;
    // Advances the doctor spinner (~8fps) only while a re-run is in flight (6.5.4).
    let spinnerTimer: ReturnType<typeof setInterval> | null = null;
    /** Monotonic local request guard. A dismissed picker or older registry response may update
     * cached data, but it must never restore an overlay or overwrite a newer mutation. */
    let workspaceRequest = 0;
    /** Context summaries are read-only, but stale responses still must not overwrite a newer
     * launch landing. Pack bodies are never requested by this loop. */
    let contextRequest = 0;
    let attaching = false;
    // Set once the loop is torn down (quit / signal / crash) so an in-flight attach
    // handoff never re-enters the alt-screen after cleanup already ran.
    let disposed = false;

    function getSize(): FrameSize {
      return { cols: output.columns ?? 0, rows: output.rows ?? 0 };
    }

    function render(): void {
      if (attaching) return; // tmux owns the terminal during an attach handoff
      screen.render(buildFrame(state, getSize(), theme));
    }

    function restoreTerminal(): void {
      disposed = true;
      if (stopReader) {
        stopReader();
        stopReader = null;
      }
      if (peekTimer) {
        clearInterval(peekTimer);
        peekTimer = null;
      }
      if (spinnerTimer) {
        clearInterval(spinnerTimer);
        spinnerTimer = null;
      }
      output.removeListener("resize", onResize);
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
      process.removeListener("uncaughtException", onUncaught);
      screen.exit();
    }

    function cleanup(): void {
      restoreTerminal();
      resolve();
    }

    function onSignal(): void {
      cleanup();
    }

    function onUncaught(err: unknown): void {
      restoreTerminal();
      resolve();
      throw err;
    }

    function onResize(): void {
      render();
    }

    function onKey(key: Key): void {
      const result = reduce(state, key, { composer: promptComposerGeometryForFrame(getSize()) });
      state = result.state;
      if (result.quit) {
        cleanup();
        return;
      }
      if (result.forceRedraw) screen.enter();
      render();
      if (result.effect) void handleEffect(result.effect);
    }

    // ── Sessions data plane (impure): the effect interpreter reduce() requests ──

    async function refreshSessions(): Promise<void> {
      const cur = sessionsOf(state);
      state = { ...state, sessions: { ...cur, status: cur.rows.length ? cur.status : "loading" } };
      render();

      const server = await hasServer();
      if (server === "tmux-not-installed") {
        state = { ...state, sessions: { rows: [], selected: 0, peek: null, status: "no-tmux" } };
        render();
        return;
      }

      const list = await listSessions();
      const now = Date.now();
      if (!list.ok) {
        state = { ...state, sessions: { ...sessionsOf(state), status: "error", error: list.error.message } };
        render();
        return;
      }

      const rows: SessionListItem[] = list.sessions.map((r) => ({
        name: r.name,
        agent: r.agent,
        uptime: uptimeFromIso(r.created, now),
        attached: r.attached,
        created: r.created,
        cwd: r.cwd,
        workspaceLabel: registeredWorkspaceLabel(r.cwd, workspaceOf(state)),
      }));
      const prev = sessionsOf(state);
      const selected = rows.length ? Math.min(prev.selected, rows.length - 1) : 0;
      const status: SessionsStatus = rows.length ? "ready" : "no-server";
      state = { ...state, sessions: { rows, selected, peek: prev.peek, status } };
      render();
      if (rows.length) void doPeek(rows[selected]!.name);
    }

    /** Capture the selected session's pane — but only if ≥1s since the last capture
     * (the ≤1Hz throttle, spec 6.4.3). peekSession already scrubs the text. */
    async function doPeek(name: string): Promise<void> {
      const now = Date.now();
      if (!shouldCapture(now, lastPeekAt)) return;
      lastPeekAt = now;
      const r = await peekSession(name);
      if (!r.ok) {
        state = { ...state, sessions: failSessionPeek(sessionsOf(state), `peek ${name}: ${r.error.message}`) };
        if (state.tab === "sessions") render();
        return;
      }
      const s = sessionsOf(state);
      state = { ...state, sessions: { ...s, peek: { name, text: r.text, at: Date.now() } } };
      if (state.tab === "sessions") render();
    }

    async function doKill(name: string): Promise<void> {
      await killSession(name, true); // reduce() already required an explicit `y`
      await refreshSessions();
    }

    async function doSend(name: string, text: string): Promise<void> {
      await sendToSession(name, text, true); // the user typed + pressed enter deliberately
      lastPeekAt = null; // let the pane refresh immediately so the sent line shows
      void doPeek(name);
    }

    /** Attach handoff (6.4.4): give tmux the real terminal, restore ours on return. */
    async function doAttach(name: string): Promise<void> {
      const target = attachTarget(name);
      // Inside tmux, attaching means `switch-client`, which HIJACKS the whole tmux client
      // — and there Ctrl-b d detaches the entire client (kicking you out of everything).
      // Rather than do that surprising thing, decline with guidance: ebrain ui is meant to
      // run in a plain terminal so attach = attach-session (clean detach with Ctrl-b d).
      if (target.verb === "switch-client") {
        state = {
          ...state,
          overlay: {
            kind: "detail",
            title: "attach unavailable inside tmux",
            body: "ebrain ui is running inside tmux, where attaching would hijack your tmux client (Ctrl-b d would exit everything). Run `ebrain ui` in a plain terminal to attach cleanly, or use `p` to prompt this session without attaching.",
          },
        };
        render();
        return;
      }
      attaching = true;
      if (stopReader) {
        stopReader();
        stopReader = null;
      }
      if (peekTimer) {
        clearInterval(peekTimer);
        peekTimer = null;
      }
      screen.exit();
      // Discoverability: attaching (attach-session; the inside-tmux case was declined
      // above) hands the terminal FULLY to tmux — the way back is the tmux detach binding,
      // which ebrain doesn't own. Print it before the handoff (the sessions hint bar shows
      // it persistently too).
      output.write(`\r\n  attached to ${name} — press Ctrl-b then d to detach back to ebrain\r\n\r\n`);
      try {
        const proc = Bun.spawn(["tmux", ...target.args], {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        });
        await proc.exited; // attach-session blocks until detach; switch-client returns now
      } catch {
        // tmux missing/failed — fall through and restore our UI regardless.
      }
      if (disposed) return; // quit/signal happened during the attach — do NOT re-enter
      attaching = false;
      screen.enter();
      stopReader = startNavReader(input, onKey, output);
      peekTimer = setInterval(peekTick, 1000);
      await refreshSessions();
    }

    function peekTick(): void {
      if (attaching || state.tab !== "sessions") return;
      const s = sessionsOf(state);
      const sel = s.rows[s.selected];
      if (sel) void doPeek(sel.name);
    }

    /** Resolve the selected workspace through the CLI immediately before a launch flow. A
     * registered path may have been replaced since it was listed; this closes that TOCTOU gap
     * before the independent sessions/targets deny-list performs its own final check. */
    async function resolveLaunchWorkspace(): Promise<WorkspaceSelection | null> {
      const workspace = workspaceOf(state);
      const result = await validateWorkspace(workspace.active.cwd);
      if (!result.ok) {
        const launch = launchOf(state);
        state = {
          ...state,
          workspace: { ...workspace, status: "error", error: "Selected workspace is unavailable." },
          launch: { ...launch, status: "error", error: "Selected workspace is unavailable. Open the workspace picker and choose another directory." },
        };
        if (state.tab === "launch") render();
        return null;
      }
      const canonical = result.data.cwd;
      const current = !workspace.current.persistent && workspace.current.cwd === workspace.active.cwd
        ? { ...workspace.current, cwd: canonical, validated: true }
        : workspace.current;
      const active = { ...workspace.active, cwd: canonical, validated: true };
      state = { ...state, workspace: { ...workspace, current, active, status: "ready", error: undefined } };
      return active;
    }

    /** Launch `agent`: resolve workspace then run the RAM governor (6.4.6); if it wants confirmation, open the
     * dialog; otherwise launch straight away. */
    async function doLaunch(agent: string, prompt: string): Promise<void> {
      const workspace = await resolveLaunchWorkspace();
      if (!workspace) return;
      const cwd = workspace.cwd;
      const [cls, heavy] = await Promise.all([classOf(agent), countLiveHeavy()]);
      const g = governLaunch({ launchingClass: cls, liveHeavyCount: heavy, availableMb: readAvailableMb() });
      if (g.decision === "confirm") {
        // The confirm overlay is modal; the prompt is re-snapshotted from state at the `y` reduce
        // (launchConfirmed), so it stays consistent with what the user reviewed.
        state = { ...state, overlay: { kind: "confirmLaunch", agent, cwd, reason: g.reason } };
        render();
        return;
      }
      await performLaunch(agent, cwd, null, prompt);
    }

    /** Actually create the session (via the manifest launch cmd + full harness env).
     * `override` non-null means the user pushed past the governor → log the override.
     * `prompt` is the reviewed task snapshotted at the reducer boundary (G56-F2), NOT re-read
     * from mutable state after the newSession await. */
    async function performLaunch(agent: string, cwd: string, override: string | null, prompt: string): Promise<void> {
      if (override) logOverride({ agent, cwd, reason: override });
      const r = await newSession(agent, launchSlug(cwd), { cwd });
      if (!r.ok) {
        // Surface the refusal (deny-client rc=2, bad-agent, tmux error) in the panel.
        const s = sessionsOf(state);
        state = { ...state, tab: "sessions", sessions: { ...s, status: "error", error: r.error.message } };
        render();
        return;
      }
      let promptSendError: string | null = null;
      const initialPrompt = prompt;
      if (initialPrompt.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        const sent = await sendToSession(r.session.name, initialPrompt, true);
        if (!sent.ok) promptSendError = sent.error.message;
      }
      state = withTab(state, "sessions"); // jump to Sessions to show the new one
      render();
      await refreshSessions();
      if (promptSendError) {
        const s = sessionsOf(state);
        state = { ...state, sessions: { ...s, status: "error", error: `initial prompt: ${promptSendError}` } };
        render();
      }
    }

    function launchSlug(cwd: string): string {
      const base = cwd.split("/").filter(Boolean).pop() || "session";
      const clean = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16) || "session";
      return `${clean}-${Date.now().toString(36).slice(-4)}`; // short suffix avoids name clashes
    }

    // ── Knowledge data plane (impure): fetch each panel from its subcommand (6.5) ──

    /** HH:MM now, for the lock-awareness / last-run timestamps (impure by design —
     * buildFrame never calls this; the loop stamps the string onto the slice). */
    function nowClock(): string {
      const dt = new Date();
      return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
    }

    /** Overview/home (6.5.1): status + last-3 memory, then a bare session list. */
    async function refreshStatus(): Promise<void> {
      const cur = overviewOf(state);
      state = { ...state, overview: { ...cur, status: cur.data ? cur.status : "loading" } };
      if (state.tab === "home") render();

      const [st, mem] = await Promise.all([fetchStatus(), fetchMemory(20)]);
      const o = overviewOf(state);
      if (st.ok) {
        state = {
          ...state,
          overview: { ...o, data: st.data, memory: mem.ok ? mem.data : o.memory, status: "ready", error: undefined, atLabel: nowClock() },
        };
      } else {
        state = { ...state, overview: { ...o, status: "error", error: st.error } };
      }
      if (state.tab === "home") render();
      await refreshSessionsBare();
    }

    /** Bare tmux session list (no peek) for the home "sesiones activas" panel. */
    async function refreshSessionsBare(): Promise<void> {
      if ((await hasServer()) !== "up") return; // no server -> leave slice empty (shows "sin sesiones")
      const list = await listSessions();
      if (!list.ok) return;
      const now = Date.now();
      const rows: SessionListItem[] = list.sessions.map((r) => ({
        name: r.name,
        agent: r.agent,
        uptime: uptimeFromIso(r.created, now),
        attached: r.attached,
        created: r.created,
        cwd: r.cwd,
        workspaceLabel: registeredWorkspaceLabel(r.cwd, workspaceOf(state)),
      }));
      const prev = sessionsOf(state);
      state = {
        ...state,
        sessions: {
          ...prev,
          rows,
          selected: rows.length ? Math.min(prev.selected, rows.length - 1) : 0,
          status: rows.length ? "ready" : prev.status,
        },
      };
      if (state.tab === "home" || state.tab === "sessions") render();
    }

    async function refreshMemory(): Promise<void> {
      const cur = memoryOf(state);
      state = { ...state, memory: { ...cur, status: cur.data ? cur.status : "loading" } };
      if (state.tab === "memory") render();
      const [r, episodes, contexts, procedures] = await Promise.all([
        fetchMemory(8),
        fetchEpisodes(8),
        fetchContextPacks(),
        fetchProcedures(8),
      ]);
      const m = memoryOf(state);
      if (r.ok) {
        const nextEpisodes = episodes.ok ? episodes.data : m.episodes;
        const nextContexts = contexts.ok ? contexts.data : m.contexts;
        const nextProcedures = procedures.ok ? procedures.data : m.procedures;
        const nextMemory: MemorySlice = {
          ...m,
          data: r.data,
          episodes: nextEpisodes,
          contexts: nextContexts,
          procedures: nextProcedures,
        };
        const unavailable = [episodes, contexts, procedures].filter((result) => !result.ok).length;
        state = {
          ...state,
          memory: {
            ...nextMemory,
            selected: Math.min(m.selected, Math.max(0, recallRows(nextMemory).length - 1)),
            workflowSelected: Math.min(m.workflowSelected, Math.max(0, procedureRows(nextMemory).length - 1)),
            status: "ready",
            error: unavailable > 0 ? "some memory metadata is unavailable" : undefined,
          },
        };
      } else {
        state = { ...state, memory: { ...m, status: "error", error: r.error } };
      }
      if (state.tab === "memory") render();
    }

    async function doRunWorkflow(id: string): Promise<void> {
      const r = await runWorkflow(id);
      if (r.ok) {
        state = { ...state, overlay: { kind: "detail", title: `workflow · ${r.data.title}`, body: r.data.prompt } };
      } else {
        const m = memoryOf(state);
        state = { ...state, memory: { ...m, status: "error", error: `workflow: ${r.error}` } };
      }
      if (state.tab === "memory") render();
    }

    async function doAttachWorkflow(id: string): Promise<void> {
      const r = await runWorkflow(id);
      if (!r.ok) {
        const m = memoryOf(state);
        state = { ...state, memory: { ...m, status: "error", error: `workflow: ${r.error}` } };
        if (state.tab === "memory") render();
        return;
      }
      const launch = launchOf(state);
      state = {
        ...state,
        tab: "launch",
        focusRegion: 0,
        overlay: null,
        launch: { ...launch, task: r.data.prompt, workflowId: r.data.id, status: "idle", error: undefined },
      };
      render();
    }

    async function refreshRouting(): Promise<void> {
      const cur = routingOf(state);
      state = { ...state, routing: { ...cur, status: cur.data ? cur.status : "loading" } };
      if (state.tab === "routing") render();
      const [r, cost] = await Promise.all([fetchRouting(), fetchCost()]);
      const rt = routingOf(state);
      if (r.ok) {
        const nextCost = cost.ok ? cost.data : rt.cost;
        state = {
          ...state,
          routing: {
            ...rt,
            data: r.data,
            cost: nextCost,
            selected: Math.min(rt.selected, Math.max(0, r.data.capabilities.length - 1)),
            costSelected: Math.min(rt.costSelected, Math.max(0, (nextCost?.providers.length ?? 0) - 1)),
            status: "ready",
            error: cost.ok ? undefined : `cost: ${cost.error}`,
          },
        };
      } else {
        state = { ...state, routing: { ...rt, status: "error", error: r.error } };
      }
      if (state.tab === "routing") render();
    }

    /** Re-read both halves of the workspace control plane. `validate` deliberately does not
     * read the registry, so a malformed store never hides a safe caller directory. */
    async function refreshWorkspaceRegistry(pickerReturnToWizard?: boolean): Promise<void> {
      const request = ++workspaceRequest;
      const before = workspaceOf(state);
      const [registry, currentResult] = await Promise.all([fetchWorkspaces(), validateWorkspace(before.current.cwd)]);
      if (disposed || request !== workspaceRequest) return;

      const current = currentResult.ok
        ? { ...before.current, cwd: currentResult.data.cwd, validated: true }
        : { ...before.current, validated: false };
      const data = registry.ok ? registry.data : before.data;
      let active = !before.active.persistent && before.active.cwd === before.current.cwd ? current : before.active;
      // Removing a registered active entry must not leave a future launch pointing at an
      // unregistered record. Existing tmux sessions keep their own immutable cwd.
      if (active.persistent && !data?.workspaces.some((entry) => entry.cwd === active.cwd)) active = current;
      const error = !currentResult.ok
        ? "Current directory is not available as a workspace."
        : !registry.ok
          ? "Workspace registry is unavailable. Current directory remains available."
          : undefined;
      const provisional: WorkspaceSlice = { ...before, current, active, data, status: error ? "error" : "ready", error };
      const candidates = workspaceCandidatesFromSlice(provisional);
      const activity = workspaceActivity(provisional, sessionsOf(state).rows);
      const nextWorkspace: WorkspaceSlice = {
        ...provisional,
        selected: candidates.length ? clampIndex(before.selected, candidates.length) : 0,
        activitySelected: activity.length ? clampIndex(before.activitySelected, activity.length) : 0,
      };
      state = {
        ...state,
        workspace: nextWorkspace,
        sessions: { ...sessionsOf(state), rows: relabelSessionRows(sessionsOf(state).rows, nextWorkspace) },
      };
      // An older picker result must not recreate a picker after Esc. If the expected picker is
      // still present, clamping its selection is safe and keeps the visible list coherent.
      const overlay = state.overlay;
      if (pickerReturnToWizard !== undefined && overlay?.kind === "workspacePicker" && overlay.returnToWizard === pickerReturnToWizard) {
        const count = filteredWorkspaces(state, overlay.query).length;
        state = { ...state, overlay: { ...overlay, selected: clampIndex(overlay.selected, count) } };
      }
      render();
    }

    async function openWorkspacePicker(returnToWizard: boolean): Promise<void> {
      await refreshWorkspaceRegistry(returnToWizard);
    }

    async function addWorkspaceFromUi(cwd: string, label: string, returnToWizard: boolean, origin: "picker" | "cockpit"): Promise<void> {
      ++workspaceRequest; // invalidate a concurrent list/validation response before mutation
      const result = await createWorkspace({ cwd, label });
      if (!result.ok) {
        const workspace = workspaceOf(state);
        state = { ...state, workspace: { ...workspace, status: "error", error: "Workspace could not be added. Check the directory and label." } };
        render();
        return;
      }
      await refreshWorkspaceRegistry(); // re-read strict store; never construct an optimistic registry
      if (disposed) return;
      const workspace = workspaceOf(state);
      const created = workspace.data?.workspaces.find((entry) => entry.id === result.data.id);
      if (!created) {
        state = { ...state, workspace: { ...workspace, status: "error", error: "Workspace was added, but the registry could not be refreshed." } };
        render();
        return;
      }
      const candidate = selectionFromRecord(created);
      if (origin === "picker") {
        state = selectWorkspace(state, candidate, returnToWizard);
      } else {
        const selected = Math.max(0, workspaceCandidates(state).findIndex((entry) => entry.cwd === candidate.cwd));
        state = { ...state, overlay: null, workspace: { ...workspaceOf(state), selected } };
      }
      render();
    }

    async function renameWorkspaceFromUi(id: string, label: string): Promise<void> {
      ++workspaceRequest;
      const result = await renameWorkspace({ id, label });
      if (!result.ok) {
        const workspace = workspaceOf(state);
        state = { ...state, workspace: { ...workspace, status: "error", error: "Workspace could not be renamed. Check the label and refresh." } };
        render();
        return;
      }
      await refreshWorkspaceRegistry();
      if (disposed) return;
      const workspace = workspaceOf(state);
      const selected = Math.max(0, workspaceCandidates(state).findIndex((entry) => entry.id === result.data.id));
      state = { ...state, workspace: { ...workspace, selected } };
      render();
    }

    async function removeWorkspaceFromUi(id: string): Promise<void> {
      ++workspaceRequest;
      const result = await removeWorkspace(id);
      if (!result.ok) {
        const workspace = workspaceOf(state);
        state = { ...state, workspace: { ...workspace, status: "error", error: "Workspace could not be removed. Refresh and try again." } };
        render();
        return;
      }
      await refreshWorkspaceRegistry();
    }

    async function refreshLaunchContext(): Promise<void> {
      const request = ++contextRequest;
      const launch = launchOf(state);
      state = { ...state, launch: { ...launch, contextStatus: "loading", contextError: undefined } };
      if (state.tab === "launch") render();
      const result = await fetchContextPacks();
      if (disposed || request !== contextRequest) return;
      const current = launchOf(state);
      state = result.ok
        ? { ...state, launch: { ...current, contexts: result.data, contextStatus: "ready", contextError: undefined } }
        : { ...state, launch: { ...current, contextStatus: "error", contextError: result.error } };
      if (state.tab === "launch") render();
    }

    async function openLaunchWizard(): Promise<void> {
      const launch = launchOf(state);
      state = { ...state, launch: { ...launch, status: "loading", error: undefined } };
      if (state.tab === "launch") render();
      const selectedWorkspace = await resolveLaunchWorkspace();
      if (!selectedWorkspace) return;
      const [targets, profiles] = await Promise.all([fetchTargets(), fetchProfiles()]);
      const current = launchOf(state);
      if (!targets.ok || !profiles.ok || !profiles.data.initialized || profiles.data.profiles.length === 0 || targets.data.length === 0) {
        if (targets.ok && profiles.ok && !profiles.data.initialized) {
          state = { ...state, overlay: { kind: "confirmProfilesInit" }, launch: { ...current, status: "ready", error: undefined } };
          if (state.tab === "launch") render();
          return;
        }
        const error = !targets.ok ? targets.error : !profiles.ok ? profiles.error :
          profiles.data.profiles.length === 0
            ? "No execution profiles are available. Create one in Profiles before launching."
            : "no adapter declares an OpenRouter target";
        state = { ...state, launch: { ...current, status: "error", error } };
      } else {
        const capability = taskCapabilityOf(current);
        const first = profiles.data.profiles[0]!;
        state = {
          ...state,
          overlay: { kind: "launchWizard" },
          launch: {
            ...current,
            status: "ready",
            wizard: {
              targets: targets.data,
              profiles: profiles.data,
              targetSelected: 0,
              profileSelected: 0,
              capability: first.capabilities.includes(capability) ? capability : first.capabilities[0]!,
              cwd: selectedWorkspace.cwd,
              focus: "target",
              plan: null,
            },
          },
        };
      }
      if (state.tab === "launch") render();
    }

    async function initializeLaunchProfiles(): Promise<void> {
      const launch = launchOf(state);
      state = { ...state, launch: { ...launch, status: "loading", error: undefined } };
      if (state.tab === "launch") render();
      const result = await initializeProfiles();
      if (!result.ok) {
        const current = launchOf(state);
        state = { ...state, launch: { ...current, status: "error", error: result.error } };
        if (state.tab === "launch") render();
        return;
      }
      await openLaunchWizard();
    }

    async function planLaunchWizard(): Promise<void> {
      const launch = launchOf(state); const wizard = wizardOf(launch); const target = wizard && selectedWizardTarget(wizard); const profile = wizard && selectedWizardProfile(wizard);
      if (!wizard || !target || !profile) return;
      state = { ...state, launch: { ...launch, status: "loading", error: undefined } };
      if (state.tab === "launch") render();
      const result = await fetchTargetPlan({ target: target.id, profile: profile.id, capability: wizard.capability, cwd: wizard.cwd });
      const current = launchOf(state); const currentWizard = wizardOf(current);
      state = result.ok && currentWizard ? { ...state, launch: { ...current, status: "ready", wizard: { ...currentWizard, plan: result.data } } } : { ...state, launch: { ...current, status: "error", error: result.ok ? "wizard closed" : result.error } };
      if (state.tab === "launch") render();
    }

    async function requestTargetLaunch(plan: TargetPlanData, intent: LaunchIntent): Promise<void> {
      const cls = plan.ramClass === "light" ? "light" : "heavy";
      const g = governLaunch({ launchingClass: cls, liveHeavyCount: await countLiveHeavy(), availableMb: readAvailableMb() });
      if (g.decision === "confirm") { state = { ...state, overlay: { kind: "confirmTargetGovernor", plan, intent, reason: g.reason } }; render(); return; }
      await launchTarget(plan, intent);
    }

    async function launchTarget(plan: TargetPlanData, intent: LaunchIntent, reason?: string): Promise<void> {
      if (reason) logOverride({ agent: plan.agent, cwd: plan.cwd, reason });
      const launch = launchOf(state); state = { ...state, launch: { ...launch, status: "running", error: undefined } }; if (state.tab === "launch") render();
      const slug = launchSlug(plan.cwd);
      // Deliver the reviewed task over stdin (never argv) + attribute the workflow (G56-F2).
      const { args, stdin } = buildTargetLaunchArgs(plan, intent, slug);
      const proc = Bun.spawn([EBRAIN, ...args], { stdin: stdin === null ? "ignore" : "pipe", stdout: "pipe", stderr: "pipe" });
      if (stdin !== null && proc.stdin) { proc.stdin.write(stdin); await proc.stdin.end(); }
      const [out, exit] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
      const current = launchOf(state);
      // A `prompt-send` result means the session started but the task could not be delivered — a
      // recoverable state: keep the session (Sessions is refreshed) and surface a clear error,
      // never echoing the prompt.
      let promptSend = false;
      try { const parsed = JSON.parse(out); if (parsed && parsed.ok === false && parsed.error?.type === "prompt-send") promptSend = true; } catch { /* non-JSON → fall back to exit code */ }
      if (exit === 0) {
        state = { ...state, launch: { ...current, status: "ready", error: undefined } };
      } else if (promptSend) {
        state = { ...state, launch: { ...current, status: "error", error: "session started but the task could not be delivered; the session is retained" } };
      } else {
        state = { ...state, launch: { ...current, status: "error", error: "target launch failed" } };
      }
      await refreshSessions(); if (state.tab === "launch") render();
    }

    /** Fleet + Doctor (6.5.4). `force` (the `r` re-run) refetches even when cached and
     * drives the spinner; a landing skips the fetch if data is already present. */
    async function refreshFleetDoctor(force = false): Promise<void> {
      const cur = doctorOf(state);
      if (!force && cur.doctor && cur.fleet) {
        if (state.tab === "doctor") render();
        return;
      }
      state = { ...state, doctor: { ...cur, status: cur.doctor ? cur.status : "loading", running: force } };
      if (state.tab === "doctor") render();

      const [fl, dc] = await Promise.all([fetchFleet(), fetchDoctor()]);
      const d = doctorOf(state);
      const fleet = fl.ok ? fl.data : d.fleet;
      const doctor = dc.ok ? dc.data : d.doctor;
      const err = !fl.ok ? fl.error : !dc.ok ? dc.error : undefined;
      const status: LoadStatus = fl.ok || dc.ok ? "ready" : "error";
      state = { ...state, doctor: { ...d, fleet, doctor, status, error: err, running: false, atLabel: nowClock() } };
      if (state.tab === "doctor") render();
    }

    async function rerunDoctor(): Promise<void> {
      if (!spinnerTimer) spinnerTimer = setInterval(spinnerTick, 120);
      try {
        await refreshFleetDoctor(true);
      } finally {
        if (spinnerTimer) {
          clearInterval(spinnerTimer);
          spinnerTimer = null;
        }
      }
    }

    function spinnerTick(): void {
      const d = doctorOf(state);
      if (!d.running) return;
      state = { ...state, doctor: { ...d, spinnerFrame: d.spinnerFrame + 1 } };
      if (state.tab === "doctor") render();
    }

    /** Write a learning to permanent agentic memory, then refresh so it shows in
     * "resultados" (round-trip = F6.5 criterion #6). */
    async function doRemember(text: string): Promise<void> {
      const r = await runRemember(text);
      await refreshMemory();
      if (!r.ok) {
        const m = memoryOf(state);
        state = { ...state, memory: { ...m, status: "error", error: `remember: ${r.error}` } };
        if (state.tab === "memory") render();
      }
    }

    async function doSearchMemory(query: string): Promise<void> {
      const m = memoryOf(state);
      state = { ...state, memory: { ...m, searchStatus: "loading", searchError: undefined } };
      if (state.tab === "memory") render();
      const result = await fetchSearch(query);
      const current = memoryOf(state);
      // Reset the search cursor on every query so selection never dangles past the new
      // result set (G56-F3 — clamp/reset on each query).
      state = result.ok
        ? { ...state, memory: { ...current, search: result.data, searchStatus: "ready", searchError: undefined, searchSelected: 0 } }
        : { ...state, memory: { ...current, search: null, searchStatus: "error", searchError: result.error, searchSelected: 0 } };
      if (state.tab === "memory") render();
    }

    async function handleEffect(effect: AppEffect): Promise<void> {
      switch (effect.type) {
        case "refreshSessions":
          await refreshSessions();
          break;
        case "refreshStatus":
          await refreshStatus();
          break;
        case "refreshMemory":
          await refreshMemory();
          break;
        case "runWorkflow":
          await doRunWorkflow(effect.id);
          break;
        case "attachWorkflow":
          await doAttachWorkflow(effect.id);
          break;
        case "refreshRouting":
          await refreshRouting();
          break;
        case "refreshFleetDoctor":
          await refreshFleetDoctor();
          break;
        case "rerunDoctor":
          await rerunDoctor();
          break;
        case "remember":
          await doRemember(effect.text);
          break;
        case "searchMemory":
          await doSearchMemory(effect.query);
          break;
        case "peek":
          await doPeek(effect.name);
          break;
        case "attach":
          await doAttach(effect.name);
          break;
        case "kill":
          await doKill(effect.name);
          break;
        case "send":
          await doSend(effect.name, effect.text);
          break;
        case "launch":
          await doLaunch(effect.agent, effect.prompt ?? "");
          break;
        case "launchConfirmed":
          await performLaunch(effect.agent, effect.cwd, effect.reason, effect.prompt ?? "");
          break;
        case "openLaunchWizard": await openLaunchWizard(); break;
        case "refreshLaunchContext": await refreshLaunchContext(); break;
        case "openWorkspacePicker": await openWorkspacePicker(effect.returnToWizard); break;
        case "refreshWorkspaces": await refreshWorkspaceRegistry(); break;
        case "addWorkspace": await addWorkspaceFromUi(effect.cwd, effect.label, effect.returnToWizard, effect.origin); break;
        case "renameWorkspace": await renameWorkspaceFromUi(effect.id, effect.label); break;
        case "removeWorkspace": await removeWorkspaceFromUi(effect.id); break;
        case "initializeProfiles": await initializeLaunchProfiles(); break;
        case "planLaunchWizard": await planLaunchWizard(); break;
        case "requestTargetLaunch": await requestTargetLaunch(effect.plan, effect.intent); break;
        case "launchTarget": await launchTarget(effect.plan, effect.intent, effect.reason); break;
      }
    }

    try {
      stopReader = startNavReader(input, onKey, output);
      process.on("SIGINT", onSignal);
      process.on("SIGTERM", onSignal);
      process.on("uncaughtException", onUncaught);
      output.on("resize", onResize);

      screen.enter();
      render();
      // Make the caller directory and registry available without forcing the user through a
      // modal. Direct/guided launch revalidate again, so this is only UX warming, never trust.
      void openWorkspacePicker(false);
      peekTimer = setInterval(peekTick, 1000); // Sessions peek refresh (self-gated ≤1Hz)
      void refreshStatus(); // home lands first — populate its live summary immediately
    } catch (err) {
      restoreTerminal();
      resolve();
      throw err;
    }
  });
}

// ---------------------------------------------------------------------------
// Entrypoint — `bun run tui/src/app.ts` (via `ebrain ui`, cli/ebrain, 6.3.6)
// ---------------------------------------------------------------------------

if (import.meta.main) {
  runUi().catch((err) => {
    // Terminal is already restored by runUi's own handlers by the time we get
    // here — this only reports the error and sets a non-zero exit code.
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
