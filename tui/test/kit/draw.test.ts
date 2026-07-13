/**
 * Ported from FlowClock (~/flowclock-cli/test/tui.test.ts) — draw.ts coverage
 * only (displayWidth/truncate/padTo/panel/barH/sparkline/kv/gauge). Adapted
 * from vitest to bun:test and repointed to ebrain's vendored kit at
 * ../../src/kit/draw.js.
 */
import { describe, it, expect } from "bun:test";

import {
  displayWidth,
  truncate,
  padTo,
  panel,
  barH,
  sparkline,
  kv,
  gauge,
} from "../../src/kit/draw.js";

// ---------------------------------------------------------------------------
// draw.ts — displayWidth
// ---------------------------------------------------------------------------

describe("displayWidth", () => {
  it("returns 0 for empty string", () => {
    expect(displayWidth("")).toBe(0);
  });

  it("counts plain ASCII characters", () => {
    expect(displayWidth("hello")).toBe(5);
  });

  it("ignores ANSI SGR escape sequences", () => {
    expect(displayWidth("\x1b[32mhello\x1b[0m")).toBe(5);
  });

  it("ignores complex ANSI sequences (256-color)", () => {
    expect(displayWidth("\x1b[38;5;46mgreen\x1b[0m")).toBe(5);
  });

  it("counts box-drawing chars as width 1", () => {
    expect(displayWidth("┌─┐")).toBe(3);
  });

  it("counts block char █ as width 1", () => {
    expect(displayWidth("███")).toBe(3);
  });

  it("counts sparkline chars as width 1", () => {
    expect(displayWidth("▁▂▃▄▅▆▇█")).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// draw.ts — truncate
// ---------------------------------------------------------------------------

describe("truncate", () => {
  it("returns the string unchanged when it fits", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns empty string for width 0", () => {
    expect(truncate("hello", 0)).toBe("");
  });

  it("truncates plain ASCII to exact width", () => {
    expect(truncate("hello world", 5)).toBe("hello");
  });

  it("truncates ANSI-colored string to visible width", () => {
    const colored = "\x1b[32mhello world\x1b[0m";
    const result = truncate(colored, 5);
    // Visible content should be exactly 5 chars
    expect(displayWidth(result)).toBe(5);
  });

  it("keeps escape sequences for the visible portion", () => {
    const colored = "\x1b[32mhello\x1b[0m world";
    const result = truncate(colored, 3);
    // Should contain color codes since the color started before the cut
    expect(result).toContain("\x1b[32m");
    expect(displayWidth(result)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// draw.ts — padTo
// ---------------------------------------------------------------------------

describe("padTo", () => {
  it("pads left (default) with spaces on the right", () => {
    expect(padTo("hi", 5)).toBe("hi   ");
  });

  it("pads right with spaces on the left", () => {
    expect(padTo("hi", 5, "right")).toBe("   hi");
  });

  it("centers with even padding split (extra space on right)", () => {
    expect(padTo("hi", 6, "center")).toBe("  hi  ");
  });

  it("centers with odd padding — extra space goes right", () => {
    // total pad = 3: left=1, right=2
    expect(padTo("hi", 5, "center")).toBe(" hi  ");
  });

  it("returns unchanged string when already exact width", () => {
    expect(padTo("hello", 5)).toBe("hello");
  });

  it("truncates when string is wider than width", () => {
    expect(padTo("hello world", 5)).toBe("hello");
  });

  it("handles ANSI-colored string width correctly", () => {
    const colored = "\x1b[32mhi\x1b[0m";
    const result = padTo(colored, 5);
    // Visible width should be 5, with 3 padding spaces on right
    expect(displayWidth(result)).toBe(5);
    // Original colored part should still be there
    expect(result).toContain("\x1b[32m");
  });
});

// ---------------------------------------------------------------------------
// draw.ts — panel
// ---------------------------------------------------------------------------

describe("panel", () => {
  it("returns exactly `height` rows", () => {
    const rows = panel({ width: 20, height: 5, body: [] });
    expect(rows).toHaveLength(5);
  });

  it("each row has display width equal to `width`", () => {
    const rows = panel({ width: 20, height: 5, body: [] });
    for (const row of rows) {
      expect(displayWidth(row)).toBe(20);
    }
  });

  it("first row starts with top-left corner", () => {
    const rows = panel({ width: 20, height: 5, body: [] });
    expect(stripAnsi(rows[0] ?? "")).toMatch(/^┌/);
  });

  it("first row ends with top-right corner", () => {
    const rows = panel({ width: 20, height: 5, body: [] });
    expect(stripAnsi(rows[0] ?? "")).toMatch(/┐$/);
  });

  it("last row starts with bottom-left corner", () => {
    const rows = panel({ width: 20, height: 5, body: [] });
    expect(stripAnsi(rows[rows.length - 1] ?? "")).toMatch(/^└/);
  });

  it("last row ends with bottom-right corner", () => {
    const rows = panel({ width: 20, height: 5, body: [] });
    expect(stripAnsi(rows[rows.length - 1] ?? "")).toMatch(/┘$/);
  });

  it("middle rows start and end with vertical border", () => {
    const rows = panel({ width: 20, height: 5, body: ["line1", "line2", "line3"] });
    for (let i = 1; i < rows.length - 1; i++) {
      const raw = stripAnsi(rows[i] ?? "");
      expect(raw).toMatch(/^│/);
      expect(raw).toMatch(/│$/);
    }
  });

  it("includes title in top border", () => {
    const rows = panel({ width: 30, height: 5, body: [], title: "My Panel" });
    expect(stripAnsi(rows[0] ?? "")).toContain("My Panel");
  });

  it("truncates long body lines to inner width", () => {
    const longLine = "a".repeat(100);
    const rows = panel({ width: 10, height: 3, body: [longLine] });
    // inner width = 8
    for (const row of rows) {
      expect(displayWidth(row)).toBe(10);
    }
  });

  it("pads short body lines to inner width", () => {
    const rows = panel({ width: 10, height: 3, body: ["hi"] });
    // Each body row should have display width = 10
    for (const row of rows) {
      expect(displayWidth(row)).toBe(10);
    }
  });

  it("handles height=1 gracefully (no body, no bottom border)", () => {
    const rows = panel({ width: 10, height: 1, body: [] });
    expect(rows).toHaveLength(1);
    expect(displayWidth(rows[0] ?? "")).toBe(10);
  });

  it("handles height=2 (top + bottom border, no body rows)", () => {
    const rows = panel({ width: 10, height: 2, body: [] });
    expect(rows).toHaveLength(2);
    expect(stripAnsi(rows[0] ?? "")).toMatch(/^┌/);
    expect(stripAnsi(rows[1] ?? "")).toMatch(/^└/);
  });

  it("wraps border/title in the optional color and resets it", () => {
    const rows = panel({ width: 20, height: 3, body: ["hi"], title: "T", color: "\x1b[36m" });
    expect(rows[0]).toContain("\x1b[36m");
    expect(rows[0]).toContain("\x1b[0m");
    // Display width must still be exact even with color codes present.
    for (const row of rows) {
      expect(displayWidth(row)).toBe(20);
    }
  });
});

// ---------------------------------------------------------------------------
// draw.ts — barH
// ---------------------------------------------------------------------------

describe("barH", () => {
  it("returns full bar when value equals max", () => {
    expect(barH(10, 10, 10)).toBe("█".repeat(10));
  });

  it("returns empty bar when value is 0", () => {
    expect(barH(0, 10, 10)).toBe("░".repeat(10));
  });

  it("returns half bar for 50%", () => {
    const result = barH(5, 10, 10);
    expect(result).toBe("█████░░░░░");
  });

  it("returns string of exact `width` chars", () => {
    const result = barH(3, 7, 15);
    expect(displayWidth(result)).toBe(15);
  });

  it("clamps value above max to full bar", () => {
    expect(barH(20, 10, 5)).toBe("█".repeat(5));
  });

  it("clamps negative value to empty bar", () => {
    expect(barH(-5, 10, 5)).toBe("░".repeat(5));
  });

  it("returns empty string for width 0", () => {
    expect(barH(5, 10, 0)).toBe("");
  });

  it("uses custom filled/empty chars", () => {
    const result = barH(5, 10, 10, { filled: "#", empty: "." });
    expect(result).toBe("#####.....");
  });
});

// ---------------------------------------------------------------------------
// draw.ts — sparkline
// ---------------------------------------------------------------------------

describe("sparkline", () => {
  it("returns empty string for empty input", () => {
    expect(sparkline([])).toBe("");
  });

  it("returns all mid chars for all-same values", () => {
    const result = sparkline([5, 5, 5, 5]);
    expect(result).toBe("▄▄▄▄");
  });

  it("maps min to ▁ and max to █", () => {
    const result = sparkline([0, 100]);
    expect(result[0]).toBe("▁");
    expect(result[1]).toBe("█");
  });

  it("returns correct length", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(sparkline(values)).toHaveLength(8);
  });

  it("uses block chars from the sparkline set", () => {
    const chars = new Set(["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]);
    const result = sparkline([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    for (const ch of result) {
      expect(chars.has(ch)).toBe(true);
    }
  });

  it("single value returns mid char", () => {
    expect(sparkline([42])).toBe("▄");
  });
});

// ---------------------------------------------------------------------------
// draw.ts — kv
// ---------------------------------------------------------------------------

describe("kv", () => {
  it("pads to exact width", () => {
    const result = kv("Score", "42", 20);
    expect(displayWidth(result)).toBe(20);
  });

  it("key is on the left, value on the right", () => {
    const result = kv("Score", "42", 20);
    expect(result.startsWith("Score")).toBe(true);
    expect(result.endsWith("42")).toBe(true);
  });

  it("returns string of correct width when key is short", () => {
    const result = kv("A", "B", 10);
    expect(displayWidth(result)).toBe(10);
  });

  it("returns empty string for width 0", () => {
    expect(kv("key", "val", 0)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// draw.ts — gauge
// ---------------------------------------------------------------------------

describe("gauge", () => {
  it("returns string of exact `width` chars", () => {
    const result = gauge(50, 20);
    expect(displayWidth(result)).toBe(20);
  });

  it("starts with [ and ends with ]", () => {
    const result = gauge(75, 15);
    expect(result[0]).toBe("[");
    expect(result[result.length - 1]).toBe("]");
  });

  it("contains percentage label", () => {
    expect(gauge(42, 20)).toContain("42%");
  });

  it("clamps to 0 minimum", () => {
    const result = gauge(-10, 20);
    expect(result).toContain("0%");
  });

  it("clamps to 100 maximum", () => {
    const result = gauge(150, 20);
    expect(result).toContain("100%");
  });

  it("returns empty string for width 0", () => {
    expect(gauge(50, 0)).toBe("");
  });

  it("full gauge at 100%", () => {
    const result = gauge(100, 20);
    expect(result).toContain("100%");
    // Should have filled chars
    expect(result).toContain("█");
  });

  it("empty gauge at 0%", () => {
    const result = gauge(0, 20);
    expect(result).toContain("0%");
  });
});

// ---------------------------------------------------------------------------
// Helpers for this test file
// ---------------------------------------------------------------------------

/** Strip ANSI sequences (used in panel assertions). */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g, "");
}
