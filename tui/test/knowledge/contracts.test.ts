/**
 * tui/test/knowledge/contracts.test.ts — SPRINT-TUI 6.5 knowledge-panel parsers.
 *
 * Pure fixtures only (no ebrain, no network, no brain, no tmux — spec 6.5.6): each
 * fixture is a verbatim shape captured from the real `ebrain <sub> --json` output, so a
 * contract drift in the CLI would surface as a failing assert here (and in the F6.1
 * contract suite). Also asserts the DEFENSIVE path: malformed / missing fields never
 * throw — they degrade to safe defaults or null.
 *
 * Run: bun test ./tui/test/knowledge/contracts.test.ts
 */
import { test, expect, describe } from "bun:test";
import {
  parseStatus,
  parseFleet,
  parseDoctor,
  parseSpend,
  parseMemory,
} from "../../src/knowledge/contracts.ts";

describe("parseStatus (status --json)", () => {
  const fx = {
    brain: { state: "up", served_by: "mcp:8541", sources: [], cached: true },
    spend: { mtd: 0.0116, cap: 10, remaining: 9.9884 },
    fleet: {
      agents: [
        { name: "claude", ok: true },
        { name: "gemini", ok: false },
        { name: "codex", ok: true },
      ],
    },
    memory: { learnings: 5, sessions: 39 },
  };

  test("normalizes the real shape", () => {
    const d = parseStatus(fx)!;
    expect(d.brain.state).toBe("up");
    expect(d.brain.servedBy).toBe("mcp:8541");
    expect(d.brain.cached).toBe(true);
    expect(d.spend).toEqual({ mtd: 0.0116, cap: 10, remaining: 9.9884 });
    expect(d.fleet).toEqual({ total: 3, online: 2 }); // gemini ok:false
    expect(d.memory).toEqual({ learnings: 5, sessions: 39 });
  });

  test("defensive: junk / missing fields never throw", () => {
    expect(parseStatus(null)).toBeNull();
    expect(parseStatus("nope")).toBeNull();
    expect(parseStatus([])).toBeNull();
    const partial = parseStatus({})!;
    expect(partial.brain.state).toBe("unknown");
    expect(partial.fleet).toEqual({ total: 0, online: 0 });
    expect(partial.spend.cap).toBe(10); // default cap
  });
});

describe("parseFleet (fleet --json)", () => {
  const fx = {
    agents: [
      { name: "claude", ok: true, class: "heavy" },
      { name: "gemini", ok: false, class: "light" },
      { name: "generic", ok: true, class: "light" },
      { name: "weird", ok: true, class: "??" },
    ],
  };
  test("maps class + counts online", () => {
    const d = parseFleet(fx)!;
    expect(d.total).toBe(4);
    expect(d.online).toBe(3);
    expect(d.agents[0]).toEqual({ name: "claude", ok: true, cls: "heavy" });
    expect(d.agents[3]!.cls).toBe("unknown"); // unrecognized class -> unknown
  });
  test("defensive", () => {
    expect(parseFleet(42)).toBeNull();
    expect(parseFleet({})!.agents).toEqual([]);
  });
});

describe("parseDoctor (doctor --json)", () => {
  const fx = {
    checks: [
      { id: "tmux", level: "ok", msg: "5 sesiones" },
      { id: "openai", level: "warn", msg: "latencia 2.4s" },
      { id: "deepseek", level: "fail", msg: "inestable" },
      { id: "mystery", level: "???", msg: "" },
    ],
  };
  test("counts by level; unknown level -> warn", () => {
    const d = parseDoctor(fx)!;
    expect(d.checks.length).toBe(4);
    expect(d.ok).toBe(1);
    expect(d.warn).toBe(2); // openai + mystery(coerced)
    expect(d.fail).toBe(1);
    expect(d.checks[3]!.level).toBe("warn");
  });
  test("defensive", () => {
    expect(parseDoctor(null)).toBeNull();
    expect(parseDoctor({})!.checks).toEqual([]);
  });
});

describe("parseSpend (spend --json)", () => {
  const fx = {
    month: "2026-07",
    budget: { monthly_usd: 10, hard_stop: true },
    mtd: 0.011589,
    remaining: 9.988411,
    by_capability: [
      { capability: "general", mtd: 0.005213, routes: 2 },
      { capability: "coding", mtd: 0.001253, routes: 2 },
      { capability: "terminal", mtd: 0, routes: 0 },
    ],
    gbrain_untracked: true,
  };
  test("normalizes budget + caps + flag", () => {
    const d = parseSpend(fx)!;
    expect(d.month).toBe("2026-07");
    expect(d.cap).toBe(10);
    expect(d.hardStop).toBe(true);
    expect(d.gbrainUntracked).toBe(true);
    expect(d.byCap.length).toBe(3);
    expect(d.byCap[0]).toEqual({ capability: "general", mtd: 0.005213, routes: 2 });
  });
  test("defensive: missing budget -> default cap 10, no throw", () => {
    expect(parseSpend([])).toBeNull();
    const p = parseSpend({ mtd: 1 })!;
    expect(p.cap).toBe(10);
    expect(p.byCap).toEqual([]);
    expect(p.gbrainUntracked).toBe(false);
  });
});

describe("parseMemory (memory recent --json)", () => {
  const fx = {
    learnings: [
      {
        project: "ebrain",
        agent: "unknown",
        date: "2026-07-14",
        tags: ["learning", "ebrain"],
        text: "scrubber debe cubrir _KEY genérico",
      },
    ],
    sessions: [
      {
        ts: "2026-07-14T12:45:46Z",
        project: "second-brain",
        agent: "unknown",
        commit: "48238bd",
        summary: "symlink a repo cliente -> deny-client rc=2",
      },
    ],
  };
  test("normalizes learnings + sessions", () => {
    const d = parseMemory(fx)!;
    expect(d.learnings.length).toBe(1);
    expect(d.learnings[0]!.tags).toEqual(["learning", "ebrain"]);
    expect(d.sessions[0]!.commit).toBe("48238bd");
    expect(d.sessions[0]!.summary).toContain("deny-client");
  });
  test("defensive", () => {
    expect(parseMemory(null)).toBeNull();
    const p = parseMemory({})!;
    expect(p.learnings).toEqual([]);
    expect(p.sessions).toEqual([]);
  });
});
