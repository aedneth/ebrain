/**
 * tui/src/widgets/chrome/hintbar.ts — HintBar, ported 1:1 from
 * design-system/components/chrome/HintBar.{d.ts,jsx,prompt.md} (SPRINT-TUI 6.3.2).
 *
 * Keyboard-shortcut bar present on EVERY view (penultimate row, above the footer).
 * Composes `keyHint` for each hint, joined with a 2-cell gap; contextual hints
 * first, global last (caller-ordered). Optional `right` segment, dim, right-justified.
 *
 * `width` is the terminal column count (render dimension), 3rd arg so `props`
 * stays 1:1 with HintBarProps (hints, right) per the .d.ts.
 */
import type { Theme } from "../../theme.js";
import { displayWidth, truncate, padTo } from "../../kit/draw.js";
import { keyHint } from "./keyhint.js";

export interface HintBarProps {
  hints?: Array<{ k: string; label: string; disabled?: boolean }>;
  /** Dim, right-aligned trailing text. */
  right?: string;
}

/** Render the hint bar as a single terminal row of exactly `width` cells. */
export function hintBar(props: HintBarProps, theme: Theme, width: number): string {
  const { hints = [], right } = props;
  const reset = theme.reset;
  if (width <= 0) return "";

  // jsx padding '0 1ch' -> one cell each side; gap '2ch' between hints.
  const inner = Math.max(0, width - 2);
  const left = hints.map((h) => keyHint(h, theme)).join("  ");

  let body: string;
  if (right != null && right.length > 0) {
    const rightSeg = theme.fg("text.muted") + right + reset;
    const lw = displayWidth(left);
    const rw = displayWidth(right);
    if (lw + rw <= inner) {
      body = left + " ".repeat(inner - lw - rw) + rightSeg;
    } else {
      const leftRoom = Math.max(0, inner - rw);
      body = padTo(truncate(left, leftRoom), leftRoom) + rightSeg;
    }
  } else {
    body = padTo(truncate(left, inner), inner);
  }

  return " " + body + " ";
}
