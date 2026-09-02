/**
 * tui/src/theme.ts — GENERATED FILE. DO NOT EDIT — regenerate via `bun run scripts/design-sync-tui`.
 *
 * Source of truth: design-system/tokens/ebrain.tokens.json (SPRINT-TUI 6.2.2).
 * Bridges the ebrain color / glyph / spacing / state tokens to the ANSI escape strings
 * consumed by the kit's drawing primitives (tui/src/kit/draw.ts), whose primitives accept
 * an optional `color?: string` that is a raw ANSI escape sequence.
 */

// ---------------------------------------------------------------------------
// Raw token data (hex + xterm-256 fallback per role)
// ---------------------------------------------------------------------------

/** Hex + xterm-256 pair for a single token color. */
export interface TokenColor {
  readonly hex: string;
  readonly xterm256: number;
}

export const colors = {
  background: {
    void: { hex: "#0B0E14", xterm256: 233 },
    surface: { hex: "#11151F", xterm256: 234 },
    raised: { hex: "#1A2030", xterm256: 235 },
    border: { hex: "#232B3D", xterm256: 236 },
  },
  text: {
    primary: { hex: "#E6EAF2", xterm256: 254 },
    secondary: { hex: "#8B94A7", xterm256: 246 },
    muted: { hex: "#565F73", xterm256: 60 },
  },
  accent: {
    teal: { hex: "#2DD4BF", xterm256: 43 },
    tealDim: { hex: "#1B7F73", xterm256: 30 },
  },
  memory: {
    violet: { hex: "#A78BFA", xterm256: 141 },
  },
  semantic: {
    ok: { hex: "#4ADE80", xterm256: 78 },
    warn: { hex: "#FBBF24", xterm256: 214 },
    error: { hex: "#F87171", xterm256: 210 },
    info: { hex: "#60A5FA", xterm256: 75 },
  },
  agents: {
    claude: { hex: "#D97757", xterm256: 173 },
    codex: { hex: "#9AA5B8", xterm256: 248 },
    gemini: { hex: "#5B8DEF", xterm256: 69 },
    opencode: { hex: "#E5B567", xterm256: 179 },
    cursor: { hex: "#C678DD", xterm256: 176 },
    route: { hex: "#FF6B6B", xterm256: 203 },
    generic: { hex: "#A3E635", xterm256: 155 },
    free: { hex: "#67E8F9", xterm256: 123 },
  },
} as const;

export type AgentName = keyof typeof colors.agents;

// ---------------------------------------------------------------------------
// Glyphs (unicode + pure-ASCII fallback)
// ---------------------------------------------------------------------------

/** A glyph group: unicode chars plus its pure-ASCII fallback. */
export interface GlyphDef {
  readonly chars: string;
  readonly asciiFallback: string;
}

export const glyphs = {
  panelBorder: { chars: "╭ ─ ╮ │ ╰ ╯", asciiFallback: "+ - + | + +" },
  dialogBorder: { chars: "┌ ─ ┐ │ └ ┘", asciiFallback: "+ - + | + +" },
  heavyLeft: { chars: "┃", asciiFallback: "|" },
  gauge: { chars: "█ ▓ ░", asciiFallback: "# = ." },
  blocks: { chars: "█ ▀ ▄ ▓ ▒ ░", asciiFallback: "# \" _ = : ." },
  scrollbar: { chars: "█ (thumb) │ (track)", asciiFallback: "# |" },
  spinner: { chars: "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏", asciiFallback: "|/-\\\\" },
  separators: { chars: "· │ ─", asciiFallback: ". | -" },
  badgeDot: { chars: "●", asciiFallback: "*" },
  caret: { chars: "▌", asciiFallback: "_" },
  arrows: { chars: "→ ↑ ↓ ▸ ▾", asciiFallback: "> ^ v > v" },
} as const;

export type GlyphGroup = keyof typeof glyphs;

// ---------------------------------------------------------------------------
// Spacing scale (character cells)
// ---------------------------------------------------------------------------

export const spacing = {
  scale: [1,2,4] as readonly number[],
} as const;

// ---------------------------------------------------------------------------
// States (mirrors tokens `states` block: focus/blur/selected/disabled)
// ---------------------------------------------------------------------------

const STATE_HEX = {
  focusBorder: "#2DD4BF",
  // Blur (non-focused) panel border. The mockup's --border (#232B3D) is invisible on a
  // terminal's dark native background, so unfocused boxes had no discernible contour;
  // bumped to text.muted so every box is clearly outlined (focused = teal, blur = muted).
  blurBorder: "#565F73",
  selectedBg: "#1A2030",
  disabledText: "#565F73",
} as const;

// ---------------------------------------------------------------------------
// Theme factory
// ---------------------------------------------------------------------------

/** ANSI reset. */
export const RESET = "\x1b[0m";

/** Dotted color-role path (e.g. "accent.teal", "text.primary") or a raw "#rrggbb" hex. */
export type ColorRole =
  | "background.void"
  | "background.surface"
  | "background.raised"
  | "background.border"
  | "text.primary"
  | "text.secondary"
  | "text.muted"
  | "accent.teal"
  | "accent.tealDim"
  | "memory.violet"
  | "semantic.ok"
  | "semantic.warn"
  | "semantic.error"
  | "semantic.info"
  | "agents.claude"
  | "agents.codex"
  | "agents.gemini"
  | "agents.opencode"
  | "agents.cursor"
  | "agents.route"
  | "agents.generic"
  | "agents.free"
  | (string & {});

export interface ThemeOptions {
  /** Force truecolor (24-bit) escapes. Default: auto-detect (see detectTrueColor below). */
  trueColor?: boolean;
  /** Force ASCII-only glyph fallbacks. Default: auto-detect (see detectAscii below). */
  ascii?: boolean;
}

export interface Theme {
  readonly trueColor: boolean;
  readonly ascii: boolean;
  /** ANSI reset (same value as the exported RESET constant). */
  readonly reset: string;
  /** Foreground ANSI escape for a color role or raw "#rrggbb" hex. */
  fg(role: ColorRole): string;
  /** Background ANSI escape for a color role or raw "#rrggbb" hex. */
  bg(role: ColorRole): string;
  /** Foreground ANSI escape for one of the 8 agent colors. */
  agent(name: AgentName): string;
  /** Unicode chars, or ASCII fallback when theme.ascii is true, for a glyph group. */
  glyph(group: GlyphGroup): string;
  readonly focusBorder: string;
  readonly blurBorder: string;
  readonly selectedBg: string;
  readonly disabledText: string;
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Approximate an arbitrary hex color to an xterm-256 index (6x6x6 color cube + grayscale
 * ramp). Only used for raw #rrggbb roles that are NOT one of the named tokens above —
 * token-defined roles always use their curated `xterm256` value instead of this estimate.
 */
function hexToXterm256(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  const idx = (v: number) => Math.round((v / 255) * 5);
  return 16 + 36 * idx(r) + 6 * idx(g) + idx(b);
}

function resolveColor(role: string): TokenColor {
  if (role.startsWith("#")) return { hex: role, xterm256: hexToXterm256(role) };
  const parts = role.split(".");
  let node: unknown = colors;
  for (const p of parts) node = (node as Record<string, unknown> | undefined)?.[p];
  const c = node as Partial<TokenColor> | undefined;
  if (!c || typeof c.hex !== "string" || typeof c.xterm256 !== "number") {
    throw new Error(`ebrain/tui theme: unknown color role "${role}"`);
  }
  return c as TokenColor;
}

function ansiFg(c: TokenColor, trueColor: boolean): string {
  if (trueColor) {
    const [r, g, b] = hexToRgb(c.hex);
    return `\x1b[38;2;${r};${g};${b}m`;
  }
  return `\x1b[38;5;${c.xterm256}m`;
}

function ansiBg(c: TokenColor, trueColor: boolean): string {
  if (trueColor) {
    const [r, g, b] = hexToRgb(c.hex);
    return `\x1b[48;2;${r};${g};${b}m`;
  }
  return `\x1b[48;5;${c.xterm256}m`;
}

/**
 * Auto-detected truecolor default. Explicit EBRAIN_TUI_TRUECOLOR wins ("1" forces on, "0"
 * forces off); otherwise infer from COLORTERM containing "truecolor" or "24bit".
 */
function detectTrueColor(): boolean {
  return (
    process.env.EBRAIN_TUI_TRUECOLOR === "1" ||
    (process.env.EBRAIN_TUI_TRUECOLOR !== "0" && /truecolor|24bit/.test(process.env.COLORTERM ?? ""))
  );
}

/**
 * Auto-detected ASCII default. Explicit EBRAIN_TUI_ASCII="1" forces ASCII glyphs on;
 * otherwise infer from a non-UTF-8 LANG/LC_ALL (ascii=true when the locale isn't utf-8).
 * Note: unlike detectTrueColor, there is no "=== \"0\"" override here by design (spec
 * SPRINT-TUI 6.2.2) — a non-UTF-8 locale always forces ASCII regardless of the env var.
 */
function detectAscii(): boolean {
  return (
    process.env.EBRAIN_TUI_ASCII === "1" ||
    !/utf-?8/i.test(process.env.LANG ?? process.env.LC_ALL ?? "")
  );
}

/** Build a Theme bound to truecolor/ascii mode (auto-detected from env unless overridden). */
export function makeTheme(opts: ThemeOptions = {}): Theme {
  const trueColor = opts.trueColor ?? detectTrueColor();
  const ascii = opts.ascii ?? detectAscii();

  const fg = (role: ColorRole): string => ansiFg(resolveColor(role), trueColor);
  const bg = (role: ColorRole): string => ansiBg(resolveColor(role), trueColor);

  return {
    trueColor,
    ascii,
    reset: RESET,
    fg,
    bg,
    agent: (name: AgentName): string => fg(`agents.${name}`),
    glyph: (group: GlyphGroup): string => (ascii ? glyphs[group].asciiFallback : glyphs[group].chars),
    focusBorder: fg(STATE_HEX.focusBorder),
    blurBorder: fg(STATE_HEX.blurBorder),
    selectedBg: bg(STATE_HEX.selectedBg),
    disabledText: fg(STATE_HEX.disabledText),
  };
}
