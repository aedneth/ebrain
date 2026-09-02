/**
 * Snapshot test for chrome/keyhint.ts (SPRINT-TUI 6.3.2).
 * Props (k, label, disabled) match KeyHint.d.ts. The compact UX controls use a
 * muted bracketed key and a primary action label; disabled -> both disabledText.
 */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { displayWidth } from "../../../src/kit/draw.js";
import { keyHint } from "../../../src/widgets/chrome/keyhint.ts";

describe("keyHint", () => {
  const theme = makeTheme({ trueColor: true, ascii: false });

  it("renders a muted bracketed key and primary action label", () => {
    const out = keyHint({ k: "tab", label: "panels" }, theme);
    const expected =
      theme.fg("text.muted") + "[tab]" + theme.reset +
      theme.fg("text.primary") + " panels" + theme.reset;
    expect(out).toBe(expected);
    expect(displayWidth(out)).toBe("[tab] panels".length); // 12
  });

  it("uses disabledText for both key and label when disabled", () => {
    const out = keyHint({ k: "a", label: "attach", disabled: true }, theme);
    const expected =
      theme.disabledText + "[a]" + theme.reset +
      theme.disabledText + " attach" + theme.reset;
    expect(out).toBe(expected);
    expect(displayWidth(out)).toBe("[a] attach".length); // 10
  });
});
