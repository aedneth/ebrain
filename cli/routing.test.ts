import { describe, expect, test } from "bun:test";
import { buildRoutingOverview } from "./routing.ts";

describe("routing overview contract", () => {
  test("exposes OpenRouter chains as operable capability rows", () => {
    const payload = buildRoutingOverview(
      {
        budget: { monthly_usd: 10, hard_stop: true, log: "/tmp/spend.jsonl" },
        capabilities: {
          coding: { models: ["deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash", "qwen/qwen3-coder:free"] },
          terminal: { models: ["qwen/qwen3.7-max", "qwen/qwen3.7-plus", "qwen/qwen3.5-flash-02-23"] },
        },
      },
      [{ capability: "coding", mtd: 0.125, routes: 2 }],
      0.25,
      "2026-07",
    );

    expect(payload.month).toBe("2026-07");
    expect(payload.remaining).toBe(9.75);
    expect(payload.gbrain_untracked).toBe(true);

    const coding = payload.capabilities.find((c) => c.capability === "coding")!;
    expect(coding.command).toBe('ebrain route --cap coding "<prompt>"');
    expect(coding.mtd).toBe(0.125);
    expect(coding.routes).toBe(2);
    expect(coding.est_typical_usd).not.toBeNull();
    expect(coding.models.map((m) => m.role)).toEqual(["winner", "fallback", "floor"]);
    expect(coding.models[0].pricing).toEqual({ input_per_m: 0.435, output_per_m: 0.87 });
    expect(coding.models[2].free).toBe(true);

    const terminal = payload.capabilities.find((c) => c.capability === "terminal")!;
    expect(terminal.mtd).toBe(0);
    expect(terminal.routes).toBe(0);
  });
});
