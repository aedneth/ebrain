/**
 * Badge — TUI mirror of design-system/components/core/Badge.{d.ts,prompt.md,jsx}.
 *
 * Agent dot (`●` + name) or semantic-tone badge, rendered to a single terminal
 * row. Color comes exclusively from the injected theme (zero hardcoded hex).
 * Props + enums are 1:1 with Badge.d.ts / _adherence.oxlintrc.json.
 */
import type { Theme, AgentName, ColorRole } from "../../theme.js";

/** Semantic tone (used only when no `agent` is given). Mirrors Badge.d.ts. */
export type BadgeTone = "ok" | "warn" | "error" | "info" | "memory" | "accent";

export interface BadgeProps {
  /** Categorical agent color. */
  agent?: AgentName;
  /** Semantic tone (if no agent). */
  tone?: BadgeTone;
  /** Text; defaults to the agent/tone name. */
  label?: string;
  /** Inverted block (color background, void text) for maximum emphasis. */
  solid?: boolean;
  disabled?: boolean;
}

const AGENTS: readonly AgentName[] = [
  "claude", "codex", "gemini", "opencode", "cursor", "route", "generic", "free",
];

const TONE_ROLE: Record<BadgeTone, ColorRole> = {
  ok: "semantic.ok",
  warn: "semantic.warn",
  error: "semantic.error",
  info: "semantic.info",
  memory: "memory.violet",
  accent: "accent.teal",
};

/** ANSI bold attribute (width-neutral SGR; mirrors jsx fontWeight:700 on solid). */
const BOLD = "\x1b[1m";

export function badge(props: BadgeProps, theme: Theme): string {
  const { agent, tone, label, solid = false, disabled = false } = props;
  const reset = theme.reset;
  const dot = theme.glyph("badgeDot"); // ● / *

  // Ignore invalid enum values (sane fallback, no throw).
  const validAgent = agent && AGENTS.includes(agent) ? agent : undefined;
  const validTone = tone && tone in TONE_ROLE ? tone : undefined;
  const text = label != null ? label : (validAgent ?? validTone ?? "");

  // Resolve a color role so both fg and bg escapes are available.
  let role: ColorRole;
  if (disabled) role = "text.muted";               // disabledText color (== text.muted)
  else if (validAgent) role = `agents.${validAgent}`;
  else if (validTone) role = TONE_ROLE[validTone];
  else role = "text.secondary";                    // default (jsx var(--text-2))

  if (solid) {
    const bg = theme.bg(role);
    const fgVoid = theme.fg("background.void");
    return bg + fgVoid + BOLD + " " + text + " " + reset;
  }

  const fg = disabled ? theme.disabledText : theme.fg(role);
  return fg + dot + " " + text + reset;
}
