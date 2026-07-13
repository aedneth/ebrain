/** Snapshot tests for dialog/confirm — mirrors design-system ConfirmDialog contract. */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { confirm } from "../../../src/widgets/dialog/confirm.js";
import { displayWidth } from "../../../src/kit/draw.js";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("confirm (truecolor/unicode)", () => {
  const t = makeTheme({ trueColor: true, ascii: false });

  it("renders a straight box with title, message, and a keys row", () => {
    const width = 52;
    const out = confirm(
      {
        danger: true,
        title: "kill session",
        message: "terminar ebr-claude-korvex?",
        confirmKey: "y",
        confirmLabel: "kill",
        cancelKey: "esc",
        cancelLabel: "cancel",
        width,
      },
      t,
    );
    expect(out.length).toBe(6); // top, blank, msg, blank, actions, bottom
    for (const row of out) expect(displayWidth(row)).toBe(width);

    expect(strip(out[0])).toBe("┌─ kill session ───────────────────────────────────┐");
    expect(strip(out[2])).toBe("│ terminar ebr-claude-korvex?                      │");
    expect(strip(out[4])).toBe("│ [y] kill   [esc] cancel                          │");
    expect(strip(out[5])).toBe("└" + "─".repeat(width - 2) + "┘");
  });

  it("danger colors the border + confirm key in error; body on raised bg", () => {
    const out = confirm({ danger: true, title: "t", message: "m", width: 30 }, t);
    expect(out[0]).toContain(t.fg("semantic.error")); // danger border
    expect(out[4]).toContain(t.fg("semantic.error")); // [confirmKey] in error
    expect(out[2]).toContain(t.bg("background.raised"));
    for (const row of out) expect(displayWidth(row)).toBe(30);
  });

  it("non-danger uses text.muted border + accent confirm key; defaults applied", () => {
    const out = confirm({ title: "t", message: "m", width: 44 }, t);
    expect(out[0]).toContain(t.fg("text.muted"));
    expect(out[4]).toContain(t.fg("accent.teal")); // confirm key accent
    expect(strip(out[4])).toContain("[y] confirmar");
    expect(strip(out[4])).toContain("[n] cancelar");
    for (const row of out) expect(displayWidth(row)).toBe(44);
  });
});

describe("confirm (ASCII fallback)", () => {
  const t = makeTheme({ trueColor: true, ascii: true });

  it("uses ASCII straight-box corners +", () => {
    const width = 40;
    const out = confirm({ title: "t", message: "m", width }, t);
    expect(strip(out[0]).startsWith("+")).toBe(true);
    expect(strip(out[0]).endsWith("+")).toBe(true);
    expect(strip(out[5])).toBe("+" + "-".repeat(width - 2) + "+");
    for (const row of out) expect(displayWidth(row)).toBe(width);
  });
});
