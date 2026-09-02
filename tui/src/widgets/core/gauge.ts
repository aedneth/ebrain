/**
 * Gauge — TUI mirror of design-system/components/core/Gauge.{d.ts,prompt.md,jsx}.
 *
 * Horizontal character gauge (█▓░ / ascii #=.) for RAM, spend and routing caps.
 * `width` is the BAR width in cells (per Gauge.d.ts: "Ancho de la barra en celdas");
 * `label` and `suffix` are laid out around it. All color via the injected theme.
 */
import type { Theme, ColorRole } from "../../theme.js";

export type GaugeTone =
  | "auto" | "ok" | "warn" | "error" | "info" | "accent" | "memory" | "text-2";

export interface GaugeProps {
  value?: number;
  max?: number;
  /** Bar width in cells. */
  width?: number;
  /** Left-side text (dim). */
  label?: string;
  /** Right-side text, e.g. "$2.1/$10". */
  suffix?: string;
  /** 'auto' colors by threshold (>=75% warn, >=90% error); or a token. */
  tone?: GaugeTone;
}

const TONE_ROLE: Record<Exclude<GaugeTone, "auto">, ColorRole> = {
  ok: "semantic.ok",
  warn: "semantic.warn",
  error: "semantic.error",
  info: "semantic.info",
  accent: "accent.teal",
  memory: "memory.violet",
  "text-2": "text.secondary",
};

export function gauge(props: GaugeProps, theme: Theme): string {
  const { value = 0, max = 1, width = 20, label, suffix, tone = "auto" } = props;
  const reset = theme.reset;
  const [full, part, empty] = theme.glyph("gauge").split(" "); // █ ▓ ░ / # = .

  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const exact = ratio * width;
  const fullN = Math.floor(exact);
  const partN = exact - fullN >= 0.5 && fullN < width ? 1 : 0;
  const emptyN = Math.max(0, width - fullN - partN);
  const bar = full.repeat(fullN) + part.repeat(partN) + empty.repeat(emptyN);

  let role: ColorRole;
  if (tone === "auto") {
    role = ratio >= 0.9 ? "semantic.error" : ratio >= 0.75 ? "semantic.warn" : "text.secondary";
  } else {
    role = TONE_ROLE[tone] ?? "text.secondary"; // ignore invalid enum → neutral
  }
  const barColor = theme.fg(role);
  const dim = theme.fg("text.secondary");

  let out = "";
  if (label != null) out += dim + label + " " + reset;
  out += barColor + bar + reset;
  if (suffix != null) out += dim + " " + suffix + reset;
  return out;
}
