/**
 * tui/src/widgets/input/promptbox.ts — PromptBox, TUI mirror of
 * design-system/components/input/PromptBox.{d.ts,jsx,prompt.md} (SPRINT-TUI 6.4.3).
 *
 * OpenCode-style prompt: a thick left bar `┃` (teal on focus / dim border when blurred)
 * + a surface field holding the value (text.primary) or placeholder (text.muted) with a
 * caret `▌` in accent, and an optional dim hint right-floated. Rendered as ONE row of
 * exact `width` cells (rows=1 — the single-line case the Sessions `p` action needs;
 * the multiline composer is F6.6.3). Color comes exclusively from the injected theme.
 */
import type { Theme } from "../../theme.js";
import { truncate, padTo, displayWidth } from "../../kit/draw.js";

export interface PromptBoxProps {
  value?: string;
  placeholder?: string;
  focus?: boolean;
  /** Dim, right-floated helper text (e.g. "enter send · esc cancel"). */
  hint?: string;
  /** Total width in cells. */
  width: number;
}

/** The heavy vertical bar `┃` (U+2503) — the PromptBox signature per the .jsx. Not a
 * theme glyph token; used as a literal like commandpalette.ts's `›`/`▌`. */
const BAR = "┃";
const CARET = "▌";

export function promptBox(props: PromptBoxProps, theme: Theme): string {
  const { value = "", placeholder = "describe the task…", focus = true, hint, width } = props;
  const reset = theme.reset;

  const barColor = focus ? theme.fg("accent.teal") : theme.fg("background.border");
  const empty = value.length === 0;
  const textColor = empty ? theme.fg("text.muted") : theme.fg("text.primary");
  const caret = focus ? theme.fg("accent.teal") + CARET + reset : "";

  // Layout: `┃ ` (bar + 1 pad) then the field, then a right-floated hint. The field is
  // delineated by the `┃` bar + caret alone — NO surface fill (a terminal's background
  // is the user's and cannot be matched; an interior fill bands against it). Same
  // contour-only rule as every panel (see app.ts / statusbar.ts).
  const barSeg = barColor + BAR + reset;
  const fieldW = Math.max(0, width - 2); // bar(1) + one pad(1)

  const shown = empty ? placeholder : value;
  const caretW = focus ? 1 : 0;
  const hintText = hint ?? "";
  const hintW = hintText.length > 0 ? displayWidth(hintText) + 1 : 0; // +1 gap

  // Room for the value text = field minus caret minus hint (hint wins the right edge).
  const textRoom = Math.max(0, fieldW - caretW - hintW);
  // The caret sits where typing lands: after the value, or ahead of the placeholder when the
  // field is empty. Padding comes after it so the caret never floats at the far edge of the field.
  const text = textColor + truncate(shown, textRoom) + reset;
  const typed = padTo(empty ? caret + text : text + caret, textRoom + caretW);

  const bg = ""; // contour-only: no interior fill (breaks native terminal bg)
  let field = bg + typed;
  if (hintW > 0) field = bg + typed + bg + " " + theme.fg("text.muted") + hintText + reset;

  // Compose and hard-pad to exact width (bg persists across the field).
  const row = barSeg + " " + field;
  return padTo(truncate(row, width), width);
}
