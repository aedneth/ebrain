/**
 * ConfirmDialog — TUI mirror of design-system/components/input/ConfirmDialog.{d.ts,prompt.md,jsx}.
 *
 * Confirmation modal: straight box (dialogBorder) on background.raised, bold title
 * in the top border, a message body, and an actions row of keys
 * (e.g. `[y] kill   [esc] cancel`). `danger` → border + [confirmKey] in semantic.error.
 * Returns the box rows ONLY (caller centers + draws the scrim; key handling is later).
 */
import type { Theme } from "../../theme.js";
import { truncate, padTo, displayWidth } from "../../kit/draw.js";

export interface ConfirmProps {
  title?: string;
  message?: string;
  /** true: border + confirm key in error color (destructive actions). */
  danger?: boolean;
  confirmKey?: string;
  confirmLabel?: string;
  cancelKey?: string;
  cancelLabel?: string;
  /** Total box width in cells. */
  width?: number;
}

const BOLD = "\x1b[1m";
const NOBOLD = "\x1b[22m";

export function confirm(props: ConfirmProps, theme: Theme): string[] {
  const {
    title = "confirmar",
    message = "",
    danger = false,
    confirmKey = "y",
    confirmLabel = "confirmar",
    cancelKey = "n",
    cancelLabel = "cancelar",
    width = 52,
  } = props;
  const reset = theme.reset;
  const [tl, h, tr, v, bl, br] = theme.glyph("dialogBorder").split(" "); // ┌ ─ ┐ │ └ ┘
  const border = danger ? theme.fg("semantic.error") : theme.fg("text.muted");
  const bg = theme.bg("background.raised");
  const fgPrimary = theme.fg("text.primary");
  const fgMuted = theme.fg("text.muted");
  const keyColor = danger ? theme.fg("semantic.error") : theme.fg("accent.teal");

  const innerW = Math.max(0, width - 2);

  // Top border with embedded title:  ┌─ title ─────┐  (title bold, primary).
  const titleText = " " + title + " ";
  const fill = Math.max(0, innerW - 1 - displayWidth(titleText));
  const top =
    border + tl + h + reset +
    fgPrimary + BOLD + titleText + NOBOLD + reset +
    border + h.repeat(fill) + tr + reset;

  const bottom = border + bl + h.repeat(innerW) + br + reset;

  // Body row: bg raised persists across the interior (fg-only changes inside).
  const bodyRow = (interior: string): string =>
    border + v + reset + padTo(bg + interior, innerW) + reset + border + v + reset;

  const blank = bodyRow("");
  const msg = truncate(message, Math.max(0, innerW - 2));
  const msgRow = bodyRow(" " + fgPrimary + msg);

  const confirmPart = keyColor + BOLD + "[" + confirmKey + "]" + NOBOLD + fgPrimary + " " + confirmLabel;
  const cancelPart = fgPrimary + BOLD + "[" + cancelKey + "]" + NOBOLD + fgMuted + " " + cancelLabel;
  const actionsRow = bodyRow(" " + confirmPart + "   " + cancelPart);

  return [top, blank, msgRow, blank, actionsRow, bottom];
}
