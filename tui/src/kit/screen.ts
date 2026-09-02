/**
 * Vendored from FlowClock (~/flowclock-cli/src/lib/tui/screen.ts), FlowClock v3.9.0.
 * Vendored into ebrain; diverges as ebrain's own kit — do not edit upstream, do not re-sync automatically.
 */

/**
 * Alt-screen lifecycle + diff renderer.
 *
 * `diffFrames` is the pure heart: given the previous and next frames as arrays
 * of already-padded row strings, it returns the minimal ANSI escape sequence
 * that updates only changed rows — no full-screen clear, no flicker.
 */

/// <reference types="node" />

// ---------------------------------------------------------------------------
// ANSI lifecycle constants
// ---------------------------------------------------------------------------

/** Enter the alternate screen and hide the cursor. */
export const ENTER_ALT_SCREEN =
  "\x1b[?1049h" + // enter alt-screen
  "\x1b[?25l"; // hide cursor

/** Show the cursor and leave the alternate screen. */
export const EXIT_ALT_SCREEN =
  "\x1b[?25h" + // show cursor
  "\x1b[?1049l"; // exit alt-screen

/** Clear the screen and move cursor to top-left. */
export const CLEAR_SCREEN = "\x1b[2J\x1b[H";

/** Move cursor to 1-based (row, col). */
export function cursorTo(row: number, col: number): string {
  return `\x1b[${row};${col}H`;
}

/** Erase from cursor to end of line. */
export const ERASE_EOL = "\x1b[K";

// ---------------------------------------------------------------------------
// Pure diff renderer
// ---------------------------------------------------------------------------

/**
 * Given the previous frame and the next frame as arrays of full row strings
 * (already padded/truncated to terminal width by the caller), return the
 * minimal ANSI that updates only the changed rows.
 *
 * For each row index where `prev[i] !== next[i]`, emits:
 *   cursorTo(i+1, 1) + ERASE_EOL + next[i]
 *
 * Unchanged rows emit nothing → no flicker.
 * Handles length differences (next longer/shorter than prev).
 */
export function diffFrames(prev: string[], next: string[]): string {
  const maxLen = Math.max(prev.length, next.length);
  let out = "";

  for (let i = 0; i < maxLen; i++) {
    const prevRow = prev[i] ?? "";
    const nextRow = next[i] ?? "";

    if (prevRow !== nextRow) {
      out += cursorTo(i + 1, 1) + ERASE_EOL + nextRow;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Screen class — alt-screen lifecycle + incremental render
// ---------------------------------------------------------------------------

export class Screen {
  private readonly out: NodeJS.WritableStream;
  private prevFrame: string[] = [];

  constructor(out: NodeJS.WritableStream = process.stdout) {
    this.out = out;
  }

  /**
   * Write the alt-screen enter sequence + clear, reset internal prev frame.
   */
  enter(): void {
    this.prevFrame = [];
    this.out.write(ENTER_ALT_SCREEN + CLEAR_SCREEN);
  }

  /**
   * Compute the diff from the previous frame to `rows`, write it, and store
   * `rows` as the new previous frame.
   */
  render(rows: string[]): void {
    const diff = diffFrames(this.prevFrame, rows);
    if (diff.length > 0) {
      this.out.write(diff);
    }
    this.prevFrame = rows.slice();
  }

  /**
   * Show cursor + leave the alternate screen.
   */
  exit(): void {
    this.out.write(EXIT_ALT_SCREEN);
  }
}
