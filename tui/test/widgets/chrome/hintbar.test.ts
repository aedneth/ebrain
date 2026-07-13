/**
 * Snapshot test for chrome/hintbar.ts (SPRINT-TUI 6.3.2).
 * Props (hints, right) match HintBar.d.ts; composes keyHint with a 2-cell gap.
 */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { displayWidth, padTo } from "../../../src/kit/draw.js";
import { hintBar } from "../../../src/widgets/chrome/hintbar.ts";
import { keyHint } from "../../../src/widgets/chrome/keyhint.ts";

describe("hintBar", () => {
  const theme = makeTheme({ trueColor: true, ascii: false });

  it("joins hints with a 2-cell gap, padded to exact width", () => {
    const hints = [
      { k: "tab", label: "panels" },
      { k: "/", label: "palette" },
    ];
    const row = hintBar({ hints }, theme, 40);

    const left = keyHint(hints[0], theme) + "  " + keyHint(hints[1], theme);
    const expected = " " + padTo(left, 38) + " ";
    expect(row).toBe(expected);
    expect(displayWidth(row)).toBe(40);
  });

  it("right-justifies the optional dim `right` segment", () => {
    const row = hintBar({ hints: [{ k: "?", label: "help" }], right: "v0.4.2" }, theme, 40);
    expect(displayWidth(row)).toBe(40);
    expect(row).toContain(theme.fg("text.muted") + "v0.4.2" + theme.reset);
    // right segment sits at the tail (before the trailing pad cell)
    expect(row.endsWith("v0.4.2" + theme.reset + " ")).toBe(true);
  });
});
