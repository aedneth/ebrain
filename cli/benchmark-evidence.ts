/**
 * Optional benchmark evidence schema (ADR-005 / F6.6.5).
 *
 * This is deliberately descriptive: callers may display or compare evidence, but it
 * cannot select a model, create a routing default, or encode a "winner" field.
 */
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,160}$/;

export interface BenchmarkMetric { id: string; value: number; unit: string }
export interface BenchmarkModelEvidence { model: string; metrics: BenchmarkMetric[] }
export interface BenchmarkEvidence {
  schema_version: 1;
  source: string;
  as_of: string;
  version: string;
  task_scope: string;
  models: BenchmarkModelEvidence[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

/** Reject unknown fields so benchmark data cannot smuggle credentials or routing policy. */
export function parseBenchmarkEvidence(value: unknown): BenchmarkEvidence {
  if (!record(value) || !exact(value, ["schema_version", "source", "as_of", "version", "task_scope", "models"]) || value.schema_version !== 1) {
    throw new Error("benchmark evidence requiere schema_version=1 y campos conocidos");
  }
  const scalar = [value.source, value.as_of, value.version, value.task_scope];
  if (!scalar.every((item) => typeof item === "string" && item.trim().length > 0) || !Number.isFinite(Date.parse(value.as_of as string))) {
    throw new Error("benchmark evidence requiere source, as_of ISO, version y task_scope");
  }
  if (!Array.isArray(value.models) || value.models.length === 0) throw new Error("benchmark evidence requiere modelos");
  const models = value.models.map((entry): BenchmarkModelEvidence => {
    if (!record(entry) || !exact(entry, ["model", "metrics"]) || typeof entry.model !== "string" || !MODEL_ID.test(entry.model) || !Array.isArray(entry.metrics) || entry.metrics.length === 0) {
      throw new Error("modelo de benchmark invalido");
    }
    const metrics = entry.metrics.map((metric): BenchmarkMetric => {
      if (!record(metric) || !exact(metric, ["id", "value", "unit"]) || typeof metric.id !== "string" || !MODEL_ID.test(metric.id) || typeof metric.value !== "number" || !Number.isFinite(metric.value) || typeof metric.unit !== "string" || metric.unit.trim().length === 0) {
        throw new Error("metrica de benchmark invalida");
      }
      return { id: metric.id, value: metric.value, unit: metric.unit };
    });
    return { model: entry.model, metrics };
  });
  return { schema_version: 1, source: value.source as string, as_of: value.as_of as string, version: value.version as string, task_scope: value.task_scope as string, models };
}
