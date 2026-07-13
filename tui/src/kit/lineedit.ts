/**
 * Vendored from FlowClock (~/flowclock-cli/src/lib/tui/lineedit.ts), FlowClock v3.9.0.
 * Vendored into ebrain; diverges as ebrain's own kit — do not edit upstream, do not re-sync automatically.
 */

/**
 * A tiny, pure single-line text editor model.
 *
 * Every text field in the TUI (goal, details, target, break budget, …) is a
 * one-line input. This module holds the editing logic — cursor position,
 * insert-at-cursor, paste, word-free navigation — so the form reducers stay
 * thin and the behaviour is unit-testable in isolation.
 *
 * `cursor` is a code-unit index in `[0, text.length]` pointing *before* the
 * character it would insert at. Pure: every function returns a new state.
 */

import type { Key } from "./input.js";

export interface LineState {
  text: string;
  cursor: number;
}

/** A fresh line, cursor parked at the end of any seed text. */
export function lineFrom(text = ""): LineState {
  return { text, cursor: text.length };
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max));

// Code-point-aware stepping so a surrogate pair (emoji) moves/deletes as one
// unit and is never split into a broken half.
function nextBoundary(text: string, i: number): number {
  const c = text.charCodeAt(i);
  return Math.min(text.length, i + (c >= 0xd800 && c <= 0xdbff ? 2 : 1));
}
function prevBoundary(text: string, i: number): number {
  const c = text.charCodeAt(i - 1);
  return Math.max(0, i - (c >= 0xdc00 && c <= 0xdfff ? 2 : 1));
}

/**
 * Sanitize text for a single-line field: newlines/tabs collapse to a space and
 * other C0/C1 control characters are dropped. Keeps printable text (incl.
 * multibyte/emoji) intact. Used for pastes and defensively for typed input.
 */
export function sanitizeInline(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "\n" || ch === "\r" || ch === "\t") out += " ";
    else if (code < 0x20 || code === 0x7f) continue; // drop control chars
    else out += ch;
  }
  return out;
}

/** Insert sanitized text at the cursor and advance past it. */
export function insert(state: LineState, raw: string): LineState {
  const ins = sanitizeInline(raw);
  if (!ins) return state;
  const at = clamp(state.cursor, state.text.length);
  return {
    text: state.text.slice(0, at) + ins + state.text.slice(at),
    cursor: at + ins.length,
  };
}

/** Delete the character before the cursor (Backspace). */
export function backspace(state: LineState): LineState {
  const at = clamp(state.cursor, state.text.length);
  if (at === 0) return state;
  const prev = prevBoundary(state.text, at);
  return { text: state.text.slice(0, prev) + state.text.slice(at), cursor: prev };
}

/** Delete the character at the cursor (Delete / Supr). */
export function deleteForward(state: LineState): LineState {
  const at = clamp(state.cursor, state.text.length);
  if (at >= state.text.length) return state;
  const next = nextBoundary(state.text, at);
  return { text: state.text.slice(0, at) + state.text.slice(next), cursor: at };
}

export function left(state: LineState): LineState {
  const at = clamp(state.cursor, state.text.length);
  return { ...state, cursor: prevBoundary(state.text, at) };
}
export function right(state: LineState): LineState {
  const at = clamp(state.cursor, state.text.length);
  return { ...state, cursor: nextBoundary(state.text, at) };
}
export function home(state: LineState): LineState {
  return { ...state, cursor: 0 };
}
export function end(state: LineState): LineState {
  return { ...state, cursor: state.text.length };
}

/**
 * Render `text` with a visible cursor bar inserted before the character at
 * `cursor` (or at the end). The bar sits between cells so it reads like a
 * caret without overwriting a character.
 */
export function withCursor(text: string, cursor: number, glyph = "▏"): string {
  const at = clamp(cursor, text.length);
  return text.slice(0, at) + glyph + text.slice(at);
}

/**
 * Apply a Key to the line. Returns `{ state, handled }`: `handled` is false for
 * keys this editor doesn't own (tab/enter/escape/up/down) so the caller's form
 * reducer can act on them. Ctrl-C is never consumed.
 */
export function lineApplyKey(
  state: LineState,
  key: Key,
): { state: LineState; handled: boolean } {
  switch (key.name) {
    case "char": {
      const ch = key.char;
      const code = ch.codePointAt(0) ?? 0;
      if (code < 0x20 || ch === "\x03") return { state, handled: false }; // Ctrl-C etc.
      return { state: insert(state, ch), handled: true };
    }
    case "paste":
      return { state: insert(state, key.text), handled: true };
    case "backspace":
      return { state: backspace(state), handled: true };
    case "delete":
      return { state: deleteForward(state), handled: true };
    case "left":
      return { state: left(state), handled: true };
    case "right":
      return { state: right(state), handled: true };
    case "home":
      return { state: home(state), handled: true };
    case "end":
      return { state: end(state), handled: true };
    default:
      return { state, handled: false };
  }
}
