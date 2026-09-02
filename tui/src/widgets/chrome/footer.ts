/**
 * tui/src/widgets/chrome/footer.ts — Footer, ported 1:1 from
 * design-system/components/chrome/Footer.{d.ts,jsx,prompt.md} (SPRINT-TUI 6.3.2).
 *
 * Context footer (last row of every view): `cwd:branch` left, version right.
 * All dim per the jsx: `cwd` = text.muted, `branch` = text.secondary, `right`
 * (version) = text.muted.
 *
 * `width` is the terminal column count (render dimension), 3rd arg so `props`
 * stays 1:1 with FooterProps (cwd, branch, right) per the .d.ts.
 */
import type { Theme } from "../../theme.js";
import { displayWidth, truncate, padTo } from "../../kit/draw.js";

export interface FooterProps {
  /** e.g. "~/code/korvex" */
  cwd?: string;
  /** e.g. "main" */
  branch?: string;
  /** e.g. "ebrain 0.4.2" */
  right?: string;
}

/** Render the footer as a single terminal row of exactly `width` cells. */
export function footer(props: FooterProps, theme: Theme, width: number): string {
  const { cwd = "", branch, right = "" } = props;
  const reset = theme.reset;
  if (width <= 0) return "";

  // jsx padding '0 1ch' -> one cell each side.
  const inner = Math.max(0, width - 2);

  // Left: cwd (muted) [ : (muted) branch (secondary) ]
  const leftPlain = branch != null ? `${cwd}:${branch}` : cwd;
  const rightPlain = right;
  const lw = displayWidth(leftPlain);
  const rw = displayWidth(rightPlain);

  const muted = theme.fg("text.muted");
  const secondary = theme.fg("text.secondary");
  const leftColored =
    branch != null
      ? muted + cwd + ":" + reset + secondary + branch + reset
      : muted + cwd + reset;
  const rightColored = muted + rightPlain + reset;

  let body: string;
  if (lw + rw <= inner) {
    const gap = " ".repeat(inner - lw - rw);
    body = leftColored + gap + rightColored;
  } else if (rw >= inner) {
    body = muted + padTo(truncate(rightPlain, inner), inner, "right") + reset;
  } else {
    const leftRoom = inner - rw;
    // Truncate the plain left then re-color (avoids splitting an escape mid-sequence).
    const leftTrunc = truncate(leftPlain, leftRoom);
    body = muted + padTo(leftTrunc, leftRoom) + reset + rightColored;
  }

  return " " + body + " ";
}
