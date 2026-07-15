# Benchmark Evidence Schema

`BenchmarkEvidence` is optional provenance for a user profile or future evidence view. It
does not choose, rank, default, or route any model. Routing remains user-governed under
ADR-005.

```json
{
  "schema_version": 1,
  "source": "https://publisher.example/results",
  "as_of": "2026-07-15T00:00:00.000Z",
  "version": "2026.07",
  "task_scope": "repository coding",
  "models": [
    { "model": "provider/model", "metrics": [{ "id": "pass_rate", "value": 0.72, "unit": "ratio" }] }
  ]
}
```

Every record needs an attributable source, ISO timestamp, source version, and task scope.
Unknown fields are rejected by `cli/benchmark-evidence.ts`; this prevents embedding tokens,
credentials, hidden routing policies, or a claimed winner in evidence. Metrics are factual
measurements only and must be interpreted by the user in their own workload.
