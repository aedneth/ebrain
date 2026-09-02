/**
 * Snapshot test for chrome/tabbar.ts (SPRINT-TUI 6.3.2).
 * Verifies props (tabs, active) match TabBar.d.ts and exact-row rendering:
 * active = bold text.primary on background.raised; inactive = dim text.secondary.
 */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { displayWidth } from "../../../src/kit/draw.js";
import { tabBar } from "../../../src/widgets/chrome/tabbar.ts";

const BOLD = "\x1b[1m";

describe("tabBar", () => {
  const theme = makeTheme({ trueColor: true, ascii: false });

  it("renders numbered tabs with the active one raised+bold, inactive dim", () => {
    const row = tabBar({ tabs: ["home", "sessions"], active: 0 }, theme);

    const cell0 =
      theme.bg("background.raised") + BOLD + theme.fg("text.primary") + " 1:home " + theme.reset;
    const cell1 = theme.fg("text.secondary") + " 2:sessions " + theme.reset;
    const expected = " " + cell0 + " " + cell1 + " ";

    expect(row).toBe(expected);
    // visible width: 1 + " 1:home "(8) + 1 + " 2:sessions "(12) + 1 = 23
    expect(displayWidth(row)).toBe(23);
  });

  it("moves the raised+bold treatment to the active index", () => {
    const row = tabBar({ tabs: ["a", "b", "c"], active: 2 }, theme);
    const raised = theme.bg("background.raised") + BOLD + theme.fg("text.primary");
    // Only the third cell (" 3:c ") carries the raised background.
    expect(row.indexOf(raised)).toBe(row.lastIndexOf(raised));
    expect(row).toContain(raised + " 3:c ");
  });
});

describe("tabBar — fits the row it is given", () => {
  const theme = makeTheme({ trueColor: true, ascii: false });
  const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const SEVEN = ["home", "launch", "sessions", "workspaces", "memory", "routing", "doctor"];

  it("keeps the natural spacing when it fits (120 columns)", () => {
    expect(tabBar({ tabs: SEVEN, active: 0 }, theme, 120)).toBe(tabBar({ tabs: SEVEN, active: 0 }, theme));
  });

  it("at the 80-column minimum every label survives whole — the last view is never clipped", () => {
    const row = tabBar({ tabs: SEVEN, active: 0 }, theme, 80);
    expect(displayWidth(row)).toBeLessThanOrEqual(80);
    for (const t of SEVEN) expect(strip(row)).toContain(`:${t} `);
    // The active cell keeps its full raised treatment in the compact tier.
    expect(row).toContain(theme.bg("background.raised") + BOLD + theme.fg("text.primary") + " 1:home " + theme.reset);
  });

  it("falls back to bare numbers only when even the tight tier cannot fit", () => {
    const row = tabBar({ tabs: SEVEN, active: 6 }, theme, 40);
    expect(displayWidth(row)).toBeLessThanOrEqual(40);
    expect(strip(row)).not.toContain("home");
    expect(strip(row)).toContain(" 7 ");
  });
});
