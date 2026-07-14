/**
 * tui/test/app.test.ts — SPRINT-TUI 6.3.3 app shell tests.
 *
 * Pure `buildFrame` / `reduce` — no real TTY needed. `initialState()` reads
 * EBRAIN_CALLER_CWD / process.cwd() and a best-effort git branch, but neither
 * of those leaks into the assertions below (we only ever check `.tab` /
 * `.quit` / `.confirmQuit`, or the frame's shell chrome — never cwd/branch text).
 */
import { describe, it, expect } from "bun:test";
import { buildFrame, reduce, initialState, MIN_COLS, MIN_ROWS } from "../src/app.ts";
import { COMMANDS, hintsForTab } from "../src/commands.ts";
import { makeTheme } from "../src/theme.ts";
import { displayWidth } from "../src/kit/draw.ts";
import { wordmark } from "../src/widgets/brand/wordmark.ts";

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g, "");

const theme = makeTheme({ trueColor: true, ascii: false });

// ---------------------------------------------------------------------------
// buildFrame — home snapshot (120x32, matches shell.jsx's COLS/ROWS)
// ---------------------------------------------------------------------------

describe("buildFrame — home snapshot (120x32)", () => {
  const state = initialState();
  const frame = buildFrame(state, { cols: 120, rows: 32 }, theme);
  const plain = frame.map(stripAnsi);

  it("returns exactly 32 rows, each of exact display width 120", () => {
    expect(frame.length).toBe(32);
    for (const row of frame) expect(displayWidth(row)).toBe(120);
  });

  it("row1 (statusbar) contains 'brain' and 'fleet 6/6'", () => {
    expect(plain[0]).toContain("brain");
    expect(plain[0]).toContain("fleet 6/6");
  });

  it("row2 (tabbar) contains all 6 tab names, with home styled active", () => {
    for (const name of ["home", "sessions", "launch", "memory", "routing", "doctor"]) {
      expect(plain[1]).toContain(name);
    }
    // Active-tab styling is exact per tabbar.ts's contract: bg(raised)+bold+fg(primary).
    const activeCell = theme.bg("background.raised") + "\x1b[1m" + theme.fg("text.primary") + " 1:home " + theme.reset;
    expect(frame[1]).toContain(activeCell);
  });

  it("row3 is the hairline separator", () => {
    expect(plain[2]).toContain("─");
  });

  it("the wordmark block appears verbatim (colored) somewhere in the body", () => {
    const wm = wordmark({ variant: "block" }, theme);
    expect(wm.length).toBeGreaterThan(0);
    for (const line of wm) {
      expect(frame.some((row) => row.includes(line))).toBe(true);
    }
  });

  it("the 'ultimas memorias' panel is present", () => {
    expect(plain.join("\n")).toContain("ultimas memorias");
  });

  it("the 'sistema' and 'sesiones activas' panels are present", () => {
    expect(plain.join("\n")).toContain("sistema");
    expect(plain.join("\n")).toContain("sesiones activas");
  });

  it("the penultimate row is the hint bar, the last row is the footer", () => {
    expect(plain[30]).toContain("ctrl+c salir");
    expect(plain[31]).toContain("ebrain");
  });
});

describe("buildFrame — stub tabs render '<tab> — proximamente'", () => {
  // `sessions` (6.4.3) and `launch` (6.4.5) are REAL views now; the remaining three
  // are still stubs until F6.5.
  for (const tab of ["memory", "routing", "doctor"] as const) {
    it(`${tab} renders a stub panel`, () => {
      const frame = buildFrame({ tab, confirmQuit: false, cwd: "~" }, { cols: 120, rows: 32 }, theme);
      const plain = frame.map(stripAnsi).join("\n");
      expect(plain).toContain(`${tab} — proximamente`);
    });
  }
});

// ---------------------------------------------------------------------------
// reduce — pure key -> state (no TTY needed)
// ---------------------------------------------------------------------------

describe("reduce — pure key-driven navigation", () => {
  it('"2" switches the active tab to sessions', () => {
    const r = reduce(initialState(), { name: "char", char: "2" });
    expect(r.state.tab).toBe("sessions");
    expect(r.quit).toBe(false);
  });

  it('"tab" cycles forward (home -> sessions)', () => {
    const r = reduce(initialState(), { name: "tab" });
    expect(r.state.tab).toBe("sessions");
  });

  it('"shift+tab" cycles backward and wraps (home -> doctor)', () => {
    const r = reduce(initialState(), { name: "shifttab" });
    expect(r.state.tab).toBe("doctor");
  });

  it('"6" jumps directly to doctor', () => {
    const r = reduce(initialState(), { name: "char", char: "6" });
    expect(r.state.tab).toBe("doctor");
  });

  it('"l" jumps directly to launch', () => {
    const r = reduce(initialState(), { name: "char", char: "l" });
    expect(r.state.tab).toBe("launch");
  });

  it('"tab" then "shift+tab" returns to the original tab', () => {
    const s0 = initialState();
    const forward = reduce(s0, { name: "tab" }).state;
    const back = reduce(forward, { name: "shifttab" }).state;
    expect(back.tab).toBe(s0.tab);
  });

  it('"q" quits immediately', () => {
    const r = reduce(initialState(), { name: "char", char: "q" });
    expect(r.quit).toBe(true);
  });

  it('"ctrl+d" quits immediately', () => {
    const r = reduce(initialState(), { name: "char", char: "\x04" });
    expect(r.quit).toBe(true);
  });

  it("a single ctrl+c arms quit-confirm but does not quit; a second consecutive one does", () => {
    const s0 = initialState();
    const r1 = reduce(s0, { name: "char", char: "\x03" });
    expect(r1.quit).toBe(false);
    expect(r1.state.confirmQuit).toBe(true);

    const r2 = reduce(r1.state, { name: "char", char: "\x03" });
    expect(r2.quit).toBe(true);
  });

  it("any other key clears an armed quit-confirm (no accidental quit)", () => {
    const armed = reduce(initialState(), { name: "char", char: "\x03" }).state;
    expect(armed.confirmQuit).toBe(true);
    const after = reduce(armed, { name: "char", char: "3" });
    expect(after.state.confirmQuit).toBe(false);
    expect(after.quit).toBe(false);
  });

  it('"ctrl+l" requests a forced redraw without changing the tab', () => {
    const r = reduce(initialState(), { name: "char", char: "\x0c" });
    expect(r.forceRedraw).toBe(true);
    expect(r.state.tab).toBe("home");
    expect(r.quit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildFrame — min-size guard
// ---------------------------------------------------------------------------

describe("buildFrame — min-size guard", () => {
  it("below MIN_COLS/MIN_ROWS (60x20) returns a guidance message, not the shell", () => {
    const frame = buildFrame(initialState(), { cols: 60, rows: 20 }, theme);
    expect(frame.length).toBe(20);
    for (const row of frame) expect(displayWidth(row)).toBe(60);

    const plain = frame.map(stripAnsi).join("\n");
    expect(plain).toContain("ebrain ui requiere");
    expect(plain).toContain("60");
    expect(plain).toContain("20");
    // The real shell chrome must be absent — this is the guard, not a shrunk shell.
    expect(plain).not.toContain("sesiones activas");
    expect(plain).not.toContain("ultimas memorias");
  });

  it(`right at the threshold (${MIN_COLS}x${MIN_ROWS}) renders the real shell, not the guard`, () => {
    const frame = buildFrame(initialState(), { cols: MIN_COLS, rows: MIN_ROWS }, theme);
    const plain = frame.map(stripAnsi).join("\n");
    expect(plain).not.toContain("ebrain ui requiere");
  });

  it(`one row short of the threshold (${MIN_COLS}x${MIN_ROWS - 1}) triggers the guard`, () => {
    const frame = buildFrame(initialState(), { cols: MIN_COLS, rows: MIN_ROWS - 1 }, theme);
    const plain = frame.map(stripAnsi).join("\n");
    expect(plain).toContain("ebrain ui requiere");
  });
});

// ---------------------------------------------------------------------------
// Registry: hint bar text must come from COMMANDS, not hardcoded strings
// ---------------------------------------------------------------------------

describe("hint bar is generated from the COMMANDS registry", () => {
  it("hintsForTab draws only from commands marked showInHintBar", () => {
    const hints = hintsForTab("home");
    const expected = COMMANDS.filter((c) => c.showInHintBar);
    expect(hints.length).toBe(expected.length);
    expect(hints.length).toBeGreaterThan(0);
  });

  it("every hintsForTab() entry shows up in buildFrame's hint bar row", () => {
    const frame = buildFrame(initialState(), { cols: 120, rows: 32 }, theme);
    const hintRow = stripAnsi(frame[30]!);
    for (const h of hintsForTab("home")) {
      expect(hintRow).toContain(h.k);
      expect(hintRow).toContain(h.label);
    }
  });
});
