/**
 * tui/src/widgets/input/commandpalette.ts — CommandPalette, ported 1:1 from
 * design-system/components/input/CommandPalette.{d.ts,prompt.md,jsx} (SPRINT-TUI 6.3.4).
 *
 * Centered overlay box whose TEAL border is the view's accent moment while open.
 * Layout (matching the .jsx):
 *   › <query>▌                     ← prompt line (accent bold "› ", primary query, accent caret)
 *   ────────────────────────       ← full-inner-width hairline
 *   <label>            <hint>       ← items; matched query chars accent-bold (fuzzyMark);
 *                                     selected row on background.raised, bold
 *   ↑↓ navegar · enter ejecutar · esc cerrar   ← footer hint (dim)
 *
 * Pure `(props, theme) -> string[]`. All color via theme (zero hardcoded hex).
 * Uses the panel widget with pad:0 so the query/items get a manual 1-cell left
 * inset while the separator spans the full inner width (as in the .jsx).
 */
import type { Theme, ColorRole } from "../../theme.js";
import { displayWidth, truncate, padTo } from "../../kit/draw.js";
import { panel } from "../layout/panel.js";

const BOLD = "\x1b[1m";
const NOBOLD = "\x1b[22m";

export interface PaletteItem {
  label: string;
  hint?: string;
}

export interface CommandPaletteProps {
  query?: string;
  items?: PaletteItem[];
  selected?: number;
  width?: number;
}

/**
 * Colorize `plain` marking the subsequence match of `query` in accent-bold and
 * the rest in `baseRole`. Emits fg-only escapes + bold toggles (never a full
 * reset) so a caller can wrap the result in a persistent background without the
 * bg being cleared mid-line.
 */
export function fuzzyMark(plain: string, query: string, theme: Theme, baseRole: ColorRole): string {
  const base = theme.fg(baseRole);
  const acc = theme.fg("accent.teal");
  const q = query.toLowerCase();
  let qi = 0;
  let out = "";
  for (const ch of plain) {
    if (qi < q.length && ch.toLowerCase() === q[qi]) {
      out += acc + BOLD + ch + NOBOLD;
      qi++;
    } else {
      out += base + ch;
    }
  }
  return out;
}

export function commandPalette(props: CommandPaletteProps, theme: Theme): string[] {
  const { query = "", items = [], selected = 0, width = 64 } = props;
  const innerW = Math.max(1, width - 2); // panel pad:0 -> content spans width-2
  const reset = theme.reset;
  const accent = theme.fg("accent.teal");
  const caret = theme.glyph("caret");

  // Prompt line: 1-cell inset, "› " accent bold, query primary, caret accent.
  const promptRaw =
    " " + accent + BOLD + "› " + reset + theme.fg("text.primary") + query + reset + accent + caret + reset;
  const promptRow = padTo(promptRaw, innerW);

  // Full-inner-width hairline (matches the .jsx separator spanning the panel).
  const sepRow = theme.fg("background.border") + "─".repeat(innerW) + reset;

  const body: string[] = [promptRow, sepRow];

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const sel = i === selected;
    const hint = it.hint ?? "";
    const hintW = displayWidth(hint);
    // 1 left inset + at least 1 gap before the hint.
    const labelBudget = Math.max(0, innerW - 1 - hintW - 1);
    const plainLabel = truncate(it.label, labelBudget);
    const marked = fuzzyMark(plainLabel, query, theme, sel ? "text.primary" : "text.secondary");

    // Left block " " + marked, padded so the hint sits flush right.
    const left = padTo(" " + marked, innerW - hintW);
    const hintStr = hint ? theme.fg("text.muted") + hint : "";

    if (sel) {
      // Persistent raised bg + bold; fuzzyMark/hint use fg-only escapes so the bg
      // survives to the single terminating reset.
      body.push(theme.bg("background.raised") + BOLD + left + hintStr + reset);
    } else {
      body.push(left + hintStr + reset);
    }
  }

  // Footer hint line (dim). ↑↓ are U+2191/U+2193 (arrows) — DS-sanctioned, not emoji.
  body.push(padTo(" " + theme.fg("text.muted") + "↑↓ navegar · enter ejecutar · esc cerrar" + reset, innerW));

  const height = body.length + 2; // + top/bottom border
  return panel({ focus: true, width, height, body, bg: "background.surface", pad: 0 }, theme);
}
