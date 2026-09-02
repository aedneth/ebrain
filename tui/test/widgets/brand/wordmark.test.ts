/**
 * Snapshot test for brand/wordmark.ts (SPRINT-TUI 6.3.2).
 * Props match Wordmark.d.ts (variant, ascii); WORDMARK_MATRIX + wordmarkHalfBlocks
 * exported per the .d.ts. Asserts: block variant multi-row; "e"/"brain" split
 * colors differ; ascii variant emoji-free. Includes the brand group's ascii variant.
 * Also verifies the matrix was copied VERBATIM from Wordmark.jsx.
 */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { displayWidth } from "../../../src/kit/draw.js";
import {
  wordmark,
  WORDMARK_MATRIX,
  wordmarkHalfBlocks,
} from "../../../src/widgets/brand/wordmark.ts";

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/u;

describe("wordmark", () => {
  const theme = makeTheme({ trueColor: true, ascii: false });

  it("WORDMARK_MATRIX copied verbatim from Wordmark.jsx", () => {
    expect(WORDMARK_MATRIX.e).toEqual([".###", "#..#", "####", "#...", ".###"]);
    expect(WORDMARK_MATRIX.b).toEqual(["#...", "#...", "###.", "#..#", "###."]);
    expect(WORDMARK_MATRIX.r).toEqual(["....", "#.##", "##..", "#...", "#..."]);
    expect(WORDMARK_MATRIX.a).toEqual([".###", "#..#", "####", "#..#", "#..#"]);
    expect(WORDMARK_MATRIX.i).toEqual(["#", ".", "#", "#", "#"]);
    expect(WORDMARK_MATRIX.n).toEqual(["....", "#.#.", "##.#", "#..#", "#..#"]);
  });

  it("wordmarkHalfBlocks maps row pairs to █ / ▀ / ▄ (verbatim technique)", () => {
    // 'i' = ['#','.','#','#','#'] -> pairs (#,.)=▀ (#,#)=█ (#,.)=▀
    expect(wordmarkHalfBlocks(WORDMARK_MATRIX.i)).toEqual(["▀", "█", "▀"]);
  });

  it("block variant is multi-row with 'e' teal and 'brain' primary (colors differ)", () => {
    const rows = wordmark({}, theme);
    expect(rows.length).toBe(3); // half-block => 3 rows
    expect(rows.length).toBeGreaterThan(1);

    const teal = theme.fg("accent.teal");
    const primary = theme.fg("text.primary");
    expect(teal).not.toBe(primary);
    // each line starts with the teal-colored 'e' and also contains the primary 'brain'
    for (const r of rows) {
      expect(r.startsWith(teal)).toBe(true);
      expect(r).toContain(primary);
    }
    // all three rows share the same display width
    const w = displayWidth(rows[0]);
    for (const r of rows) expect(displayWidth(r)).toBe(w);
    expect(EMOJI_RE.test(rows.join(""))).toBe(false);
  });

  it("compact variant is a single bold 'ebrain' line", () => {
    const rows = wordmark({ variant: "compact" }, theme);
    expect(rows.length).toBe(1);
    expect(displayWidth(rows[0])).toBe("ebrain".length); // 6
    expect(rows[0]).toContain("brain");
    expect(rows[0]).toContain("\x1b[1m"); // bold
  });

  it("ascii variant: 5 rows, emoji-free, no half-block chars", () => {
    const rows = wordmark({ ascii: true }, theme);
    expect(rows.length).toBe(5);
    expect(EMOJI_RE.test(rows.join(""))).toBe(false);
    const plain = rows.map((r) => r.replace(/\x1b\[[0-9;]*m/g, "")).join("");
    expect(plain.includes("█")).toBe(false);
    expect(plain.includes("▀")).toBe(false);
    expect(plain.includes("▄")).toBe(false);
  });

  it("theme.ascii forces the ascii path even without the ascii prop", () => {
    const asciiTheme = makeTheme({ trueColor: true, ascii: true });
    const rows = wordmark({}, asciiTheme);
    expect(rows.length).toBe(5);
  });
});
