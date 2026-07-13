/**
 * tui/src/widgets/chrome/keyhint.ts — KeyHint, ported 1:1 from
 * design-system/components/chrome/KeyHint.{d.ts,jsx,prompt.md} (SPRINT-TUI 6.3.2).
 *
 * The atomic unit of the hint bar: `k label` — key bold, label dim.
 *
 * Deviation note (see task report): KeyHint.jsx colors the label
 * `var(--text-3)` (text.muted) UNCONDITIONALLY, not `var(--text-1)`/text.secondary
 * as paraphrased in the build brief. `disabledText` resolves to the exact same hex
 * as `text.muted` (same token hex), so using `theme.disabledText` for the label satisfies
 * both "always dim like the jsx" and "disabled -> both theme.disabledText" at once.
 * `k` keeps `fontWeight: 700` (bold) in BOTH states per the jsx — only its color
 * switches between text.primary and disabledText.
 */
import type { Theme } from "../../theme.js";

const BOLD = "\x1b[1m";

export interface KeyHintProps {
  /** The key, e.g. "tab", "/", "?", "ctrl+k" */
  k: string;
  /** The action, e.g. "panels" */
  label: string;
  disabled?: boolean;
}

/** Render `k label` as a single terminal row fragment. */
export function keyHint(props: KeyHintProps, theme: Theme): string {
  const { k, label, disabled = false } = props;
  const reset = theme.reset;

  const kColor = disabled ? theme.disabledText : theme.fg("text.primary");
  const labelColor = disabled ? theme.disabledText : theme.fg("text.muted");
  return kColor + BOLD + k + reset + labelColor + " " + label + reset;
}
