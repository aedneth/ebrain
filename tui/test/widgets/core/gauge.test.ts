/** Snapshot tests for core/gauge — mirrors design-system Gauge contract. */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { gauge } from "../../../src/widgets/core/gauge.js";
import { displayWidth } from "../../../src/kit/draw.js";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("gauge (truecolor/unicode)", () => {
  const t = makeTheme({ trueColor: true, ascii: false });
  const [full, part, empty] = t.glyph("gauge").split(" ");

  it("lays out label + bar + suffix; bar is `width` cells; auto tone neutral <75%", () => {
    const out = gauge({ label: "spend", value: 2.1, max: 10, width: 24, suffix: "$2.1/$10" }, t);
    const dim = t.fg("text.secondary");
    // ratio 0.21 → 5 full, 0 part, 19 empty; auto tone < 75% → neutral (text.secondary)
    const bar = full.repeat(5) + part.repeat(0) + empty.repeat(19);
    const expected = dim + "spend " + t.reset + dim + bar + t.reset + dim + " $2.1/$10" + t.reset;
    expect(out).toEqual(expected);
    expect(strip(out)).toBe("spend " + full.repeat(5) + empty.repeat(19) + " $2.1/$10");
    expect(displayWidth(out)).toBe("spend ".length + 24 + " $2.1/$10".length); // 6 + 24 + 9
  });

  it("bar-only render is exactly `width` cells (declared width)", () => {
    const out = gauge({ value: 1, max: 2, width: 16 }, t);
    expect(displayWidth(out)).toBe(16);
  });

  it("auto tone colors the fill warn >=75%", () => {
    const out = gauge({ label: "ram", value: 3.2, max: 4, width: 10, tone: "auto", suffix: "3.2/4G" }, t);
    // ratio 0.8 → warn
    expect(out).toContain(t.fg("semantic.warn"));
    expect(displayWidth(out)).toBe("ram ".length + 10 + " 3.2/4G".length);
  });

  it("explicit tone token colors the fill and ignores threshold", () => {
    const out = gauge({ value: 1, max: 10, width: 8, tone: "memory" }, t);
    expect(out).toContain(t.fg("memory.violet"));
  });

  it("ignores an invalid tone enum (neutral fill)", () => {
    const out = gauge({ value: 5, max: 10, width: 8, tone: "bogus" as never }, t);
    expect(out).toContain(t.fg("text.secondary"));
    expect(displayWidth(out)).toBe(8);
  });
});

describe("gauge (ASCII fallback)", () => {
  const t = makeTheme({ trueColor: true, ascii: true });

  it("uses ASCII gauge chars # = .", () => {
    const out = gauge({ value: 5, max: 10, width: 10 }, t); // ratio 0.5 → 5 full
    expect(strip(out)).toBe("#####.....");
    expect(displayWidth(out)).toBe(10);
  });
});
