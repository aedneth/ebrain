/**
 * tui/src/widgets/layout/panel.ts — Panel, ported 1:1 from
 * design-system/components/layout/Panel.{d.ts,jsx,prompt.md} (SPRINT-TUI 6.3.2).
 *
 * The base container of every view: a bordered box with the title embedded in
 * the top border. Returns exactly `height` rows, each of exact display-width
 * `width`.
 *
 * CORNER RULE (critical):
 *   - NON-dialog (default) -> ROUNDED corners from theme.glyph("panelBorder")  ╭─╮│╰─╯
 *   - dialog:true          -> SQUARE  corners from theme.glyph("dialogBorder")  ┌─┐│└┘
 * The kit `panel` primitive hardcodes square corners, so we render the border
 * ourselves from the theme glyph set (reusing kit padTo/truncate/displayWidth
 * for the inner layout only).
 *
 * TITLE ALIGNMENT — deviation flagged: Panel.jsx renders the title LEFT-aligned
 * after a one-cell lead-in (`╭─ title ─────╮`), NOT centered. The overarching
 * mandate ("visual matching its .jsx") takes precedence over the word "centered"
 * in the build brief, so this matches the .jsx. See the task report.
 *
 * FOCUS: focus -> border theme.focusBorder (accent) + title bold text.primary;
 * blur -> border theme.blurBorder (border) + title text.secondary. borderColor /
 * titleColor (color-role strings) override. `bg` (color role) fills inner rows.
 */
import type { Theme, ColorRole } from "../../theme.js";
import { displayWidth, truncate, padTo } from "../../kit/draw.js";

const BOLD = "\x1b[1m";

export interface PanelProps {
  /** Title embedded in the top border. */
  title?: string;
  /** Teal border + bold title. One focused panel per view. */
  focus?: boolean;
  /** Square corners (modal dialogs) instead of rounded. */
  dialog?: boolean;
  /** Color-role override for the border (e.g. "background.border"). */
  borderColor?: ColorRole;
  /** Color-role override for the title. */
  titleColor?: ColorRole;
  width: number;
  height: number;
  /** Interior horizontal padding in cells (default 1). */
  pad?: number;
  /** Color-role fill for interior rows. */
  bg?: ColorRole;
  body: string[];
}

/** Render the panel as exactly `height` rows, each of exact width `width`. */
export function panel(props: PanelProps, theme: Theme): string[] {
  const { title, focus = false, dialog = false, width, height, body } = props;
  const pad = props.pad ?? 1;
  const reset = theme.reset;

  if (width < 2 || height < 1) {
    return Array.from({ length: Math.max(0, height) }, () => " ".repeat(Math.max(0, width)));
  }

  // Corner + edge glyphs: [TL, H, TR, V, BL, BR].
  const g = theme.glyph(dialog ? "dialogBorder" : "panelBorder").split(" ");
  const TL = g[0] ?? "+";
  const H = g[1] ?? "-";
  const TR = g[2] ?? "+";
  const V = g[3] ?? "|";
  const BL = g[4] ?? "+";
  const BR = g[5] ?? "+";

  const bc = props.borderColor ? theme.fg(props.borderColor) : (focus ? theme.focusBorder : theme.blurBorder);
  const tc = props.titleColor
    ? theme.fg(props.titleColor)
    : (focus ? theme.fg("text.primary") : theme.fg("text.secondary"));

  const innerW = width - 2; // between the two vertical border chars
  const bgEsc = props.bg ? theme.bg(props.bg) : "";

  const rows: string[] = [];

  // --- Top border (title left-aligned, matching the .jsx) --------------------
  if (title != null && title.length > 0 && width >= 5) {
    // Columns: TL H " title " <fill H> TR  ->  1 + 1 + (t+2) + F + 1 = width
    let t = title;
    let fill = width - 5 - displayWidth(t);
    if (fill < 0) {
      t = truncate(t, Math.max(0, width - 5));
      fill = width - 5 - displayWidth(t);
    }
    rows.push(
      bc + TL + H + reset +
        tc + (focus ? BOLD : "") + " " + t + " " + reset +
        bc + H.repeat(Math.max(0, fill)) + TR + reset,
    );
  } else {
    rows.push(bc + TL + H.repeat(innerW) + TR + reset);
  }

  // --- Body rows -------------------------------------------------------------
  const contentW = Math.max(0, innerW - 2 * pad);
  const bodyRows = Math.max(0, height - 2);
  const padCells = " ".repeat(pad);
  for (let i = 0; i < bodyRows; i++) {
    const line = body[i] ?? "";
    const content = padTo(truncate(line, contentW), contentW);
    const innerStr = padCells + content + padCells; // width innerW
    const inner = bgEsc ? bgEsc + innerStr + reset : innerStr;
    rows.push(bc + V + reset + inner + bc + V + reset);
  }

  // --- Bottom border ---------------------------------------------------------
  if (height >= 2) {
    rows.push(bc + BL + H.repeat(innerW) + BR + reset);
  }

  return rows;
}
