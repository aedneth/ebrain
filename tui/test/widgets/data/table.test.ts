/** Snapshot tests for data/table — mirrors design-system Table contract. */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { table } from "../../../src/widgets/data/table.js";
import { displayWidth } from "../../../src/kit/draw.js";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const COLUMNS = [
  { key: "hora", label: "hora", width: 7 },
  { key: "agente", label: "agente", width: 12 },
  { key: "costo", label: "costo", width: 8, align: "right" as const },
];
const ROWS = [
  { hora: "14:32", agente: "claude", costo: "$0.42" },
  { hora: "14:35", agente: "codex", costo: "$1.10" },
];
const TOTAL = 7 + 2 + 12 + 2 + 8 + 2; // widths + 2ch gap per column = 33

describe("table (truecolor/unicode)", () => {
  const t = makeTheme({ trueColor: true, ascii: false });

  it("renders dim header + hairline separator + flat rows, all `total` wide", () => {
    const out = table({ columns: COLUMNS, rows: ROWS, selected: 0 }, t);
    expect(out.length).toBe(2 + ROWS.length); // header + sep + 2 rows
    for (const row of out) expect(displayWidth(row)).toBe(TOTAL);

    expect(strip(out[0])).toBe("hora     agente           costo  ");
    expect(strip(out[1])).toBe("─".repeat(TOTAL));
    // right-aligned costo column (7+2 | 12+2 | right-pad 8 +2)
    expect(strip(out[2])).toBe("14:32    claude           $0.42  ");
    expect(strip(out[3])).toBe("14:35    codex            $1.10  ");
  });

  it("selected row carries the selectedBg + primary text; header uses text.muted (jsx-exact --text-3)", () => {
    const out = table({ columns: COLUMNS, rows: ROWS, selected: 0 }, t);
    expect(out[0]).toContain(t.fg("text.muted"));
    expect(out[1]).toContain(t.fg("background.border"));
    expect(out[2]).toContain(t.selectedBg);
    expect(out[3]).not.toContain(t.selectedBg);
  });

  it("auto-widths a column with no declared width", () => {
    const out = table(
      { columns: [{ key: "a", label: "hdr" }], rows: [{ a: "longer-cell" }] },
      t,
    );
    // width = max(displayWidth("hdr"), displayWidth("longer-cell")) = 11; +2 gap = 13
    for (const row of out) expect(displayWidth(row)).toBe(13);
  });
});

describe("table (ASCII fallback)", () => {
  const t = makeTheme({ trueColor: true, ascii: true });

  it("uses the ASCII hairline -", () => {
    const out = table({ columns: COLUMNS, rows: ROWS, selected: -1 }, t);
    expect(strip(out[1])).toBe("-".repeat(TOTAL));
    for (const row of out) expect(displayWidth(row)).toBe(TOTAL);
  });
});
