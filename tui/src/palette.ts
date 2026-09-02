/**
 * tui/src/palette.ts — command palette state + logic (SPRINT-TUI 6.3.4).
 *
 * Ported from FlowClock's palette.ts (~/flowclock-cli/src/tui/palette.ts) — pure
 * state + reducer, no I/O, no rendering (rendering is widgets/input/commandpalette.ts).
 * Adapted to ebrain's single command registry (commands.ts): the palette lists and
 * dispatches real `Command`s, so the SAME registry feeds keybinds, the hint bar, the
 * palette, and the help overlay (the claude-code no-drift rule).
 *
 * Filter upgraded from FlowClock's substring match to FUZZY SUBSEQUENCE (matching the
 * DS CommandPalette.jsx `fuzzyMark`): a command matches when `query` is a case-
 * insensitive subsequence of its title.
 */
import type { Key } from "./kit/input.js";
import type { Command } from "./commands.js";
import { COMMANDS } from "./commands.js";
import type { PaletteItem } from "./widgets/input/commandpalette.js";

export interface PaletteState {
  open: boolean;
  query: string;
  selected: number;
}

export function emptyPaletteState(): PaletteState {
  return { open: false, query: "", selected: 0 };
}

/**
 * Commands the palette does NOT list: the compact "1-6" hint-bar-only entry, the
 * palette opener itself (opening the palette from the palette is nonsense), the
 * `l` launch shortcut (duplicates nav.launch), and the tab-cycle pair (keybinds,
 * not palette actions).
 */
const PALETTE_EXCLUDE = new Set(["nav.tabs", "palette.open", "nav.launchShortcut", "nav.cycleNext", "nav.cyclePrev"]);

/** The registry commands the palette offers, in registry order. */
export function paletteCommands(commands: Command[] = COMMANDS): Command[] {
  return commands.filter((c) => !PALETTE_EXCLUDE.has(c.id));
}

/** Case-insensitive subsequence test (the DS fuzzy rule). Empty query matches all. */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const t = text.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

/** Filter the palette commands by fuzzy-matching the query against each title. */
export function filterCommands(query: string, commands: Command[] = paletteCommands()): Command[] {
  const q = query.trim();
  if (q === "") return commands.slice();
  return commands.filter((c) => fuzzyMatch(q, c.title));
}

/** Map filtered commands to palette items (label = title, hint = key). */
export function toItems(commands: Command[]): PaletteItem[] {
  return commands.map((c) => ({ label: c.title, hint: c.hintKey ?? c.key }));
}

export interface PaletteResult {
  state: PaletteState;
  action?: { type: "run"; command: Command } | { type: "close" };
}

/**
 * Pure reducer over the palette state. Never mutates. Mirrors FlowClock's
 * paletteApplyKey:
 *   escape    -> close (reset)
 *   enter     -> run the selected filtered command (if any); then close
 *   backspace -> drop last query char; reset selection to 0
 *   up/down   -> move selection, clamped to the filtered range
 *   char      -> printable (>= 0x20, not Ctrl-C) appends to query; reset selection
 *   else      -> unchanged (selection re-clamped)
 */
export function paletteApplyKey(
  state: PaletteState,
  key: Key,
  commands: Command[] = paletteCommands(),
): PaletteResult {
  const filtered = filterCommands(state.query, commands);
  const clamped = filtered.length > 0 ? Math.min(state.selected, filtered.length - 1) : 0;

  switch (key.name) {
    case "escape":
      return { state: emptyPaletteState(), action: { type: "close" } };

    case "enter": {
      if (filtered.length === 0) return { state: { ...state, selected: clamped } };
      return { state: emptyPaletteState(), action: { type: "run", command: filtered[clamped]! } };
    }

    case "backspace":
      return { state: { ...state, query: state.query.slice(0, -1), selected: 0 } };

    case "up":
      return { state: { ...state, selected: Math.max(0, clamped - 1) } };

    case "down": {
      const max = filtered.length > 0 ? filtered.length - 1 : 0;
      return { state: { ...state, selected: Math.min(max, clamped + 1) } };
    }

    case "char": {
      const ch = key.char;
      const code = ch.codePointAt(0) ?? 0;
      if (code >= 0x20 && ch !== "\x03") {
        return { state: { ...state, query: state.query + ch, selected: 0 } };
      }
      return { state: { ...state, selected: clamped } };
    }

    default:
      return { state: { ...state, selected: clamped } };
  }
}
