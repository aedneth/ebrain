/**
 * tui/src/widgets/layout/terminalpeek.ts — TerminalPeek, ported 1:1 from
 * design-system/components/layout/TerminalPeek.{d.ts,jsx,prompt.md} (SPRINT-TUI 6.3.2).
 *
 * Frame for peeking at ANOTHER session's output (a tmux pane). Per the .jsx it is
 * a Panel with the border FORCED dim (borderColor "background.border" / --border-1)
 * and content in text.secondary — it NEVER receives teal/focus, because it is
 * foreign session output. `live` appends a dim ` · live` indicator to the title.
 * Corners are rounded (the .jsx renders a Panel WITHOUT dialog).
 */
import type { Theme } from "../../theme.js";
import { panel } from "./panel.js";

export interface TerminalPeekProps {
  /** e.g. "peek · ebr-claude-korvex" */
  title: string;
  /** Appends " · live" to the title. */
  live?: boolean;
  height: number;
  width: number;
  /** Output lines (pre text). */
  body: string[];
}

/** Render the terminal-peek frame as exactly `height` rows of exact width `width`. */
export function terminalPeek(props: TerminalPeekProps, theme: Theme): string[] {
  const { title, live = false, height, width, body } = props;
  const reset = theme.reset;

  const dot = theme.glyph("separators").split(" ")[0] ?? "·";
  const fullTitle = live ? `${title} ${dot} live` : title;

  // Content is foreign output: always text.secondary, never teal.
  const coloredBody = body.map((line) => theme.fg("text.secondary") + line + reset);

  return panel(
    {
      title: fullTitle,
      focus: false,
      dialog: false, // rounded corners, like a panel but dim
      borderColor: "background.border", // ALWAYS dim — never focusBorder/teal
      titleColor: live ? "text.secondary" : "text.muted",
      width,
      height,
      body: coloredBody,
    },
    theme,
  );
}
