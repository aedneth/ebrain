/**
 * cli/contract.test.ts — contrato JSON unificado (SPRINT-TUI 6.1.8): valida con zod el schema de
 * los CINCO `--json` del F6.1 (status/doctor/spend/fleet/memory recent) contra fixtures.
 *
 * Por qué FIXTURES y no spawns en vivo de los scripts reales: harness/core/doctor.sh invoca
 * contract-test.sh como uno de sus propios checks, y contract-test.sh (después de F6.1.8) corre
 * ESTE archivo vía `bun test`. Si este archivo spawneara `doctor.sh --json` en vivo, el ciclo sería
 * doctor.sh → contract-test.sh → bun test contract.test.ts → doctor.sh --json → contract-test.sh
 * → … (recursión infinita). `fleet.ts` tiene el mismo problema transitivo: llama a
 * `install.sh --doctor <agent>` por cada adapter, e install.sh TAMBIÉN invoca contract-test.sh como
 * parte de su propio doctor. Para no tener un diseño asimétrico y fragil (2 en vivo + 3 fixture,
 * a merced de que alguien agregue mañana una llamada a contract-test.sh en spend.ts/memory.ts y
 * reintroduzca el ciclo sin darse cuenta), las CINCO se validan igual: contra fixtures, nunca
 * spawneando el CLI real. Los `jq -e` / `bun test` de cada tarea 6.1.1–6.1.5 ya probaron el output
 * REAL en vivo — esta suite fija el SCHEMA para que draft futuro no lo rompa en silencio.
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
