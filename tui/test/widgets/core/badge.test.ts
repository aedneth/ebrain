/** Snapshot tests for core/badge — mirrors design-system Badge contract. */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { badge } from "../../../src/widgets/core/badge.js";
import { displayWidth } from "../../../src/kit/draw.js";

const BOLD = "\x1b[1m";
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("badge (truecolor/unicode)", () => {
  const t = makeTheme({ trueColor: true, ascii: false });

  it("renders an agent badge: dot + label in the agent color", () => {
    const out = badge({ agent: "claude", label: "ebr" }, t);
    const expected = t.agent("claude") + t.glyph("badgeDot") + " " + "ebr" + t.reset;
    expect(out).toEqual(expected);
    expect(displayWidth(out)).toBe(5); // ● + space + "ebr"
    expect(strip(out)).toBe("● ebr");
  });

  it("renders a solid tone badge: inverted (bg=color, fg=void, bold)", () => {
    const out = badge({ tone: "ok", label: "UP", solid: true }, t);
    const expected = t.bg("semantic.ok") + t.fg("background.void") + BOLD + " UP " + t.reset;
    expect(out).toEqual(expected);
    expect(displayWidth(out)).toBe(4);
    expect(strip(out)).toBe(" UP ");
  });

  it("renders disabled everything in disabledText, ignoring agent/tone", () => {
    const out = badge({ agent: "claude", disabled: true, label: "x" }, t);
    const expected = t.disabledText + t.glyph("badgeDot") + " " + "x" + t.reset;
    expect(out).toEqual(expected);
    expect(out).not.toContain(t.agent("claude"));
    expect(displayWidth(out)).toBe(3);
  });

  it("ignores an invalid agent enum (falls back to neutral text.secondary)", () => {
    const out = badge({ agent: "bogus" as never, label: "z" }, t);
    expect(out).toEqual(t.fg("text.secondary") + t.glyph("badgeDot") + " " + "z" + t.reset);
    expect(displayWidth(out)).toBe(3);
  });
});

describe("badge (ASCII fallback)", () => {
  const t = makeTheme({ trueColor: true, ascii: true });

  it("uses the ASCII dot glyph *", () => {
    const out = badge({ agent: "gemini", label: "g" }, t);
    expect(strip(out)).toBe("* g");
    expect(out).toEqual(t.agent("gemini") + "*" + " " + "g" + t.reset);
    expect(displayWidth(out)).toBe(3);
  });
});
