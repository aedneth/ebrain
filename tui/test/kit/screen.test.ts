/**
 * Ported from FlowClock (~/flowclock-cli/test/tui.test.ts) — screen.ts coverage
 * (diffFrames + Screen class) only. Adapted from vitest to bun:test and
 * repointed to ebrain's vendored kit at ../../src/kit/screen.js.
 */
import { describe, it, expect } from "bun:test";

import {
  diffFrames,
  cursorTo,
  ERASE_EOL,
  ENTER_ALT_SCREEN,
  EXIT_ALT_SCREEN,
  CLEAR_SCREEN,
  Screen,
} from "../../src/kit/screen.js";

// ---------------------------------------------------------------------------
// screen.ts — diffFrames
// ---------------------------------------------------------------------------

describe("diffFrames", () => {
  it("returns empty string for identical frames", () => {
    const frame = ["hello", "world"];
    expect(diffFrames(frame, frame)).toBe("");
  });

  it("returns empty string for two empty frames", () => {
    expect(diffFrames([], [])).toBe("");
  });

  it("emits update only for changed rows", () => {
    const prev = ["row0", "row1", "row2"];
    const next = ["row0", "CHANGED", "row2"];
    const diff = diffFrames(prev, next);
    // Only row 1 changed (1-based index 2)
    expect(diff).toBe(cursorTo(2, 1) + ERASE_EOL + "CHANGED");
    // Must NOT contain row0 or row2 content (unchanged)
    expect(diff).not.toContain("row0");
    expect(diff).not.toContain("row2");
  });

  it("emits updates for all changed rows", () => {
    const prev = ["a", "b", "c"];
    const next = ["A", "b", "C"];
    const diff = diffFrames(prev, next);
    expect(diff).toContain(cursorTo(1, 1) + ERASE_EOL + "A");
    expect(diff).toContain(cursorTo(3, 1) + ERASE_EOL + "C");
    expect(diff).not.toContain(cursorTo(2, 1));
  });

  it("handles next frame longer than prev (new rows treated as change from empty)", () => {
    const prev = ["row0"];
    const next = ["row0", "new-row"];
    const diff = diffFrames(prev, next);
    // row0 unchanged; new-row is a change from "" → "new-row"
    expect(diff).toBe(cursorTo(2, 1) + ERASE_EOL + "new-row");
  });

  it("handles next frame shorter than prev (removed rows are change to empty)", () => {
    const prev = ["row0", "row1"];
    const next = ["row0"];
    const diff = diffFrames(prev, next);
    // row0 unchanged; row1 is a change from "row1" → ""
    expect(diff).toBe(cursorTo(2, 1) + ERASE_EOL + "");
  });

  it("handles both frames empty", () => {
    expect(diffFrames([], [])).toBe("");
  });

  it("emits correct row indices for many rows", () => {
    const prev = Array.from({ length: 10 }, (_, i) => `line${i}`);
    const next = [...prev];
    next[5] = "CHANGED";
    const diff = diffFrames(prev, next);
    expect(diff).toBe(cursorTo(6, 1) + ERASE_EOL + "CHANGED");
  });

  it("each row position in the diff starts at column 1", () => {
    const prev = ["old"];
    const next = ["new"];
    const diff = diffFrames(prev, next);
    expect(diff).toContain(";1H"); // col = 1
  });
});

// ---------------------------------------------------------------------------
// screen.ts — Screen class
// ---------------------------------------------------------------------------

describe("Screen", () => {
  function makeStream() {
    const chunks: string[] = [];
    return {
      written: chunks,
      write(s: string) {
        chunks.push(s);
        return true;
      },
    };
  }

  it("enter() writes alt-screen enter + clear", () => {
    const s = makeStream();
    const screen = new Screen(s as unknown as NodeJS.WritableStream);
    screen.enter();
    expect(s.written.join("")).toContain(ENTER_ALT_SCREEN);
    expect(s.written.join("")).toContain(CLEAR_SCREEN);
  });

  it("render() writes the diff on first render (prev is empty)", () => {
    const s = makeStream();
    const screen = new Screen(s as unknown as NodeJS.WritableStream);
    screen.enter();
    s.written.length = 0; // clear enter output
    screen.render(["hello", "world"]);
    const out = s.written.join("");
    // Both rows differ from empty prev
    expect(out).toContain("hello");
    expect(out).toContain("world");
  });

  it("render() only writes changed rows on subsequent calls", () => {
    const s = makeStream();
    const screen = new Screen(s as unknown as NodeJS.WritableStream);
    screen.enter();
    screen.render(["row0", "row1"]);
    s.written.length = 0;
    screen.render(["row0", "CHANGED"]);
    const out = s.written.join("");
    expect(out).not.toContain("row0");
    expect(out).toContain("CHANGED");
  });

  it("render() writes nothing when frame is identical", () => {
    const s = makeStream();
    const screen = new Screen(s as unknown as NodeJS.WritableStream);
    screen.enter();
    screen.render(["same"]);
    s.written.length = 0;
    screen.render(["same"]);
    expect(s.written.join("")).toBe("");
  });

  it("exit() writes the exit alt-screen sequence", () => {
    const s = makeStream();
    const screen = new Screen(s as unknown as NodeJS.WritableStream);
    screen.exit();
    expect(s.written.join("")).toContain(EXIT_ALT_SCREEN);
  });

  it("enter() resets prev frame so next render re-draws all rows", () => {
    const s = makeStream();
    const screen = new Screen(s as unknown as NodeJS.WritableStream);
    screen.enter();
    screen.render(["hello"]);
    screen.enter(); // reset
    s.written.length = 0;
    screen.render(["hello"]); // same content but prev is empty after re-enter
    const out = s.written.join("");
    expect(out).toContain("hello");
  });
});
