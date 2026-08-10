#!/usr/bin/env bun
/**
 * ebrain dream — submit the gbrain maintenance ("dream") cycle as a JOB to the
 * running daemon over MCP.
 *
 * WHY THIS EXISTS
 * ───────────────
 * gbrain is single-connection (PGLite). `scripts/dream-cycle` runs a LOCAL cycle
 * and therefore ABORTS whenever a `gbrain serve` process already owns the lock —
 * i.e. in the daemon regime the maintenance cycle never runs and the store rots
 * at scale. The daemon already owns the lock, so the fix is to hand it the cycle
 * as an `autopilot-cycle` job over the existing remote-MCP seam (see
 * `cli/remote-tools.ts` → `submitCycle`, which this module mirrors).
 *
 * WHAT LIVES HERE
 * ───────────────
 *  1. `selectCyclePhases` — PURE. The curated maintenance phase list, degraded
 *     (never failed) when the machine is keyless or at budget cap.
 *  2. `buildCycleSubmission` — PURE. The `submit_job` args payload the daemon
 *     accepts for an `autopilot-cycle` submit, mirroring `submitCycle`.
 *  3. `runDream` — thin, guarded orchestration. `--dry-run` prints the plan and
 *     NEVER submits; a real submit refuses (typed error, non-zero exit) when the
 *     daemon is not reachable.
 *  4. `main` — `ebrain dream [--dry-run] [--phases a,b,c] [--at-cap] [--keyless]`.
 *
 * The two pure functions perform NO I/O (no env, fs, or network reads) and are
 * covered directly by `cli/dream.test.ts`.
 */

// ─── Curated phase policy (pure) ─────────────────────────────────────

/**
 * Baseline curated maintenance set, in dependency order (matches the engine's
 * `ALL_PHASES` ordering for the subset we run):
 *   sync → extract_facts → consolidate → embed → orphans → purge.
 */
export const CURATED_PHASES = [
  "sync",
  "extract_facts",
  "consolidate",
  "embed",
  "orphans",
  "purge",
] as const;

/** The embedding phase — dropped when there is no embedder (keyless) OR at budget cap (no new embedding spend). */
export const EMBED_PHASE = "embed";

/**
 * LLM-heavy / spend-or-embedding-dependent phases — dropped when at cap OR
 * keyless so the cycle degrades instead of failing.
 *
 * CLASSIFICATION (verified against the pinned engine, `vendor/gbrain/src/core/cycle`):
 *
 *  - `consolidate` → HEAVY. It clusters unconsolidated facts by embedding cosine
 *    similarity, and "facts with no embedding cluster on their own … no-embedding
 *    singletons sit out the cycle" (cycle/phases/consolidate.ts:8,276-285): it can
 *    do no useful work keyless. Its documented intent + roadmap is LLM synthesis —
 *    "Sonnet-synthesize one take per cluster" (cycle.ts:1974) with the v0.31 build
 *    shipping a deterministic stub pending "the v0.32 Sonnet rewrite"
 *    (cycle/phases/consolidate.ts:10-11). So it is the spend-bearing phase at cap
 *    and the embedding-dependent phase keyless.
 *
 *  - `extract_facts` → NOT heavy (diverges from the task's initial suggestion).
 *    It is a deterministic `## Facts` fence → DB reconcile that writes a receipt
 *    with `cost_usd: 0`: "extract_facts is deterministic (fence reconcile, no LLM
 *    cost)" (cycle/extract-facts.ts:278-280). It needs neither an embedder nor an
 *    LLM, so it stays in the always-safe embedding-free subset below.
 */
export const LLM_HEAVY_PHASES: ReadonlySet<string> = new Set(["consolidate"]);

/**
 * The deterministic, no-LLM, no-embedding GC/dedup subset that must ALWAYS remain
 * so the cycle degrades, never fails:
 *   - sync           : filesystem → DB reconcile (no LLM, no embedding)
 *   - extract_facts  : `## Facts` fence → DB reconcile, cost_usd: 0
 *   - orphans        : read-only orphan report
 *   - purge          : hard-delete of expired soft-deleted rows (GC)
 */
export const EMBEDDING_FREE_GC_PHASES = [
  "sync",
  "extract_facts",
  "orphans",
  "purge",
] as const;

/**
 * PURE. Returns the curated maintenance phase list for the given machine state.
 * Deterministic, total, and I/O-free — inputs are injected as booleans.
 *
 *  - full curated set when NOT at cap and NOT keyless;
 *  - `embed` dropped when keyless (no embedder) or at cap (no new embedding spend);
 *  - LLM-heavy phases dropped when at cap OR keyless;
 *  - the embedding-free GC/dedup subset is always retained.
 */
export function selectCyclePhases(opts: { atCap: boolean; keyless: boolean }): string[] {
  const { atCap, keyless } = opts;
  return CURATED_PHASES.filter((phase) => {
    if ((atCap || keyless) && phase === EMBED_PHASE) return false;
    if ((atCap || keyless) && LLM_HEAVY_PHASES.has(phase)) return false;
    return true;
  });
}

// ─── Job payload (pure) ──────────────────────────────────────────────

/** Job name the daemon dispatches for a maintenance cycle. */
export const CYCLE_JOB_NAME = "autopilot-cycle";
/** The maintenance cycle is not retried on failure (mirrors submitCycle). */
export const CYCLE_MAX_ATTEMPTS = 1;
/** MCP tool the daemon exposes for job submission. */
export const SUBMIT_JOB_TOOL = "submit_job";

/**
 * The `submit_job` args payload for an `autopilot-cycle` submit. Mirrors the
 * shape assembled in `cli/remote-tools.ts` → `submitCycle` (see
 * remote-tools.ts:77-83): `{ name, data: { phases[, source_id] }, max_attempts }`.
 */
export interface CycleSubmission {
  name: typeof CYCLE_JOB_NAME;
  data: { phases: string[]; source_id?: string };
  max_attempts: number;
}

/**
 * PURE. Builds the `submit_job` args payload for an `autopilot-cycle` submit.
 * `source_id` is included only when a source is provided — exactly mirroring the
 * conditional `if (source) data.source_id = source` in submitCycle. No I/O.
 */
export function buildCycleSubmission(opts: { phases: string[]; sourceId?: string }): CycleSubmission {
  const data: { phases: string[]; source_id?: string } = { phases: [...opts.phases] };
  if (opts.sourceId) data.source_id = opts.sourceId;
  return { name: CYCLE_JOB_NAME, data, max_attempts: CYCLE_MAX_ATTEMPTS };
}

// ─── Guarded orchestration (thin, effectful) ─────────────────────────

/** Raised when a real submit is attempted but the daemon is not reachable. */
export class DaemonUnreachableError extends Error {
  readonly code = "DAEMON_UNREACHABLE";
  constructor(
    message = "ebrain daemon not reachable — start it with 'ebrain up' before submitting a dream cycle",
  ) {
    super(message);
    this.name = "DaemonUnreachableError";
  }
}

export interface RunDreamOptions {
  /** Print the plan and payload without submitting. */
  dryRun?: boolean;
  /** Budget exhausted — drop LLM-heavy phases. */
  atCap?: boolean;
  /** No embedder available — drop embed + LLM-heavy phases. */
  keyless?: boolean;
  /** Explicit phase override; when non-empty, `selectCyclePhases` is bypassed. */
  phases?: string[];
  /** Optional source scope, passed through to the job payload. */
  sourceId?: string;
  /** Injectable submit (wiring/tests); defaults to the remote-tools MCP path. */
  submit?: (payload: CycleSubmission) => Promise<unknown>;
  /** Injectable daemon-reachability probe; defaults to the remote MCP config check. */
  isDaemonReachable?: () => Promise<boolean>;
  /** Injectable output sink; defaults to console.log. */
  log?: (line: string) => void;
}

export interface RunDreamResult {
  submitted: boolean;
  phases: string[];
  payload: CycleSubmission;
  result?: unknown;
}

/**
 * Default reachability probe. Lazily imports the pinned engine's config loader
 * (CI has no `vendor/`, so the import is dynamic and wrapped) and treats the
 * presence of `remote_mcp` config as "daemon configured/reachable" — the same
 * precondition `remote-tools.ts` → `callTool` enforces (remote-tools.ts:38). A
 * daemon that is configured but down surfaces as a connection error at submit
 * time; both paths exit non-zero. Never reads secrets.
 */
async function defaultIsDaemonReachable(): Promise<boolean> {
  try {
    const { loadConfig } = await import("../vendor/gbrain/src/core/config.ts");
    const cfg = loadConfig() as { remote_mcp?: unknown } | null;
    return Boolean(cfg && cfg.remote_mcp);
  } catch {
    return false;
  }
}

/**
 * Default submit path. Lazily reuses `cli/remote-tools.ts` → `callTool` to submit
 * the `submit_job` MCP tool with the cycle payload, exactly as `submitCycle` does
 * (remote-tools.ts:79-83).
 */
async function defaultSubmit(payload: CycleSubmission): Promise<unknown> {
  const { callTool } = await import("./remote-tools.ts");
  return callTool(SUBMIT_JOB_TOOL, payload as unknown as Record<string, unknown>);
}

/**
 * Thin, guarded orchestration around the pure core.
 *
 *  - `--dry-run` prints the chosen phases + payload and returns WITHOUT submitting.
 *  - A real submit first checks daemon reachability and throws
 *    `DaemonUnreachableError` (non-zero exit via `main`) if the daemon is down.
 */
export async function runDream(opts: RunDreamOptions = {}): Promise<RunDreamResult> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const phases =
    opts.phases && opts.phases.length > 0
      ? opts.phases
      : selectCyclePhases({ atCap: opts.atCap ?? false, keyless: opts.keyless ?? false });
  const payload = buildCycleSubmission({ phases, sourceId: opts.sourceId });

  if (opts.dryRun) {
    log("ebrain dream — dry run (no cycle submitted)");
    log(`phases: ${phases.join(", ")}`);
    log(JSON.stringify(payload, null, 2));
    return { submitted: false, phases, payload };
  }

  const reachable = opts.isDaemonReachable
    ? await opts.isDaemonReachable()
    : await defaultIsDaemonReachable();
  if (!reachable) throw new DaemonUnreachableError();

  const submit = opts.submit ?? defaultSubmit;
  const result = await submit(payload);
  log(JSON.stringify(result, null, 2));
  return { submitted: true, phases, payload, result };
}

// ─── CLI ─────────────────────────────────────────────────────────────

export interface ParsedDreamArgs {
  dryRun: boolean;
  atCap: boolean;
  keyless: boolean;
  phases?: string[];
  sourceId?: string;
}

function flagValue(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] ?? null : null;
}

export function parseDreamArgs(argv: string[]): ParsedDreamArgs {
  const phasesFlag = flagValue(argv, "--phases");
  const sourceFlag = flagValue(argv, "--source");
  return {
    dryRun: argv.includes("--dry-run"),
    atCap: argv.includes("--at-cap"),
    keyless: argv.includes("--keyless"),
    phases: phasesFlag
      ? phasesFlag.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
    sourceId: sourceFlag ?? undefined,
  };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseDreamArgs(argv);
  try {
    await runDream({
      dryRun: args.dryRun,
      atCap: args.atCap,
      keyless: args.keyless,
      phases: args.phases,
      sourceId: args.sourceId,
    });
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`ebrain dream: ${msg}`);
    return err instanceof DaemonUnreachableError ? 2 : 1;
  }
}

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`ebrain dream: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}
