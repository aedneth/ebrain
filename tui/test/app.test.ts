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

// Home renders LIVE data (F6.5.1) — a populated overview + sessions slice stands in for
// what the loop fetches, so the snapshot is deterministic (no ebrain/tmux).
const homeState = {
  ...initialState(),
  overview: {
    data: {
      brain: { state: "up", servedBy: "mcp:8541", cached: false },
      spend: { mtd: 2.14, cap: 10, remaining: 7.86 },
      fleet: { total: 6, online: 6 },
      memory: { learnings: 128, sessions: 39 },
    },
    memory: {
      learnings: [
        { project: "routing", agent: "unknown", date: "2026-07-14", tags: [], text: "deepseek v3 falla con tool-use paralelo" },
      ],
      sessions: [],
    },
    status: "ready" as const,
    atLabel: "14:31",
  },
  sessions: {
    rows: [{ name: "ebr-claude-korvex", agent: "claude", uptime: "02:41", attached: false }],
    selected: 0,
    peek: null,
    status: "ready" as const,
  },
};

describe("buildFrame — home snapshot (120x32)", () => {
  const frame = buildFrame(homeState, { cols: 120, rows: 32 }, theme);
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

  it("the 'latest memories' panel is present", () => {
    expect(plain.join("\n")).toContain("latest memories");
  });

  it("the 'system' and 'active sessions' panels are present", () => {
    expect(plain.join("\n")).toContain("system");
    expect(plain.join("\n")).toContain("active sessions");
  });

  it("the penultimate row is the hint bar, the last row is the footer", () => {
    expect(plain[30]).toContain("ctrl+c exit");
    expect(plain[31]).toContain("ebrain");
  });
});

describe("buildFrame — knowledge tabs are REAL views (F6.5), never stubs", () => {
  // All six tabs now render real views; none say "proximamente". With no slice data yet
  // they degrade to a bordered "loading…" panel — never a spinner-forever (6.5.5).
  const cases: Array<[string, string]> = [
    ["memory", "loading memory"],
    ["routing", "loading spend"],
    ["doctor", "loading diagnostics"],
  ];
  for (const [tab, loadingMsg] of cases) {
    it(`${tab} renders its real panel with a loading state (not a stub)`, () => {
      const frame = buildFrame({ tab: tab as never, confirmQuit: false, cwd: "~" }, { cols: 120, rows: 32 }, theme);
      const plain = frame.map(stripAnsi).join("\n");
      expect(plain).not.toContain("proximamente");
      expect(plain).toContain(loadingMsg);
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

  it('"tab" moves the focus ring between boxes, NOT the view (F6.6)', () => {
    const r = reduce(initialState(), { name: "tab" });
    expect(r.state.tab).toBe("home"); // view is unchanged
    expect(r.state.focusRegion).toBe(1); // home boxes: sessions -> memories
  });

  it('"shift+tab" wraps the focus ring backward within the view', () => {
    const r = reduce(initialState(), { name: "shifttab" });
    expect(r.state.tab).toBe("home");
    expect(r.state.focusRegion).toBe(2); // home has 3 boxes; -1 wraps to the last
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
    expect(plain).toContain("ebrain ui requires");
    expect(plain).toContain("60");
    expect(plain).toContain("20");
    // The real shell chrome must be absent — this is the guard, not a shrunk shell.
    expect(plain).not.toContain("active sessions");
    expect(plain).not.toContain("latest memories");
  });

  it(`right at the threshold (${MIN_COLS}x${MIN_ROWS}) renders the real shell, not the guard`, () => {
    const frame = buildFrame(initialState(), { cols: MIN_COLS, rows: MIN_ROWS }, theme);
    const plain = frame.map(stripAnsi).join("\n");
    expect(plain).not.toContain("ebrain ui requires");
  });

  it(`one row short of the threshold (${MIN_COLS}x${MIN_ROWS - 1}) triggers the guard`, () => {
    const frame = buildFrame(initialState(), { cols: MIN_COLS, rows: MIN_ROWS - 1 }, theme);
    const plain = frame.map(stripAnsi).join("\n");
    expect(plain).toContain("ebrain ui requires");
  });
});

// ---------------------------------------------------------------------------
// Registry: hint bar text must come from COMMANDS, not hardcoded strings
// ---------------------------------------------------------------------------

describe("hint bar is view-specific and rendered from hintsForTab", () => {
  it("every view returns a non-empty hint set (each key/label pair defined)", () => {
    for (const tab of ["home", "sessions", "launch", "memory", "routing", "doctor"] as const) {
      const hints = hintsForTab(tab);
      expect(hints.length).toBeGreaterThan(0);
      for (const h of hints) {
        expect(h.k.length).toBeGreaterThan(0);
        expect(h.label.length).toBeGreaterThan(0);
      }
    }
    // The global command registry still exists and includes the hint-bar-flagged commands.
    expect(COMMANDS.filter((c) => c.showInHintBar).length).toBeGreaterThan(0);
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
