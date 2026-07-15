/** A small multiline composer for deliberate agent prompts.
 *
 * It intentionally keeps the exact user payload in memory only. Persistence, telemetry,
 * and the session list never receive the draft text.
 */
import type { Key } from "./input.js";
import { lineApplyKey, type LineState } from "./lineedit.js";

export type ComposerState = LineState;

export function composerFrom(text = ""): ComposerState {
  return { text, cursor: text.length };
}

function insertRaw(state: ComposerState, raw: string): ComposerState {
  const text = raw
    .replace(/\r\n?/g, "\n")
    .split("")
    .filter((char) => char === "\n" || (char.codePointAt(0)! >= 0x20 && char.codePointAt(0) !== 0x7f))
    .join("");
  if (!text) return state;
  const at = Math.max(0, Math.min(state.cursor, state.text.length));
  return { text: state.text.slice(0, at) + text + state.text.slice(at), cursor: at + text.length };
}

/** Alt+Enter inserts a line break; bracketed pastes preserve their newlines verbatim. */
export function composerApplyKey(state: ComposerState, key: Key): { state: ComposerState; handled: boolean } {
  if (key.name === "linebreak") return { state: insertRaw(state, "\n"), handled: true };
  if (key.name === "paste") return { state: insertRaw(state, key.text), handled: true };
  return lineApplyKey(state, key);
}
