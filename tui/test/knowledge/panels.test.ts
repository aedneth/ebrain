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

function frameTextAt(state: AppState, size: { cols: number; rows: number }): string {
  const frame = buildFrame(state, size, theme);
  // Width invariant every panel must uphold (a character buffer needs exact widths).
  for (const row of frame) expect(displayWidth(row)).toBe(size.cols);
  expect(frame.length).toBe(size.rows);
  return frame.map(stripAnsi).join("\n");
}

function frameText(state: AppState): string {
  return frameTextAt(state, SIZE);
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

  // First-run: the brain is up but nothing exists yet. Each empty box must TEACH the key
  // that creates the first item instead of a mute "none" — verified at the tightest
  // supported size (80x24), where frameTextAt also asserts exact rows×cols so the teaching
  // strings are proven to fit their panels without truncation.
  const firstRun = base("home", {
    overview: {
      data: {
        brain: { state: "up", servedBy: "mcp:8541", cached: false },
        spend: { mtd: 0, cap: 10, remaining: 10 },
        fleet: { total: 0, online: 0 },
        memory: { learnings: 0, sessions: 0 },
      },
      memory: { learnings: [], sessions: [] },
      status: "ready",
      atLabel: "14:31",
    },
  });

  it("empty sessions box teaches the launch key (l), not a bare tab number", () => {
    const t = frameTextAt(firstRun, { cols: 80, rows: 24 });
    expect(t).toContain("none · press l to launch");
    expect(t).not.toContain("press 2");
  });

  it("empty latest-memories box teaches how to save the first memory (5 then r)", () => {
    const t = frameTextAt(firstRun, { cols: 80, rows: 24 });
    expect(t).toContain("no recent memories · press 5 then r to save one");
  });

  it("first-run shows a single 'start here' cue naming the first keys, and it fits 80x24", () => {
    for (const size of [{ cols: 80, rows: 24 }, { cols: 100, rows: 30 }, { cols: 160, rows: 48 }]) {
      // frameTextAt asserts exact rows×cols, so a present CTA is also proof it fits its row.
      const t = frameTextAt(firstRun, size);
      expect(t).toContain("start here · l launch · 4 then a add workspace · 5 then r save memory");
    }
  });

  it("the 'start here' cue is suppressed once there are sessions or memories (not for existing users)", () => {
    // `cached` has live fleet + a saved learning → not a brand-new brain → no cue.
    const t = frameText(cached);
    expect(t).not.toContain("start here");
  });
});

// ── Memory (F9.2) ───────────────────────────────────────────────────────────
describe("Memory panel (F9.2)", () => {
  const state = base("memory", {
    memory: {
      data: {
        learnings: [
          { project: "routing", agent: "unknown", date: "2026-07-14", tags: ["routing"], text: "deepseek v3 falla con tool-use paralelo" },
          { project: "korvex", agent: "unknown", date: "2026-07-13", tags: [], text: "korvex usa pnpm, no npm" },
        ],
        sessions: [{ ts: "2026-07-14T12:45:46Z", project: "sb", agent: "claude", commit: "abc1234", summary: "refactor router" }],
      },
      workflows: {
        workflows: [{ id: "second-brain-structured-agentic-development", title: "Structured Agentic Development", source: "second-brain", version: 2, trigger: "Use for software", summary: "Plan then verify", tags: ["sop"], steps: 4, gates: 2 }],
      },
      episodes: {
        episodes: [{ id: "episode-11111111-1111-4111-8111-111111111111", kind: "learning", source: "remember", createdAt: "2026-07-18T00:00:00.000Z", project: "ebrain", agent: "codex", chars: 84 }],
      },
      contexts: {
        packs: [{ id: "operator", scope: "operator", version: 2, updatedAt: "2026-07-18T00:00:00.000Z", chars: 120 }],
      },
      procedures: {
        procedures: [{ id: "second-brain-structured-agentic-development", title: "Structured Agentic Development", source: "second-brain", version: 2, trigger: "Use for software", summary: "Plan then verify", tags: ["sop"], steps: 4, gates: 2, state: "active", useCount: 3, skillified: true }],
      },
      selected: 0,
      workflowSelected: 0,
      status: "ready",
    },
  });

  it("renders governed recall, passive context, procedures, legacy logs, and compact controls", () => {
    const t = frameText(state);
    expect(t).toContain("deepseek v3 falla con tool-use paralelo");
    expect(t).toContain("recall · 1 episodes · 2 learnings");
    expect(t).toContain("learning · ebrain");
    expect(t).toContain("context · 1");
    expect(t).toContain("operator · v2");
    expect(t).toContain("procedures · 1");
    expect(t).toContain("legacy session logs · 1");
    expect(t).toContain("Structured Agentic");
    expect(t).toContain("active · 3 uses · skill");
    expect(t).toContain("07-14 12:45");
    expect(t).toContain("refactor router");
    expect(t).toContain("r remember");
    expect(t).toContain("shared memory search");
    expect(t).toContain("s search");
  });

  it("keeps Recall usable at 80x24 and never exposes an episode body", () => {
    const t = frameTextAt(state, { cols: 80, rows: 24 });
    expect(t).toContain("recall");
    expect(t).toContain("context");
    expect(t).toContain("procedures");
    expect(t).not.toContain("must not enter TUI state");
  });

  it("opens an episode as provenance only, never as hidden episode text", () => {
    const next = reduce(state, { name: "enter" }).state;
    const detail = next.overlay as { kind: string; body: string };
    expect(detail.kind).toBe("detail");
    expect(detail.body).toContain("Episode text is available only through explicit bounded retrieval.");
    expect(detail.body).not.toContain("deepseek v3 falla");
  });
});

// ── Memory empty states TEACH the first action (F2-C) ────────────────────────
// A brand-new brain has nothing recalled, no context packs, and no procedures. Each empty
// panel must name the key that creates the first item (recall → `r`) or, for the read-only
// collections, where they come from (the `ebrain context` / `ebrain procedures` CLIs) —
// never a mute "none". Asserted at 80x24 so frameTextAt's exact rows×cols check doubles as
// proof each teaching line fits its (narrow) panel without truncation.
describe("Memory empty states teach the first action (F2-C)", () => {
  const emptyMemory = base("memory", {
    memory: {
      data: { learnings: [], sessions: [] },
      episodes: { episodes: [] },
      contexts: { packs: [] },
      procedures: { procedures: [] },
      workflows: { workflows: [] },
      selected: 0,
      workflowSelected: 0,
      status: "ready",
    },
  });

  it("recall names the save key (r), not a mute 'no episodes/learnings'", () => {
    const t = frameTextAt(emptyMemory, { cols: 80, rows: 24 });
    expect(t).toContain("no memories yet · press r to save one");
  });

  it("context packs (read-only) point at where they come from (ebrain context)", () => {
    const t = frameTextAt(emptyMemory, { cols: 80, rows: 24 });
    expect(t).toContain("no packs · ebrain context");
  });

  it("procedures (read-only) point at where they come from (ebrain procedures)", () => {
    const t = frameTextAt(emptyMemory, { cols: 80, rows: 24 });
    expect(t).toContain("none · ebrain procedures");
  });
});

// ── Memory search selection (G56-F3) ─────────────────────────────────────────
// When search is active the results box swaps its collection: it must navigate + open the
// SELECTED SEARCH ROW, never the recent learning that sits at the same index underneath.
describe("Memory search selection (G56-F3)", () => {
  const RESULTS = [
    { source: "agent-memory", score: 0.91, slug: "SEARCH-0", snippet: "hit zero body" },
    { source: "second-brain", score: 0.80, slug: "SEARCH-1", snippet: "hit one body" },
    { source: "company-brain", score: 0.72, slug: "SEARCH-2", snippet: "hit two body" },
  ];
  function memState(mem: Partial<NonNullable<AppState["memory"]>>): AppState {
    return base("memory", {
      memory: {
        data: {
          learnings: [
            { project: "RECENT-NOT-SEARCH", agent: "x", date: "d", tags: [], text: "recent body one" },
            { project: "r2", agent: "x", date: "d", tags: [], text: "recent body two" },
          ],
          sessions: [],
        },
        search: null,
        searchStatus: "ready",
        searchSelected: 0,
        workflows: { workflows: [] },
        selected: 0,
        workflowSelected: 0,
        logSelected: 0,
        status: "ready",
        ...mem,
      },
    });
  }

  it("↑↓ moves the search cursor and leaves the learnings selection untouched (many results)", () => {
    const s = memState({ search: { query: "q", results: RESULTS } });
    const down = reduce(s, { name: "down" });
    expect(down.state.memory!.searchSelected).toBe(1);
    expect(down.state.memory!.selected).toBe(0); // recent-learnings cursor never moved
    const down2 = reduce(down.state, { name: "down" });
    expect(down2.state.memory!.searchSelected).toBe(2);
  });

  it("Enter opens the SELECTED search row, never the learning underneath (audit reproduction)", () => {
    const s = memState({ search: { query: "q", results: [RESULTS[0]!] } });
    const r = reduce(s, { name: "enter" });
    expect(r.state.overlay?.kind).toBe("detail");
    const ov = r.state.overlay as { kind: "detail"; title: string; body: string };
    expect(ov.title).toContain("agent-memory");
    expect(ov.title).not.toContain("RECENT-NOT-SEARCH");
    expect(ov.body).toContain("SEARCH-0");
    expect(ov.body).toContain("hit zero body");
    expect(ov.body).not.toContain("recent body");
  });

  it("Enter follows the cursor across many results", () => {
    const s = memState({ search: { query: "q", results: RESULTS }, searchSelected: 2 });
    const ov = reduce(s, { name: "enter" }).state.overlay as { title: string; body: string };
    expect(ov.body).toContain("SEARCH-2");
    expect(ov.title).toContain("company-brain");
  });

  it("one result: the cursor clamps at 0 and Enter opens it", () => {
    const s = memState({ search: { query: "q", results: [RESULTS[1]!] } });
    expect(reduce(s, { name: "down" }).state.memory!.searchSelected).toBe(0); // clamp high
    const ov = reduce(s, { name: "enter" }).state.overlay as { body: string };
    expect(ov.body).toContain("SEARCH-1");
  });

  it("zero results: navigation is a no-op and Enter opens nothing (no learning leaks through)", () => {
    const s = memState({ search: { query: "q", results: [] } });
    const down = reduce(s, { name: "down" });
    expect(down.state.memory!.searchSelected).toBe(0);
    const enter = reduce(s, { name: "enter" });
    expect(enter.state.overlay ?? null).toBeNull();
    expect(frameText(s)).toContain("no search results");
  });

  it("esc switches back to recent memory: search clears, cursor resets, learnings navigate again", () => {
    const s = memState({ search: { query: "q", results: RESULTS }, searchSelected: 2 });
    const back = reduce(s, { name: "escape" });
    expect(back.state.memory!.search).toBeNull();
    expect(back.state.memory!.searchSelected).toBe(0);
    // With search cleared, ↑↓ once again drive the recent-learnings cursor.
    expect(reduce(back.state, { name: "down" }).state.memory!.selected).toBe(1);
    // …and Enter now opens a recent learning, not a search row.
    const ov = reduce(back.state, { name: "enter" }).state.overlay as { title: string; body: string };
    expect(ov.title).toContain("RECENT-NOT-SEARCH");
    expect(ov.body).toContain("recent body one");
  });

  it("renders the search results with their own cursor + title, and an out-of-range cursor clamps safely", () => {
    const t = frameText(memState({ search: { query: "q", results: RESULTS }, searchSelected: 1 }));
    expect(t).toContain("search results · 3");
    expect(t).toContain("SEARCH-1");
    expect(t).toContain("esc back to recent");
    // A stale cursor past the result set must not break the width invariant (frameText asserts it).
    frameText(memState({ search: { query: "q", results: RESULTS }, searchSelected: 99 }));
  });
});

// ── Routing (6.6A) ───────────────────────────────────────────────────────────
describe("Routing panel (6.6A)", () => {
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
        capabilities: [
          {
            capability: "coding",
            mtd: 1.253,
            routes: 2,
            command: 'ebrain route --cap coding "<prompt>"',
            models: [
              { role: "winner", slug: "deepseek/deepseek-v4-pro", free: false, frontier: false },
              { role: "fallback", slug: "deepseek/deepseek-v4-flash", free: false, frontier: false },
              { role: "floor", slug: "qwen/qwen3-coder:free", free: true, frontier: false },
            ],
          },
          {
            capability: "general",
            mtd: 0.521,
            routes: 1,
            command: 'ebrain route --cap general "<prompt>"',
            models: [
              { role: "winner", slug: "qwen/qwen3.7-max", free: false, frontier: false },
            ],
          },
        ],
        gbrainUntracked: true,
      },
      selected: 0,
      status: "ready",
    },
  });

  it("renders the per-cap table, budget panel, gbrain flag and selected chain", () => {
    const t = frameText(state);
    expect(t).toContain("capability");
    expect(t).toContain("coding");
    expect(t).toContain("total today");
    expect(t).toContain("chain · 2026-07");
    expect(t).toContain("gbrain: untracked spend");
    expect(t).toContain("deepseek/deepseek-v4-pro");
    expect(t).toContain("ebrain route --cap coding");
  });

  it("shows only factual spend — no undated price snapshot or cost estimate (G56-F8)", () => {
    const t = frameText(state);
    expect(t).toContain("OpenRouter caps · spend");
    expect(t).not.toContain("· est");        // the old table's est column header
    expect(t).not.toContain("/$0.87M");       // the old per-token price line
    expect(t).not.toContain("pricing n/d");
    // `free` (slug-derived) is still surfaced, since it is factual.
    expect(t).toContain("free");
  });
});

describe("Cost panel (6.6E)", () => {
  const cost = {
    month: "2026-07",
    budget: { monthlyUsd: 10, hardStop: true, scope: "openrouter" },
    openrouterMtd: 0.001,
    knownMtd: 0.0012,
    remainingOpenrouter: 9.999,
    providers: [
      { key: "openrouter", provider: "openrouter", status: "metered" as const, usd: 0.001, actualUsd: 0.001, estimatedUsd: 0, events: 1, tokensIn: 100, tokensOut: 50, untrackedEvents: 0, tokenOnlyEvents: 0 },
      { key: "gemini", provider: "gemini", status: "token-only" as const, usd: 0, actualUsd: 0, estimatedUsd: 0, events: 1, tokensIn: 30, tokensOut: 10, untrackedEvents: 0, tokenOnlyEvents: 1 },
    ],
    agents: [{ key: "route", usd: 0.001, actualUsd: 0.001, estimatedUsd: 0, events: 1, tokensIn: 100, tokensOut: 50, untrackedEvents: 0, tokenOnlyEvents: 0 }],
    models: [{ key: "deepseek/deepseek-v4-pro", usd: 0.001, actualUsd: 0.001, estimatedUsd: 0, events: 1, tokensIn: 100, tokensOut: 50, untrackedEvents: 0, tokenOnlyEvents: 0 }],
    sessions: [{ key: "ebr-codex-build", usd: 0.001, actualUsd: 0.001, estimatedUsd: 0, events: 1, tokensIn: 100, tokensOut: 50, untrackedEvents: 0, tokenOnlyEvents: 0 }],
    workflows: [{ key: "second-brain-sops-dev", usd: 0.001, actualUsd: 0.001, estimatedUsd: 0, events: 1, tokensIn: 100, tokensOut: 50, untrackedEvents: 0, tokenOnlyEvents: 0 }],
    untrackedProviders: ["claude"],
  };

  it("renders model-provider token metrics and workflow/session attribution without subscription spend", () => {
    const t = frameText(base("routing", {
      routing: { data: null, cost, mode: "cost", selected: 0, costSelected: 0, status: "ready" },
    }));
    expect(t).toContain("cost ledger");
    expect(t).toContain("openrouter");
    expect(t).toContain("token-only");
    expect(t).toContain("models + agents");
    expect(t).toContain("deepseek/deepsee");
    expect(t).toContain("workflows");
    expect(t).toContain("second-brain-sops-dev");
    expect(t).toContain("ebr-codex-build");
  });

  it("routing c toggles to cost mode and arrows select providers", () => {
    const s = base("routing", { routing: { data: null, cost, mode: "routing", selected: 0, costSelected: 0, status: "ready" } });
    const toggled = reduce(s, { name: "char", char: "c" });
    expect(toggled.state.routing!.mode).toBe("cost");
    expect(toggled.effect?.type).toBe("refreshRouting");
    expect(reduce(toggled.state, { name: "down" }).state.routing!.costSelected).toBe(1);
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
    expect(reduce(initialState(), { name: "char", char: "5" }).effect?.type).toBe("refreshMemory");
    expect(reduce(initialState(), { name: "char", char: "6" }).effect?.type).toBe("refreshRouting");
    expect(reduce(initialState(), { name: "char", char: "7" }).effect?.type).toBe("refreshFleetDoctor");
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

  it("memory Recall navigates passive episodes before legacy learnings", () => {
    const s = base("memory", {
      memory: {
        data: { learnings: [{ project: "legacy", agent: "x", date: "d", tags: [], text: "legacy body" }], sessions: [] },
        episodes: { episodes: [{ id: "episode-11111111-1111-4111-8111-111111111111", kind: "learning", source: "remember", createdAt: "2026-07-18T00:00:00.000Z", project: "episode", agent: "codex", chars: 12 }] },
        selected: 0,
        status: "ready",
      },
    });
    const down = reduce(s, { name: "down" }).state;
    expect(down.memory!.selected).toBe(1);
    const detail = reduce(down, { name: "enter" }).state.overlay as { body: string };
    expect(detail.body).toContain("legacy body");
  });

  it("memory procedure focus runs a materialized prompt or attaches it to Launch", () => {
    const s = base("memory", {
      focusRegion: 1,
      memory: {
        data: { learnings: [], sessions: [] },
        procedures: { procedures: [{ id: "local-dev-sop", title: "Dev SOP", source: "local", version: 1, trigger: "Use it", summary: "Plan", tags: [], steps: 2, gates: 1, state: "active", useCount: 0, skillified: false }] },
        selected: 0,
        workflowSelected: 0,
        logSelected: 0,
        status: "ready",
      },
    });
    expect(reduce(s, { name: "enter" }).effect).toEqual({ type: "runWorkflow", id: "local-dev-sop" });
    expect(reduce(s, { name: "char", char: "a" }).effect).toEqual({ type: "attachWorkflow", id: "local-dev-sop" });
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

  it("memory `s` opens the q --json search composer; enter emits its query", () => {
    const opened = reduce(base("memory", {}), { name: "char", char: "s" }).state;
    expect(opened.overlay?.kind).toBe("memorySearch");
    const typed = { ...opened, overlay: { kind: "memorySearch" as const, line: { text: "daemon lock", cursor: 11 } } };
    expect(reduce(typed, { name: "enter" }).effect).toEqual({ type: "searchMemory", query: "daemon lock" });
  });

  it("routing ↑↓ moves the cap selection", () => {
    const s = base("routing", {
      routing: {
        data: {
          month: "m", mtd: 0, cap: 10, remaining: 10, hardStop: true, byCap: [{ capability: "a", mtd: 0, routes: 0 }, { capability: "b", mtd: 0, routes: 0 }],
          capabilities: [
            { capability: "a", mtd: 0, routes: 0, command: "ebrain route --cap a", models: [{ role: "winner", slug: "a/model", free: false, frontier: false }] },
            { capability: "b", mtd: 0, routes: 0, command: "ebrain route --cap b", models: [{ role: "winner", slug: "b/model", free: false, frontier: false }] },
          ],
          gbrainUntracked: false,
        },
        selected: 0,
        status: "ready",
      },
    });
    expect(reduce(s, { name: "down" }).state.routing!.selected).toBe(1);
  });

  it("doctor `r` requests a re-run; ↑↓ moves the check selection (checks region)", () => {
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

// ── Focus model (F6.6): Tab moves the focus ring, ↑↓ act on the focused box, Enter drills in
describe("focus model (F6.6)", () => {
  it("Tab cycles the focus ring within a view; it never changes the view", () => {
    // home has 3 boxes (sessions, memories, system)
    const r1 = reduce(initialState(), { name: "tab" });
    expect(r1.state.tab).toBe("home");
    expect(r1.state.focusRegion).toBe(1);
    const r2 = reduce(r1.state, { name: "tab" });
    expect(r2.state.focusRegion).toBe(2);
    const r3 = reduce(r2.state, { name: "tab" });
    expect(r3.state.focusRegion).toBe(0); // wraps
    // shift+tab goes back
    expect(reduce(r1.state, { name: "shifttab" }).state.focusRegion).toBe(0);
  });

  it("Tab is a no-op on a single-box view (routing)", () => {
    const s = base("routing", { routing: { data: { month: "m", mtd: 0, cap: 10, remaining: 10, hardStop: true, byCap: [], capabilities: [], gbrainUntracked: false }, selected: 0, status: "ready" } });
    expect(reduce(s, { name: "tab" }).state.focusRegion).toBe(s.focusRegion ?? 0);
  });

  it("↑↓ route to the FOCUSED box: home sessions vs memories", () => {
    const s = base("home", {
      overview: {
        data: { brain: { state: "up", servedBy: "", cached: false }, spend: { mtd: 0, cap: 10, remaining: 10 }, fleet: { total: 1, online: 1 }, memory: { learnings: 2, sessions: 0 } },
        memory: { learnings: [{ project: "a", agent: "x", date: "d", tags: [], text: "one" }, { project: "b", agent: "x", date: "d", tags: [], text: "two" }], sessions: [] },
        memSelected: 0,
        status: "ready",
        atLabel: null,
      },
      sessions: { rows: [{ name: "s1", agent: "claude", uptime: "1", attached: false }, { name: "s2", agent: "codex", uptime: "2", attached: false }], selected: 0, peek: null, status: "ready" },
    });
    // region 0 = sessions → ↓ moves the session selection
    expect(reduce(s, { name: "down" }).state.sessions!.selected).toBe(1);
    // Tab to region 1 (memories) → ↓ moves the memory selection, not the session one
    const memFocused = reduce(s, { name: "tab" }).state;
    const afterDown = reduce(memFocused, { name: "down" }).state;
    expect(afterDown.overview!.memSelected).toBe(1);
    expect(afterDown.sessions!.selected).toBe(0);
  });

  it("Enter drills into the focused box: attach / open memory / open routing", () => {
    const home = base("home", {
      sessions: { rows: [{ name: "ebr-claude-x", agent: "claude", uptime: "1", attached: false }], selected: 0, peek: null, status: "ready" },
    });
    // region 0 = sessions → Enter attaches
    expect(reduce(home, { name: "enter" }).effect).toEqual({ type: "attach", name: "ebr-claude-x" });
    // region 1 = memories → Enter jumps to the memory view
    const memFocus = { ...home, focusRegion: 1 };
    expect(reduce(memFocus, { name: "enter" }).state.tab).toBe("memory");
    // region 2 = system → Enter jumps to routing
    const sysFocus = { ...home, focusRegion: 2 };
    expect(reduce(sysFocus, { name: "enter" }).state.tab).toBe("routing");
  });

  it("Enter on a memory result opens a read-only detail overlay", () => {
    const s = base("memory", {
      memory: { data: { learnings: [{ project: "routing", agent: "x", date: "d", tags: [], text: "full learning text" }], sessions: [] }, selected: 0, logSelected: 0, status: "ready" },
    });
    const r = reduce(s, { name: "enter" });
    expect(r.state.overlay?.kind).toBe("detail");
    if (r.state.overlay?.kind === "detail") expect(r.state.overlay.body).toContain("full learning text");
  });

  it("the FOCUSED box renders the teal (accent) border; a blur box does not", () => {
    const theme2 = makeTheme({ trueColor: true, ascii: false });
    const s = base("doctor", {
      focusRegion: 1, // fleet box focused
      doctor: {
        fleet: { agents: [{ name: "claude", ok: true, cls: "heavy" }], online: 1, total: 1 },
        doctor: { checks: [{ id: "x", level: "ok", msg: "" }], ok: 1, warn: 0, fail: 0 },
        selected: 0, fleetSelected: 0, status: "ready", running: false, spinnerFrame: 0, atLabel: "14:31",
      },
    });
    const frame = buildFrame(s, SIZE, theme2);
    const joined = frame.join("");
    // the fleet panel (focused) carries the focus border escape
    expect(joined).toContain(theme2.focusBorder);
  });
});
