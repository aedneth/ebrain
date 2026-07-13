/**
 * Snapshot test for layout/panel.ts (SPRINT-TUI 6.3.2).
 * Props match Panel.d.ts (title, focus, dialog, borderColor, titleColor, width,
 * height, pad, bg, body). Asserts BOTH rounded (non-dialog) and square (dialog)
 * corners, exact row count == height, and each row displayWidth == width.
 * Includes the layout group's ascii:true variant.
 */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { displayWidth } from "../../../src/kit/draw.js";
import { panel } from "../../../src/widgets/layout/panel.ts";

const BOLD = "\x1b[1m";

describe("panel", () => {
  const theme = makeTheme({ trueColor: true, ascii: false });

  it("non-dialog panel uses ROUNDED corners and exact geometry", () => {
    const rows = panel(
      { title: "sessions", focus: true, width: 20, height: 5, body: ["l1", "l2", "l3"] },
      theme,
    );
    expect(rows.length).toBe(5);
    for (const r of rows) expect(displayWidth(r)).toBe(20);

    // rounded corners ╭ ╮ ╰ ╯
    expect(rows[0]).toContain("╭");
    expect(rows[0]).toContain("╮");
    expect(rows[4]).toContain("╰");
    expect(rows[4]).toContain("╯");
    // title present + bold when focused, on the top border (left-aligned, matches .jsx)
    expect(rows[0]).toContain("sessions");
    expect(rows[0]).toContain(BOLD);
    // focus border uses the accent (teal) escape
    expect(rows[0]).toContain(theme.focusBorder);
  });

  it("dialog panel uses SQUARE corners (and not rounded)", () => {
    const rows = panel({ title: "confirm", dialog: true, width: 20, height: 5, body: [] }, theme);
    expect(rows.length).toBe(5);
    for (const r of rows) expect(displayWidth(r)).toBe(20);

    expect(rows[0]).toContain("┌");
    expect(rows[0]).toContain("┐");
    expect(rows[4]).toContain("└");
    expect(rows[4]).toContain("┘");
    // no rounded corners anywhere
    expect(rows.join("")).not.toContain("╭");
    expect(rows.join("")).not.toContain("╯");
    // blur (non-focus) border uses the dim border escape, not teal
    expect(rows[0]).toContain(theme.blurBorder);
    expect(rows[0].includes(theme.focusBorder)).toBe(false);
  });

  it("ascii variant: corners degrade to '+' and edges to '-'", () => {
    const asciiTheme = makeTheme({ trueColor: true, ascii: true });
    const rows = panel({ title: "x", width: 12, height: 3, body: ["hi"] }, asciiTheme);
    expect(rows.length).toBe(3);
    for (const r of rows) expect(displayWidth(r)).toBe(12);
    const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
    expect(plain(rows[0]).startsWith("+")).toBe(true);
    expect(plain(rows[0]).endsWith("+")).toBe(true);
    expect(plain(rows[2])).toBe("+" + "-".repeat(10) + "+");
    // no unicode box-drawing chars leaked in
    expect(plain(rows.join("")).includes("╭")).toBe(false);
    expect(plain(rows.join("")).includes("┌")).toBe(false);
  });
});
