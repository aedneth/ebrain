import { expect, test } from "bun:test";
import { parseBenchmarkEvidence } from "./benchmark-evidence.ts";

const fixture = {
  schema_version: 1,
  source: "https://example.invalid/benchmark",
  as_of: "2026-07-15T00:00:00.000Z",
  version: "2026.07",
  task_scope: "repository coding",
  models: [{ model: "qwen/qwen3-coder", metrics: [{ id: "pass_rate", value: 0.72, unit: "ratio" }] }],
};

test("benchmark evidence accepts attributable descriptive measurements", () => {
  expect(parseBenchmarkEvidence(fixture)).toEqual(fixture);
});

test("benchmark evidence rejects implicit routing, credentials, and malformed provenance", () => {
  expect(() => parseBenchmarkEvidence({ ...fixture, winner: "qwen/qwen3-coder" })).toThrow("campos conocidos");
  expect(() => parseBenchmarkEvidence({ ...fixture, token: "forbidden" })).toThrow("campos conocidos");
  expect(() => parseBenchmarkEvidence({ ...fixture, as_of: "later" })).toThrow("as_of ISO");
});
