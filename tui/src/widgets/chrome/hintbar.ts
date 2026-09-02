/**
 * tui/src/widgets/chrome/hintbar.ts — HintBar, ported 1:1 from
 * design-system/components/chrome/HintBar.{d.ts,jsx,prompt.md} (SPRINT-TUI 6.3.2).
 *
 * Keyboard-shortcut bar present on EVERY view (penultimate row, above the footer).
 * Composes `keyHint` for each hint, joined with a 2-cell gap. A normal control row
 * is centered like FlowClock; an optional `right` segment keeps legacy status use
 * cases available without changing their alignment.
 *
 * A row that does not fit drops whole hints from the end rather than cutting the last
 * one mid-word: `[a] attach proce` teaches nothing. Callers order hints by importance
 * so the ones that survive at 80 columns are the ones worth keeping; a trailing `?`
 * (the overflow route to the full action reference) is kept whenever anything is dropped.
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

/** Plain width of a rendered hint row: `[k] label` cells joined by two-cell gaps. */
function hintsWidth(hints: NonNullable<HintBarProps["hints"]>): number {
  const cells = hints.reduce((n, h) => n + displayWidth(`[${h.k}] ${h.label}`), 0);
  return cells + Math.max(0, hints.length - 1) * 2;
}

/** The longest prefix of `hints` that fits `room`, keeping a trailing `?` hint if one exists. */
function fitHints(hints: NonNullable<HintBarProps["hints"]>, room: number): NonNullable<HintBarProps["hints"]> {
  if (hintsWidth(hints) <= room) return hints;
  const last = hints[hints.length - 1];
  const tail = last && last.k === "?" ? [last] : [];
  let kept = hints.slice(0, hints.length - tail.length);
  while (kept.length > 0 && hintsWidth([...kept, ...tail]) > room) kept = kept.slice(0, -1);
  return [...kept, ...tail];
}

/** Render the hint bar as a single terminal row of exactly `width` cells. */
export function hintBar(props: HintBarProps, theme: Theme, width: number): string {
  const { hints = [], right } = props;
  const reset = theme.reset;
  if (width <= 0) return "";

  // jsx padding '0 1ch' -> one cell each side; gap '2ch' between hints.
  const inner = Math.max(0, width - 2);
  const rightW = right != null && right.length > 0 ? displayWidth(right) + 1 : 0;
  const left = fitHints(hints, Math.max(0, inner - rightW)).map((h) => keyHint(h, theme)).join("  ");

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
    body = padTo(truncate(left, inner), inner, "center");
  }

  return " " + body + " ";
}
