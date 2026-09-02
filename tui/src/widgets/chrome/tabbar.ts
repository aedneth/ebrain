/**
 * tui/src/widgets/chrome/tabbar.ts — TabBar, ported 1:1 from
 * design-system/components/chrome/TabBar.{d.ts,jsx,prompt.md} (SPRINT-TUI 6.3.2).
 *
 * Numbered tabs for direct-jump (key 1..n). Active tab = bold text.primary on
 * background.raised; inactive = dim text.secondary. No underline, no pill —
 * weight + tone + raised background only (per TabBar.prompt.md).
 *
 * TERMINAL ADAPTATION (diverges from the .jsx on purpose): the mockup's bar is as wide as
 * it likes; a terminal row is not. Seven labels at the mockup's spacing cost 83 columns,
 * so at the supported 80x24 minimum the last view was cut mid-word. When `width` is given
 * the row is measured and compacted by tiers until it fits — first the inter-tab gap is
 * dropped (each cell keeps its own padding, so labels still read as separate words), then
 * labels give way to bare numbers. Every tier is chosen by measurement, never by guessing
 * a breakpoint, so a future eighth view or a longer label degrades the same way.
 */
import type { Theme } from "../../theme.js";
import { displayWidth } from "../../kit/draw.js";

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

/** Render one tier of the bar: `label(i)` names each cell's text, `gap` separates cells. */
function renderTier(tabs: string[], active: number, label: (t: string, i: number) => string, gap: string, theme: Theme): string {
  const reset = theme.reset;
  const cells = tabs.map((t, i) => {
    const text = ` ${label(t, i)} `;
    if (i === active) {
      return theme.bg("background.raised") + BOLD + theme.fg("text.primary") + text + reset;
    }
    return theme.fg("text.secondary") + text + reset;
  });
  // Container padding '0 1ch' (jsx) -> one leading/trailing cell; gap '1ch' between tabs -> one space.
  return " " + cells.join(gap) + " ";
}

/**
 * Render the tab bar as a single terminal row. Without `width` the row is its natural
 * width (the .jsx contract). With `width`, the widest tier that fits is used.
 */
export function tabBar(props: TabBarProps, theme: Theme, width?: number): string {
  const { tabs = [], active = 0 } = props;
  const numbered = (t: string, i: number) => `${i + 1}:${t}`;
  const natural = renderTier(tabs, active, numbered, " ", theme);
  if (width == null || displayWidth(natural) <= width) return natural;

  const tight = renderTier(tabs, active, numbered, "", theme);
  if (displayWidth(tight) <= width) return tight;

  return renderTier(tabs, active, (_t, i) => String(i + 1), "", theme);
}
