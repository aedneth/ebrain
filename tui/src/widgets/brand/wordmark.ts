/**
 * tui/src/widgets/brand/wordmark.ts — Wordmark, ported 1:1 from
 * design-system/components/brand/Wordmark.{d.ts,jsx,prompt.md} (SPRINT-TUI 6.3.2).
 *
 * ebrain's signature pixel-block wordmark: "e" in accent.teal, "brain" in
 * text.primary, built from a 5-row-per-letter matrix via half-blocks.
 *
 * WORDMARK_MATRIX and wordmarkHalfBlocks are copied VERBATIM from Wordmark.jsx
 * (same matrix values, same half-block technique: a pair of rows (top,bottom) ->
 *  █ both / ▀ top / ▄ bottom / space neither). wordmarkHalfBlocks keeps the .d.ts
 * signature `(rows: string[]): string[]` (no theme arg), so it uses the literal
 * block chars exactly as the .jsx does — the ascii fallback is handled separately
 * in `wordmark()` via the `ascii` prop / `theme.ascii`.
 */
import type { Theme } from "../../theme.js";

const BOLD = "\x1b[1m";

// Exact wordmark matrix: 5 pixel rows per letter ('#' = filled, '.' = empty).
// Copied verbatim from design-system/components/brand/Wordmark.jsx.
export const WORDMARK_MATRIX: Record<string, string[]> = {
  e: [".###", "#..#", "####", "#...", ".###"],
  b: ["#...", "#...", "###.", "#..#", "###."],
  r: ["....", "#.##", "##..", "#...", "#..."],
  a: [".###", "#..#", "####", "#..#", "#..#"],
  i: ["#", ".", "#", "#", "#"],
  n: ["....", "#.#.", "##.#", "#..#", "#..#"],
};

// Half-block renderer, copied verbatim from Wordmark.jsx (rows pair -> █ / ▀ / ▄ / space).
export function wordmarkHalfBlocks(rows: string[]): string[] {
  const w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  const R = rows.map(function (r) { return r.padEnd(w, "."); }).concat([".".repeat(w)]);
  const out: string[] = [];
  for (let y = 0; y < R.length - 1; y += 2) {
    let line = "";
    for (let x = 0; x < w; x++) {
      const t = R[y][x] === "#", b = R[y + 1][x] === "#";
      line += t && b ? "█" : t ? "▀" : b ? "▄" : " ";
    }
    out.push(line);
  }
  return out;
}

export interface WordmarkProps {
  /** 'block' = large pixel-block (home); 'compact' = single line for the top bar. */
  variant?: "block" | "compact";
  /** true = pure-ASCII degradation (5 rows of '#'). */
  ascii?: boolean;
}

/**
 * Render the wordmark. Returns rows (string[]): 1 row for compact, 3 rows for the
 * half-block block variant, 5 rows for the ascii block variant. "e" is teal,
 * "brain" is text.primary; compact is bold.
 */
export function wordmark(props: WordmarkProps, theme: Theme): string[] {
  const variant = props.variant ?? "block";
  const useAscii = props.ascii === true || theme.ascii === true;
  const reset = theme.reset;
  const teal = theme.fg("accent.teal");
  const primary = theme.fg("text.primary");

  if (variant === "compact") {
    return [teal + BOLD + "e" + reset + primary + BOLD + "brain" + reset];
  }

  const letters = "ebrain".split("");
  const rendered = letters.map(function (l) {
    const m = WORDMARK_MATRIX[l]!;
    return useAscii
      ? m.map(function (r) { return r.replace(/\./g, " "); })
      : wordmarkHalfBlocks(m);
  });

  const nLines = useAscii ? 5 : 3;
  const lines: string[] = [];
  for (let i = 0; i < nLines; i++) {
    let line = "";
    rendered.forEach(function (L, j) {
      const color = j === 0 ? teal : primary;
      const glyphRow = L[i] ?? "";
      line += color + glyphRow + reset + (j < rendered.length - 1 ? " " : "");
    });
    lines.push(line);
  }
  return lines;
}
