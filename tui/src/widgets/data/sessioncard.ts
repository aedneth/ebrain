/**
 * SessionCard — TUI mirror of design-system/components/data/SessionCard.{d.ts,prompt.md,jsx}.
 *
 * One agentic-session row: badge (composed from core/badge) + name + dim uptime +
 * semantically-colored state, with optional dim detail appended. Selected → ▸ marker
 * + theme.selectedBg. Returns a single row so it composes as a ScrollList renderItem.
 *
 * State colors: running→ok, waiting→warn, idle→muted, error→error, done→secondary.
 */
import type { Theme, AgentName, ColorRole } from "../../theme.js";
import { badge } from "../core/badge.js";

export type SessionState = "running" | "waiting" | "idle" | "error" | "done";

export interface SessionCardProps {
  agent: AgentName;
  /** e.g. "ebr-claude-korvex". */
  name: string;
  /** e.g. "02:41". */
  uptime?: string;
  state?: SessionState;
  /** Optional dim detail (model, last action). */
  detail?: string;
  selected?: boolean;
}

const STATE_ROLE: Record<SessionState, ColorRole> = {
  running: "semantic.ok",
  waiting: "semantic.warn",
  idle: "text.muted",
  error: "semantic.error",
  done: "text.secondary",
};

export function sessioncard(props: SessionCardProps, theme: Theme): string {
  const { agent, name, uptime, state = "running", detail, selected = false } = props;
  const reset = theme.reset;
  const arrow = theme.glyph("arrows").split(" ")[3]; // ▸ / >

  const marker = selected ? theme.fg("accent.teal") + arrow + reset + " " : "  ";
  const badgeStr = badge({ agent }, theme);
  const nameStr = (selected ? theme.fg("text.primary") : theme.fg("text.secondary")) + name + reset;
  const role = STATE_ROLE[state] ?? "semantic.ok"; // ignore invalid enum → running color
  const stateStr = theme.fg(role) + state + reset;

  let row = marker + badgeStr + " " + nameStr;
  if (uptime != null) row += "  " + theme.fg("text.muted") + uptime + reset;
  row += "  " + stateStr;
  if (detail != null) row += "  " + theme.fg("text.muted") + detail + reset;

  return selected ? theme.selectedBg + row + reset : row;
}
