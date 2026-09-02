import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  appendAdapterEvent,
  buildCostReport,
  makeAdapterEvent,
  normalizeAdapterRecord,
  normalizeRouteRecord,
} from "./cost.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ebrain-cost-"));
}

describe("cost ledger v2", () => {
  test("normalizes legacy route spend as actual OpenRouter usage", () => {
    const event = normalizeRouteRecord({
      ts: "2026-07-15T12:00:00.000Z", src: "route", cap: "coding", model: "deepseek/deepseek-v4-pro",
      tokens_in: 120, tokens_out: 80, usd: 0.0012,
    });
    expect(event).toMatchObject({ provider: "openrouter", agent: "route", capability: "coding", cost_kind: "actual", source: "route" });
    expect(event?.tokens_out).toBe(80);
  });

  test("marks missing OpenRouter usage.cost as estimated, never free", () => {
    const event = normalizeRouteRecord({ ts: "2026-07-15T12:00:00.000Z", usd: 0.0004, usd_estimated: true });
    expect(event?.cost_kind).toBe("estimated");
    expect(event?.usd).toBe(0.0004);
  });

  test("normalizes adapter tokens without inventing USD", () => {
    const event = normalizeAdapterRecord({
      ts: "2026-07-15T12:00:00.000Z", provider: "gemini", model: "gemini-2.5-flash", tokens_in: 100, tokens_out: 40,
    });
    expect(event).toMatchObject({ provider: "gemini", usd: null, cost_kind: "token-only", source: "adapter" });
  });

  test("builds provider/agent/model/session/workflow breakdowns without applying cap to other providers", () => {
    const report = buildCostReport(
      [
        { ts: "2026-07-15T12:00:00.000Z", cap: "coding", model: "deepseek/deepseek-v4-pro", tokens_in: 100, tokens_out: 50, usd: 0.001 },
        { ts: "2026-06-30T12:00:00.000Z", cap: "coding", model: "ignored", usd: 9 },
      ],
      [
        { ts: "2026-07-15T12:01:00.000Z", provider: "openai", agent: "gbrain", model: "text-embedding-3-large", tokens_in: 300, tokens_out: 0, usd: 0.0002, workflow: "embed-vault" },
        { ts: "2026-07-15T12:02:00.000Z", provider: "claude", agent: "claude", session: "ebr-claude-audit", workflow: "review", tokens_in: 500, tokens_out: 200, cost_kind: "token-only" },
      ],
      { month: "2026-07", budget: { monthly_usd: 10, hard_stop: true }, limit: 10 },
    );
    expect(report.openrouter_mtd).toBe(0.001);
    expect(report.known_mtd).toBe(0.0012);
    expect(report.remaining_openrouter).toBe(9.999);
    expect(report.providers.find((p) => p.provider === "openai")?.status).toBe("metered");
    expect(report.providers.find((p) => p.provider === "claude")?.status).toBe("token-only");
    expect(report.workflows.find((w) => w.key === "embed-vault")?.usd).toBe(0.0002);
    expect(report.sessions.find((s) => s.key === "ebr-claude-audit")?.token_only_events).toBe(1);
    expect(report.untracked_providers).not.toContain("claude");
  });

  test("engine lane defaults to unobserved/zero when no engine spend is supplied", () => {
    const report = buildCostReport(
      [{ ts: "2026-07-15T12:00:00.000Z", cap: "coding", usd: 0.001 }],
      [],
      { month: "2026-07", budget: { monthly_usd: 10, hard_stop: true } },
    );
    expect(report.engine).toEqual({ usd: 0, observed: false, partiallyObserved: false });
  });

  test("engine lane folds in a supplied EngineSpend, independent of the OpenRouter/adapter lanes", () => {
    const report = buildCostReport(
      [{ ts: "2026-07-15T12:00:00.000Z", cap: "coding", usd: 0.001 }],
      [],
      {
        month: "2026-07",
        budget: { monthly_usd: 10, hard_stop: true },
        engine: { usd: 0.0421, observed: true, partiallyObserved: true, files: 2, lines: 10, skipped: 1 },
      },
    );
    expect(report.engine).toEqual({ usd: 0.0421, observed: true, partiallyObserved: true });
    // engine spend is a separate lane — it never leaks into the OpenRouter-scoped cap fields.
    expect(report.openrouter_mtd).toBe(0.001);
    expect(report.remaining_openrouter).toBe(9.999);
  });

  test("explicit adapter event validates identifiers and persists with private permissions", async () => {
    const dir = tmp();
    const path = join(dir, "ledger", "cost.jsonl");
    try {
      const event = makeAdapterEvent({ provider: "gemini", agent: "gemini", model: "gemini-2.5-flash", tokens_in: 10, tokens_out: 3 });
      expect(event.cost_kind).toBe("token-only");
      await appendAdapterEvent(event, path);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(statSync(join(dir, "ledger")).mode & 0o777).toBe(0o700);
      expect(readFileSync(path, "utf8")).toContain('"provider":"gemini"');
      expect(() => makeAdapterEvent({ provider: "bad provider" })).toThrow("provider inválido");
      expect(() => makeAdapterEvent({ provider: "gemini", tokens_in: 1, usd: 0.1, kind: "token-only" })).toThrow("token-only/untracked no admite usd");
      expect(() => makeAdapterEvent({ provider: "openai", kind: "actual" })).toThrow("actual/estimated requiere usd");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("provider attribution beyond a single lane", () => {
  test("a route record stamped with its provider is attributed there, not to the historical lane", () => {
    const event = normalizeRouteRecord({
      ts: "2026-08-15T12:00:00.000Z", src: "route", provider: "groq", cap: "coding",
      model: "llama-3.3-70b", tokens_in: 10, tokens_out: 5, usd: 0.0002,
    });
    expect(event?.provider).toBe("groq");
  });

  test("a record predating provider stamping keeps its historical attribution", () => {
    // Dropping these into "unknown" would rewrite spend history that is not wrong.
    const event = normalizeRouteRecord({ ts: "2026-06-01T00:00:00.000Z", usd: 0.01 });
    expect(event?.provider).toBe("openrouter");
  });

  test("the cap is measured against the provider routing.yaml points at", () => {
    const report = buildCostReport(
      [
        { ts: "2026-08-15T00:00:00.000Z", provider: "groq", usd: 2, tokens_in: 1, tokens_out: 1 },
        { ts: "2026-08-15T01:00:00.000Z", provider: "openrouter", usd: 7, tokens_in: 1, tokens_out: 1 },
      ],
      [],
      { month: "2026-08", budget: { monthly_usd: 10, hard_stop: true }, routedProvider: "groq" },
    );
    expect(report.routed_provider).toBe("groq");
    expect(report.routed_mtd).toBe(2);
    expect(report.remaining_routed).toBe(8);
    expect(report.budget.scope).toBe("groq");
    // The retained fields stay literally true about the OpenRouter lane.
    expect(report.openrouter_mtd).toBe(7);
  });

  test("defaults to the historical lane when no provider is named", () => {
    const report = buildCostReport(
      [{ ts: "2026-08-15T00:00:00.000Z", usd: 3, tokens_in: 1, tokens_out: 1 }],
      [],
      { month: "2026-08", budget: { monthly_usd: 10, hard_stop: true } },
    );
    expect(report.routed_provider).toBe("openrouter");
    expect(report.routed_mtd).toBe(3);
  });

  test("every registry provider is listed at zero rather than omitted", () => {
    const report = buildCostReport([], [], { month: "2026-08", routedProvider: "mistral" });
    const ids = report.providers.map((row) => row.provider);
    for (const id of ["openrouter", "groq", "mistral", "xai", "ollama"]) expect(ids).toContain(id);
    // Nothing may be called "metered" before an event exists unless it reports real USD.
    expect(report.providers.find((row) => row.provider === "groq")!.status).toBe("untracked");
    expect(report.providers.find((row) => row.provider === "openrouter")!.status).toBe("metered");
  });
});

describe("the human report", () => {
  test("names the provider the cap governs instead of a hardcoded lane", () => {
    // The first line was made to follow routing.yaml; the line under it still said the cap applied
    // to OpenRouter, which is false the moment the config points anywhere else.
    const home = tmp();
    try {
      const cfg = join(home, ".config", "ebrain");
      mkdirSync(cfg, { recursive: true });
      writeFileSync(join(cfg, "routing.yaml"), [
        "budget: { monthly_usd: 5, hard_stop: true, log: ~/.config/ebrain/spend.jsonl }",
        "provider: { id: groq }",
        "capabilities: { general: { models: [vendor/model-a] } }",
        "",
      ].join("\n"));
      const proc = Bun.spawnSync(["bun", "run", join(import.meta.dir, "cost.ts")], {
        env: { PATH: process.env.PATH ?? "", HOME: home },
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = proc.stdout.toString();
      expect(proc.exitCode).toBe(0);
      expect(out).toContain("groq $0.0000 / cap $5");
      expect(out).toContain("cap aplica solo a groq");
      expect(out).not.toContain("cap aplica solo a OpenRouter");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
