/**
 * Toast — TUI mirror of design-system/components/core/Toast.{d.ts,prompt.md,jsx}.
 *
 * One-line toast: straight box (dialogBorder ┌─┐│└┘) whose border + leading glyph
 * are in the tone color, body on background.raised. Returns the 3 box rows.
 *
 * Leading glyph: ok ✓, warn !, error ✗ (ascii + ! x). ✓ (U+2713) / ✗ (U+2717) are
 * DS-sanctioned TUI symbols (NOT emoji, NOT in any emoji codepoint range) and are
 * defined locally here — never in theme.ts.
 */
import type { Theme } from "../../theme.js";
import { truncate, padTo } from "../../kit/draw.js";

export type ToastTone = "ok" | "warn" | "error";

export interface ToastProps {
  tone?: ToastTone;
  /** Total box width in cells. */
  width?: number;
  /** One-line message. */
  children: string;
}

const GLYPH: Record<ToastTone, string> = { ok: "✓", warn: "!", error: "✗" };
const GLYPH_ASCII: Record<ToastTone, string> = { ok: "+", warn: "!", error: "x" };

const BOLD = "\x1b[1m";
const NOBOLD = "\x1b[22m";

export function toast(props: ToastProps, theme: Theme): string[] {
  const tone: ToastTone = props.tone && props.tone in GLYPH ? props.tone : "ok";
  const width = props.width ?? 48;
  const children = props.children ?? "";
  const reset = theme.reset;

  const [tl, h, tr, v, bl, br] = theme.glyph("dialogBorder").split(" "); // ┌ ─ ┐ │ └ ┘
  const border = theme.fg("semantic." + tone);
  const bg = theme.bg("background.raised");
  const fgText = theme.fg("text.primary");
  const g = theme.ascii ? GLYPH_ASCII[tone] : GLYPH[tone];

  const innerW = Math.max(0, width - 2);
  const avail = Math.max(0, innerW - 3); // " " + glyph + " "
  const text = truncate(children, avail);

  const top = border + tl + h.repeat(innerW) + tr + reset;
  const bottom = border + bl + h.repeat(innerW) + br + reset;

  // Interior: bg set once, only fg changes inside (bg persists), single reset at end.
  const interior = bg + " " + border + BOLD + g + NOBOLD + " " + fgText + text;
  const body = border + v + reset + padTo(interior, innerW) + reset + border + v + reset;

  return [top, body, bottom];
}
