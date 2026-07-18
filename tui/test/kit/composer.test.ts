import { describe, expect, test } from "bun:test";
import { composerApplyKey, composerFrom, composerRows, composerViewport } from "../../src/kit/composer.js";

test("composer preserves pasted newlines and Alt+Enter line breaks exactly", () => {
  let state = composerFrom("one");
  state = composerApplyKey(state, { name: "linebreak" }).state;
  state = composerApplyKey(state, { name: "paste", text: "two\r\nthree" }).state;
  expect(state.text).toBe("one\ntwo\nthree");
});

describe("composer visual editor model", () => {
  const compact = { textWidth: 4, viewportRows: 2 };

  test("keeps exact offsets while wrapping unbroken text into visual rows", () => {
    const rows = composerRows("abcdefghijk", 4);
    expect(rows).toEqual([
      { start: 0, end: 4, text: "abcd" },
      { start: 4, end: 8, text: "efgh" },
      { start: 8, end: 11, text: "ijk" },
    ]);
  });

  test("up/down traverse visual rows and preserve a preferred display column", () => {
    let state = { ...composerFrom("abcdefghijk"), cursor: 7 }; // `h`, row 2 column 3
    state = composerApplyKey(state, { name: "up" }, compact).state;
    expect(state.cursor).toBe(3); // row 1 column 3
    state = composerApplyKey(state, { name: "down" }, compact).state;
    expect(state.cursor).toBe(7);
    state = composerApplyKey(state, { name: "down" }, compact).state;
    expect(state.cursor).toBe(11); // final short row clamps at its end
  });

  test("home/end operate inside the logical line, not the whole draft", () => {
    let state = { ...composerFrom("first\nsecond\nthird"), cursor: 9 };
    state = composerApplyKey(state, { name: "home" }, compact).state;
    expect(state.cursor).toBe(6);
    state = composerApplyKey(state, { name: "end" }, compact).state;
    expect(state.cursor).toBe(12);
  });

  test("keeps the cursor-visible row in the viewport without changing exact text", () => {
    let state = { ...composerFrom("one\ntwo\nthree\nfour\nfive"), cursor: 0 };
    for (let index = 0; index < 4; index += 1) {
      state = composerApplyKey(state, { name: "down" }, { textWidth: 12, viewportRows: 2 }).state;
    }
    const viewport = composerViewport(state, { textWidth: 12, viewportRows: 2 });
    expect(viewport.visibleRows.map((row) => row.text)).toEqual(["four", "five"]);
    expect(viewport.scrollTop).toBe(3);
    expect(state.text).toBe("one\ntwo\nthree\nfour\nfive");
  });

  test("left/right and deletion never split a surrogate pair", () => {
    let state = composerFrom("a😀b");
    state = composerApplyKey(state, { name: "left" }, compact).state;
    state = composerApplyKey(state, { name: "left" }, compact).state;
    expect(state.cursor).toBe(1);
    state = composerApplyKey(state, { name: "delete" }, compact).state;
    expect(state.text).toBe("ab");
    expect(state.cursor).toBe(1);
  });
});
