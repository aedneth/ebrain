/**
 * Snapshot test for chrome/statusbar.ts (SPRINT-TUI 6.3.2).
 * Props (left, right) match StatusBar.d.ts; StatusSep exported per the .d.ts.
 * Includes the chrome group's ascii:true variant (statusSep dot fallback).
 */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { displayWidth } from "../../../src/kit/draw.js";
import { statusBar, statusSep } from "../../../src/widgets/chrome/statusbar.ts";

describe("statusBar", () => {
  const theme = makeTheme({ trueColor: true, ascii: false });

  it("renders identity left, telemetry right, on the surface bg, exact width", () => {
    const row = statusBar({ left: "ebrain", right: "UP" }, theme, 40);
    // inner = 38; lw=6, rw=2, gap=30
    const expected =
      theme.bg("background.surface") + " " + "ebrain" + " ".repeat(30) + "UP" + " " + theme.reset;
    expect(row).toBe(expected);
    expect(displayWidth(row)).toBe(40);
  });

  it("statusSep is a dim middle-dot of width 3", () => {
    const sep = statusSep(theme);
    const dot = theme.glyph("separators").split(" ")[0];
    expect(sep).toBe(theme.fg("text.muted") + " " + dot + " " + "\x1b[39m");
    expect(displayWidth(sep)).toBe(3);
  });

  it("ascii variant: statusSep falls back to '.' separator", () => {
    const asciiTheme = makeTheme({ trueColor: true, ascii: true });
    const sep = statusSep(asciiTheme);
    expect(sep).toContain(" . ");
    expect(displayWidth(sep)).toBe(3);
  });
});
