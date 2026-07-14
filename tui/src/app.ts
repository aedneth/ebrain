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

import { makeTheme, type Theme, type AgentName } from "./theme.js";
import { Screen } from "./kit/screen.js";
import { splitV, splitH, type Rect } from "./kit/layout.js";
import { padTo, truncate, displayWidth } from "./kit/draw.js";
import { startNavReader, type Key } from "./kit/input.js";

import { wordmark } from "./widgets/brand/wordmark.js";
import { statusBar, statusSep, tabBar, hintBar, footer } from "./widgets/chrome/index.js";
import { panel } from "./widgets/layout/panel.js";
import { gauge } from "./widgets/core/gauge.js";

import { TABS, type TabName, hintsForTab, COMMANDS, type Command } from "./commands.js";
import {
  type PaletteState,
  emptyPaletteState,
  paletteApplyKey,
  filterCommands,
  toItems,
} from "./palette.js";
import { commandPalette } from "./widgets/input/commandpalette.js";
import { renderHelp } from "./help.js";

import { scrolllist } from "./widgets/data/scrolllist.js";
import { terminalPeek } from "./widgets/layout/terminalpeek.js";
import { badge } from "./widgets/core/badge.js";
import { confirm } from "./widgets/dialog/confirm.js";
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
  SpendData,
  FleetData,
  DoctorData,
  DoctorCheck,
  DoctorLevel,
} from "./knowledge/contracts.js";
import {
  fetchStatus,
  fetchMemory,
  fetchSpend,
  fetchFleet,
  fetchDoctor,
  runRemember,
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

// ── Sessions panel state (F6.4.3) ──────────────────────────────────────────

/** One fleet-list row as the panel renders it. `uptime` is precomputed in the loop
 * (buildFrame is PURE — no Date.now()); `agent` is whatever was parsed from the
 * session name and is validated by badge(). */
export interface SessionListItem {
  name: string;
  agent: string;
  uptime: string;
  attached: boolean;
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
  status: LoadStatus;
  error?: string;
  /** HH:MM of the last successful fetch, precomputed by the loop so buildFrame stays
   * pure/deterministic (like sessions' uptime). Feeds the lock-awareness banner (6.5.5). */
  atLabel: string | null;
}

/** Memory panel (memory recent --json): learnings + session-logs, navigable (6.5.2). */
export interface MemorySlice {
  data: MemoryData | null;
  selected: number;
  status: LoadStatus;
  error?: string;
}

/** Routing panel (spend --json): by-capability spend + budget + gbrain flag (6.5.3). */
export interface RoutingSlice {
  data: SpendData | null;
  selected: number;
  status: LoadStatus;
  error?: string;
}

/** Fleet+Doctor panel (fleet --json + doctor --json), `r` re-runs doctor (6.5.4). */
export interface DoctorSlice {
  fleet: FleetData | null;
  doctor: DoctorData | null;
  selected: number;
  status: LoadStatus;
  error?: string;
  /** A doctor re-run is in flight — drives the spinner (advanced by the loop). */
  running: boolean;
  spinnerFrame: number;
  atLabel: string | null;
}

export function emptyOverview(): OverviewSlice {
  return { data: null, memory: null, status: "idle", atLabel: null };
}
export function emptyMemory(): MemorySlice {
  return { data: null, selected: 0, status: "idle" };
}
export function emptyRouting(): RoutingSlice {
  return { data: null, selected: 0, status: "idle" };
}
export function emptyDoctor(): DoctorSlice {
  return { fleet: null, doctor: null, selected: 0, status: "idle", running: false, spinnerFrame: 0, atLabel: null };
}

function overviewOf(state: AppState): OverviewSlice {
  return state.overview ?? emptyOverview();
}
function memoryOf(state: AppState): MemorySlice {
  return state.memory ?? emptyMemory();
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
export type Overlay =
  | { kind: "palette"; palette: PaletteState }
  | { kind: "help" }
  | { kind: "confirmKill"; name: string }
  | { kind: "prompt"; name: string; line: LineState }
  | { kind: "confirmLaunch"; agent: string; cwd: string; reason: string }
  | { kind: "remember"; line: LineState };

export interface AppState {
  tab: TabName;
  /** true after a first Ctrl-C — a second Ctrl-C quits ("ctrl+c x2" per the registry). */
  confirmQuit: boolean;
  /** Footer identity — the CALLER's cwd (see cli/ebrain's EBRAIN_CALLER_CWD export),
   * not run_bun's neutral working dir. Collapsed to "~/..." when under $HOME. */
  cwd: string;
  branch?: string;
  /** Open command palette / help / confirm / prompt overlay, or null when none. */
  overlay?: Overlay | null;
  /** Live tmux session data (F6.4). Optional — sessionsOf() defaults an empty slice. */
  sessions?: SessionsSlice;
  /** Launch-panel selection (F6.4.5). Optional — defaults to index 0. */
  launch?: { selected: number };
  /** Knowledge-panel slices (F6.5). Optional — the *Of() helpers default empties. */
  overview?: OverviewSlice;
  memory?: MemorySlice;
  routing?: RoutingSlice;
  doctor?: DoctorSlice;
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
    launch: { selected: 0 },
    overview: emptyOverview(),
    memory: emptyMemory(),
    routing: emptyRouting(),
    doctor: emptyDoctor(),
  };
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
  | { type: "launch"; agent: string }
  /** Launch confirmed through the governor's dialog (an override that gets logged). */
  | { type: "launchConfirmed"; agent: string; cwd: string; reason: string }
  // Knowledge panels (F6.5): each landing refreshes its slice from its subcommand.
  | { type: "refreshStatus" }
  | { type: "refreshMemory" }
  | { type: "refreshRouting" }
  | { type: "refreshFleetDoctor" }
  /** Doctor `r`: re-run `doctor --json` (async, spinner) without leaving the view. */
  | { type: "rerunDoctor" }
  /** Write `text` to permanent agentic memory via `ebrain remember`, then refresh. */
  | { type: "remember"; text: string };

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
  return { ...state, tab, confirmQuit: false, overlay: null };
}

/** Navigate to `tab`, requesting the matching data refresh when landing on a live view
 * so its data is current the moment you arrive (the loop performs the refresh). Each
 * knowledge panel (6.5) refreshes from its own contract-tested subcommand. */
function goTab(state: AppState, tab: TabName): ReduceResult {
  return settle(withTab(state, tab), refreshEffectFor(tab));
}

function refreshEffectFor(tab: TabName): AppEffect | undefined {
  switch (tab) {
    case "sessions":
      return { type: "refreshSessions" };
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

/** Clamp `i` into [0, count-1] (count>0 assumed by callers). */
function clampIndex(i: number, count: number): number {
  return Math.min(Math.max(0, i), count - 1);
}

/**
 * Apply one key to the current state. Pure — no I/O, no rendering. Mirrors the
 * key-handling switch in FlowClock's runDashboardApp, but as a standalone function
 * so app.test.ts can drive it directly without a fake TTY.
 */
export function reduce(state: AppState, key: Key): ReduceResult {
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
          effect: { type: "launchConfirmed", agent: ov.agent, cwd: ov.cwd, reason: ov.reason },
        };
      }
      if (
        key.name === "escape" ||
        (key.name === "char" && (key.char === "n" || key.char === "N" || key.char === "q"))
      ) {
        return settle({ ...state, overlay: null });
      }
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

    // ov.kind === "prompt": type a line; enter sends (deliberate) · esc cancels.
    if (key.name === "escape") return settle({ ...state, overlay: null });
    if (key.name === "enter") {
      const text = ov.line.text.trim();
      if (text.length === 0) return settle({ ...state, overlay: null }); // empty → just close
      return { state: { ...state, overlay: null }, quit: false, forceRedraw: false, effect: { type: "send", name: ov.name, text } };
    }
    const edited = lineApplyKey(ov.line, key);
    if (edited.handled) return settle({ ...state, overlay: { kind: "prompt", name: ov.name, line: edited.state } });
    return settle(state);
  }

  if (key.name === "tab") {
    const idx = TABS.indexOf(state.tab);
    return goTab(state, TABS[(idx + 1) % TABS.length]!);
  }
  if (key.name === "shifttab") {
    const idx = TABS.indexOf(state.tab);
    return goTab(state, TABS[(idx - 1 + TABS.length) % TABS.length]!);
  }

  // Sessions panel: ↑↓ move the fleet selection; the peek follows (throttled by the loop).
  if (state.tab === "sessions" && (key.name === "up" || key.name === "down")) {
    const s = sessionsOf(state);
    if (s.rows.length === 0) return settle({ ...state, confirmQuit: false });
    const delta = key.name === "down" ? 1 : -1;
    const selected = Math.min(Math.max(0, s.selected + delta), s.rows.length - 1);
    if (selected === s.selected) return settle({ ...state, confirmQuit: false });
    return settle(
      { ...state, confirmQuit: false, sessions: { ...s, selected } },
      { type: "peek", name: s.rows[selected]!.name },
    );
  }

  // Launch panel: arrows move the agent-grid selection; enter launches the selected one.
  if (state.tab === "launch") {
    if (key.name === "up" || key.name === "down" || key.name === "left" || key.name === "right") {
      const cur = state.launch?.selected ?? 0;
      const delta =
        key.name === "left" ? -1 : key.name === "right" ? 1 : key.name === "up" ? -LAUNCH_COLS : LAUNCH_COLS;
      const selected = Math.min(Math.max(0, cur + delta), LAUNCHABLE.length - 1);
      return settle({ ...state, confirmQuit: false, launch: { selected } });
    }
    if (key.name === "enter") {
      const it = LAUNCHABLE[state.launch?.selected ?? 0];
      if (it) return settle({ ...state, confirmQuit: false }, { type: "launch", agent: it.agent });
    }
  }

  // Knowledge panels (6.5): ↑↓ move the row selection within the focused list.
  if (key.name === "up" || key.name === "down") {
    const delta = key.name === "down" ? 1 : -1;
    if (state.tab === "memory") {
      const m = memoryOf(state);
      const n = m.data?.learnings.length ?? 0;
      if (n === 0) return settle({ ...state, confirmQuit: false });
      const selected = clampIndex(m.selected + delta, n);
      return settle({ ...state, confirmQuit: false, memory: { ...m, selected } });
    }
    if (state.tab === "routing") {
      const r = routingOf(state);
      const n = r.data?.byCap.length ?? 0;
      if (n === 0) return settle({ ...state, confirmQuit: false });
      const selected = clampIndex(r.selected + delta, n);
      return settle({ ...state, confirmQuit: false, routing: { ...r, selected } });
    }
    if (state.tab === "doctor") {
      const d = doctorOf(state);
      const n = d.doctor?.checks.length ?? 0;
      if (n === 0) return settle({ ...state, confirmQuit: false });
      const selected = clampIndex(d.selected + delta, n);
      return settle({ ...state, confirmQuit: false, doctor: { ...d, selected } });
    }
  }

  if (key.name === "char") {
    const ch = key.char;

    if (ch === CTRL_C) {
      if (state.confirmQuit) return { state, quit: true, forceRedraw: false };
      return settle({ ...state, confirmQuit: true });
    }
    if (ch === CTRL_D) return { state, quit: true, forceRedraw: false };
    if (ch === "q") return { state, quit: true, forceRedraw: false };
    if (ch === CTRL_L) return { state: { ...state, confirmQuit: false }, quit: false, forceRedraw: true };

    if (ch >= "1" && ch <= "6") {
      const tab = TABS[Number(ch) - 1];
      if (tab) return goTab(state, tab);
    }
    if (ch === "l") return goTab(state, "launch");

    // Overlays: "/" or ctrl+p ("\x10") open the command palette; "?" opens help.
    if (ch === "/" || ch === "\x10") return openPalette(state);
    if (ch === "?") return openHelp(state);

    // Sessions panel actions (only on that tab): a attach · k kill · p prompt · r refrescar.
    if (state.tab === "sessions") {
      const s = sessionsOf(state);
      const sel = s.rows[s.selected];
      if (ch === "r") return settle({ ...state, confirmQuit: false }, { type: "refreshSessions" });
      if (sel) {
        if (ch === "a") return settle({ ...state, confirmQuit: false }, { type: "attach", name: sel.name });
        if (ch === "k") return settle({ ...state, confirmQuit: false, overlay: { kind: "confirmKill", name: sel.name } });
        if (ch === "p") return settle({ ...state, confirmQuit: false, overlay: { kind: "prompt", name: sel.name, line: lineFrom("") } });
      }
    }

    // Memory panel: r opens the remember composer (writes to permanent agentic memory).
    if (state.tab === "memory" && ch === "r") {
      return settle({ ...state, confirmQuit: false, overlay: { kind: "remember", line: lineFrom("") } });
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
  frame.push(padTo(tabBar({ tabs: [...TABS], active: TABS.indexOf(state.tab) }, theme), cols));
  frame.push(buildHairlineRow(theme, cols));
  frame.push(...buildMiddle(state, middleRect, theme));
  frame.push(hintBar({ hints: hintsForTab(state.tab), right: "ctrl+c salir" }, theme, cols));
  frame.push(footer({ cwd: state.cwd, branch: state.branch, right: `ebrain ${EBRAIN_UI_VERSION}` }, theme, cols));

  // Defensive: guarantee exactly `rows` rows of exactly `cols` width regardless of
  // how the section arithmetic above landed.
  while (frame.length < rows) frame.push(" ".repeat(cols));
  const base = frame.slice(0, rows).map((r) => padTo(truncate(r, cols), cols));

  if (state.overlay) return compositeOverlay(base, state.overlay, size, theme);
  return base;
}

// ---------------------------------------------------------------------------
// Overlay compositing — palette (6.3.4) + help (6.3.5) modals.
//
// A band-clear composite: the box's row band is cleared to a plain void scrim and
// the centered box placed on it; rows above/below keep the base view (so you still
// see the tab context behind the modal). Exact width/height preserved.
// ---------------------------------------------------------------------------

function overlayBox(overlay: Overlay, cols: number, rows: number, theme: Theme): { box: string[]; top: number; left: number } {
  if (overlay.kind === "palette") {
    const width = Math.min(64, Math.max(20, cols - 4));
    const maxItems = Math.max(1, rows - 8);
    const items = toItems(filterCommands(overlay.palette.query)).slice(0, maxItems);
    const selected = Math.min(Math.max(0, overlay.palette.selected), Math.max(0, items.length - 1));
    const box = commandPalette({ query: overlay.palette.query, items, selected, width }, theme);
    const left = Math.max(0, Math.floor((cols - width) / 2));
    const top = Math.max(0, Math.min(Math.floor(rows * 0.3), rows - box.length));
    return { box, top, left };
  }

  if (overlay.kind === "confirmKill") {
    const width = Math.min(52, Math.max(30, cols - 8));
    const box = confirm(
      {
        title: "matar sesion",
        message: `kill ${overlay.name}? no se puede deshacer.`,
        danger: true,
        confirmKey: "y",
        confirmLabel: "matar",
        cancelKey: "n",
        cancelLabel: "cancelar",
        width,
      },
      theme,
    );
    const left = Math.max(0, Math.floor((cols - width) / 2));
    const top = Math.max(0, Math.floor((rows - box.length) / 2));
    return { box, top, left };
  }

  if (overlay.kind === "confirmLaunch") {
    const width = Math.min(80, Math.max(40, cols - 6));
    const box = confirm(
      {
        title: "gobernador RAM",
        message: overlay.reason,
        danger: false,
        confirmKey: "y",
        confirmLabel: `lanzar ${overlay.agent} igual`,
        cancelKey: "n",
        cancelLabel: "cancelar",
        width,
      },
      theme,
    );
    const left = Math.max(0, Math.floor((cols - width) / 2));
    const top = Math.max(0, Math.floor((rows - box.length) / 2));
    return { box, top, left };
  }

  if (overlay.kind === "prompt") {
    const width = Math.min(64, Math.max(30, cols - 6));
    const box = buildPromptBox(overlay, width, theme);
    const left = Math.max(0, Math.floor((cols - width) / 2));
    const top = Math.max(0, Math.min(Math.floor(rows * 0.4), rows - box.length));
    return { box, top, left };
  }

  if (overlay.kind === "remember") {
    const width = Math.min(72, Math.max(30, cols - 6));
    const box = buildRememberBox(overlay, width, theme);
    const left = Math.max(0, Math.floor((cols - width) / 2));
    const top = Math.max(0, Math.min(Math.floor(rows * 0.4), rows - box.length));
    return { box, top, left };
  }

  // help (fallthrough)
  const width = Math.min(66, Math.max(20, cols - 4));
  const box = renderHelp(theme, COMMANDS, width);
  const left = Math.max(0, Math.floor((cols - width) / 2));
  const top = Math.max(0, Math.floor((rows - box.length) / 2));
  return { box, top, left };
}

/** Prompt overlay box: a square dialog panel wrapping a single PromptBox row. Mid-line
 * caret is F6.6.3's composer; here the caret trails (single-line append is the case). */
function buildPromptBox(overlay: Extract<Overlay, { kind: "prompt" }>, width: number, theme: Theme): string[] {
  const field = promptBox(
    { value: overlay.line.text, focus: true, hint: "enter enviar · esc cancelar", width: width - 4 },
    theme,
  );
  const target = overlay.name.startsWith("ebr-") ? overlay.name.slice(4) : overlay.name;
  return panel(
    { title: `prompt → ${target}`, dialog: true, width, height: 3, body: [field], bg: "background.raised" },
    theme,
  );
}

/** Remember overlay box: a PromptBox wrapped in a titled dialog panel. Writes to
 * permanent agentic memory on enter — the composer is single-line here (the multiline
 * RememberForm of the mockup is the composer work in F6.6.3). */
function buildRememberBox(overlay: Extract<Overlay, { kind: "remember" }>, width: number, theme: Theme): string[] {
  const field = promptBox(
    { value: overlay.line.text, focus: true, placeholder: "un aprendizaje durable, auto-contenido", hint: "enter guardar · esc cancelar", width: width - 4 },
    theme,
  );
  return panel(
    { title: "recordar → memoria agentica permanente", dialog: true, width, height: 3, body: [field], bg: "background.raised" },
    theme,
  );
}

function compositeOverlay(base: string[], overlay: Overlay, size: FrameSize, theme: Theme): string[] {
  const { cols, rows } = size;
  const { box, top, left } = overlayBox(overlay, cols, rows, theme);
  const out = base.slice();
  for (let i = 0; i < box.length; i++) {
    const y = top + i;
    if (y < 0 || y >= rows) continue;
    const boxRow = box[i]!;
    const boxW = displayWidth(boxRow);
    const leftPad = " ".repeat(Math.max(0, left));
    const rightPad = " ".repeat(Math.max(0, cols - left - boxW));
    out[y] = padTo(truncate(leftPad + boxRow + rightPad, cols), cols);
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
  let rows: string[];
  if (state.tab === "home") rows = buildOverviewView(overviewOf(state), sessionsOf(state), rect, theme);
  else if (state.tab === "sessions") rows = buildSessionsView(sessionsOf(state), rect, theme);
  else if (state.tab === "launch") rows = buildLaunchView(state.launch?.selected ?? 0, rect, theme);
  else if (state.tab === "memory") rows = buildMemoryView(memoryOf(state), rect, theme);
  else if (state.tab === "routing") rows = buildRoutingView(routingOf(state), rect, theme);
  else rows = buildDoctorView(doctorOf(state), rect, theme);
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
  return theme.fg("text.secondary") + padTo(text, 12) + theme.reset;
}

/** Lock-awareness banner (6.5.5): one row when the brain read came back cached (the
 * PGLite lock was held by an MCP server). Empty array otherwise. */
function overviewBanner(o: OverviewSlice, cols: number, theme: Theme): string[] {
  if (!o.data?.brain.cached) return [];
  const warn = theme.fg("semantic.warn");
  const dim = theme.fg("text.secondary");
  const reset = theme.reset;
  const served = o.data.brain.servedBy || "mcp";
  const stamp = o.atLabel ? dim + " · datos cacheados " + o.atLabel + reset : "";
  const glyph = theme.glyph("badgeDot");
  const text = `${glyph} brain served by ${served} (lock)`;
  return [warn + text + reset + stamp];
}

function buildSistemaBody(d: OverviewData, theme: Theme): string[] {
  const ok = theme.fg("semantic.ok");
  const warnC = theme.fg("semantic.warn");
  const dim = theme.fg("text.secondary");
  const primary = theme.fg("text.primary");
  const reset = theme.reset;

  const up = d.brain.state === "up";
  const brainState = (up ? BOLD + ok : warnC) + d.brain.state.toUpperCase() + reset;
  const served = d.brain.servedBy ? dim + "  " + d.brain.servedBy + reset : "";
  const brainLine = labelCell("brain", theme) + brainState + served;

  const spendLine =
    labelCell("spend", theme) +
    gauge({ value: d.spend.mtd, max: d.spend.cap, width: 16, suffix: `$${d.spend.mtd.toFixed(2)}/$${d.spend.cap}` }, theme);

  const online = d.fleet.online === d.fleet.total ? ok : warnC;
  const fleetLine =
    labelCell("fleet", theme) + primary + `${d.fleet.online}/${d.fleet.total} ` + reset + online + "online" + reset;

  const memLine =
    labelCell("memoria", theme) +
    theme.fg("memory.violet") + `${d.memory.learnings} ` + reset + dim + "learnings · " + reset +
    primary + `${d.memory.sessions} ` + reset + dim + "sesiones" + reset;

  return [brainLine, "", spendLine, "", fleetLine, memLine];
}

/** One home "ultimas memorias" row from a real learning: violet bullet + text + dim
 * source (project). No fabricated score — `memory recent` carries none. */
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

  const textCell = padTo(truncate(oneLine(l.text), textW), textW);
  const sourceCell = " ".repeat(gapW) + padTo(truncate(src, sourceW), sourceW, "right");
  return violet + glyph + " " + reset + primary + textCell + reset + dim + sourceCell + reset;
}

/** Collapse a possibly multi-line learning into a single display line. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function buildOverviewView(o: OverviewSlice, sessions: SessionsSlice, rect: Rect, theme: Theme): string[] {
  const cols = rect.width;
  const wm = wordmark({ variant: "block" }, theme);
  const out: string[] = [];

  const wmBlock: string[] = [];
  for (const line of wm) wmBlock.push(centerLine(line, cols));
  wmBlock.push(" ".repeat(cols));

  // Wordmark always shows; the banner (if any) sits just under it.
  const banner = overviewBanner(o, cols, theme);

  // No data yet → a single status line where the panels would be (never a spinner-forever).
  if (!o.data) {
    for (const l of wmBlock) out.push(l);
    for (const b of banner) out.push(centerLine(b, cols));
    const msg =
      o.status === "error"
        ? theme.fg("semantic.error") + `error: ${o.error ?? "consultando ebrain status"}` + theme.reset
        : theme.fg("text.secondary") + "cargando estado del sistema…" + theme.reset;
    while (out.length < Math.floor(rect.height / 2)) out.push(" ".repeat(cols));
    out.push(centerLine(msg, cols));
    while (out.length < rect.height) out.push(" ".repeat(cols));
    return out.slice(0, rect.height);
  }

  const memoriesPanelHeight = 5; // 2 borders + 3 data rows
  const memBlockHeight = memoriesPanelHeight + 1;
  const bannerH = banner.length;
  const wmH = wmBlock.length;
  const [wmRect, panelsRect, memRect] = splitV(rect, [
    wmH + bannerH,
    { flex: 1 },
    memBlockHeight,
  ]);

  if (wmRect.height > 0) {
    for (const l of wmBlock) out.push(l);
    for (const b of banner) out.push(centerLine(b, cols));
  }

  if (panelsRect.height > 0) {
    const [sistemaRect, sesionesRect] = splitH(
      { top: 0, left: 0, width: panelsRect.width, height: panelsRect.height },
      [46, { flex: 1 }],
      2,
    );
    const sistemaPanel = panel(
      { title: "sistema", width: sistemaRect.width, height: panelsRect.height, body: buildSistemaBody(o.data, theme), bg: "background.surface" },
      theme,
    );

    const rowW = Math.max(8, sesionesRect.width - 4);
    const sessionBody =
      sessions.rows.length > 0
        ? sessions.rows.slice(0, Math.max(0, panelsRect.height - 2)).map((r, i) => renderFleetRow(r, rowW, i === 0, theme))
        : [theme.fg("text.secondary") + "sin sesiones activas · pulsa 2" + theme.reset];
    const sesionesPanel = panel(
      {
        title: `sesiones activas · ${sessions.rows.length}`,
        focus: true,
        width: sesionesRect.width,
        height: panelsRect.height,
        body: sessionBody,
        bg: "background.surface",
      },
      theme,
    );
    const gap = " ".repeat(Math.max(0, panelsRect.width - sistemaRect.width - sesionesRect.width));
    for (let i = 0; i < panelsRect.height; i++) {
      out.push((sistemaPanel[i] ?? "") + gap + (sesionesPanel[i] ?? ""));
    }
  }

  if (memRect.height > 0) {
    out.push(" ".repeat(cols));
    const learnings = o.memory?.learnings ?? [];
    const memoriesBody =
      learnings.length > 0
        ? learnings.slice(0, 3).map((l) => formatOverviewMemoryRow(l, Math.max(0, cols - 4), theme))
        : [theme.fg("text.secondary") + "sin memorias recientes" + theme.reset];
    out.push(
      ...panel(
        { title: "ultimas memorias", width: cols, height: memoriesPanelHeight, body: memoriesBody, bg: "background.surface" },
        theme,
      ),
    );
  }

  while (out.length < rect.height) out.push(" ".repeat(cols));
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
  const nameCell = nameColor + padTo(truncate(it.name, nameW), nameW) + reset;
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
  return panel({ title, width: rect.width, height: rect.height, body, bg: "background.surface" }, theme);
}

export function buildSessionsView(s: SessionsSlice, rect: Rect, theme: Theme): string[] {
  const cols = rect.width;
  const height = rect.height;
  if (height <= 0) return [];

  // Empty / status states — a single centered message panel (NEVER a spinner-forever).
  if (s.rows.length === 0) {
    const msg =
      s.status === "no-tmux"
        ? "tmux no esta instalado en este entorno"
        : s.status === "loading" || s.status === "idle"
          ? "cargando sesiones…"
          : s.status === "error"
            ? `error: ${s.error ?? "consultando tmux"}`
            : "sin sesiones activas · pulsa l para lanzar una";
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
  const noun = s.rows.length === 1 ? "sesion" : "sesiones";
  const leftPanel = panel(
    {
      title: `fleet · ${s.rows.length} ${noun}`,
      focus: true,
      width: leftRect.width,
      height,
      body: listBody,
      bg: "background.surface",
    },
    theme,
  );

  // Right: live TerminalPeek of the selected session (foreign output → always dim border).
  const selRow = s.rows[selected]!;
  const peekBody =
    s.peek && s.peek.name === selRow.name
      ? tailLines(s.peek.text, Math.max(1, height - 2))
      : ["  (capturando salida…)"];
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

function buildLaunchView(sel: number, rect: Rect, theme: Theme): string[] {
  const reset = theme.reset;
  const selected = Math.min(Math.max(0, sel), LAUNCHABLE.length - 1);
  const contentW = Math.max(0, rect.width - 4);
  const colGap = 2;
  const cellW = Math.max(10, Math.floor((contentW - colGap) / LAUNCH_COLS));
  const rowsN = Math.ceil(LAUNCHABLE.length / LAUNCH_COLS);

  const grid: string[] = [];
  for (let r = 0; r < rowsN; r++) {
    let line = "";
    for (let c = 0; c < LAUNCH_COLS; c++) {
      const idx = r * LAUNCH_COLS + c;
      if (c > 0) line += " ".repeat(colGap);
      if (idx >= LAUNCHABLE.length) {
        line += " ".repeat(cellW);
        continue;
      }
      const it = LAUNCHABLE[idx]!;
      const on = idx === selected;
      const marker = on ? theme.fg("accent.teal") + "▸ " + reset : "  ";
      const b = badge({ agent: it.agent }, theme);
      const clsColor = it.cls === "heavy" ? theme.fg("semantic.warn") : theme.fg("text.muted");
      line += padTo(truncate(marker + b + "  " + clsColor + it.cls + reset, cellW), cellW);
    }
    grid.push(line);
  }

  const selAgent = LAUNCHABLE[selected]!.agent;
  const foot =
    theme.fg("text.muted") + "enter → nueva sesion " + reset +
    theme.fg("text.primary") + selAgent + reset +
    theme.fg("text.muted") + " en el cwd actual · el gobernador RAM revisa antes de lanzar" + reset;

  const body = [...grid, "", foot];
  return panel(
    { title: "lanzar agente", focus: true, width: rect.width, height: rect.height, body, bg: "background.surface" },
    theme,
  );
}

// ---------------------------------------------------------------------------
// Memory view (F6.5.2) — screens-b.jsx's MemoryScreen wired to `memory recent --json`:
// a semantic-search PromptBox (informational — `ebrain q` has no --json contract, so no
// fabricated score/source parsing), a navigable "resultados" ScrollList of recent
// learnings (violet = memoria), a "session-logs" side panel, and `r` to open the
// remember composer (writes to permanent agentic memory). Round-trip remember→recent is
// the F6.5 criterion #6.
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

function renderLogRow(s: MemorySession, width: number, theme: Theme): string {
  const reset = theme.reset;
  const ts = theme.fg("text.muted") + padTo(fmtLogTs(s.ts), 11) + reset;
  const b = badge({ agent: s.agent as AgentName, label: oneLine(s.summary) }, theme);
  return truncate(ts + " " + b, width);
}

export function buildMemoryView(m: MemorySlice, rect: Rect, theme: Theme): string[] {
  const cols = rect.width;
  const height = rect.height;
  if (height <= 0) return [];

  if (!m.data) {
    const msg =
      m.status === "error" ? `error: ${m.error ?? "consultando memoria"}` : "cargando memoria…";
    return buildCenteredMessagePanel("memory", msg, rect, theme);
  }

  const learnings = m.data.learnings;
  const sessions = m.data.sessions;
  const [searchRect, midRect, footRect] = splitV(rect, [1, { flex: 1 }, 1]);

  const out: string[] = [];

  // Search row (informational — live search lives in `ebrain q` at the terminal).
  out.push(
    padTo(
      promptBox(
        { value: "", focus: false, placeholder: "busqueda semantica — `ebrain q` en terminal", hint: "", width: cols },
        theme,
      ),
      cols,
    ),
  );

  // Mid: results (flex) + session-logs (fixed).
  const rightW = Math.min(40, Math.max(24, Math.floor(cols * 0.34)));
  const [leftRect, rightRect] = splitH({ top: 0, left: 0, width: cols, height: midRect.height }, [{ flex: 1 }, rightW], 2);

  const selected = clampIndex(m.selected, Math.max(1, learnings.length));
  const listHeight = Math.max(1, midRect.height - 2);
  const offset = scrollOffset(selected, listHeight, learnings.length);
  const rowW = Math.max(8, leftRect.width - 4 - 3);
  const resultsBody =
    learnings.length > 0
      ? scrolllist(
          {
            items: learnings,
            selected,
            height: listHeight,
            offset,
            renderItem: (l, idx) => renderLearningRow(l, rowW, idx === selected, theme),
          },
          theme,
        )
      : [theme.fg("text.secondary") + "sin learnings recientes" + theme.reset];
  const leftPanel = panel(
    { title: `resultados · ${learnings.length} · violeta = memoria`, focus: true, width: leftRect.width, height: midRect.height, body: resultsBody, bg: "background.surface" },
    theme,
  );

  const logW = Math.max(8, rightRect.width - 4);
  const logsBody =
    sessions.length > 0
      ? sessions.slice(0, Math.max(0, midRect.height - 2)).map((s) => renderLogRow(s, logW, theme))
      : [theme.fg("text.secondary") + "sin sesiones" + theme.reset];
  const rightPanel = panel(
    { title: "session-logs", width: rightRect.width, height: midRect.height, body: logsBody, bg: "background.surface" },
    theme,
  );

  const gap = " ".repeat(Math.max(0, cols - leftRect.width - rightRect.width));
  for (let i = 0; i < midRect.height; i++) out.push((leftPanel[i] ?? "") + gap + (rightPanel[i] ?? ""));

  // Footer hint (the composer opens as an overlay on `r`).
  if (footRect.height > 0) {
    const foot =
      theme.fg("text.muted") + "r → recordar (memoria agentica permanente) · ↑↓ resultados" + theme.reset;
    out.push(padTo(truncate(foot, cols), cols));
  }

  while (out.length < height) out.push(" ".repeat(cols));
  return out.slice(0, height);
}

// ---------------------------------------------------------------------------
// Routing view (F6.5.3) — screens-b.jsx's RoutingScreen, honestly scoped to the
// `spend --json` contract: a per-capability MTD Table (navigable), the total-vs-cap
// budget gauge, and the gbrain-untracked flag. The winner/fallback/floor CHAINS and the
// per-event LEDGER from the mockup have NO --json contract yet (reading routing.yaml /
// spend.jsonl directly would be orphan logic that fails gate criterion #2) — surfaced as
// a documented "pendiente" note, same discipline that deferred the launch wizard to 6.6.
// ---------------------------------------------------------------------------

export function buildRoutingView(r: RoutingSlice, rect: Rect, theme: Theme): string[] {
  const cols = rect.width;
  const height = rect.height;
  if (height <= 0) return [];

  if (!r.data) {
    const msg = r.status === "error" ? `error: ${r.error ?? "consultando spend"}` : "cargando gasto…";
    return buildCenteredMessagePanel("routing", msg, rect, theme);
  }

  const d = r.data;
  const rightW = Math.min(42, Math.max(28, Math.floor(cols * 0.36)));
  const [leftRect, rightRect] = splitH({ top: 0, left: 0, width: cols, height }, [{ flex: 1 }, rightW], 2);

  // Left: per-capability spend table + total line.
  const selected = clampIndex(r.selected, Math.max(1, d.byCap.length));
  const rows = d.byCap.map((c) => ({
    cap: c.capability,
    routes: String(c.routes),
    mtd: "$" + c.mtd.toFixed(3),
  }));
  const tableRows = table(
    {
      columns: [
        { key: "cap", label: "capacidad", width: 15 },
        { key: "routes", label: "rutas", width: 6, align: "right" },
        { key: "mtd", label: "mtd", width: 9, align: "right" },
      ],
      rows,
      selected,
    },
    theme,
  );
  const totalLine =
    theme.fg("text.muted") + "total hoy  " + theme.reset +
    spendTone(d.mtd, d.cap, theme) + "$" + d.mtd.toFixed(3) + theme.reset +
    theme.fg("text.muted") + " / $" + d.cap.toFixed(2) + theme.reset;
  const leftBody = [...tableRows, "", totalLine];
  const leftPanel = panel(
    { title: "caps · gasto por carril", focus: true, width: leftRect.width, height, body: leftBody, bg: "background.surface" },
    theme,
  );

  // Right: budget gauge + remaining + hard-stop + gbrain flag + deferred note.
  const budgetBody: string[] = [];
  budgetBody.push(gauge({ value: d.mtd, max: d.cap, width: Math.max(8, rightRect.width - 6), suffix: "", tone: "auto" }, theme));
  budgetBody.push("");
  budgetBody.push(theme.fg("text.secondary") + "restante  " + theme.fg("text.primary") + "$" + d.remaining.toFixed(2) + theme.reset);
  budgetBody.push(
    theme.fg("text.secondary") + "hard-stop " +
      (d.hardStop ? theme.fg("semantic.ok") + "si" : theme.fg("semantic.warn") + "no") + theme.reset,
  );
  if (d.gbrainUntracked) {
    budgetBody.push("");
    budgetBody.push(theme.fg("semantic.warn") + theme.glyph("badgeDot") + " gbrain: gasto sin trackear" + theme.reset);
  }
  budgetBody.push("");
  budgetBody.push(theme.fg("text.muted") + "cadenas + ledger por evento:" + theme.reset);
  budgetBody.push(theme.fg("text.muted") + "pendiente contrato routing --json" + theme.reset);
  const rightPanel = panel(
    { title: `presupuesto · ${d.month}`, width: rightRect.width, height, body: budgetBody, bg: "background.surface" },
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
  return glyphCell + idCell + msgCell;
}

export function buildDoctorView(d: DoctorSlice, rect: Rect, theme: Theme): string[] {
  const cols = rect.width;
  const height = rect.height;
  if (height <= 0) return [];

  if (!d.doctor && !d.fleet) {
    const msg =
      d.status === "error"
        ? `error: ${d.error ?? "consultando doctor"}`
        : d.running
          ? "ejecutando diagnostico…"
          : "cargando diagnostico…";
    return buildCenteredMessagePanel("doctor", msg, rect, theme);
  }

  const rightW = Math.min(38, Math.max(24, Math.floor(cols * 0.32)));
  const [leftRect, rightRect] = splitH({ top: 0, left: 0, width: cols, height }, [{ flex: 1 }, rightW], 2);

  // Left: diagnostics list (spinner row while re-running).
  const checks = d.doctor?.checks ?? [];
  const selected = clampIndex(d.selected, Math.max(1, checks.length));
  const leftBody: string[] = [];
  if (d.running) {
    leftBody.push(spinner({ label: "re-ejecutando checks…", frame: d.spinnerFrame }, theme));
    leftBody.push("");
  }
  const listRoom = Math.max(1, height - 2 - leftBody.length);
  const rowW = Math.max(8, leftRect.width - 4);
  const offset = scrollOffset(selected, listRoom, checks.length);
  const windowed = checks.slice(offset, offset + listRoom);
  for (let i = 0; i < windowed.length; i++) {
    leftBody.push(renderCheckRow(windowed[i]!, rowW, offset + i === selected, theme));
  }
  const title = d.running ? "diagnostico" : d.atLabel ? `diagnostico · ultimo ${d.atLabel}` : "diagnostico";
  const leftPanel = panel(
    { title, focus: true, width: leftRect.width, height, body: leftBody, bg: "background.surface" },
    theme,
  );

  // Right: fleet online state + RAM class, plus a warn/fail summary.
  const agents = d.fleet?.agents ?? [];
  const online = d.fleet?.online ?? 0;
  const total = d.fleet?.total ?? 0;
  const fleetBody: string[] = [];
  for (const a of agents) {
    const b = badge({ agent: a.name as AgentName, label: a.name }, theme);
    const state = a.ok ? theme.fg("semantic.ok") + "online" : theme.fg("semantic.error") + "offline";
    const cls = theme.fg("text.muted") + " " + a.cls + theme.reset;
    const bw = Math.max(0, rightRect.width - 4 - 7 - displayWidth(a.cls) - 1);
    fleetBody.push(padTo(b, bw) + state + theme.reset + cls);
  }
  if (d.doctor) {
    fleetBody.push("");
    fleetBody.push(
      theme.fg("text.muted") + `${d.doctor.warn} warn · ${d.doctor.fail} fail` + theme.reset,
    );
  }
  const rightPanel = panel(
    { title: `fleet ${online}/${total}`, width: rightRect.width, height, body: fleetBody, bg: "background.surface" },
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

  const message = `ebrain ui requiere ≥80×24 — actual ${cols}×${rows}`;
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
      const result = reduce(state, key);
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
      if (!r.ok) return;
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

    /** Launch `agent`: run the RAM governor (6.4.6); if it wants confirmation, open the
     * dialog; otherwise launch straight away. */
    async function doLaunch(agent: string): Promise<void> {
      const cwd = callerCwd();
      const [cls, heavy] = await Promise.all([classOf(agent), countLiveHeavy()]);
      const g = governLaunch({ launchingClass: cls, liveHeavyCount: heavy, availableMb: readAvailableMb() });
      if (g.decision === "confirm") {
        state = { ...state, overlay: { kind: "confirmLaunch", agent, cwd, reason: g.reason } };
        render();
        return;
      }
      await performLaunch(agent, cwd, null);
    }

    /** Actually create the session (via the manifest launch cmd + full harness env).
     * `override` non-null means the user pushed past the governor → log the override. */
    async function performLaunch(agent: string, cwd: string, override: string | null): Promise<void> {
      if (override) logOverride({ agent, cwd, reason: override });
      const r = await newSession(agent, launchSlug(cwd), { cwd });
      if (!r.ok) {
        // Surface the refusal (deny-client rc=2, bad-agent, tmux error) in the panel.
        const s = sessionsOf(state);
        state = { ...state, tab: "sessions", sessions: { ...s, status: "error", error: r.error.message } };
        render();
        return;
      }
      state = withTab(state, "sessions"); // jump to Sessions to show the new one
      render();
      await refreshSessions();
    }

    function launchSlug(cwd: string): string {
      const base = cwd.split("/").filter(Boolean).pop() || "sesion";
      const clean = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16) || "sesion";
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

      const [st, mem] = await Promise.all([fetchStatus(), fetchMemory(3)]);
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
      const r = await fetchMemory(8);
      const m = memoryOf(state);
      if (r.ok) {
        state = { ...state, memory: { ...m, data: r.data, selected: Math.min(m.selected, Math.max(0, r.data.learnings.length - 1)), status: "ready", error: undefined } };
      } else {
        state = { ...state, memory: { ...m, status: "error", error: r.error } };
      }
      if (state.tab === "memory") render();
    }

    async function refreshRouting(): Promise<void> {
      const cur = routingOf(state);
      state = { ...state, routing: { ...cur, status: cur.data ? cur.status : "loading" } };
      if (state.tab === "routing") render();
      const r = await fetchSpend();
      const rt = routingOf(state);
      if (r.ok) {
        state = { ...state, routing: { ...rt, data: r.data, selected: Math.min(rt.selected, Math.max(0, r.data.byCap.length - 1)), status: "ready", error: undefined } };
      } else {
        state = { ...state, routing: { ...rt, status: "error", error: r.error } };
      }
      if (state.tab === "routing") render();
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
          await doLaunch(effect.agent);
          break;
        case "launchConfirmed":
          await performLaunch(effect.agent, effect.cwd, effect.reason);
          break;
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
