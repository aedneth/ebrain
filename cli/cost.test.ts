import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
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
