/** A small multiline composer for deliberate agent prompts.
 *
 * It intentionally keeps the exact user payload in memory only. Persistence, telemetry,
 * and the session list never receive the draft text.
 */
import type { Key } from "./input.js";
import { displayWidth } from "./draw.js";

/**
 * An in-memory multiline buffer. `cursor` is a UTF-16 offset just like the existing
 * line editor, but movement never splits a surrogate pair. The two optional fields
 * are display state only: they are never sent, persisted, or reused as history.
 */
export interface ComposerState {
  text: string;
  cursor: number;
  /** Desired display-cell column while traversing visual rows with Up/Down. */
  preferredColumn?: number;
  /** First visible visual row. It is clamped whenever terminal geometry changes. */
  scrollTop?: number;
}

/** Geometry belongs to the caller because a pure reducer cannot read the terminal. */
export interface ComposerGeometry {
  /** Printable cells available after the prompt bar and cursor are reserved. */
  textWidth: number;
  /** Number of visual rows available to the editor viewport. */
  viewportRows: number;
}

export interface ComposerVisualRow {
  /** UTF-16 offsets into `ComposerState.text`, exclusive at `end`. */
  start: number;
  end: number;
  text: string;
}

export interface ComposerViewport {
  rows: ComposerVisualRow[];
  visibleRows: ComposerVisualRow[];
  cursorRow: number;
  cursorColumn: number;
  scrollTop: number;
  maxScroll: number;
}

const DEFAULT_GEOMETRY: ComposerGeometry = { textWidth: 56, viewportRows: 6 };
const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max));

export function composerFrom(text = ""): ComposerState {
  return { text, cursor: text.length, scrollTop: 0 };
}

function nextBoundary(text: string, index: number): number {
  const code = text.charCodeAt(index);
  return Math.min(text.length, index + (code >= 0xd800 && code <= 0xdbff ? 2 : 1));
}

function prevBoundary(text: string, index: number): number {
  const code = text.charCodeAt(index - 1);
  return Math.max(0, index - (code >= 0xdc00 && code <= 0xdfff ? 2 : 1));
}

function safeCursor(text: string, cursor: number): number {
  const at = clamp(cursor, text.length);
  return at > 0 && at < text.length && /[\uDC00-\uDFFF]/.test(text[at] ?? "") ? prevBoundary(text, at) : at;
}

function cellWidth(text: string): number {
  return Math.max(1, displayWidth(text));
}

/** Produce visual rows while retaining offsets into the exact, unmodified draft. */
export function composerRows(text: string, requestedWidth: number): ComposerVisualRow[] {
  const width = Math.max(2, Math.floor(requestedWidth));
  const rows: ComposerVisualRow[] = [];
  let logicalStart = 0;

  while (logicalStart <= text.length) {
    const newline = text.indexOf("\n", logicalStart);
    const logicalEnd = newline === -1 ? text.length : newline;

    if (logicalStart === logicalEnd) {
      rows.push({ start: logicalStart, end: logicalEnd, text: "" });
    } else {
      let start = logicalStart;
      let end = logicalStart;
      let visual = "";
      let used = 0;
      while (end < logicalEnd) {
        const next = nextBoundary(text, end);
        const glyph = text.slice(end, next);
        const glyphWidth = cellWidth(glyph);
        if (visual.length > 0 && used + glyphWidth > width) {
          rows.push({ start, end, text: visual });
          start = end;
          visual = "";
          used = 0;
        }
        visual += glyph;
        used += glyphWidth;
        end = next;
      }
      rows.push({ start, end, text: visual });
    }

    if (newline === -1) break;
    logicalStart = newline + 1;
  }

  return rows.length > 0 ? rows : [{ start: 0, end: 0, text: "" }];
}

function cursorRowFor(rows: ComposerVisualRow[], cursor: number): number {
  const startsHere = rows.findIndex((row) => row.start === cursor);
  if (startsHere >= 0) return startsHere;
  const inside = rows.findIndex((row) => cursor >= row.start && cursor <= row.end);
  return inside >= 0 ? inside : Math.max(0, rows.length - 1);
}

function columnAt(row: ComposerVisualRow, cursor: number): number {
  const at = clamp(cursor - row.start, row.text.length);
  return displayWidth(row.text.slice(0, at));
}

function offsetAtColumn(row: ComposerVisualRow, column: number): number {
  const wanted = Math.max(0, column);
  let offset = row.start;
  let used = 0;
  while (offset < row.end) {
    const next = nextBoundary(row.text, offset - row.start) + row.start;
    const glyphWidth = cellWidth(row.text.slice(offset - row.start, next - row.start));
    if (used + glyphWidth > wanted) break;
    used += glyphWidth;
    offset = next;
  }
  return offset;
}

/** Derive a cursor-visible viewport. This is safe to call after a resize: no state mutation. */
export function composerViewport(state: ComposerState, geometry: ComposerGeometry = DEFAULT_GEOMETRY): ComposerViewport {
  const rows = composerRows(state.text, geometry.textWidth);
  const cursor = safeCursor(state.text, state.cursor);
  const cursorRow = cursorRowFor(rows, cursor);
  const viewportRows = Math.max(1, Math.floor(geometry.viewportRows));
  const maxScroll = Math.max(0, rows.length - viewportRows);
  let scrollTop = clamp(state.scrollTop ?? 0, maxScroll);
  if (cursorRow < scrollTop) scrollTop = cursorRow;
  if (cursorRow >= scrollTop + viewportRows) scrollTop = cursorRow - viewportRows + 1;
  scrollTop = clamp(scrollTop, maxScroll);
  return {
    rows,
    visibleRows: rows.slice(scrollTop, scrollTop + viewportRows),
    cursorRow,
    cursorColumn: columnAt(rows[cursorRow]!, cursor),
    scrollTop,
    maxScroll,
  };
}

function withVisibleCursor(state: ComposerState, geometry: ComposerGeometry): ComposerState {
  const cursor = safeCursor(state.text, state.cursor);
  const viewport = composerViewport({ ...state, cursor }, geometry);
  return { ...state, cursor, scrollTop: viewport.scrollTop };
}

function clearPreferred(state: ComposerState): ComposerState {
  const { preferredColumn: _preferredColumn, ...next } = state;
  return next;
}

function sanitizeMultiline(raw: string): string {
  let text = "";
  for (const glyph of raw.replace(/\r\n?/g, "\n")) {
    const code = glyph.codePointAt(0) ?? 0;
    if (glyph === "\n" || (code >= 0x20 && code !== 0x7f)) text += glyph;
  }
  return text;
}

function insertRaw(state: ComposerState, raw: string): ComposerState {
  const text = sanitizeMultiline(raw);
  if (!text) return state;
  const at = safeCursor(state.text, state.cursor);
  return clearPreferred({ ...state, text: state.text.slice(0, at) + text + state.text.slice(at), cursor: at + text.length });
}

function deleteBackward(state: ComposerState): ComposerState {
  const at = safeCursor(state.text, state.cursor);
  if (at === 0) return clearPreferred({ ...state, cursor: at });
  const previous = prevBoundary(state.text, at);
  return clearPreferred({ ...state, text: state.text.slice(0, previous) + state.text.slice(at), cursor: previous });
}

function deleteForward(state: ComposerState): ComposerState {
  const at = safeCursor(state.text, state.cursor);
  if (at >= state.text.length) return clearPreferred({ ...state, cursor: at });
  const next = nextBoundary(state.text, at);
  return clearPreferred({ ...state, text: state.text.slice(0, at) + state.text.slice(next), cursor: at });
}

function logicalLineStart(text: string, cursor: number): number {
  return text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
}

function logicalLineEnd(text: string, cursor: number): number {
  const newline = text.indexOf("\n", cursor);
  return newline === -1 ? text.length : newline;
}

function moveVertical(state: ComposerState, delta: number, geometry: ComposerGeometry): ComposerState {
  const viewport = composerViewport(state, geometry);
  const row = viewport.rows[viewport.cursorRow]!;
  const preferredColumn = state.preferredColumn ?? viewport.cursorColumn;
  const nextRow = clamp(viewport.cursorRow + delta, viewport.rows.length - 1);
  const cursor = offsetAtColumn(viewport.rows[nextRow]!, preferredColumn);
  return withVisibleCursor({ ...state, cursor, preferredColumn }, geometry);
}

/**
 * Alt+Enter inserts a line break; bracketed pastes preserve newlines. Enter is deliberately
 * unhandled so the parent can open the exact-payload review before a literal tmux send.
 */
export function composerApplyKey(
  state: ComposerState,
  key: Key,
  geometry: ComposerGeometry = DEFAULT_GEOMETRY,
): { state: ComposerState; handled: boolean } {
  let next: ComposerState | null = null;
  switch (key.name) {
    case "linebreak": next = insertRaw(state, "\n"); break;
    case "paste": next = insertRaw(state, key.text); break;
    case "char": {
      const code = key.char.codePointAt(0) ?? 0;
      if (code >= 0x20 && key.char !== "\x7f") next = insertRaw(state, key.char);
      break;
    }
    case "backspace": next = deleteBackward(state); break;
    case "delete": next = deleteForward(state); break;
    case "left": next = clearPreferred({ ...state, cursor: prevBoundary(state.text, safeCursor(state.text, state.cursor)) }); break;
    case "right": next = clearPreferred({ ...state, cursor: nextBoundary(state.text, safeCursor(state.text, state.cursor)) }); break;
    case "home": next = clearPreferred({ ...state, cursor: logicalLineStart(state.text, safeCursor(state.text, state.cursor)) }); break;
    case "end": next = clearPreferred({ ...state, cursor: logicalLineEnd(state.text, safeCursor(state.text, state.cursor)) }); break;
    case "up": return { state: moveVertical(state, -1, geometry), handled: true };
    case "down": return { state: moveVertical(state, 1, geometry), handled: true };
    default: return { state, handled: false };
  }
  if (!next) return { state, handled: false };
  return { state: withVisibleCursor(next, geometry), handled: true };
}
