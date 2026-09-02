/** Snapshot tests for core/toast — mirrors design-system Toast contract. */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { toast } from "../../../src/widgets/core/toast.js";
import { displayWidth, padTo } from "../../../src/kit/draw.js";

const BOLD = "\x1b[1m";
const NOBOLD = "\x1b[22m";
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("toast (truecolor/unicode)", () => {
  const t = makeTheme({ trueColor: true, ascii: false });
  const [tl, h, tr, v, bl, br] = t.glyph("dialogBorder").split(" ");

  it("renders a 3-row box, border+glyph in tone color, body on raised bg", () => {
    const width = 30;
    const innerW = width - 2;
    const out = toast({ tone: "ok", width, children: "memoria guardada" }, t);

    const border = t.fg("semantic.ok");
    const bg = t.bg("background.raised");
    const fgText = t.fg("text.primary");
    const interior = bg + " " + border + BOLD + "✓" + NOBOLD + " " + fgText + "memoria guardada";
    const expected = [
      border + tl + h.repeat(innerW) + tr + t.reset,
      border + v + t.reset + padTo(interior, innerW) + t.reset + border + v + t.reset,
      border + bl + h.repeat(innerW) + br + t.reset,
    ];

    expect(out).toEqual(expected);
    expect(out.length).toBe(3);
    for (const row of out) expect(displayWidth(row)).toBe(width);
    expect(strip(out[1])).toBe("│ ✓ memoria guardada         │");
    expect(out[0]).toContain(t.fg("semantic.ok"));
    expect(out[1]).toContain(t.bg("background.raised"));
  });

  it("error tone uses the ✗ glyph and the error color", () => {
    const out = toast({ tone: "error", width: 30, children: "brain locked" }, t);
    expect(strip(out[1])).toContain("✗ brain locked");
    expect(out[0]).toContain(t.fg("semantic.error"));
    for (const row of out) expect(displayWidth(row)).toBe(30);
  });
});

describe("toast (ASCII fallback)", () => {
  const t = makeTheme({ trueColor: true, ascii: true });

  it("uses ASCII corners + and ASCII glyphs (+ / x)", () => {
    const ok = toast({ tone: "ok", width: 20, children: "hi" }, t);
    const err = toast({ tone: "error", width: 20, children: "no" }, t);
    expect(strip(ok[0])).toBe("+" + "-".repeat(18) + "+");
    expect(strip(ok[1])).toBe("| + hi             |");
    expect(strip(err[1])).toContain("x no");
    for (const row of [...ok, ...err]) expect(displayWidth(row)).toBe(20);
  });
});
