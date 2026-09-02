/**
 * Vendored from FlowClock (~/flowclock-cli/src/lib/tui/draw.ts), FlowClock v3.9.0.
 * Vendored into ebrain; diverges as ebrain's own kit — do not edit upstream, do not re-sync automatically.
 */

/**
 * Pure drawing primitives — every function returns a string or string[].
 * All are ANSI-aware: display-width calculations strip escape sequences so
 * that colored text pads/truncates correctly.
 */

// ---------------------------------------------------------------------------
// ANSI-aware display width
// ---------------------------------------------------------------------------

/** Strip ANSI escape sequences (CSI + OSC) before measuring string width. */
export function stripAnsi(s: string): string {
  // Match ESC [ ... m (SGR), ESC [ ... H/A/B/etc (CSI), ESC ] ... BEL/ST (OSC)
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g, "");
}

/**
 * Compute the visible display width of a string, ignoring ANSI escape
 * sequences. Box-drawing chars (U+2500–U+257F) and block chars like `█`
 * count as width 1 (they are single-width in most terminal fonts).
 */
export function displayWidth(s: string): number {
  return [...stripAnsi(s)].length;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Truncate `s` to at most `width` visible characters. ANSI-aware: we iterate
 * over the visible characters and cut there, then reset any open color with
 * \x1b[0m if the string contained ANSI codes.
 *
 * Simple strategy: strip-and-count the visible chars, then rebuild by walking
 * raw string and skipping escape sequences.
 */
export function truncate(s: string, width: number): string {
  if (width <= 0) return "";
  const visible = displayWidth(s);
  if (visible <= width) return s;

  // Walk the raw string, counting visible chars and collecting everything
  // (including escapes) until we've consumed `width` visible chars.
  // eslint-disable-next-line no-control-regex
  const escRe = /\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g;

  let result = "";
  let visCount = 0;
  let pos = 0;
  let hadAnsi = false;

  while (pos < s.length && visCount < width) {
    escRe.lastIndex = pos;
    const m = escRe.exec(s);

    if (m && m.index === pos) {
      // This position is the start of an escape sequence — include it verbatim.
      result += m[0];
      pos += m[0].length;
      hadAnsi = true;
    } else {
      // Regular character (possibly multi-byte — use codepoint iteration).
      const cp = s.codePointAt(pos)!;
      const ch = String.fromCodePoint(cp);
      result += ch;
      pos += ch.length;
      visCount++;
    }
  }

  if (hadAnsi) result += "\x1b[0m";
  return result;
}

/**
 * Pad (or truncate) `s` to exactly `width` visible characters.
 * Alignment: "left" (default) pads on the right; "right" pads on the left;
 * "center" splits padding evenly (extra space goes to the right).
 */
export function padTo(
  s: string,
  width: number,
  align: "left" | "right" | "center" = "left",
): string {
  const cur = displayWidth(s);
  if (cur > width) return truncate(s, width);
  const pad = width - cur;
  if (pad === 0) return s;

  switch (align) {
    case "right":
      return " ".repeat(pad) + s;
    case "center": {
      const left = Math.floor(pad / 2);
      const right = pad - left;
      return " ".repeat(left) + s + " ".repeat(right);
    }
    default: // "left"
      return s + " ".repeat(pad);
  }
}

/**
 * Truncate `s` to at most `width` visible characters, ending in `…` when anything was cut.
 * Dense dashboard rows still use `truncate` for cells that are padded to an exact width; this is
 * for prose and identifiers a reader would otherwise see stop mid-word and take for a rendering
 * bug. The ellipsis counts toward `width`. At width 1 the ellipsis alone is returned.
 */
export function ellipsize(s: string, width: number, ellipsis = "…"): string {
  if (width <= 0) return "";
  if (displayWidth(s) <= width) return s;
  const mark = displayWidth(ellipsis) <= width ? ellipsis : "";
  const head = truncate(s, width - displayWidth(mark));
  return head + mark;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface PanelOpts {
  title?: string;
  width: number;
  height: number;
  body: string[];
  /** Optional ANSI color sequence to wrap border/title characters. */
  color?: string;
}

/**
 * Render a bordered box using box-drawing characters.
 * Returns exactly `height` rows each of display width `width`.
 *
 * Layout:
 *   ┌──── title ────┐   ← row 0
 *   │ body line     │   ← rows 1 .. height-2
 *   └───────────────┘   ← row height-1
 *
 * Body lines are truncated/padded to inner width (width - 2 for borders).
 * If height < 2, returns that many blank-ish rows of correct width.
 */
export function panel(opts: PanelOpts): string[] {
  const { title, width, height, body, color } = opts;
  const RESET = "\x1b[0m";
  const c = (s: string) => (color ? `${color}${s}${RESET}` : s);

  if (width < 2 || height < 1) {
    return Array.from({ length: height }, () => " ".repeat(Math.max(0, width)));
  }

  const innerW = width - 2; // space between the two vertical border chars
  const rows: string[] = [];

  // Top border
  if (title && title.length > 0) {
    // ┌── title ──┐  (title padded by one space each side)
    const titleSlot = innerW;
    const titleText = ` ${title} `;
    const titleVis = displayWidth(titleText);

    if (titleVis >= titleSlot) {
      // Title too wide: truncate it
      const t = truncate(titleText, titleSlot);
      const dashCount = titleSlot - displayWidth(t);
      rows.push(c("┌") + c(t) + c("─".repeat(dashCount)) + c("┐"));
    } else {
      const dashEach = (titleSlot - titleVis) / 2;
      const leftDash = Math.floor(dashEach);
      const rightDash = titleSlot - titleVis - leftDash;
      rows.push(
        c("┌") +
          c("─".repeat(leftDash)) +
          c(titleText) +
          c("─".repeat(rightDash)) +
          c("┐"),
      );
    }
  } else {
    rows.push(c("┌") + c("─".repeat(innerW)) + c("┐"));
  }

  // Body rows: height - 2 (subtract top + bottom border)
  const bodyRows = Math.max(0, height - 2);
  for (let i = 0; i < bodyRows; i++) {
    const line = body[i] ?? "";
    rows.push(c("│") + padTo(truncate(line, innerW), innerW) + c("│"));
  }

  // Bottom border (only if height >= 2)
  if (height >= 2) {
    rows.push(c("└") + c("─".repeat(innerW)) + c("┘"));
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Horizontal bar
// ---------------------------------------------------------------------------

export interface BarHOpts {
  /** Character for filled portion (default `█`). */
  filled?: string;
  /** Character for empty portion (default `░`). */
  empty?: string;
}

/**
 * Render a horizontal bar of total `width` cells.
 * `value / max` determines the filled fraction.
 * Clamps to [0, max]. Returns a string of exactly `width` display-width chars.
 */
export function barH(
  value: number,
  max: number,
  width: number,
  opts: BarHOpts = {},
): string {
  const filled = opts.filled ?? "█";
  const empty = opts.empty ?? "░";
  if (width <= 0) return "";
  const clamped = Math.max(0, Math.min(value, max));
  const ratio = max <= 0 ? 0 : clamped / max;
  const filledCount = Math.round(ratio * width);
  const emptyCount = width - filledCount;
  return filled.repeat(filledCount) + empty.repeat(emptyCount);
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/**
 * Map an array of numbers to a sparkline string using `▁▂▃▄▅▆▇█`.
 * Maps by relative magnitude within the array. All-same or single-value
 * arrays render as `▄` (mid-point). Empty array returns `""`.
 */
export function sparkline(values: number[]): string {
  if (values.length === 0) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);

  return values
    .map((v) => {
      if (max === min) return SPARK_CHARS[3]; // all same → mid
      const idx = Math.round(((v - min) / (max - min)) * (SPARK_CHARS.length - 1));
      return SPARK_CHARS[idx] ?? SPARK_CHARS[SPARK_CHARS.length - 1];
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Key/value row
// ---------------------------------------------------------------------------

/**
 * Render a key/value pair: key left-aligned, value right-aligned, total
 * padded to `width`. If key + " " + value > width, the key is truncated.
 */
export function kv(key: string, value: string, width: number): string {
  if (width <= 0) return "";
  const valW = displayWidth(value);
  const keyW = width - valW - 1; // 1 space separator minimum
  if (keyW < 1) {
    // No room for the key; return just the value (right-side)
    return padTo(value, width, "right");
  }
  const keyPart = padTo(key, keyW);
  return keyPart + " " + value;
}

// ---------------------------------------------------------------------------
// Gauge (0–100 %)
// ---------------------------------------------------------------------------

/**
 * Render a percentage gauge of total `width` cells.
 * Format: `[████░░░ 42%]` inside `width` chars.
 * The bar itself shrinks to fit the percentage label.
 */
export function gauge(pct: number, width: number): string {
  if (width <= 0) return "";
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const label = ` ${String(clamped)}%`;
  // width = 2 (brackets) + barWidth + labelWidth
  const barWidth = Math.max(0, width - 2 - displayWidth(label));
  const bar = barH(clamped, 100, barWidth);
  return "[" + bar + label + "]";
}
