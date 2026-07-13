/** Snapshot tests for data/sessioncard — mirrors design-system SessionCard contract. */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { sessioncard } from "../../../src/widgets/data/sessioncard.js";
import { badge } from "../../../src/widgets/core/badge.js";
import { displayWidth } from "../../../src/kit/draw.js";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("sessioncard (truecolor/unicode)", () => {
  const t = makeTheme({ trueColor: true, ascii: false });

  it("composes core/badge + name + dim uptime + semantic state, single row", () => {
    const out = sessioncard({ agent: "claude", name: "ebr-claude-korvex", uptime: "02:41", state: "running" }, t);
    expect(strip(out)).toBe("  ● claude ebr-claude-korvex  02:41  running");
    expect(out).toContain(badge({ agent: "claude" }, t)); // literal composition of core/badge
    expect(out).toContain(t.fg("semantic.ok")); // running → ok
    expect(displayWidth(out)).toBe(strip(out).length);
  });

  it("selected → ▸ marker + selectedBg; detail appended dim", () => {
    const out = sessioncard(
      { agent: "gemini", name: "ebr-gem-web", uptime: "00:12", state: "waiting", detail: "esperando", selected: true },
      t,
    );
    expect(strip(out)).toBe("▸ ● gemini ebr-gem-web  00:12  waiting  esperando");
    expect(out).toContain(t.selectedBg);
    expect(out).toContain(t.fg("accent.teal")); // ▸ marker
    expect(out).toContain(t.fg("semantic.warn")); // waiting → warn
  });

  it("maps each state to its semantic color", () => {
    const roles = {
      running: t.fg("semantic.ok"),
      waiting: t.fg("semantic.warn"),
      idle: t.fg("text.muted"),
      error: t.fg("semantic.error"),
      done: t.fg("text.secondary"),
    } as const;
    for (const [state, esc] of Object.entries(roles)) {
      const out = sessioncard({ agent: "codex", name: "s", state: state as never }, t);
      expect(out).toContain(esc);
    }
  });

  it("ignores an invalid state enum (falls back to running color)", () => {
    const out = sessioncard({ agent: "codex", name: "s", state: "bogus" as never }, t);
    expect(out).toContain(t.fg("semantic.ok"));
  });
});

describe("sessioncard (ASCII fallback)", () => {
  const t = makeTheme({ trueColor: true, ascii: true });

  it("uses ASCII badge dot * and ASCII marker >", () => {
    const out = sessioncard({ agent: "claude", name: "x", state: "idle", selected: true }, t);
    expect(strip(out)).toBe("> * claude x  idle");
  });
});
