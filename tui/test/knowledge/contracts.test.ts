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
  parseRouting,
  parseTaskProfile,
  parseRouteRun,
  parseMemory,
  parseWorkflows,
  parseWorkflowRun,
  parseCost,
  parseSearch,
  parseWorkspaces,
  parseWorkspaceValidation,
  parseWorkspaceMutation,
  parseWorkspaceRemoval,
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

describe("parseRouting (routing --json)", () => {
  test("normalizes chains to factual fields only — no price snapshot survives (G56-F8)", () => {
    const d = parseRouting({
      month: "2026-07",
      budget: { monthly_usd: 10, hard_stop: true },
      mtd: 0.014,
      remaining: 9.986,
      gbrain_untracked: true,
      capabilities: [{
        capability: "coding",
        mtd: 0.001,
        routes: 2,
        command: 'ebrain route --cap coding "<prompt>"',
        // Even if a stale producer emits pricing/est, the parser must drop them.
        est_typical_usd: 0.0026,
        models: [
          { role: "winner", slug: "deepseek/deepseek-v4-pro", free: false, frontier: false, pricing: { input_per_m: 0.435, output_per_m: 0.87 } },
          { role: "floor", slug: "qwen/qwen3-coder:free", free: true, frontier: false, pricing: { input_per_m: 0, output_per_m: 0 } },
        ],
      }],
    })!;
    expect(d.capabilities[0]!.models[0]).toEqual({ role: "winner", slug: "deepseek/deepseek-v4-pro", free: false, frontier: false });
    expect(d.capabilities[0]!.models[0]).not.toHaveProperty("pricing");
    expect(d.capabilities[0]!).not.toHaveProperty("estTypicalUsd");
    expect(d.byCap[0]).toEqual({ capability: "coding", mtd: 0.001, routes: 2 });
  });
});

describe("parseTaskProfile / parseRouteRun", () => {
  test("normalizes Task Profile output without a recommendation", () => {
    const d = parseTaskProfile({
      task: "Summarize transcripts",
      signals: [{ capability: "long_context", matched: ["summarize", "transcript"] }],
      selected_capability: "long_context",
      compatible_targets: ["manual-session", "openrouter-one-shot"],
      disclaimer: "Signals only.",
    })!;
    expect(d.selectedCapability).toBe("long_context");
    expect(d.signals[0]!.matched).toEqual(["summarize", "transcript"]);
    expect(d.compatibleTargets).toContain("openrouter-one-shot");
  });

  test("normalizes route result", () => {
    const d = parseRouteRun({
      ts: "2026-07-15T00:00:00Z",
      cap: "coding",
      model: "deepseek/deepseek-v4-pro",
      tokens_in: 10,
      tokens_out: 5,
      usd: 0.0001,
      content: "ok",
    })!;
    expect(d.tokensIn).toBe(10);
    expect(d.estimated).toBe(false);
    expect(d.content).toBe("ok");
  });
});

describe("workspace registry contracts", () => {
  test("accepts a complete schema-v1 registry and rejects malformed rows", () => {
    expect(parseWorkspaces({ schema_version: 1, workspaces: [{ id: "my-project", label: "My Project", cwd: "/tmp/project" }] }))
      .toEqual({ schemaVersion: 1, workspaces: [{ id: "my-project", label: "My Project", cwd: "/tmp/project" }] });
    expect(parseWorkspaces({ schema_version: 1, workspaces: [{ id: "bad", label: "Bad", cwd: "relative" }] })).toBeNull();
    expect(parseWorkspaces({ schema_version: 2, workspaces: [] })).toBeNull();
  });

  test("accepts only canonical validation and mutation output shapes", () => {
    expect(parseWorkspaceValidation({ ok: true, cwd: "/tmp/project" })).toEqual({ cwd: "/tmp/project" });
    expect(parseWorkspaceValidation({ ok: true, cwd: "relative" })).toBeNull();
    expect(parseWorkspaceMutation({ ok: true, workspace: { id: "project", label: "Project", cwd: "/tmp/project" } }))
      .toEqual({ id: "project", label: "Project", cwd: "/tmp/project" });
    expect(parseWorkspaceMutation({ ok: true, workspace: { label: "missing" } })).toBeNull();
    expect(parseWorkspaceRemoval({ ok: true, removed: "project" })).toEqual({ removed: "project" });
    expect(parseWorkspaceRemoval({ ok: true, removed: "../../bad" })).toBeNull();
  });
});

describe("parseSearch (q --json)", () => {
  test("normalizes cross-source result rows", () => {
    expect(parseSearch({ query: "daemon lock", results: [{ score: 0.91, source: "agent-memory", slug: "learning-1", snippet: "Use the daemon" }] })).toEqual({ query: "daemon lock", results: [{ score: 0.91, source: "agent-memory", slug: "learning-1", snippet: "Use the daemon" }] });
    expect(parseSearch({ query: "x", results: [{ source: "", slug: "bad" }] })?.results).toEqual([]);
  });

  // G56-F4 — the snippet/slug are scrubbed at THIS boundary before storage/render, even if a
  // producer regresses and emits a raw secret. Assignment (KV), provider-token and PEM shapes.
  test("scrubs an assignment (NAME=value) secret in the snippet", () => {
    const row = parseSearch({ query: "env", results: [{ score: 0.5, source: "s", slug: "note", snippet: "config: OPENAI_API_KEY=sk-proj-Ab12Cd34Ef56Gh78Ij90Kl leaked" }] })?.results[0];
    expect(row?.snippet).not.toContain("sk-proj-Ab12Cd34Ef56Gh78Ij90Kl");
    expect(row?.snippet).toContain("[REDACTED]");
  });

  test("scrubs a provider token shape anywhere in the snippet or slug", () => {
    const bySnippet = parseSearch({ query: "t", results: [{ score: 0.5, source: "s", slug: "note", snippet: "the pane printed sk-ant-abcd1234efgh mid-line" }] })?.results[0];
    expect(bySnippet?.snippet).not.toContain("sk-ant-abcd1234efgh");
    expect(bySnippet?.snippet).toContain("[REDACTED]");
    const bySlug = parseSearch({ query: "t", results: [{ score: 0.5, source: "s", slug: "ghp_ABCDEFGHIJKLMNOPQRST1234", snippet: "ok" }] })?.results[0];
    expect(bySlug?.slug).not.toContain("ghp_ABCDEFGHIJKLMNOPQRST1234");
    expect(bySlug?.slug).toContain("[REDACTED]");
  });

  test("scrubs a PEM private-key block bleeding into the snippet", () => {
    const row = parseSearch({ query: "key", results: [{ score: 0.5, source: "s", slug: "note", snippet: "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAbase64blob\n-----END RSA PRIVATE KEY-----" }] })?.results[0];
    expect(row?.snippet).toContain("[REDACTED PRIVATE KEY]");
    expect(row?.snippet).not.toContain("MIIEpAIBAAKCAQEAbase64blob");
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

describe("parseWorkflows (workflows list/run --json)", () => {
  const workflow = {
    id: "second-brain-structured-agentic-development",
    title: "Structured Agentic Development",
    source: "second-brain",
    version: 3,
    trigger: "Use when building software.",
    summary: "Plan, implement, verify and audit.",
    tags: ["workflow", "sop"],
    steps: 4,
    gates: 2,
  };

  test("normalizes summaries and ignores malformed rows", () => {
    const d = parseWorkflows({ workflows: [workflow, { id: "missing-title" }] })!;
    expect(d.workflows).toHaveLength(1);
    expect(d.workflows[0]!.title).toBe("Structured Agentic Development");
    expect(d.workflows[0]!.steps).toBe(4);
  });

  test("normalizes a materialized prompt without treating it as execution", () => {
    const d = parseWorkflowRun({
      id: workflow.id,
      title: workflow.title,
      version: 3,
      prompt: "Use ebrain workflow: Structured Agentic Development",
      checklist: ["1. Plan", "Gate: tests"],
    })!;
    expect(d.prompt).toContain("Use ebrain workflow");
    expect(d.checklist).toHaveLength(2);
    expect(parseWorkflowRun({ id: "x", title: "x" })).toBeNull();
  });
});

describe("parseCost (cost --json)", () => {
  test("normalizes known USD separately from token-only provider usage", () => {
    const d = parseCost({
      schema_version: 2,
      month: "2026-07",
      budget: { monthly_usd: 10, hard_stop: true, scope: "openrouter" },
      openrouter_mtd: 0.001,
      known_mtd: 0.0012,
      remaining_openrouter: 9.999,
      providers: [
        { key: "openrouter", provider: "openrouter", status: "metered", usd: 0.001, actual_usd: 0.001, estimated_usd: 0, events: 1, tokens_in: 100, tokens_out: 50, untracked_events: 0, token_only_events: 0 },
        { key: "gemini", provider: "gemini", status: "token-only", usd: 0, actual_usd: 0, estimated_usd: 0, events: 1, tokens_in: 30, tokens_out: 10, untracked_events: 0, token_only_events: 1 },
      ],
      agents: [], models: [], sessions: [], workflows: [], untracked_providers: ["claude"], entries: [],
    })!;
    expect(d.providers[0]!.actualUsd).toBe(0.001);
    expect(d.providers[1]!.status).toBe("token-only");
    expect(d.providers[1]!.tokensIn + d.providers[1]!.tokensOut).toBe(40);
    expect(d.untrackedProviders).toEqual(["claude"]);
  });
});
