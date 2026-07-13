/**
 * Snapshot test for chrome/keyhint.ts (SPRINT-TUI 6.3.2).
 * Props (k, label, disabled) match KeyHint.d.ts. `k` bold text.primary,
 * `label` dim text.muted; disabled -> both theme.disabledText.
 */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { displayWidth } from "../../../src/kit/draw.js";
import { keyHint } from "../../../src/widgets/chrome/keyhint.ts";

const BOLD = "\x1b[1m";

describe("keyHint", () => {
  const theme = makeTheme({ trueColor: true, ascii: false });

  it("renders key bold-primary and label dim-muted", () => {
    const out = keyHint({ k: "tab", label: "panels" }, theme);
    const expected =
      theme.fg("text.primary") + BOLD + "tab" + theme.reset +
      theme.fg("text.muted") + " panels" + theme.reset;
    expect(out).toBe(expected);
    expect(displayWidth(out)).toBe("tab panels".length); // 10
  });

  it("uses disabledText for both key and label when disabled", () => {
    const out = keyHint({ k: "a", label: "attach", disabled: true }, theme);
    const expected =
      theme.disabledText + BOLD + "a" + theme.reset +
      theme.disabledText + " attach" + theme.reset;
    expect(out).toBe(expected);
    expect(displayWidth(out)).toBe("a attach".length); // 8
  });
});
