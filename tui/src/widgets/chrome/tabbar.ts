/**
 * tui/src/widgets/chrome/tabbar.ts — TabBar, ported 1:1 from
 * design-system/components/chrome/TabBar.{d.ts,jsx,prompt.md} (SPRINT-TUI 6.3.2).
 *
 * Numbered tabs for direct-jump (key 1..n). Active tab = bold text.primary on
 * background.raised; inactive = dim text.secondary. No underline, no pill —
 * weight + tone + raised background only (per TabBar.prompt.md).
 */
import type { Theme } from "../../theme.js";

/** Raw SGR bold — not a color, so it stays outside the theme's fg/bg surface. */
const BOLD = "\x1b[1m";

export interface TabBarProps {
  /** Labels, e.g. ['home','sessions','launch','memory','routing','doctor'] */
  tabs?: string[];
  /** Active index (0-based) */
  active?: number;
  /** Part of the contract; unused in a pure string render (no click events on a buffer). */
  onSelect?: (index: number) => void;
}

/** Render the tab bar as a single terminal row (natural width — no fixed-width prop in the contract). */
export function tabBar(props: TabBarProps, theme: Theme): string {
  const { tabs = [], active = 0 } = props;
  const reset = theme.reset;

  const cells = tabs.map((t, i) => {
    const label = ` ${i + 1}:${t} `;
    if (i === active) {
      return theme.bg("background.raised") + BOLD + theme.fg("text.primary") + label + reset;
    }
    return theme.fg("text.secondary") + label + reset;
  });

  // Container padding '0 1ch' (jsx) -> one leading/trailing cell; gap '1ch' between tabs -> one space.
  return " " + cells.join(" ") + " ";
}
