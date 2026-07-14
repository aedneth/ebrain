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

/** A transient modal overlay composited over the base view (6.3.4/6.3.5). */
export type Overlay = { kind: "palette"; palette: PaletteState } | { kind: "help" };

export interface AppState {
  tab: TabName;
  /** true after a first Ctrl-C — a second Ctrl-C quits ("ctrl+c x2" per the registry). */
  confirmQuit: boolean;
  /** Footer identity — the CALLER's cwd (see cli/ebrain's EBRAIN_CALLER_CWD export),
   * not run_bun's neutral working dir. Collapsed to "~/..." when under $HOME. */
  cwd: string;
  branch?: string;
  /** Open command palette / help overlay, or null when none. */
  overlay?: Overlay | null;
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
  return { tab: "home", confirmQuit: false, cwd: collapseHome(dir), branch: detectBranch(dir), overlay: null };
}

// ---------------------------------------------------------------------------
// reduce — pure key -> state transition (testable without a TTY)
// ---------------------------------------------------------------------------

export interface ReduceResult {
  state: AppState;
  quit: boolean;
  /** true when the terminal should be fully re-entered (clear + repaint), not just
   * diffed — the ctrl+l "redraw" command. */
  forceRedraw: boolean;
}

function withTab(state: AppState, tab: TabName): AppState {
  return { ...state, tab, confirmQuit: false, overlay: null };
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
    if ((TABS as readonly string[]).includes(suffix)) return settle(withTab(state, suffix as TabName));
  }
  return settle(state);
}

function settle(state: AppState): ReduceResult {
  return { state, quit: false, forceRedraw: false };
}

/**
 * Apply one key to the current state. Pure — no I/O, no rendering. Mirrors the
 * key-handling switch in FlowClock's runDashboardApp, but as a standalone function
 * so app.test.ts can drive it directly without a fake TTY.
 */
export function reduce(state: AppState, key: Key): ReduceResult {
  // Overlay routing takes precedence over every base keybind while open.
  if (state.overlay) {
    if (state.overlay.kind === "palette") {
      const r = paletteApplyKey(state.overlay.palette, key);
      if (r.action?.type === "run") return runCommand({ ...state, overlay: null }, r.action.command);
      if (r.action?.type === "close") return settle({ ...state, overlay: null });
      return settle({ ...state, overlay: { kind: "palette", palette: r.state } });
    }
    // help overlay: esc / enter / ? / q dismiss it; any other key leaves it open.
    if (
      key.name === "escape" ||
      key.name === "enter" ||
      (key.name === "char" && (key.char === "?" || key.char === "q"))
    ) {
      return settle({ ...state, overlay: null });
    }
    return settle(state);
  }

  if (key.name === "tab") {
    const idx = TABS.indexOf(state.tab);
    return settle(withTab(state, TABS[(idx + 1) % TABS.length]!));
  }
  if (key.name === "shifttab") {
    const idx = TABS.indexOf(state.tab);
    return settle(withTab(state, TABS[(idx - 1 + TABS.length) % TABS.length]!));
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
      if (tab) return settle(withTab(state, tab));
    }
    if (ch === "l") return settle(withTab(state, "launch"));

    // Overlays: "/" or ctrl+p ("\x10") open the command palette; "?" opens help.
    if (ch === "/" || ch === "\x10") return openPalette(state);
    if (ch === "?") return openHelp(state);

    // Any other printable char: no-op beyond clearing the quit-confirm arm.
    return settle({ ...state, confirmQuit: false });
  }

  // Any other key not yet bound (arrows, enter, escape, ...): clear the quit-confirm
  // arm (only a repeated, consecutive Ctrl-C quits) and no-op otherwise.
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
  const width = Math.min(66, Math.max(20, cols - 4));
  const box = renderHelp(theme, COMMANDS, width);
  const left = Math.max(0, Math.floor((cols - width) / 2));
  const top = Math.max(0, Math.floor((rows - box.length) / 2));
  return { box, top, left };
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
  const rows = state.tab === "home" ? buildHomeView(rect, theme) : buildStubView(state.tab, rect, theme);
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
// Stub views — sessions/launch/memory/routing/doctor become real views in F6.4+.
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

    function getSize(): FrameSize {
      return { cols: output.columns ?? 0, rows: output.rows ?? 0 };
    }

    function render(): void {
      screen.render(buildFrame(state, getSize(), theme));
    }

    function restoreTerminal(): void {
      if (stopReader) {
        stopReader();
        stopReader = null;
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
    }

    try {
      stopReader = startNavReader(input, onKey, output);
      process.on("SIGINT", onSignal);
      process.on("SIGTERM", onSignal);
      process.on("uncaughtException", onUncaught);
      output.on("resize", onResize);

      screen.enter();
      render();
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
