/**
 * Vendored from FlowClock (~/flowclock-cli/src/lib/tui/input.ts), FlowClock v3.9.0.
 * Vendored into ebrain; diverges as ebrain's own kit — do not edit upstream, do not re-sync automatically.
 */

/**
 * Pure key parser + raw-mode reader wrapper for TUI navigation.
 *
 * `parseKey` is pure and fully unit-testable. `startNavReader` mirrors the
 * `startKeyReader` pattern in `keys.ts` but dispatches structured Key values
 * rather than calling per-action handlers.
 */

/// <reference types="node" />

// ---------------------------------------------------------------------------
// Key type
// ---------------------------------------------------------------------------

export type Key =
  | { name: "up" }
  | { name: "down" }
  | { name: "left" }
  | { name: "right" }
  | { name: "enter" }
  | { name: "linebreak" }
  | { name: "tab" }
  | { name: "shifttab" }
  | { name: "escape" }
  | { name: "backspace" }
  | { name: "delete" }
  | { name: "home" }
  | { name: "end" }
  | { name: "paste"; text: string }
  | { name: "char"; char: string };

// Bracketed-paste markers (DEC mode 2004). When enabled, terminals wrap pasted
// text in these so a multi-line paste can't be misread as Enter/keystrokes.
export const PASTE_START = "\x1b[200~";
export const PASTE_END = "\x1b[201~";
const PASTE_ON = "\x1b[?2004h";
const PASTE_OFF = "\x1b[?2004l";

// ---------------------------------------------------------------------------
// Pure key parser
// ---------------------------------------------------------------------------

// Common escape sequences
const SEQUENCES: Record<string, Key> = {
  // Most terminals encode Alt+Enter as ESC + CR. The composer owns this key; normal
  // fields continue to submit on plain Enter.
  "\x1b\r": { name: "linebreak" },
  "\x1b[A": { name: "up" },
  "\x1b[B": { name: "down" },
  "\x1b[C": { name: "right" },
  "\x1b[D": { name: "left" },
  // Application-mode cursor keys
  "\x1bOA": { name: "up" },
  "\x1bOB": { name: "down" },
  "\x1bOC": { name: "right" },
  "\x1bOD": { name: "left" },
  // Home / End
  "\x1b[H": { name: "home" },
  "\x1b[F": { name: "end" },
  "\x1b[1~": { name: "home" },
  "\x1b[4~": { name: "end" },
  "\x1b[7~": { name: "home" },
  "\x1b[8~": { name: "end" },
  // Delete / "Supr" (forward delete)
  "\x1b[3~": { name: "delete" },
  // Shift+Tab (CBT — Cursor Backward Tabulation), added SPRINT-TUI 6.3.3 for
  // ebrain's own kit (this file "diverges as ebrain's own kit" per the header
  // above — not an upstream FlowClock sequence, added locally for tab-cycle-back).
  "\x1b[Z": { name: "shifttab" },
};

const CTRL_C = "";

/**
 * Parse a raw terminal chunk into a structured Key.
 *
 * Handles:
 *   - Arrow keys (`\x1b[A/B/C/D`, `\x1bOA/B/C/D`)
 *   - Enter (`\r` or `\n`)
 *   - Tab (`\t`) / Shift+Tab (`\x1b[Z`)
 *   - Escape (bare `\x1b`)
 *   - Backspace (`\x7f`)
 *   - Home / End (various sequences)
 *   - Ctrl-C → `{ name: "char", char: "" }`
 *   - Any other printable character → `{ name: "char", char }`
 */
export function parseKey(chunk: string): Key {
  // Lookup multi-char sequences first
  const seq = SEQUENCES[chunk];
  if (seq) return seq;

  // Single-char cases
  if (chunk === "\r" || chunk === "\n") return { name: "enter" };
  if (chunk === "\t") return { name: "tab" };
  if (chunk === "\x7f") return { name: "backspace" };
  if (chunk === "\x1b") return { name: "escape" };

  // Ctrl-C: treat as a char so the app can decide to quit
  if (chunk === CTRL_C) return { name: "char", char: CTRL_C };

  // Any other input (including multi-byte UTF-8 chars) → char
  const char = chunk[0] ?? "";
  return { name: "char", char };
}

// Escape-sequence keys, longest first, so `tokenize` matches greedily.
const SEQ_KEYS = Object.keys(SEQUENCES).sort((a, b) => b.length - a.length);

/**
 * Split a raw chunk into a stream of structured Keys.
 *
 * Unlike `parseKey` (one Key for the whole chunk), this walks the chunk so a
 * multi-character data event — fast typing batched by the OS, an arrow-key
 * auto-repeat burst, or a plain (non-bracketed) paste — yields one Key per
 * logical token instead of silently dropping all but the first character.
 *
 * Bracketed-paste assembly is handled by the reader (it can span chunks); this
 * function assumes `chunk` contains no paste markers.
 */
export function tokenize(chunk: string): Key[] {
  const out: Key[] = [];
  let i = 0;
  while (i < chunk.length) {
    // Longest known escape sequence at the cursor wins.
    let matched: string | null = null;
    for (const seq of SEQ_KEYS) {
      if (chunk.startsWith(seq, i)) {
        matched = seq;
        break;
      }
    }
    if (matched) {
      out.push(SEQUENCES[matched]!);
      i += matched.length;
      continue;
    }
    const ch = chunk[i]!;
    if (ch === "\x1b") {
      out.push({ name: "escape" });
      i += 1;
    } else if (ch === "\r" || ch === "\n") {
      out.push({ name: "enter" });
      i += 1;
    } else if (ch === "\t") {
      out.push({ name: "tab" });
      i += 1;
    } else if (ch === "\x7f") {
      out.push({ name: "backspace" });
      i += 1;
    } else if (ch === CTRL_C) {
      out.push({ name: "char", char: CTRL_C });
      i += 1;
    } else {
      // Full Unicode code point (handles surrogate pairs / multibyte UTF-8).
      const cp = String.fromCodePoint(chunk.codePointAt(i)!);
      out.push({ name: "char", char: cp });
      i += cp.length;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Raw-mode reader
// ---------------------------------------------------------------------------

/**
 * Start a raw-mode key reader on `input`. Dispatches one `Key` per data
 * chunk via `onKey`. Also routes Ctrl-C to `{ name: "char", char: "" }`
 * so the caller can handle quit.
 *
 * Mirrors the pattern in `keys.ts` (`startKeyReader`):
 *   - Sets raw mode, resumes, utf8 encoding.
 *   - Returns a `stop()` function that restores raw mode + pauses.
 */
export function startNavReader(
  input: NodeJS.ReadStream,
  onKey: (k: Key) => void,
  output?: NodeJS.WriteStream,
): () => void {
  const wasRaw = (input as NodeJS.ReadStream & { isRaw?: boolean }).isRaw ?? false;

  if (input.isTTY) input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");
  // Ask the terminal to wrap pastes in PASTE_START/PASTE_END so a multi-line
  // paste arrives as one event instead of a flood of keystrokes (incl. Enter).
  if (output?.isTTY) output.write(PASTE_ON);

  // Buffer for a bracketed paste in progress (may span several data events).
  let pasteBuf: string | null = null;

  const emitPlain = (s: string) => {
    if (!s) return;
    for (const key of tokenize(s)) onKey(key);
  };

  const flushPaste = () => {
    if (pasteBuf === null) return;
    const end = pasteBuf.indexOf(PASTE_END);
    if (end === -1) return; // still accumulating
    const text = pasteBuf.slice(0, end);
    const rest = pasteBuf.slice(end + PASTE_END.length);
    pasteBuf = null;
    onKey({ name: "paste", text });
    if (rest) onData(rest);
  };

  function onData(chunk: string) {
    if (pasteBuf !== null) {
      pasteBuf += chunk;
      flushPaste();
      return;
    }
    const start = chunk.indexOf(PASTE_START);
    if (start !== -1) {
      emitPlain(chunk.slice(0, start));
      pasteBuf = chunk.slice(start + PASTE_START.length);
      flushPaste();
      return;
    }
    emitPlain(chunk);
  }

  input.on("data", onData);

  return function stop() {
    input.off("data", onData);
    if (output?.isTTY) output.write(PASTE_OFF);
    if (input.isTTY) input.setRawMode(wasRaw);
    input.pause();
  };
}
