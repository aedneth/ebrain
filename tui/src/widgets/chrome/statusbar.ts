/**
 * tui/src/widgets/chrome/statusbar.ts — StatusBar + StatusSep, ported 1:1 from
 * design-system/components/chrome/StatusBar.{d.ts,jsx,prompt.md} (SPRINT-TUI 6.3.2).
 *
 * Top bar on background.surface: identity (`left`) left-justified, telemetry
 * (`right`) right-justified. Both are PRE-COMPOSED strings (contract), so this
 * widget only positions + backgrounds them — exactly like the jsx, where the bar
 * owns the surface bg and children own only their fg colors.
 *
 * `width` is the terminal column count (a render dimension), passed as the third
 * argument so `props` stays 1:1 with StatusBarProps (left, right) per the .d.ts.
 */
import type { Theme } from "../../theme.js";
import { displayWidth, truncate, padTo } from "../../kit/draw.js";

export interface StatusBarProps {
  /** Identity segment, pre-composed (e.g. compact wordmark). */
  left?: string;
  /** Telemetry segment, pre-composed (e.g. `brain UP · $2.1/$10`). */
  right?: string;
}

/**
 * Item separator: a dim middle-dot ` · `. Uses `\x1b[39m` (default-fg) rather
 * than a full reset so it composes inside the surface-bg bar without clearing it.
 */
export function statusSep(theme: Theme): string {
  const dot = theme.glyph("separators").split(" ")[0] ?? "·";
  return theme.fg("text.muted") + " " + dot + " " + "\x1b[39m";
}

/** Render the status bar as a single terminal row of exactly `width` cells. */
export function statusBar(props: StatusBarProps, theme: Theme, width: number): string {
  const left = props.left ?? "";
  const right = props.right ?? "";
  const reset = theme.reset;
  if (width <= 0) return "";

  // jsx padding '0 1ch' -> one cell each side; content lives in the inner span.
  const inner = Math.max(0, width - 2);
  const lw = displayWidth(left);
  const rw = displayWidth(right);

  let body: string;
  if (lw + rw <= inner) {
    body = left + " ".repeat(inner - lw - rw) + right;
  } else if (rw >= inner) {
    // Telemetry alone overflows: keep the tail of it, drop identity.
    body = padTo(truncate(right, inner), inner, "right");
  } else {
    // Truncate identity to whatever space the telemetry leaves.
    const leftRoom = inner - rw;
    body = padTo(truncate(left, leftRoom), leftRoom) + right;
  }

  return theme.bg("background.surface") + " " + body + " " + reset;
}
