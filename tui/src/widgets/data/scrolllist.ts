/**
 * ScrollList — TUI mirror of design-system/components/data/ScrollList.{d.ts,prompt.md,jsx}.
 *
 * Navigable list: selected row prefixed with ▸ (ascii >) in accent.teal, a character
 * scrollbar (█ thumb over ░ track) on the right column, items windowed by offset/height.
 * Always emits exactly `height` rows of uniform width (a character buffer needs it).
 *
 * NOTE: the theme's `scrollbar` glyph token is descriptive ("█ (thumb) │ (track)"),
 * so the block chars are sourced from the `gauge` glyph group (█ / ░, ascii # / .),
 * matching ScrollList.jsx which renders █ over ░.
 */
import type { Theme } from "../../theme.js";
import { truncate, padTo, displayWidth } from "../../kit/draw.js";

export interface ScrollListProps<T = unknown> {
  items: T[];
  selected: number;
  /** Visible rows. */
  height: number;
  /** First visible index. */
  offset?: number;
  /** Real total (if items is already sliced). */
  total?: number;
  renderItem: (item: T, index: number) => string;
}

export function scrolllist<T>(props: ScrollListProps<T>, theme: Theme): string[] {
  const { items = [], selected = -1, height, offset = 0, total, renderItem } = props;
  const reset = theme.reset;
  const arrow = theme.glyph("arrows").split(" ")[3]; // ▸ / >
  const gaugeChars = theme.glyph("gauge").split(" "); // █ ▓ ░ / # = .
  const thumbCh = gaugeChars[0];
  const trackCh = gaugeChars[2];
  const accent = theme.fg("accent.teal");
  const thumbColor = theme.fg("text.muted");
  const trackColor = theme.fg("background.border");

  const count = total != null ? total : items.length;
  const visible = items.slice(offset, offset + height);
  const rendered = visible.map((it, i) => renderItem(it, offset + i));

  let itemW = 1;
  for (const r of rendered) itemW = Math.max(itemW, displayWidth(r));

  // Scrollbar thumb geometry (mirrors ScrollList.jsx).
  const thumbLen = Math.max(1, Math.round((height / Math.max(count, 1)) * height));
  const maxOffset = Math.max(1, count - height);
  const thumbStart = Math.min(
    height - thumbLen,
    Math.round((offset / maxOffset) * (height - thumbLen)),
  );
  const overflow = count > height;

  const out: string[] = [];
  for (let i = 0; i < height; i++) {
    const has = i < visible.length;
    const idx = offset + i;
    const sel = has && idx === selected;
    const marker = sel ? accent + arrow + reset + " " : "  ";
    const itemStr = has ? padTo(truncate(rendered[i], itemW), itemW) : " ".repeat(itemW);
    // Selected row gets a filled background CURSOR (contrast makes the selection
    // explicit) — bg is re-asserted after every internal reset so it spans the whole
    // row despite the item's own fg color changes.
    const core = marker + itemStr;
    const styled = sel ? theme.selectedBg + core.split(reset).join(reset + theme.selectedBg) + reset : core;
    const isThumb = overflow && i >= thumbStart && i < thumbStart + thumbLen;
    const sb = (isThumb ? thumbColor + thumbCh : trackColor + trackCh) + reset;
    out.push(styled + sb);
  }
  return out;
}
