/** Snapshot tests for core/spinner — mirrors design-system Spinner contract. */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { glyphs } from "../../../src/theme.ts";
import { spinner } from "../../../src/widgets/core/spinner.js";
import { displayWidth } from "../../../src/kit/draw.js";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("spinner (truecolor/unicode)", () => {
  const t = makeTheme({ trueColor: true, ascii: false });
  const frames = [...t.glyph("spinner")];

  it("PURE: `frame` selects the braille char; default color accent.teal; dim label", () => {
    const out = spinner({ label: "doctor...", frame: 2 }, t);
    const expected =
      t.fg("accent.teal") + frames[2] + t.reset + " " + t.fg("text.secondary") + "doctor..." + t.reset;
    expect(out).toEqual(expected);
    expect(strip(out)).toBe(frames[2] + " doctor...");
    expect(displayWidth(out)).toBe(1 + 1 + "doctor...".length);
  });

  it("wraps the frame index (frame % frames.length)", () => {
    const out = spinner({ frame: frames.length + 3 }, t);
    expect(strip(out)).toBe(frames[3]);
  });

  it("freezes at · when inactive (per Spinner.d.ts/.jsx)", () => {
    const out = spinner({ label: "idle", active: false }, t);
    const dot = t.glyph("separators").split(" ")[0];
    expect(strip(out)).toBe(dot + " idle");
    expect(dot).toBe("·");
  });

  it("overridable color role", () => {
    const out = spinner({ frame: 0, color: "memory.violet" }, t);
    expect(out).toContain(t.fg("memory.violet"));
  });
});

describe("spinner (ASCII)", () => {
  it("ascii prop forces |/-\\ frames even in unicode theme", () => {
    const t = makeTheme({ trueColor: true, ascii: false });
    const asciiFrames = [...glyphs.spinner.asciiFallback];
    const out = spinner({ ascii: true, frame: 1 }, t);
    expect(strip(out)).toBe(asciiFrames[1]); // "/"
  });

  it("ascii theme uses ascii frames", () => {
    const t = makeTheme({ trueColor: true, ascii: true });
    const out = spinner({ frame: 0 }, t);
    expect(strip(out)).toBe("|");
    expect(displayWidth(out)).toBe(1);
  });
});
