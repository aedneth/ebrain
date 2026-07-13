/**
 * Table — TUI mirror of design-system/components/data/Table.{d.ts,prompt.md,jsx}.
 *
 * Dim header + hairline `─` separator + flat rows. Selected row → theme.selectedBg.
 * Cells are pre-rendered strings (may already carry ANSI color — width math is
 * ANSI-aware via the kit). `align:"right"` right-pads the cell. All color via theme.
 */
import type { Theme } from "../../theme.js";
import { truncate, padTo, displayWidth } from "../../kit/draw.js";

export interface TableColumn {
  key: string;
  label: string;
  /** Width in cells; omitted → auto from content. */
  width?: number;
  align?: "left" | "right";
}

export interface TableProps {
  columns: TableColumn[];
  /** Each row: { [key]: string } (cells may carry ANSI color). */
  rows: Array<Record<string, string>>;
  selected?: number;
}

/** Trailing gap after each column (mirrors jsx paddingRight: 2ch). */
const GAP = 2;

export function table(props: TableProps, theme: Theme): string[] {
  const { columns = [], rows = [], selected = -1 } = props;
  const reset = theme.reset;
  const hairline = theme.glyph("separators").split(" ")[2]; // ─ / -

  const widths = columns.map((c) => {
    if (c.width != null) return c.width;
    let w = displayWidth(c.label);
    for (const r of rows) w = Math.max(w, displayWidth(String(r[c.key] ?? "")));
    return w;
  });
  const aligns: Array<"left" | "right"> = columns.map((c) =>
    c.align === "right" ? "right" : "left",
  );
  const total = widths.reduce((a, w) => a + w + GAP, 0);

  const buildRow = (cells: string[]): string => {
    let s = "";
    for (let i = 0; i < widths.length; i++) {
      const cell = cells[i] ?? "";
      s += padTo(truncate(cell, widths[i]), widths[i], aligns[i]) + " ".repeat(GAP);
    }
    return s;
  };

  const header = theme.fg("text.muted") + buildRow(columns.map((c) => c.label)) + reset;
  const sep = theme.fg("background.border") + hairline.repeat(total) + reset;

  const bodyRows = rows.map((r, i) => {
    const cells = columns.map((c) => String(r[c.key] ?? ""));
    const content = buildRow(cells);
    if (i === selected) {
      return theme.selectedBg + theme.fg("text.primary") + content + reset;
    }
    return theme.fg("text.secondary") + content + reset;
  });

  return [header, sep, ...bodyRows];
}
