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

  it("joins hints with a 2-cell gap, centered and padded to exact width", () => {
    const hints = [
      { k: "tab", label: "panels" },
      { k: "/", label: "palette" },
    ];
    const row = hintBar({ hints }, theme, 40);

    const left = keyHint(hints[0], theme) + "  " + keyHint(hints[1], theme);
    const expected = " " + padTo(left, 38, "center") + " ";
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

describe("hintBar — never truncates a hint mid-word", () => {
  const theme = makeTheme({ trueColor: true, ascii: false });
  const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const many = [
    { k: "s", label: "search" },
    { k: "r", label: "remember" },
    { k: "enter", label: "open/run" },
    { k: "↑↓", label: "navigate" },
    { k: "tab", label: "focus box" },
    { k: "a", label: "attach procedure" },
  ];

  it("drops whole trailing hints until the row fits (80 columns keeps remember, loses attach)", () => {
    const row = strip(hintBar({ hints: many }, theme, 80));
    expect(displayWidth(row)).toBe(80);
    expect(row).toContain("[r] remember");
    expect(row).toContain("[tab] focus box");
    expect(row).not.toContain("attach");
    expect(row).not.toContain("proce");
  });

  it("keeps a trailing [?] hint when it has to drop something, since it is the route to the rest", () => {
    const hints = [...many.slice(0, 5), { k: "?", label: "actions" }];
    const row = strip(hintBar({ hints }, theme, 60));
    expect(displayWidth(row)).toBe(60);
    expect(row).toContain("[?] actions");
    expect(row).toContain("[s] search");
  });
});
