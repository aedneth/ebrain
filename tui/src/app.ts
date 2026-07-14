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
import { sessioncard, type SessionState } from "./widgets/data/sessioncard.js";

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

/** A transient modal overlay composited over the base view. palette/help (6.3.4/6.3.5);
 * confirmKill/prompt are the Sessions panel's `k`/`p` actions (6.4.3). */
export type Overlay =
  | { kind: "palette"; palette: PaletteState }
  | { kind: "help" }
  | { kind: "confirmKill"; name: string }
  | { kind: "prompt"; name: string; line: LineState }
  | { kind: "confirmLaunch"; agent: string; cwd: string; reason: string };

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
  | { type: "launchConfirmed"; agent: string; cwd: string; reason: string };

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

/** Navigate to `tab`, requesting a session refresh when landing on the Sessions view
 * so its live data is current the moment you arrive (the loop performs the refresh). */
function goTab(state: AppState, tab: TabName): ReduceResult {
  return settle(withTab(state, tab), tab === "sessions" ? { type: "refreshSessions" } : undefined);
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
  frame.push(buildStatusRow(theme, cols));
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

function buildStatusRow(theme: Theme, cols: number): string {
  const left = wordmark({ variant: "compact" }, theme)[0] ?? "";
  const right =
    "brain " +
    theme.fg("semantic.ok") +
    BOLD +
    "UP" +
    theme.reset +
    statusSep(theme) +
    "fleet 6/6" +
    statusSep(theme) +
    "$2.14/$10";
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
  if (state.tab === "home") rows = buildHomeView(rect, theme);
  else if (state.tab === "sessions") rows = buildSessionsView(sessionsOf(state), rect, theme);
  else if (state.tab === "launch") rows = buildLaunchView(state.launch?.selected ?? 0, rect, theme);
  else rows = buildStubView(state.tab, rect, theme);
  return rows.slice(0, rect.height).map((r) => padTo(truncate(r, rect.width), rect.width));
}

// ---------------------------------------------------------------------------
// Home view — reproduces screens-a.jsx's HomeScreen with static fixture data.
// Real data wiring (brain/fleet/spend/sessions/memory) is F6.5 — out of scope here.
// ---------------------------------------------------------------------------

const SESSIONS_FIXTURE: Array<{ agent: AgentName; name: string; uptime: string; state: SessionState }> = [
  { agent: "claude", name: "ebr-claude-korvex", uptime: "02:41", state: "running" },
  { agent: "gemini", name: "ebr-gem-web", uptime: "00:12", state: "waiting" },
  { agent: "codex", name: "ebr-codex-tests", uptime: "01:03", state: "running" },
  { agent: "opencode", name: "ebr-oc-docs", uptime: "00:48", state: "idle" },
];

const MEMORY_FIXTURE: Array<[text: string, score: string, source: string]> = [
  ["deepseek v3 falla con tool-use paralelo; enrutar a claude", "0.94", "routing"],
  ["korvex usa pnpm, no npm — nunca sugerir npm install", "0.91", "korvex"],
  ["frontier siempre requiere confirmacion manual del usuario", "0.88", "policy"],
];

function labelCell(text: string, theme: Theme): string {
  return theme.fg("text.secondary") + padTo(text, 12) + theme.reset;
}

function buildSistemaBody(theme: Theme): string[] {
  const ok = theme.fg("semantic.ok");
  const dim = theme.fg("text.secondary");
  const primary = theme.fg("text.primary");
  const reset = theme.reset;

  const brainLine = labelCell("brain", theme) + BOLD + ok + "UP" + reset + dim + "  CKIS · 128 learnings" + reset;
  const spendLine = labelCell("spend hoy", theme) + gauge({ value: 2.14, max: 10, width: 16, suffix: "$2.14/$10" }, theme);
  const ramLine = labelCell("ram", theme) + gauge({ value: 3.1, max: 4, width: 16, suffix: "3.1/4G", tone: "auto" }, theme);
  const fleetLine = labelCell("fleet", theme) + primary + "6/6 " + reset + ok + "online" + reset;
  const routingLine = labelCell("routing", theme) + primary + "6 caps " + reset + dim + "· 0 fallbacks" + reset;

  return [brainLine, "", spendLine, ramLine, "", fleetLine, routingLine];
}

function formatMemoryRow([text, score, source]: [string, string, string], contentW: number, theme: Theme): string {
  const violet = theme.fg("memory.violet");
  const primary = theme.fg("text.primary");
  const dim = theme.fg("text.secondary");
  const reset = theme.reset;

  const sourceW = 10; // matches screens-a.jsx: width:'10ch', textAlign:'right'
  const gapW = 2; // matches paddingLeft:'2ch'
  const bulletW = 2; // '● '
  const scoreW = displayWidth(score);
  const textW = Math.max(0, contentW - bulletW - gapW - scoreW - gapW - sourceW);

  const textCell = padTo(truncate(text, textW), textW);
  const scoreCell = " ".repeat(gapW) + score;
  const sourceCell = " ".repeat(gapW) + padTo(source, sourceW, "right");

  return violet + "● " + reset + primary + textCell + reset + violet + scoreCell + reset + dim + sourceCell + reset;
}

function buildHomeView(rect: Rect, theme: Theme): string[] {
  const cols = rect.width;
  const wm = wordmark({ variant: "block" }, theme);
  const wmBlockHeight = wm.length + 1; // + 1 gap row (paddingBottom var(--row-h))
  const memoriesPanelHeight = 5; // 2 borders + 3 data rows
  const memBlockHeight = memoriesPanelHeight + 1; // + 1 gap row (paddingTop var(--row-h))

  const [wmRect, panelsRect, memRect] = splitV(rect, [wmBlockHeight, { flex: 1 }, memBlockHeight]);

  const out: string[] = [];

  if (wmRect.height > 0) {
    for (const line of wm) out.push(centerLine(line, cols));
    out.push(" ".repeat(cols));
  }

  if (panelsRect.height > 0) {
    const [sistemaRect, sesionesRect] = splitH(
      { top: 0, left: 0, width: panelsRect.width, height: panelsRect.height },
      [46, { flex: 1 }],
      2,
    );
    const sistemaPanel = panel(
      { title: "sistema", width: sistemaRect.width, height: panelsRect.height, body: buildSistemaBody(theme), bg: "background.surface" },
      theme,
    );
    const sessionBody = SESSIONS_FIXTURE.slice(0, 4).map((s, i) =>
      sessioncard({ agent: s.agent, name: s.name, uptime: s.uptime, state: s.state, selected: i === 0 }, theme),
    );
    const sesionesPanel = panel(
      {
        title: "sesiones activas",
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
    const memoriesBody = MEMORY_FIXTURE.map((m) => formatMemoryRow(m, Math.max(0, cols - 4), theme));
    out.push(
      ...panel(
        { title: "ultimas memorias", width: cols, height: memoriesPanelHeight, body: memoriesBody, bg: "background.surface" },
        theme,
      ),
    );
  }

  while (out.length < rect.height) out.push(" ".repeat(cols));
  return out;
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
// Stub views — memory/routing/doctor become real views in F6.5.
// ---------------------------------------------------------------------------

function buildStubView(tab: TabName, rect: Rect, theme: Theme): string[] {
  const cols = rect.width;
  const contentW = Math.max(0, cols - 4); // panel width - 2 borders - 2*pad(1)
  const bodyRows = Math.max(0, rect.height - 2);
  const message = theme.fg("text.secondary") + `${tab} — proximamente` + theme.reset;
  const midRow = Math.floor(bodyRows / 2);

  const body: string[] = [];
  for (let i = 0; i < bodyRows; i++) {
    body.push(i === midRow ? centerLine(message, contentW) : "");
  }

  return panel({ title: tab, width: cols, height: rect.height, body, bg: "background.surface" }, theme);
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
    let attaching = false;

    function getSize(): FrameSize {
      return { cols: output.columns ?? 0, rows: output.rows ?? 0 };
    }

    function render(): void {
      if (attaching) return; // tmux owns the terminal during an attach handoff
      screen.render(buildFrame(state, getSize(), theme));
    }

    function restoreTerminal(): void {
      if (stopReader) {
        stopReader();
        stopReader = null;
      }
      if (peekTimer) {
        clearInterval(peekTimer);
        peekTimer = null;
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

    async function handleEffect(effect: AppEffect): Promise<void> {
      switch (effect.type) {
        case "refreshSessions":
          await refreshSessions();
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
