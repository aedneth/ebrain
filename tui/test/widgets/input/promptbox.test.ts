/**
 * tui/test/widgets/input/promptbox.test.ts — PromptBox widget (SPRINT-TUI 6.4.3),
 * TUI mirror of design-system/components/input/PromptBox.jsx. Single row, exact width.
 *
 *   bun test ./tui/test/widgets/input/promptbox.test.ts
 */
import { test, expect, describe } from "bun:test";
import { makeTheme } from "../../../src/theme.js";
import { promptBox } from "../../../src/widgets/input/promptbox.js";
import { displayWidth } from "../../../src/kit/draw.js";

const t = makeTheme({ trueColor: true, ascii: false });
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

describe("promptBox (DS mirror of PromptBox.jsx)", () => {
  test("exact width, left ┃ bar, shows the value", () => {
    const row = promptBox({ value: "hola mundo", width: 40 }, t);
    expect(displayWidth(row)).toBe(40);
    expect(strip(row)).toContain("┃");
    expect(strip(row)).toContain("hola mundo");
  });

  test("empty value shows the placeholder", () => {
    const row = promptBox({ value: "", placeholder: "escribe…", width: 30 }, t);
    expect(displayWidth(row)).toBe(30);
    expect(strip(row)).toContain("escribe…");
  });

  test("hint is included; width stays exact", () => {
    const row = promptBox({ value: "x", hint: "enter enviar", width: 40 }, t);
    expect(strip(row)).toContain("enter enviar");
    expect(displayWidth(row)).toBe(40);
  });

  test("over-long values are truncated to width", () => {
    const row = promptBox({ value: "x".repeat(200), width: 24 }, t);
    expect(displayWidth(row)).toBe(24);
  });
});
