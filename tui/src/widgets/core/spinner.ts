/**
 * Spinner — TUI mirror of design-system/components/core/Spinner.{d.ts,prompt.md,jsx}.
 *
 * Single-row braille spinner (⠋⠙⠹… / ascii |/-\). PURE: `frame` selects the char,
 * the app advances it. When `!active` the spinner freezes at `·` per Spinner.d.ts
 * ("false congela el spinner en ·") and Spinner.jsx. Default color accent.teal.
 */
import type { Theme, ColorRole } from "../../theme.js";
import { glyphs } from "../../theme.js";

export interface SpinnerProps {
  /** Dim text to the right, e.g. "re-ejecutando doctor...". */
  label?: string;
  /** false freezes the spinner at `·`. */
  active?: boolean;
  /** Force ASCII frames |/-\ regardless of theme mode. */
  ascii?: boolean;
  /** Color role (default accent.teal). */
  color?: ColorRole;
  /** Frame index (the app advances it). */
  frame?: number;
}

export function spinner(props: SpinnerProps, theme: Theme): string {
  const { label, active = true, ascii = false, color = "accent.teal", frame = 0 } = props;
  const reset = theme.reset;

  // `ascii` prop forces ASCII frames even when the theme is unicode (jsx parity);
  // otherwise theme.glyph respects the theme's own ascii mode.
  const frameStr = ascii ? glyphs.spinner.asciiFallback : theme.glyph("spinner");
  const frames = [...frameStr];

  const colorEsc = theme.fg(color);
  let char: string;
  if (active && frames.length > 0) {
    const idx = ((frame % frames.length) + frames.length) % frames.length;
    char = frames[idx] ?? "";
  } else {
    char = theme.glyph("separators").split(" ")[0]; // · / .
  }

  let out = colorEsc + char + reset;
  if (label != null) out += " " + theme.fg("text.secondary") + label + reset;
  return out;
}
