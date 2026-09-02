/**
 * Ported from FlowClock (~/flowclock-cli/test/lineedit.test.ts) — full file,
 * adapted from vitest to bun:test and repointed to ebrain's vendored kit at
 * ../../src/kit/lineedit.js and ../../src/kit/input.js.
 */
import { describe, it, expect } from "bun:test";
import {
  lineFrom,
  insert,
  backspace,
  deleteForward,
  left,
  right,
  home,
  end,
  sanitizeInline,
  lineApplyKey,
  withCursor,
  type LineState,
} from "../../src/kit/lineedit.js";
import type { Key } from "../../src/kit/input.js";

describe("lineedit — model", () => {
  it("seeds cursor at end of text", () => {
    expect(lineFrom("hello")).toEqual({ text: "hello", cursor: 5 });
    expect(lineFrom()).toEqual({ text: "", cursor: 0 });
  });

  it("inserts at the cursor, not just the end", () => {
    let s = lineFrom("ac");
    s = home(s); // cursor 0
    s = right(s); // cursor 1, between a and c
    s = insert(s, "b");
    expect(s.text).toBe("abc");
    expect(s.cursor).toBe(2);
  });

  it("backspace deletes before cursor; no-op at start", () => {
    let s: LineState = { text: "abc", cursor: 2 };
    s = backspace(s);
    expect(s).toEqual({ text: "ac", cursor: 1 });
    s = home(s);
    expect(backspace(s)).toEqual({ text: "ac", cursor: 0 });
  });

  it("delete-forward removes at cursor; no-op at end", () => {
    let s: LineState = { text: "abc", cursor: 1 };
    s = deleteForward(s);
    expect(s).toEqual({ text: "ac", cursor: 1 });
    s = end(s);
    expect(deleteForward(s)).toEqual({ text: "ac", cursor: 2 });
  });

  it("cursor movement clamps to bounds", () => {
    const s = lineFrom("hi");
    expect(left(left(left(s))).cursor).toBe(0);
    expect(right(right(right(s))).cursor).toBe(2);
    expect(home(s).cursor).toBe(0);
    expect(end(home(s)).cursor).toBe(2);
  });

  it("preserves multibyte / emoji as single code points", () => {
    let s = lineFrom("a😀b");
    s = home(s);
    s = right(s); // after 'a'
    s = deleteForward(s); // delete the emoji (2 code units, one code point)
    expect(s.text).toBe("ab");
  });
});

describe("lineedit — paste sanitization", () => {
  it("collapses newlines/tabs to spaces and drops control chars", () => {
    expect(sanitizeInline("a\nb\tc")).toBe("a b c");
    expect(sanitizeInline("x\x00\x07y")).toBe("xy");
    expect(sanitizeInline("clean text")).toBe("clean text");
  });

  it("inserts a full pasted string at once (not just the first char)", () => {
    const s = insert(lineFrom(""), "Deep work on StreamNet");
    expect(s.text).toBe("Deep work on StreamNet");
    expect(s.cursor).toBe(22);
  });

  it("paste in the middle splices correctly", () => {
    let s = lineFrom("ad");
    s = home(s);
    s = right(s);
    s = insert(s, "bc");
    expect(s.text).toBe("abcd");
    expect(s.cursor).toBe(3);
  });
});

describe("lineedit — withCursor", () => {
  it("inserts the cursor glyph before the character at cursor", () => {
    expect(withCursor("abc", 1)).toBe("a▏bc");
  });

  it("places the glyph at the end when cursor is at text length", () => {
    expect(withCursor("abc", 3)).toBe("abc▏");
  });

  it("clamps an out-of-range cursor", () => {
    expect(withCursor("abc", 99)).toBe("abc▏");
    expect(withCursor("abc", -5)).toBe("▏abc");
  });

  it("supports a custom glyph", () => {
    expect(withCursor("ab", 1, "|")).toBe("a|b");
  });
});

describe("lineedit — lineApplyKey routing", () => {
  const apply = (s: LineState, k: Key) => lineApplyKey(s, k);

  it("handles editing keys and reports handled=true", () => {
    expect(apply(lineFrom("a"), { name: "char", char: "b" })).toEqual({
      state: { text: "ab", cursor: 2 },
      handled: true,
    });
    expect(apply({ text: "hi", cursor: 2 }, { name: "paste", text: "!!" }).state.text).toBe("hi!!");
    expect(apply({ text: "hi", cursor: 2 }, { name: "backspace" }).state.text).toBe("h");
  });

  it("handles delete/left/right/home/end and reports handled=true", () => {
    expect(apply({ text: "abc", cursor: 1 }, { name: "delete" }).state.text).toBe("ac");
    expect(apply({ text: "abc", cursor: 1 }, { name: "left" }).state.cursor).toBe(0);
    expect(apply({ text: "abc", cursor: 1 }, { name: "right" }).state.cursor).toBe(2);
    expect(apply({ text: "abc", cursor: 1 }, { name: "home" }).state.cursor).toBe(0);
    expect(apply({ text: "abc", cursor: 1 }, { name: "end" }).state.cursor).toBe(3);
  });

  it("does NOT consume tab/enter/escape/up/down (handled=false)", () => {
    for (const name of ["tab", "enter", "escape", "up", "down"] as const) {
      const res = apply(lineFrom("x"), { name } as Key);
      expect(res.handled).toBe(false);
      expect(res.state).toEqual(lineFrom("x"));
    }
  });

  it("never consumes Ctrl-C", () => {
    const res = apply(lineFrom("x"), { name: "char", char: "\x03" });
    expect(res.handled).toBe(false);
  });

  it("never consumes other control characters typed as char", () => {
    const res = apply(lineFrom("x"), { name: "char", char: "\x01" });
    expect(res.handled).toBe(false);
    expect(res.state).toEqual(lineFrom("x"));
  });
});
