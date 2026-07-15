import { expect, test } from "bun:test";
import { composerApplyKey, composerFrom } from "../../src/kit/composer.js";

test("composer preserves pasted newlines and Alt+Enter line breaks exactly", () => {
  let state = composerFrom("one");
  state = composerApplyKey(state, { name: "linebreak" }).state;
  state = composerApplyKey(state, { name: "paste", text: "two\r\nthree" }).state;
  expect(state.text).toBe("one\ntwo\nthree");
});
