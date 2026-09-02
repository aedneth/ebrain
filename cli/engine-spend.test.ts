import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readEngineSpend } from "./engine-spend.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ebrain-engine-spend-"));
}

function write(dir: string, name: string, lines: string[]): void {
  writeFileSync(join(dir, name), lines.join("\n") + "\n");
}

describe("readEngineSpend", () => {
  test("absent dir: usd 0, observed false", () => {
    const dir = tmp();
    const missing = join(dir, "does-not-exist");
    const result = readEngineSpend(missing);
    expect(result).toEqual({
      usd: 0,
      observed: false,
      partiallyObserved: false,
      files: 0,
      lines: 0,
      skipped: 0,
    });
    rmSync(dir, { recursive: true, force: true });
  });

  test("empty dir (exists, literally no entries): usd 0, observed false", () => {
    const dir = tmp(); // mkdtempSync already creates it empty — nothing else to do
    const result = readEngineSpend(dir);
    expect(result).toEqual({
      usd: 0,
      observed: false,
      partiallyObserved: false,
      files: 0,
      lines: 0,
      skipped: 0,
    });
    rmSync(dir, { recursive: true, force: true });
  });

  test("empty dir (exists, no matching files): usd 0, observed false", () => {
    const dir = tmp();
    // Directory exists but has nothing budget-related in it.
    writeFileSync(join(dir, "unrelated.txt"), "hello\n");
    const result = readEngineSpend(dir);
    expect(result.observed).toBe(false);
    expect(result.usd).toBe(0);
    expect(result.files).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("valid budget-*.jsonl lines are summed from record events", () => {
    const dir = tmp();
    write(dir, "budget-2026-W21.jsonl", [
      JSON.stringify({
        schema_version: 1,
        ts: "2026-05-20T10:00:00.000Z",
        event: "reserve",
        label: "think",
        kind: "chat",
        model: "claude-opus-4-7",
        projected_cost_usd: 0.05,
        cumulative_cost_usd: 0,
        max_cost_usd: null,
      }),
      JSON.stringify({
        schema_version: 1,
        ts: "2026-05-20T10:00:01.000Z",
        event: "record",
        label: "think",
        kind: "chat",
        model: "claude-opus-4-7",
        input_tokens: 1000,
        output_tokens: 200,
        embedding_dims: null,
        actual_cost_usd: 0.045,
        cumulative_cost_usd: 0.045,
        max_cost_usd: null,
      }),
      JSON.stringify({
        schema_version: 1,
        ts: "2026-05-20T10:00:02.000Z",
        event: "record",
        label: "think",
        kind: "chat",
        model: "claude-haiku-4-5",
        input_tokens: 500,
        output_tokens: 100,
        embedding_dims: null,
        actual_cost_usd: 0.005,
        cumulative_cost_usd: 0.05,
        max_cost_usd: null,
      }),
    ]);

    const result = readEngineSpend(dir);
    expect(result.observed).toBe(true);
    expect(result.partiallyObserved).toBe(false);
    expect(result.files).toBe(1);
    expect(result.lines).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.usd).toBeCloseTo(0.05, 6);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a corrupt line is skipped and sets partiallyObserved, valid lines still summed", () => {
    const dir = tmp();
    const validRecord = JSON.stringify({
      schema_version: 1,
      event: "record",
      model: "claude-opus-4-7",
      actual_cost_usd: 0.02,
      cumulative_cost_usd: 0.02,
    });
    writeFileSync(
      join(dir, "budget-2026-W22.jsonl"),
      [
        validRecord,
        "{not valid json at all",
        JSON.stringify({ schema_version: 1, event: "record", model: "x" }), // missing cost field
        "",
      ].join("\n"),
    );

    const result = readEngineSpend(dir);
    expect(result.observed).toBe(true);
    expect(result.partiallyObserved).toBe(true);
    expect(result.files).toBe(1);
    expect(result.lines).toBe(3); // blank trailing line not counted
    expect(result.skipped).toBe(2); // malformed JSON + missing cost field
    expect(result.usd).toBeCloseTo(0.02, 6);
    rmSync(dir, { recursive: true, force: true });
  });

  test("mixed budget-* and dream-budget-* files are both parsed and summed", () => {
    const dir = tmp();
    write(dir, "budget-2026-W23.jsonl", [
      JSON.stringify({
        schema_version: 1,
        event: "record",
        model: "claude-opus-4-7",
        actual_cost_usd: 0.03,
        cumulative_cost_usd: 0.03,
      }),
    ]);
    write(dir, "dream-budget-2026-W23.jsonl", [
      JSON.stringify({
        schema_version: 1,
        phase: "auto_think",
        event: "submit",
        model: "claude-haiku-4-5-20251001",
        label: "verdict",
        estimated_cost_usd: 0.0035,
        cumulative_cost_usd: 0.0035,
        budget_usd: 1.0,
      }),
      JSON.stringify({
        schema_version: 1,
        phase: "auto_think",
        event: "submit_denied",
        model: "claude-opus-4-7",
        label: "big-call",
        estimated_cost_usd: 0.5,
        cumulative_cost_usd: 0.0035,
        budget_usd: 0.01,
      }),
      JSON.stringify({
        schema_version: 1,
        phase: "drift",
        event: "submit_unpriced",
        model: "gpt-5",
        label: "unpriced",
        estimated_input_tokens: 1000,
        max_output_tokens: 1000,
      }),
    ]);

    const result = readEngineSpend(dir);
    expect(result.observed).toBe(true);
    expect(result.files).toBe(2);
    expect(result.lines).toBe(4);
    expect(result.skipped).toBe(0);
    // submit_denied contributes nothing (blocked, no spend); submit_unpriced
    // contributes nothing to usd but does flag partiallyObserved.
    expect(result.usd).toBeCloseTo(0.03 + 0.0035, 6);
    expect(result.partiallyObserved).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("unpriced/denied events alone: observed true, usd 0, partiallyObserved reflects unpriced only", () => {
    const dir = tmp();
    write(dir, "budget-2026-W24.jsonl", [
      JSON.stringify({ schema_version: 1, event: "reserve", model: "x", projected_cost_usd: 0.1 }),
      JSON.stringify({ schema_version: 1, event: "reserve_denied", model: "x" }),
      JSON.stringify({ schema_version: 1, event: "runtime_denied", model: "x" }),
    ]);
    const result = readEngineSpend(dir);
    expect(result.observed).toBe(true);
    expect(result.usd).toBe(0);
    expect(result.partiallyObserved).toBe(false);
    expect(result.skipped).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("mkdtempSync fixtures never touch a real ~/.gbrain path", () => {
    const dir = tmp();
    expect(dir.startsWith(tmpdir())).toBe(true);
    expect(dir.includes(".gbrain")).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
