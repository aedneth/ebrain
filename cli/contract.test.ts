/**
 * cli/contract.test.ts — contrato JSON unificado (SPRINT-TUI 6.1.8, extendido en 6.1.6/6.1.7):
 * valida con zod el schema de los `--json` de F6.1+ (status/doctor/spend/routing/workflows/
 * fleet/memory recent/sessions list+peek+mutate/advise) contra fixtures.
 *
 * Por qué FIXTURES y no spawns en vivo de los scripts reales: harness/core/doctor.sh invoca
 * contract-test.sh como uno de sus propios checks, y contract-test.sh (después de F6.1.8) corre
 * ESTE archivo vía `bun test`. Si este archivo spawneara `doctor.sh --json` en vivo, el ciclo sería
 * doctor.sh → contract-test.sh → bun test contract.test.ts → doctor.sh --json → contract-test.sh
 * → … (recursión infinita). `fleet.ts` tiene el mismo problema transitivo: llama a
 * `install.sh --doctor <agent>` por cada adapter, e install.sh TAMBIÉN invoca contract-test.sh como
 * parte de su propio doctor. Para no tener un diseño asimétrico y fragil (algunos en vivo + otros
 * fixture, a merced de que alguien agregue mañana una llamada a contract-test.sh en un cli/*.ts y
 * reintroduzca el ciclo sin darse cuenta), TODOS se validan igual: contra fixtures, nunca
 * spawneando el CLI real (ni siquiera sessions.ts/advise.ts, que hoy no tienen ese riesgo — la
 * convención se mantiene pareja para que nunca dependa de auditar caso por caso). Los `jq -e` /
 * `bun test` / smoke manual de cada tarea ya probaron el output REAL en vivo — esta suite fija el
 * SCHEMA para que un cambio futuro no lo rompa en silencio.
 *
 * `bun test cli/contract.test.ts`. Para ver que realmente valida: rompé un campo del fixture (tipo
 * incorrecto, campo faltante, valor fuera de enum) y el test correspondiente debe fallar.
 */
import { test, expect, describe } from "bun:test";
import { z } from "zod";

// ── 6.1.1 ebrain status --json ──────────────────────────────────────────────
const StatusSchema = z.object({
  brain: z.object({
    state: z.enum(["up", "idle"]),
    served_by: z.string(),
    sources: z.array(z.string()),
    cached: z.boolean(),
  }),
  spend: z.object({
    mtd: z.number(),
    cap: z.number(),
    remaining: z.number(),
  }),
  fleet: z.object({
    agents: z.array(z.object({ name: z.string(), ok: z.boolean() })),
  }),
  memory: z.object({
    learnings: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
  }),
});

// Fixture = captura real de `bash harness/core/status.sh --json` (brain lockeado por MCP, 2026-07-12).
const statusFixture = {
  brain: { state: "up", served_by: "mcp:8541", sources: [], cached: true },
  spend: { mtd: 0.0068, cap: 10, remaining: 9.9932 },
  fleet: {
    agents: [
      { name: "claude", ok: true }, { name: "codex", ok: true }, { name: "cursor", ok: true },
      { name: "gemini", ok: true }, { name: "generic", ok: true }, { name: "opencode", ok: true },
    ],
  },
  memory: { learnings: 3, sessions: 39 },
};

describe("6.1.1 status --json", () => {
  test("fixture real pasa el schema", () => {
    expect(() => StatusSchema.parse(statusFixture)).not.toThrow();
  });
  test("rompe brain.state (enum inválido) → falla", () => {
    const broken = { ...statusFixture, brain: { ...statusFixture.brain, state: "sideways" } };
    expect(StatusSchema.safeParse(broken).success).toBe(false);
  });
  test("rompe spend.mtd (string en vez de number) → falla", () => {
    const broken = { ...statusFixture, spend: { ...statusFixture.spend, mtd: "0.0068" } };
    expect(StatusSchema.safeParse(broken).success).toBe(false);
  });
  test("campo top-level faltante (memory) → falla", () => {
    const { memory: _drop, ...broken } = statusFixture;
    expect(StatusSchema.safeParse(broken).success).toBe(false);
  });
});

// ── 6.1.2 ebrain doctor --json ──────────────────────────────────────────────
const DoctorCheckSchema = z.object({
  id: z.string().min(1),
  level: z.enum(["ok", "warn", "fail"]),
  msg: z.string(),
});
const DoctorSchema = z.object({
  checks: z.array(DoctorCheckSchema),
  rc: z.number().int(),
});

// rc coherente con el peor nivel: rc=1 SOLO si hay algún check "fail" (los warn no tumban rc) —
// misma regla dura documentada en doctor.sh. Se valida aparte del schema estructural (zod valida
// forma, esto valida la INVARIANTE semántica entre checks[] y rc).
function rcCoherente(doc: z.infer<typeof DoctorSchema>): boolean {
  const hasFail = doc.checks.some((c) => c.level === "fail");
  return hasFail ? doc.rc !== 0 : doc.rc === 0;
}

// Fixture = captura real de `bash harness/core/doctor.sh --json` (2026-07-12, brain lockeado).
const doctorFixture = {
  checks: [
    { id: "launcher:gbrain-run", level: "ok", msg: "gbrain-run" },
    { id: "config:routing.yaml", level: "ok", msg: "routing.yaml" },
    { id: "guard:contract-test", level: "ok", msg: "contract-test: 16 ok, 0 fallidos" },
    { id: "adapter:gemini", level: "warn", msg: "adapter gemini: pendiente (ver 'ebrain harness doctor gemini')" },
    { id: "sources:isolation", level: "warn", msg: "brain servido por MCP (PID 8541) → lock PGLite activo" },
    { id: "spend:mtd", level: "ok", msg: "gasto MTD $0.0068 / cap $10" },
    { id: "brain:engine", level: "ok", msg: "brain UP (MCP serve, PID 8541)" },
  ],
  rc: 0,
};

describe("6.1.2 doctor --json", () => {
  test("fixture real pasa el schema y la invariante rc↔checks", () => {
    const parsed = DoctorSchema.parse(doctorFixture);
    expect(rcCoherente(parsed)).toBe(true);
  });
  test("rompe level (valor fuera del enum ok|warn|fail) → falla el schema", () => {
    const broken = { ...doctorFixture, checks: [{ id: "x", level: "critical", msg: "y" }] };
    expect(DoctorSchema.safeParse(broken).success).toBe(false);
  });
  test("rompe la invariante: hay un 'fail' pero rc=0 → rcCoherente() detecta la divergencia", () => {
    const withFail = { checks: [...doctorFixture.checks, { id: "x", level: "fail", msg: "y" }], rc: 0 };
    const parsed = DoctorSchema.parse(withFail); // el schema estructural sigue siendo válido…
    expect(rcCoherente(parsed)).toBe(false);      // …pero la invariante semántica lo atrapa
  });
  test("checks[] vacío es válido estructuralmente (edge case, no debería pasar en la práctica)", () => {
    expect(DoctorSchema.safeParse({ checks: [], rc: 0 }).success).toBe(true);
  });
});

// ── 6.1.3 ebrain spend --json ────────────────────────────────────────────────
const SpendSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "formato YYYY-MM"),
  budget: z.object({ monthly_usd: z.number(), hard_stop: z.boolean() }),
  mtd: z.number(),
  remaining: z.number(),
  by_capability: z.array(z.object({
    capability: z.string(),
    mtd: z.number(),
    routes: z.number().int().nonnegative(),
  })),
  gbrain_untracked: z.literal(true),
});

// Fixture = captura real de `bun run cli/spend.ts --json` (2026-07-12).
const spendFixture = {
  month: "2026-07",
  budget: { monthly_usd: 10, hard_stop: true },
  mtd: 0.00683,
  remaining: 9.99317,
  by_capability: [
    { capability: "agentic", mtd: 0.003713, routes: 1 },
    { capability: "coding", mtd: 0.001253, routes: 2 },
    { capability: "terminal", mtd: 0, routes: 0 },
  ],
  gbrain_untracked: true,
};

describe("6.1.3 spend --json", () => {
  test("fixture real pasa el schema", () => {
    expect(() => SpendSchema.parse(spendFixture)).not.toThrow();
  });
  test("rompe month (formato inválido) → falla", () => {
    expect(SpendSchema.safeParse({ ...spendFixture, month: "julio-2026" }).success).toBe(false);
  });
  test("gbrain_untracked debe ser literalmente true (el gap NUNCA se puede ocultar poniéndolo false)", () => {
    expect(SpendSchema.safeParse({ ...spendFixture, gbrain_untracked: false }).success).toBe(false);
  });
  test("routes negativo (dato imposible) → falla", () => {
    const broken = { ...spendFixture, by_capability: [{ capability: "x", mtd: 0, routes: -1 }] };
    expect(SpendSchema.safeParse(broken).success).toBe(false);
  });
});

// ── 6.6A ebrain routing --json ───────────────────────────────────────────────
const RoutingModelSchema = z.object({
  role: z.enum(["winner", "fallback", "floor"]),
  slug: z.string(),
  free: z.boolean(),
  frontier: z.boolean(),
  pricing: z.object({ input_per_m: z.number(), output_per_m: z.number() }).nullable(),
});
const RoutingSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  budget: z.object({ monthly_usd: z.number(), hard_stop: z.boolean() }),
  mtd: z.number(),
  remaining: z.number(),
  capabilities: z.array(z.object({
    capability: z.string(),
    mtd: z.number(),
    routes: z.number().int().nonnegative(),
    command: z.string(),
    est_typical_usd: z.number().nullable(),
    models: z.array(RoutingModelSchema).min(1),
  })),
  gbrain_untracked: z.literal(true),
});

const routingFixture = {
  month: "2026-07",
  budget: { monthly_usd: 10, hard_stop: true },
  mtd: 0.014016,
  remaining: 9.985984,
  capabilities: [
    {
      capability: "coding",
      mtd: 0.001253,
      routes: 2,
      command: 'ebrain route --cap coding "<prompt>"',
      est_typical_usd: 0.00261,
      models: [
        { role: "winner", slug: "deepseek/deepseek-v4-pro", free: false, frontier: false, pricing: { input_per_m: 0.435, output_per_m: 0.87 } },
        { role: "fallback", slug: "deepseek/deepseek-v4-flash", free: false, frontier: false, pricing: { input_per_m: 0.077, output_per_m: 0.154 } },
        { role: "floor", slug: "qwen/qwen3-coder:free", free: true, frontier: false, pricing: { input_per_m: 0, output_per_m: 0 } },
      ],
    },
  ],
  gbrain_untracked: true,
};

describe("6.6A routing --json", () => {
  test("fixture pasa el schema", () => {
    expect(() => RoutingSchema.parse(routingFixture)).not.toThrow();
  });
  test("modelo sin pricing debe explicitar null, no omitir el campo", () => {
    const fixture = {
      ...routingFixture,
      capabilities: [{
        ...routingFixture.capabilities[0],
        models: [{ ...routingFixture.capabilities[0].models[0], pricing: null }],
      }],
    };
    expect(RoutingSchema.safeParse(fixture).success).toBe(true);
  });
  test("role inválido falla", () => {
    const fixture = {
      ...routingFixture,
      capabilities: [{
        ...routingFixture.capabilities[0],
        models: [{ ...routingFixture.capabilities[0].models[0], role: "primary" }],
      }],
    };
    expect(RoutingSchema.safeParse(fixture).success).toBe(false);
  });
});

// ── 6.6C ebrain workflows --json ────────────────────────────────────────────
const WorkflowSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: z.enum(["second-brain", "company-brain", "local", "captured"]),
  version: z.number().int().positive(),
  trigger: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  steps: z.number().int().nonnegative(),
  gates: z.number().int().nonnegative(),
});
const WorkflowRecordSchema = WorkflowSummarySchema.extend({
  schema_version: z.literal(1),
  source_path: z.string(),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/),
  updated_at: z.string(),
  steps: z.array(z.string()),
  gates: z.array(z.string()),
  body: z.string(),
});
const WorkflowsListSchema = z.object({
  workflows: z.array(WorkflowSummarySchema),
});
const WorkflowsIngestSchema = z.object({
  ingested: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  workflows: z.array(WorkflowSummarySchema),
  store_dir: z.string(),
});
const WorkflowsSearchSchema = z.object({
  query: z.string(),
  workflows: z.array(WorkflowSummarySchema.extend({ score: z.number().positive() })),
});
const WorkflowsShowSchema = z.object({
  workflow: WorkflowRecordSchema,
});
const WorkflowsRunSchema = z.object({
  id: z.string(),
  title: z.string(),
  version: z.number().int().positive(),
  prompt: z.string().min(1),
  checklist: z.array(z.string()),
});
const WorkflowsCaptureSchema = z.object({
  candidates: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    count: z.number().int().positive(),
    sources: z.array(z.string()),
    snippets: z.array(z.string()),
  })),
});
const WorkflowsSkillifySchema = z.union([
  z.object({ ok: z.literal(true), path: z.string(), workflow: WorkflowSummarySchema }),
  z.object({
    ok: z.literal(false),
    error: z.object({ type: z.enum(["not-found", "confirm-required"]), message: z.string() }),
    would: z.object({ path: z.string() }).optional(),
  }),
]);

const workflowSummaryFixture = {
  id: "second-brain-structured-agentic-development",
  title: "Structured Agentic Development",
  source: "second-brain",
  version: 2,
  trigger: "Use when building software changes",
  summary: "Spec-driven development loop.",
  tags: ["workflow", "second-brain", "dev"],
  steps: 4,
  gates: 2,
};
const workflowRecordFixture = {
  ...workflowSummaryFixture,
  schema_version: 1,
  source_path: "/home/eduardo.borjas/Documents/Second Brain/01-systems/workflows/structured-agentic-development/_workflow.md",
  content_hash: "a".repeat(64),
  updated_at: "2026-07-15T00:00:00.000Z",
  steps: ["Load context", "Plan", "Implement", "Verify"],
  gates: ["Verify: bun test ./cli/", "Gate: maker != checker"],
  body: "# Structured Agentic Development\n\nBody",
};

describe("6.6C workflows --json", () => {
  test("list fixture pasa el schema", () => {
    expect(() => WorkflowsListSchema.parse({ workflows: [workflowSummaryFixture] })).not.toThrow();
  });
  test("ingest fixture pasa el schema", () => {
    expect(() => WorkflowsIngestSchema.parse({ ingested: 1, changed: 1, workflows: [workflowSummaryFixture], store_dir: "/tmp/workflows" })).not.toThrow();
  });
  test("search fixture pasa el schema", () => {
    expect(() => WorkflowsSearchSchema.parse({ query: "dev", workflows: [{ ...workflowSummaryFixture, score: 12 }] })).not.toThrow();
  });
  test("show fixture pasa el schema", () => {
    expect(() => WorkflowsShowSchema.parse({ workflow: workflowRecordFixture })).not.toThrow();
  });
  test("run fixture pasa el schema", () => {
    expect(() => WorkflowsRunSchema.parse({ id: workflowSummaryFixture.id, title: workflowSummaryFixture.title, version: 2, prompt: "Use ebrain workflow", checklist: ["1. Verify"] })).not.toThrow();
  });
  test("capture fixture pasa el schema", () => {
    expect(() => WorkflowsCaptureSchema.parse({ candidates: [{ id: "captured-release", title: "release", count: 2, sources: ["session:a"], snippets: ["follow release workflow"] }] })).not.toThrow();
  });
  test("skillify confirm-required fixture pasa el schema", () => {
    expect(() => WorkflowsSkillifySchema.parse({ ok: false, error: { type: "confirm-required", message: "repeat with --yes" }, would: { path: "/tmp/SKILL.md" } })).not.toThrow();
  });
  test("rompe version no-positiva", () => {
    expect(WorkflowSummarySchema.safeParse({ ...workflowSummaryFixture, version: 0 }).success).toBe(false);
  });
  test("rompe content_hash no-sha256", () => {
    expect(WorkflowsShowSchema.safeParse({ workflow: { ...workflowRecordFixture, content_hash: "abc" } }).success).toBe(false);
  });
});

// ── 6.6E ebrain cost --json ─────────────────────────────────────────────────
const CostKindSchema = z.enum(["actual", "estimated", "token-only", "untracked"]);
const CostBreakdownSchema = z.object({
  key: z.string().min(1),
  usd: z.number().nonnegative(),
  actual_usd: z.number().nonnegative(),
  estimated_usd: z.number().nonnegative(),
  events: z.number().int().nonnegative(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  untracked_events: z.number().int().nonnegative(),
  token_only_events: z.number().int().nonnegative(),
});
const CostProviderSchema = CostBreakdownSchema.extend({
  provider: z.string().min(1),
  status: z.enum(["metered", "token-only", "untracked"]),
});
const CostEventSchema = z.object({
  schema_version: z.literal(2),
  ts: z.string().min(1),
  provider: z.string().min(1),
  agent: z.string().nullable(),
  model: z.string().nullable(),
  session: z.string().nullable(),
  workflow: z.string().nullable(),
  capability: z.string().nullable(),
  tokens_in: z.number().int().nonnegative().nullable(),
  tokens_out: z.number().int().nonnegative().nullable(),
  usd: z.number().nonnegative().nullable(),
  cost_kind: CostKindSchema,
  source: z.enum(["route", "adapter"]),
});
const CostSchema = z.object({
  schema_version: z.literal(2),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  budget: z.object({ monthly_usd: z.number().positive(), hard_stop: z.boolean(), scope: z.literal("openrouter") }),
  openrouter_mtd: z.number().nonnegative(),
  known_mtd: z.number().nonnegative(),
  remaining_openrouter: z.number(),
  providers: z.array(CostProviderSchema),
  agents: z.array(CostBreakdownSchema),
  models: z.array(CostBreakdownSchema),
  sessions: z.array(CostBreakdownSchema),
  workflows: z.array(CostBreakdownSchema),
  entries: z.array(CostEventSchema),
  untracked_providers: z.array(z.string()),
});
const costBreakdownFixture = {
  key: "openrouter", usd: 0.0012, actual_usd: 0.001, estimated_usd: 0.0002,
  events: 2, tokens_in: 150, tokens_out: 80, untracked_events: 0, token_only_events: 0,
};
const costFixture = {
  schema_version: 2,
  month: "2026-07",
  budget: { monthly_usd: 10, hard_stop: true, scope: "openrouter" },
  openrouter_mtd: 0.0012,
  known_mtd: 0.0014,
  remaining_openrouter: 9.9988,
  providers: [
    { ...costBreakdownFixture, provider: "openrouter", status: "metered" },
    { ...costBreakdownFixture, key: "gemini", provider: "gemini", status: "token-only", usd: 0, actual_usd: 0, estimated_usd: 0, events: 1, tokens_in: 40, tokens_out: 20, token_only_events: 1 },
  ],
  agents: [costBreakdownFixture], models: [costBreakdownFixture], sessions: [], workflows: [],
  entries: [{ schema_version: 2, ts: "2026-07-15T00:00:00.000Z", provider: "openrouter", agent: "route", model: "deepseek/deepseek-v4-pro", session: null, workflow: "second-brain-sops-dev", capability: "coding", tokens_in: 100, tokens_out: 50, usd: 0.001, cost_kind: "actual", source: "route" }],
  untracked_providers: ["claude", "cursor"],
};

describe("6.6E cost --json", () => {
  test("fixture pasa el schema: USD real/estimado separado de token-only", () => {
    expect(() => CostSchema.parse(costFixture)).not.toThrow();
  });
  test("fixture token-only conserva USD=0 y conteo separado", () => {
    const gemini = costFixture.providers[1]!;
    expect(gemini.status).toBe("token-only");
    expect(gemini.usd).toBe(0);
    expect(gemini.token_only_events).toBe(1);
  });
  test("kind desconocido falla", () => {
    const broken = { ...costFixture, entries: [{ ...costFixture.entries[0], cost_kind: "subscription" }] };
    expect(CostSchema.safeParse(broken).success).toBe(false);
  });
});

// ── 6.1.4 ebrain fleet --json ────────────────────────────────────────────────
const FleetSchema = z.object({
  agents: z.array(z.object({
    name: z.string(),
    ok: z.boolean(),
    class: z.enum(["heavy", "light", "unknown"]),
  })),
});

// Fixture = captura real de `bun run cli/fleet.ts --json` (2026-07-12, 6 adapters reales).
const fleetFixture = {
  agents: [
    { name: "claude", ok: true, class: "heavy" },
    { name: "codex", ok: true, class: "heavy" },
    { name: "cursor", ok: true, class: "heavy" },
    { name: "gemini", ok: false, class: "light" },
    { name: "generic", ok: true, class: "light" },
    { name: "opencode", ok: true, class: "heavy" },
  ],
};

describe("6.1.4 fleet --json", () => {
  test("fixture real pasa el schema", () => {
    expect(() => FleetSchema.parse(fleetFixture)).not.toThrow();
  });
  test("los 6 agentes conocidos están presentes con la clase esperada", () => {
    const byName = Object.fromEntries(fleetFixture.agents.map((a) => [a.name, a.class]));
    expect(byName).toEqual({
      claude: "heavy", codex: "heavy", cursor: "heavy",
      gemini: "light", generic: "light", opencode: "heavy",
    });
  });
  test("rompe class (valor fuera de heavy|light|unknown) → falla", () => {
    const broken = { agents: [{ name: "x", ok: true, class: "medium" }] };
    expect(FleetSchema.safeParse(broken).success).toBe(false);
  });
  test("agente sin 'ok' (campo requerido faltante) → falla", () => {
    const broken = { agents: [{ name: "x", class: "heavy" }] };
    expect(FleetSchema.safeParse(broken).success).toBe(false);
  });
});

// ── 6.1.5 ebrain memory recent --json ───────────────────────────────────────
const LearningEntrySchema = z.object({
  project: z.string(),
  agent: z.string(),
  date: z.string(),
  tags: z.array(z.string()),
  text: z.string(),
  path: z.string(),
});
const SessionEntrySchema = z.object({
  ts: z.string(),
  project: z.string(),
  agent: z.string(),
  commit: z.string(),
  summary: z.string(),
  path: z.string(),
});
const MemorySchema = z.object({
  learnings: z.array(LearningEntrySchema),
  sessions: z.array(SessionEntrySchema),
});

// Fixture = captura real de `bun run cli/memory.ts recent --json --limit 3` (2026-07-12).
const memoryFixture = {
  learnings: [
    {
      project: "ebrain", agent: "opencode", date: "2026-07-11",
      tags: ["learning", "ebrain", "opencode"],
      text: "Cross-provider test: OpenCode escribió esto en la MISMA memoria.",
      path: "/home/eduardo.borjas/eBrain/memory/learnings/ebrain/2026-07-11-2333-opencode-e9b2eafb.md",
    },
  ],
  sessions: [
    {
      ts: "2026-07-13T04:37:43Z", project: "second-brain", agent: "unknown", commit: "7d7ef00",
      summary: "CLI-first --json (D3)…",
      path: "/home/eduardo.borjas/Documents/Second Brain/02-daily/logs/2026-07-12.md",
    },
  ],
};

describe("6.1.5 memory recent --json", () => {
  test("fixture real pasa el schema", () => {
    expect(() => MemorySchema.parse(memoryFixture)).not.toThrow();
  });
  test("tags no-array (rompe forma) → falla", () => {
    const broken = { ...memoryFixture, learnings: [{ ...memoryFixture.learnings[0], tags: "learning,ebrain" }] };
    expect(MemorySchema.safeParse(broken).success).toBe(false);
  });
  test("session sin 'commit' (campo requerido faltante) → falla", () => {
    const { commit: _drop, ...sessionSinCommit } = memoryFixture.sessions[0];
    expect(MemorySchema.safeParse({ ...memoryFixture, sessions: [sessionSinCommit] }).success).toBe(false);
  });
  test("learnings/sessions vacíos son válidos (vault recién creado, sin historia aún)", () => {
    expect(MemorySchema.safeParse({ learnings: [], sessions: [] }).success).toBe(true);
  });
});

// ── 6.1.6 ebrain sessions <list|peek|new|send|kill> --json ─────────────────────────────────
const SessionRowSchema = z.object({
  name: z.string().regex(/^ebr-/, "prefijo ebr- obligatorio"),
  agent: z.string().min(1),
  slug: z.string().min(1),
  cwd: z.string(),
  created: z.string(),
  attached: z.boolean(),
});
const SessionsListSchema = z.object({ sessions: z.array(SessionRowSchema) });

// Fixture = captura real de `ebrain sessions list --json` (2026-07-13, sesión E2E fake-agent viva).
const sessionsListFixture = {
  sessions: [
    { name: "ebr-generic-smoketest", agent: "generic", slug: "smoketest", cwd: "/tmp/ebrain-manual-smoke", created: "2026-07-13T17:44:49.000Z", attached: false },
  ],
};

describe("6.1.6 sessions list --json", () => {
  test("fixture real pasa el schema", () => {
    expect(() => SessionsListSchema.parse(sessionsListFixture)).not.toThrow();
  });
  test("lista vacía (sin server tmux o sin sesiones ebr-*) es válida", () => {
    expect(SessionsListSchema.safeParse({ sessions: [] }).success).toBe(true);
  });
  test("nombre sin prefijo 'ebr-' (naming contract roto) → falla", () => {
    const broken = { sessions: [{ ...sessionsListFixture.sessions[0], name: "otra-cosa" }] };
    expect(SessionsListSchema.safeParse(broken).success).toBe(false);
  });
  test("'attached' no-boolean → falla", () => {
    const broken = { sessions: [{ ...sessionsListFixture.sessions[0], attached: "no" }] };
    expect(SessionsListSchema.safeParse(broken).success).toBe(false);
  });
});

// `peek` — el contrato MÁS security-critical del programa: el texto SIEMPRE debe estar scrubbeado
// antes de llegar acá (cli/sessions.ts peekSession()). El fixture "ok" incluye una línea que
// PARECÍA un secreto en el pane crudo pero ya llegó redactada — fija el contrato de forma, no repite
// el test de contenido del scrubber (eso vive en cli/sessions.test.ts, contra la función real).
const SessionsPeekOkSchema = z.object({ ok: z.literal(true), name: z.string(), lines: z.number().int().positive(), text: z.string() });
const SessionsErrorSchema = z.object({ ok: z.literal(false), error: z.object({ type: z.string(), message: z.string() }) });
const SessionsPeekSchema = z.union([SessionsPeekOkSchema, SessionsErrorSchema]);

const sessionsPeekFixture = {
  ok: true,
  name: "ebr-claude-korvex",
  lines: 50,
  text: "fake-agent: listo (AGENT_NAME=claude)\n$ export OPENROUTER_API_KEY=[REDACTED]\n[fake-agent 17:44:50] tick",
};

describe("6.1.6 sessions peek --json (scrubber — hard requirement)", () => {
  test("fixture ok (ya scrubbeado) pasa el schema", () => {
    expect(() => SessionsPeekSchema.parse(sessionsPeekFixture)).not.toThrow();
  });
  test("un fixture con un secreto CRUDO (no redactado) sigue pasando el schema de FORMA — el schema"
    + " no puede detectar contenido, por eso el scrubber se prueba aparte contra la función real"
    + " (cli/sessions.test.ts); este test documenta ese límite explícitamente.", () => {
    const leaky = { ...sessionsPeekFixture, text: "OPENROUTER_API_KEY=sk-or-v1-realvalue-no-debería-pasar" };
    expect(SessionsPeekSchema.safeParse(leaky).success).toBe(true); // forma válida — el CONTENIDO se audita aparte
  });
  test("error tipado (sesión no encontrada) pasa el schema de error", () => {
    const err = { ok: false, error: { type: "not-found", message: "can't find session ebr-x" } };
    expect(() => SessionsPeekSchema.parse(err)).not.toThrow();
  });
  test("'lines' no-positivo → falla", () => {
    expect(SessionsPeekSchema.safeParse({ ...sessionsPeekFixture, lines: 0 }).success).toBe(false);
  });
});

// `new` / `send` / `kill` — envelope común de mutación: éxito con payload propio, o error tipado.
// El caso que este contrato DEBE fijar es el refuso sin --yes (send/kill) — hard requirement 6.1.6.
const SessionsMutateSchema = z.union([
  z.object({ ok: z.literal(true) }).passthrough(),
  z.object({ ok: z.literal(false), error: z.object({ type: z.string(), message: z.string() }) }).passthrough(),
]);

describe("6.1.6 sessions new/send/kill --json (mutate envelope + candado --yes)", () => {
  test("new: éxito trae session:{name,agent,slug,cwd}", () => {
    const ok = { ok: true, session: { name: "ebr-generic-smoketest", agent: "generic", slug: "smoketest", cwd: "/tmp/ebrain-manual-smoke" } };
    expect(() => SessionsMutateSchema.parse(ok)).not.toThrow();
  });
  test("send SIN --yes: ok:false, error.type='confirm-required', trae 'would' (nunca ejecuta)", () => {
    const refused = { ok: false, error: { type: "confirm-required", message: "falta --yes" }, would: { name: "ebr-x", text: "hola" } };
    const parsed = SessionsMutateSchema.parse(refused);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.type).toBe("confirm-required");
  });
  test("kill SIN --yes: mismo candado", () => {
    const refused = { ok: false, error: { type: "confirm-required", message: "falta --yes" }, would: { name: "ebr-x" } };
    expect(() => SessionsMutateSchema.parse(refused)).not.toThrow();
  });
  test("cwd de cliente (deny-list) → error tipado 'deny-client'", () => {
    const denied = { ok: false, error: { type: "deny-client", message: "cwd resuelve bajo un repo de cliente" } };
    const parsed = SessionsMutateSchema.parse(denied);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.type).toBe("deny-client");
  });
  test("ok sin booleano literal (rompe forma) → falla", () => {
    expect(SessionsMutateSchema.safeParse({ ok: "yes", session: {} }).success).toBe(false);
  });
});

// ── ADR-005 ebrain task-profile / advise alias --json ──────────────────────────────────────────
const TaskProfileSchema = z.object({
  task: z.string().min(1),
  signals: z.array(z.object({
    capability: z.enum(["coding", "agentic", "web_design", "long_context", "terminal", "general"]),
    matched: z.array(z.string()),
  })),
  selected_capability: z.enum(["coding", "agentic", "web_design", "long_context", "terminal", "general"]),
  compatible_targets: z.array(z.enum(["manual-session", "openrouter-one-shot"])).min(1),
  disclaimer: z.string().min(1),
});

const taskProfileFixture = {
  task: "Summarize this batch of transcripts into a daily digest",
  signals: [{ capability: "long_context", matched: ["summarize", "digest", "transcript", "batch"] }],
  selected_capability: "long_context",
  compatible_targets: ["manual-session", "openrouter-one-shot"],
  disclaimer: "Las senales clasifican la tarea; no ordenan modelos ni eligen un agente.",
};

describe("ADR-005 task-profile --json", () => {
  test("fixture pasa el schema", () => {
    expect(() => TaskProfileSchema.parse(taskProfileFixture)).not.toThrow();
  });
  test("capability fuera del enum falla", () => {
    expect(TaskProfileSchema.safeParse({ ...taskProfileFixture, selected_capability: "reasoning" }).success).toBe(false);
  });
  test("target desconocido falla", () => {
    expect(TaskProfileSchema.safeParse({ ...taskProfileFixture, compatible_targets: ["codex-best"] }).success).toBe(false);
  });
  test("sin signals no es un error: general es una clasificacion explicita", () => {
    expect(TaskProfileSchema.safeParse({ ...taskProfileFixture, signals: [], selected_capability: "general" }).success).toBe(true);
  });
  test("el contrato no puede transportar una recomendacion legacy", () => {
    const parsed = TaskProfileSchema.parse({ ...taskProfileFixture, agent: "codex", model: "x", est_cost: { usd: 0 } });
    expect(Object.keys(parsed)).not.toContain("agent");
    expect(Object.keys(parsed)).not.toContain("model");
  });
});
