/** Snapshot tests for data/scrolllist — mirrors design-system ScrollList contract. */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { scrolllist } from "../../../src/widgets/data/scrolllist.js";
import { displayWidth } from "../../../src/kit/draw.js";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("scrolllist (truecolor/unicode)", () => {
  const t = makeTheme({ trueColor: true, ascii: false });

  it("windows items, marks selected with ▸, draws a char scrollbar", () => {
    const out = scrolllist(
      {
        items: ["a", "b", "c", "d", "e"],
        selected: 1,
        height: 3,
        offset: 0,
        total: 5,
        renderItem: (it) => `item ${it}`,
      },
      t,
    );
    expect(out.length).toBe(3); // exactly `height` rows
    const itemW = "item a".length; // 6
    for (const row of out) expect(displayWidth(row)).toBe(2 + itemW + 1); // marker + item + scrollbar

    expect(strip(out[0])).toBe("  item a█"); // thumb
    expect(strip(out[1])).toBe("▸ item b█"); // selected marker + thumb
    expect(strip(out[2])).toBe("  item c░"); // track

    expect(out[1]).toContain(t.fg("accent.teal")); // ▸ marker is teal
    expect(out[0]).toContain(t.fg("text.muted")); // thumb color
    expect(out[2]).toContain(t.fg("background.border")); // track color
  });

  it("pads short windows to `height` rows of uniform width", () => {
    const out = scrolllist(
      { items: ["x", "y"], selected: 0, height: 4, offset: 0, total: 2, renderItem: (it) => `${it}` },
      t,
    );
    expect(out.length).toBe(4);
    const w = displayWidth(out[0]);
    for (const row of out) expect(displayWidth(row)).toBe(w);
    // no overflow (total<=height) → all track chars
    expect(strip(out[2]).trim()).toBe("░");
  });
});

describe("scrolllist (ASCII fallback)", () => {
  const t = makeTheme({ trueColor: true, ascii: true });

  it("uses ASCII marker > and ASCII scrollbar chars # / .", () => {
    const out = scrolllist(
      { items: ["a", "b", "c", "d"], selected: 0, height: 2, offset: 0, total: 4, renderItem: (it) => `it-${it}` },
      t,
    );
    expect(strip(out[0])).toBe("> it-a#"); // selected marker + thumb
    expect(strip(out[1])).toBe("  it-b."); // track (ascii)
    for (const row of out) expect(displayWidth(row)).toBe(2 + "it-a".length + 1);
  });
});
