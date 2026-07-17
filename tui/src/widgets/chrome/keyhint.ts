/**
 * tui/src/widgets/chrome/keyhint.ts — KeyHint, ported 1:1 from
 * design-system/components/chrome/KeyHint.{d.ts,jsx,prompt.md} (SPRINT-TUI 6.3.2).
 *
 * The atomic unit of the hint bar: `[k] label` — the key is quiet and the
 * action is the visual anchor. This mirrors FlowClock's compact control row
 * and keeps a dense TUI legible at a glance.
 *
 * Deviation note (see task report): KeyHint.jsx colors the label
 * `var(--text-3)` (text.muted) UNCONDITIONALLY, not `var(--text-1)`/text.secondary
 * as paraphrased in the build brief. The UX phase intentionally reverses that
 * visual weight: users scan the action first, then the bracketed key. Disabled
 * hints stay uniformly muted.
 */
import type { Theme } from "../../theme.js";

export interface KeyHintProps {
  /** The key, e.g. "tab", "/", "?", "ctrl+k" */
  k: string;
  /** The action, e.g. "panels" */
  label: string;
  disabled?: boolean;
}

/** Render `[k] label` as a single terminal row fragment. */
export function keyHint(props: KeyHintProps, theme: Theme): string {
  const { k, label, disabled = false } = props;
  const reset = theme.reset;

  const kColor = disabled ? theme.disabledText : theme.fg("text.muted");
  const labelColor = disabled ? theme.disabledText : theme.fg("text.primary");
  return kColor + `[${k}]` + reset + labelColor + " " + label + reset;
}
