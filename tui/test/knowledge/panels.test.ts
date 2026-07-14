/**
 * tui/test/knowledge/panels.test.ts — SPRINT-TUI 6.5.6: snapshots of EVERY knowledge
 * panel from pure JSON fixtures (no ebrain, no network, no brain, no tmux) + the reduce
 * transitions the new panels add. buildFrame is pure, so a populated slice stands in for
 * what the loop would fetch — the whole suite runs offline anywhere.
 *
 * Run: bun test ./tui/test/knowledge/panels.test.ts
 */
import { describe, it, expect } from "bun:test";
import { buildFrame, reduce, initialState, type AppState } from "../../src/app.ts";
import { makeTheme } from "../../src/theme.ts";
import { displayWidth } from "../../src/kit/draw.ts";

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g, "");
const theme = makeTheme({ trueColor: true, ascii: false });
const SIZE = { cols: 120, rows: 32 };

function frameText(state: AppState): string {
  const frame = buildFrame(state, SIZE, theme);
  // Width invariant every panel must uphold (a character buffer needs exact widths).
  for (const row of frame) expect(displayWidth(row)).toBe(SIZE.cols);
  expect(frame.length).toBe(SIZE.rows);
  return frame.map(stripAnsi).join("\n");
}

function base(tab: AppState["tab"], extra: Partial<AppState>): AppState {
  return { ...initialState(), tab, ...extra };
}

// ── Overview — lock-awareness banner (6.5.5) ────────────────────────────────
describe("Overview panel (6.5.1) + lock banner (6.5.5)", () => {
  const cached = base("home", {
    overview: {
      data: {
        brain: { state: "up", servedBy: "mcp:8541", cached: true },
        spend: { mtd: 2.14, cap: 10, remaining: 7.86 },
        fleet: { total: 6, online: 6 },
        memory: { learnings: 128, sessions: 39 },
      },
      memory: { learnings: [{ project: "routing", agent: "x", date: "2026-07-14", tags: [], text: "no sugerir npm en korvex" }], sessions: [] },
      status: "ready",
      atLabel: "14:31",
    },
  });

  it("raises the lock banner with server + cached timestamp when the brain read was cached", () => {
    const t = frameText(cached);
    expect(t).toContain("brain served by mcp:8541 (lock)");
    expect(t).toContain("cached 14:31");
  });

  it("shows real spend/fleet/memory in the sistema panel + last learning", () => {
    const t = frameText(cached);
    expect(t).toContain("system");
    expect(t).toContain("$2.14/$10");
    expect(t).toContain("6/6");
    expect(t).toContain("128");
    expect(t).toContain("no sugerir npm en korvex");
  });

  it("no data yet degrades to a loading line, never a spinner-forever", () => {
    const t = frameText(base("home", {}));
    expect(t).toContain("loading system status");
  });
});

// ── Memory (6.5.2) ──────────────────────────────────────────────────────────
describe("Memory panel (6.5.2)", () => {
  const state = base("memory", {
    memory: {
      data: {
        learnings: [
          { project: "routing", agent: "unknown", date: "2026-07-14", tags: ["routing"], text: "deepseek v3 falla con tool-use paralelo" },
          { project: "korvex", agent: "unknown", date: "2026-07-13", tags: [], text: "korvex usa pnpm, no npm" },
        ],
        sessions: [{ ts: "2026-07-14T12:45:46Z", project: "sb", agent: "claude", commit: "abc1234", summary: "refactor router" }],
      },
      selected: 0,
      status: "ready",
    },
  });

  it("renders results, session-logs, the search box and the remember hint", () => {
    const t = frameText(state);
    expect(t).toContain("deepseek v3 falla con tool-use paralelo");
    expect(t).toContain("results");
    expect(t).toContain("session-logs");
    expect(t).toContain("07-14 12:45");
    expect(t).toContain("refactor router");
    expect(t).toContain("r → remember");
    expect(t).toContain("semantic search"); // informational PromptBox placeholder
  });
});

// ── Routing (6.5.3) ───────────────────────────────────────────────────────────
describe("Routing panel (6.5.3)", () => {
  const state = base("routing", {
    routing: {
      data: {
        month: "2026-07",
        mtd: 2.14,
        cap: 10,
        remaining: 7.86,
        hardStop: true,
        byCap: [
          { capability: "coding", mtd: 1.253, routes: 2 },
          { capability: "general", mtd: 0.521, routes: 1 },
        ],
        gbrainUntracked: true,
      },
      selected: 0,
      status: "ready",
    },
  });

  it("renders the per-cap table, budget panel, gbrain flag and the deferred-chains note", () => {
    const t = frameText(state);
    expect(t).toContain("capability");
    expect(t).toContain("coding");
    expect(t).toContain("total today");
    expect(t).toContain("budget · 2026-07");
    expect(t).toContain("gbrain: untracked spend");
    expect(t).toContain("pending routing --json contract"); // honest scoping (criterion #2)
  });
});

// ── Fleet/Doctor (6.5.4) ──────────────────────────────────────────────────────
describe("Doctor panel (6.5.4)", () => {
  const state = base("doctor", {
    doctor: {
      fleet: {
        agents: [
          { name: "claude", ok: true, cls: "heavy" },
          { name: "gemini", ok: false, cls: "light" },
        ],
        online: 1,
        total: 2,
      },
      doctor: {
        checks: [
          { id: "tmux server", level: "ok", msg: "5 sesiones" },
          { id: "openai api", level: "warn", msg: "latencia alta" },
          { id: "deepseek api", level: "fail", msg: "inestable" },
        ],
        ok: 1,
        warn: 1,
        fail: 1,
      },
      selected: 0,
      status: "ready",
      running: false,
      spinnerFrame: 0,
      atLabel: "14:31",
    },
  });

  it("colorizes checks by level (✓/!/✗), lists the fleet and the warn/fail summary", () => {
    const t = frameText(state);
    expect(t).toContain("✓");
    expect(t).toContain("✗");
    expect(t).toContain("tmux server");
    expect(t).toContain("deepseek api");
    expect(t).toContain("fleet 1/2");
    expect(t).toContain("offline"); // gemini ok:false
    expect(t).toContain("1 warn · 1 fail");
  });

  it("shows the spinner label while a re-run is in flight (never a frozen forever-state)", () => {
    const running = { ...state, doctor: { ...state.doctor!, running: true } };
    expect(frameText(running)).toContain("re-running checks");
  });
});

// ── reduce — navigation + actions the knowledge panels add ────────────────────
describe("reduce — knowledge-panel keys", () => {
  it("landing on each knowledge tab requests its refresh effect", () => {
    expect(reduce(initialState(), { name: "char", char: "1" }).effect?.type).toBe("refreshStatus");
    expect(reduce(initialState(), { name: "char", char: "4" }).effect?.type).toBe("refreshMemory");
    expect(reduce(initialState(), { name: "char", char: "5" }).effect?.type).toBe("refreshRouting");
    expect(reduce(initialState(), { name: "char", char: "6" }).effect?.type).toBe("refreshFleetDoctor");
  });

  it("memory ↑↓ moves the result selection", () => {
    const s = base("memory", {
      memory: {
        data: { learnings: [{ project: "a", agent: "x", date: "d", tags: [], text: "one" }, { project: "b", agent: "x", date: "d", tags: [], text: "two" }], sessions: [] },
        selected: 0,
        status: "ready",
      },
    });
    expect(reduce(s, { name: "down" }).state.memory!.selected).toBe(1);
    expect(reduce({ ...s, memory: { ...s.memory!, selected: 1 } }, { name: "up" }).state.memory!.selected).toBe(0);
  });

  it("memory `r` opens the remember composer; enter emits a remember effect", () => {
    const s = base("memory", {});
    const opened = reduce(s, { name: "char", char: "r" }).state;
    expect(opened.overlay?.kind).toBe("remember");
    // type + submit
    const typed = reduce(opened, { name: "char", char: "x" }).state;
    const submit = reduce(typed, { name: "enter" });
    expect(submit.effect?.type).toBe("remember");
    // empty submit just closes (no effect)
    const emptySubmit = reduce(opened, { name: "enter" });
    expect(emptySubmit.effect).toBeUndefined();
    expect(emptySubmit.state.overlay).toBeNull();
  });

  it("routing ↑↓ moves the cap selection", () => {
    const s = base("routing", {
      routing: {
        data: { month: "m", mtd: 0, cap: 10, remaining: 10, hardStop: true, byCap: [{ capability: "a", mtd: 0, routes: 0 }, { capability: "b", mtd: 0, routes: 0 }], gbrainUntracked: false },
        selected: 0,
        status: "ready",
      },
    });
    expect(reduce(s, { name: "down" }).state.routing!.selected).toBe(1);
  });

  it("doctor `r` requests a re-run; ↑↓ moves the check selection", () => {
    const s = base("doctor", {
      doctor: {
        fleet: null,
        doctor: { checks: [{ id: "a", level: "ok", msg: "" }, { id: "b", level: "warn", msg: "" }], ok: 1, warn: 1, fail: 0 },
        selected: 0,
        status: "ready",
        running: false,
        spinnerFrame: 0,
        atLabel: null,
      },
    });
    expect(reduce(s, { name: "char", char: "r" }).effect?.type).toBe("rerunDoctor");
    expect(reduce(s, { name: "down" }).state.doctor!.selected).toBe(1);
  });
});
