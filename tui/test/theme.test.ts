/**
 * Tests de tui/src/theme.ts — theme generado desde design-system/tokens/ebrain.tokens.json
 * (SPRINT-TUI 6.2.3). Standalone: no depende de tui/package.json ni tui/tsconfig.json.
 *
 * `bun test tui/test/theme.test.ts`
 */
import { readFileSync } from "fs";
import { join } from "path";
import { test, expect, describe } from "bun:test";
import {
  colors,
  glyphs,
  spacing,
  RESET,
  makeTheme,
  type AgentName,
  type GlyphGroup,
} from "../src/theme.ts";

const THEME_SRC_PATH = join(import.meta.dir, "..", "src", "theme.ts");
const THEME_SRC = readFileSync(THEME_SRC_PATH, "utf8");

const AGENT_NAMES: AgentName[] = [
  "claude", "codex", "gemini", "opencode", "cursor", "route", "generic", "free",
];
const GLYPH_GROUPS: GlyphGroup[] = [
  "panelBorder", "dialogBorder", "heavyLeft", "gauge", "blocks",
  "scrollbar", "spinner", "separators", "badgeDot", "caret", "arrows",
];

// ---------------------------------------------------------------------------
// Semantic roles + agents: all defined, all produce a non-empty escape
// ---------------------------------------------------------------------------

describe("semantic roles", () => {
  const theme = makeTheme({ trueColor: true, ascii: false });

  const backgroundRoles = ["background.void", "background.surface", "background.raised", "background.border"] as const;
  const textRoles = ["text.primary", "text.secondary", "text.muted"] as const;
  const accentRoles = ["accent.teal", "accent.tealDim"] as const;
  const memoryRoles = ["memory.violet"] as const;
  const semanticRoles = ["semantic.ok", "semantic.warn", "semantic.error", "semantic.info"] as const;

  test("background x4 defined with non-empty fg/bg escapes", () => {
    expect(backgroundRoles.length).toBe(4);
    for (const role of backgroundRoles) {
      expect(theme.fg(role).length).toBeGreaterThan(0);
      expect(theme.bg(role).length).toBeGreaterThan(0);
    }
  });

  test("text x3 defined with non-empty fg/bg escapes", () => {
    expect(textRoles.length).toBe(3);
    for (const role of textRoles) {
      expect(theme.fg(role).length).toBeGreaterThan(0);
      expect(theme.bg(role).length).toBeGreaterThan(0);
    }
  });

  test("accent x2 defined with non-empty fg/bg escapes", () => {
    expect(accentRoles.length).toBe(2);
    for (const role of accentRoles) {
      expect(theme.fg(role).length).toBeGreaterThan(0);
      expect(theme.bg(role).length).toBeGreaterThan(0);
    }
  });

  test("memory (violet) defined with non-empty fg/bg escape", () => {
    expect(memoryRoles.length).toBe(1);
    for (const role of memoryRoles) {
      expect(theme.fg(role).length).toBeGreaterThan(0);
      expect(theme.bg(role).length).toBeGreaterThan(0);
    }
  });

  test("semantic x4 (ok/warn/error/info) defined with non-empty fg/bg escapes", () => {
    expect(semanticRoles.length).toBe(4);
    for (const role of semanticRoles) {
      expect(theme.fg(role).length).toBeGreaterThan(0);
      expect(theme.bg(role).length).toBeGreaterThan(0);
    }
  });

  test("all 8 agents defined with non-empty fg escape via theme.agent()", () => {
    expect(AGENT_NAMES.length).toBe(8);
    expect(new Set(AGENT_NAMES).size).toBe(8); // 8 distinct names
    for (const name of AGENT_NAMES) {
      const esc = theme.agent(name);
      expect(esc.length).toBeGreaterThan(0);
      expect(esc.startsWith("\x1b[")).toBe(true);
    }
  });

  test("raw colors table has hex+xterm256 for every role above (source data, not just escapes)", () => {
    for (const role of backgroundRoles) {
      const [, key] = role.split(".");
      const c = (colors.background as Record<string, { hex: string; xterm256: number }>)[key];
      expect(typeof c.hex).toBe("string");
      expect(typeof c.xterm256).toBe("number");
    }
    for (const name of AGENT_NAMES) {
      const c = colors.agents[name];
      expect(typeof c.hex).toBe("string");
      expect(typeof c.xterm256).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// Truecolor / 256-fallback escape shape
// ---------------------------------------------------------------------------

describe("ANSI escape shape", () => {
  test("truecolor fg/bg for accent.teal are well-formed 24-bit escapes", () => {
    const theme = makeTheme({ trueColor: true });
    const fg = theme.fg("accent.teal");
    const bg = theme.bg("accent.teal");
    expect(fg).toMatch(/^\x1b\[38;2;\d{1,3};\d{1,3};\d{1,3}m$/);
    expect(bg).toMatch(/^\x1b\[48;2;\d{1,3};\d{1,3};\d{1,3}m$/);
    // #2DD4BF -> 45,212,191
    expect(fg).toBe("\x1b[38;2;45;212;191m");
    expect(bg).toBe("\x1b[48;2;45;212;191m");
  });

  test("256-fallback fg/bg for accent.teal are well-formed xterm-256 escapes", () => {
    const theme = makeTheme({ trueColor: false });
    const fg = theme.fg("accent.teal");
    const bg = theme.bg("accent.teal");
    expect(fg).toMatch(/^\x1b\[38;5;\d{1,3}m$/);
    expect(bg).toMatch(/^\x1b\[48;5;\d{1,3}m$/);
    expect(fg).toBe(`\x1b[38;5;${colors.accent.teal.xterm256}m`);
    expect(bg).toBe(`\x1b[48;5;${colors.accent.teal.xterm256}m`);
  });

  test("raw #rrggbb hex role works for both truecolor and 256 modes", () => {
    const t256 = makeTheme({ trueColor: false });
    const tTrue = makeTheme({ trueColor: true });
    expect(tTrue.fg("#2DD4BF")).toBe("\x1b[38;2;45;212;191m");
    expect(t256.fg("#2DD4BF")).toMatch(/^\x1b\[38;5;\d{1,3}m$/);
  });

  test("reset constant is the SGR reset sequence, and Theme.reset matches it", () => {
    expect(RESET).toBe("\x1b[0m");
    expect(makeTheme().reset).toBe(RESET);
  });

  test("unknown dotted color role throws", () => {
    const theme = makeTheme();
    expect(() => theme.fg("not.a.real.role")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Glyphs: unicode + ASCII fallback modes
// ---------------------------------------------------------------------------

describe("glyphs", () => {
  test("every glyph group has both chars and asciiFallback, non-empty", () => {
    expect(GLYPH_GROUPS.length).toBe(11);
    for (const g of GLYPH_GROUPS) {
      expect(glyphs[g].chars.length).toBeGreaterThan(0);
      expect(glyphs[g].asciiFallback.length).toBeGreaterThan(0);
    }
  });

  test("theme.glyph() returns unicode chars when ascii=false", () => {
    const theme = makeTheme({ ascii: false });
    for (const g of GLYPH_GROUPS) {
      expect(theme.glyph(g)).toBe(glyphs[g].chars);
    }
  });

  test("theme.glyph() returns ASCII fallback when ascii=true", () => {
    const theme = makeTheme({ ascii: true });
    for (const g of GLYPH_GROUPS) {
      expect(theme.glyph(g)).toBe(glyphs[g].asciiFallback);
    }
  });
});

// ---------------------------------------------------------------------------
// Spacing scale
// ---------------------------------------------------------------------------

describe("spacing", () => {
  test("scale is the [1, 2, 4] character-cell scale", () => {
    expect(spacing.scale).toEqual([1, 2, 4]);
  });
});

// ---------------------------------------------------------------------------
// State accessors (focus/blur/selected/disabled)
// ---------------------------------------------------------------------------

describe("state accessors", () => {
  test("focusBorder/blurBorder/selectedBg/disabledText are non-empty escapes", () => {
    const theme = makeTheme({ trueColor: true });
    expect(theme.focusBorder.length).toBeGreaterThan(0);
    expect(theme.blurBorder.length).toBeGreaterThan(0);
    expect(theme.selectedBg.length).toBeGreaterThan(0);
    expect(theme.disabledText.length).toBeGreaterThan(0);
  });

  test("focusBorder mirrors states.focus.border (#2DD4BF, same as accent.teal)", () => {
    const theme = makeTheme({ trueColor: true });
    expect(theme.focusBorder).toBe(theme.fg("accent.teal"));
  });

  test("selectedBg is a BACKGROUND escape (48;...), not a foreground one", () => {
    const theme = makeTheme({ trueColor: true });
    expect(theme.selectedBg).toMatch(/^\x1b\[48;/);
  });
});

// ---------------------------------------------------------------------------
// Contrast: text.primary vs background.void relative luminance delta
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** WCAG relative luminance (0 = black, 1 = white). */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

describe("contrast", () => {
  test("text.primary vs background.void luminance delta exceeds ~0.5 (readable dark-mode contrast)", () => {
    const lText = relativeLuminance(colors.text.primary.hex);
    const lBg = relativeLuminance(colors.background.void.hex);
    const delta = Math.abs(lText - lBg);
    expect(delta).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// ZERO-EMOJI policy (Korvex discipline, hard gate)
// ---------------------------------------------------------------------------

// U+1F000–U+1FAFF (misc symbols/pictographs/emoticons/transport/supplemental symbols),
// U+2600–U+27BF (misc symbols + dingbats), U+FE0F (variation selector-16), U+200D (ZWJ).
// Box-drawing (U+2500–U+257F), blocks (U+2580–U+259F) and braille (U+2800–U+28FF) are
// explicitly OUTSIDE these ranges and therefore allowed.
const EMOJI_RANGE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/u;

describe("zero-emoji policy", () => {
  test("generated theme.ts source text contains no emoji codepoints", () => {
    expect(EMOJI_RANGE.test(THEME_SRC)).toBe(false);
  });

  test("every glyph group's chars and asciiFallback contain no emoji codepoints", () => {
    for (const g of GLYPH_GROUPS) {
      expect(EMOJI_RANGE.test(glyphs[g].chars)).toBe(false);
      expect(EMOJI_RANGE.test(glyphs[g].asciiFallback)).toBe(false);
    }
  });

  test("sanity: the emoji regex actually matches a real emoji (not a no-op)", () => {
    expect(EMOJI_RANGE.test("\u{1F600}")).toBe(true); // grinning face (misc pictographs)
    expect(EMOJI_RANGE.test("\u{2705}")).toBe(true); // white heavy check mark (dingbats)
  });

  test("sanity: allowed ranges (box-drawing/blocks/braille) do NOT trigger the emoji regex", () => {
    expect(EMOJI_RANGE.test("╭─╮│╰╯┌┐└┘┃")).toBe(false); // box-drawing U+2500-257F
    expect(EMOJI_RANGE.test("█▀▄▓▒░")).toBe(false); // blocks U+2580-259F
    expect(EMOJI_RANGE.test("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏")).toBe(false); // braille U+2800-28FF
  });
});
