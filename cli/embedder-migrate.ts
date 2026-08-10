#!/usr/bin/env bun
/**
 * cli/embedder-migrate.ts — `ebrain embedder migrate`.
 *
 * THE MOST SAFETY-SENSITIVE COMMAND IN THE CLI: it is the ONE path that both mutates durable state
 * (the engine config that decides which embedder the whole brain uses) AND spends money (a
 * provider-switch re-embed bills the embedding provider per token, proportional to brain size). A
 * careless switch silently invalidates the entire vector store and forces a full, paid re-embed.
 *
 * The whole module is built so that NO mutation and NO spend can happen without an explicit, auditable
 * confirmation, and so that the effectful steps are INJECTABLE — tests drive the full orchestration
 * without ever touching a real `~/.gbrain`, a real daemon, a real provider, or a single cent.
 *
 * WHAT IT DOES
 * ────────────
 *  1. Detect the current posture via `detectEmbedder` (read-only) → current decision + actions.
 *  2. Resolve the TARGET embedder: `--to <provider:model@dims>` (validated through `selectEmbedder`'s
 *     override path) or, absent `--to`, the decided default `selectEmbedder` already returned.
 *  3. If the target is already active with nothing left to do → "already on <sig>, nothing to migrate".
 *  4. Compute a COST PREVIEW (chunks × tokens × price-per-1M → USD, labeled "estimate"). Cost is
 *     telemetry: USD only.
 *  5. Confirmation gate (HARD): `--dry-run` prints the preview and exits 0 changing NOTHING; a real run
 *     needs `--yes` OR an interactive-TTY `y`; a non-TTY run without `--yes` prints the preview + a
 *     "re-run with --yes" hint and exits non-zero WITHOUT mutating.
 *  6. Only on confirmation (the effectful path — built here, NEVER executed by the build task): refuse if
 *     the daemon is unreachable or the target dims are illegal; otherwise switch the engine config to the
 *     target provider (config write FIRST) and submit the daemon-mediated re-embed (submit SECOND).
 *
 * ENGINE MECHANISM THIS ORCHESTRATES (read-only discovery; cites are `vendor/gbrain/...`):
 *  - Cost estimator: `computeReembedEstimate(engine, modelString)` — core/post-upgrade-reembed.ts:41,
 *    over `EMBEDDING_PRICING` + `estimateCostFromChars` in core/embedding-pricing.ts:50,68. It needs a
 *    connected `BrainEngine` (the store lock), so the DEFAULT preview here does NOT open the store — it
 *    uses the PURE pricing table only and reports the chunk count as "needs the daemon". The estimator
 *    is the intended injectable production seam for a daemon-backed precise figure.
 *  - Provider-switch re-embed: setting a new `embedding_model`/`embedding_dimensions` changes
 *    `currentEmbeddingSignature()` (core/embedding.ts:178); the embed pass then NULLs every embedding
 *    stamped under the OLD signature via `engine.invalidateStaleSignatureEmbeddings` (core/engine.ts:1009,
 *    driven from core/embed-stale.ts:141) and re-embeds through a keyset cursor.
 *  - Config switch (non-interactive): `loadConfigFileOnly()` + `saveConfig()` (core/config.ts:397,949)
 *    over the `embedding_model`/`embedding_dimensions`/`embedding_disabled` keys (core/config.ts:818-820).
 *  - Daemon-mediated re-embed submit: MCP `submit_job` with an `autopilot-cycle` whose `phases:["embed"]`
 *    runs `runEmbedCore(engine,{stale:true})` (core/cycle.ts:1174) → `embedAllStale(...signature...)`
 *    (core/commands/embed.ts:629,647), i.e. the signature-drift re-embed above. This mirrors the proven
 *    submit path in cli/dream.ts and cli/remote-tools.ts (submit_job → autopilot-cycle).
 *
 * SAFETY INVARIANTS:
 *  - The two effectful mutators (`writeConfig`, `submit`) are only ever reached AFTER the confirmation
 *    gate passes, and always in the order config-write → submit.
 *  - Every impure step (`detect`, `estimate`, `isDaemonReachable`, `writeConfig`, `submit`, `confirm`) is
 *    injectable; the defaults are the real wiring, and `vendor/` is only ever imported lazily.
 *  - No secret is read or printed; providers are named, never keyed by value.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { detectEmbedder } from "./embedder-detect.ts";
import { MAX_DIM, selectEmbedder, type EmbedderAction, type EmbedderDecision, type EmbedderInput } from "./embedder.ts";

// ─── Constants ───────────────────────────────────────────────────────

/** Job the daemon dispatches for a maintenance cycle (mirrors cli/dream.ts / cli/remote-tools.ts). */
export const REEMBED_JOB_NAME = "autopilot-cycle";
/** The embed phase drives the signature-drift re-embed (runEmbedCore stale path). */
export const EMBED_PHASE = "embed";
/** MCP tool the daemon exposes for job submission. */
export const SUBMIT_JOB_TOOL = "submit_job";
/** A re-embed is not retried on failure (mirrors submitCycle). */
export const REEMBED_MAX_ATTEMPTS = 1;

/**
 * Rough tokens-per-chunk heuristic for the labeled fallback estimate. Only used when a precise
 * char-count from the engine estimator is unavailable. Deliberately conservative and clearly labeled.
 */
export const ROUGH_TOKENS_PER_CHUNK = 256;

/** Exit codes. All refusals are non-zero so a wrapper/script can gate on them. */
export const EXIT_OK = 0;
export const EXIT_CONFIRM_REQUIRED = 1;
export const EXIT_DAEMON_UNREACHABLE = 2;
export const EXIT_INVALID_TARGET = 2;

// ─── Typed errors (effectful-path guards; mirror cli/dream.ts) ───────

/** Raised on the confirmed path when the daemon is not reachable — refuses before any mutation. */
export class DaemonUnreachableError extends Error {
  readonly code = "DAEMON_UNREACHABLE";
  constructor(
    message = "ebrain daemon not reachable — start it with 'ebrain up' before migrating the embedder",
  ) {
    super(message);
    this.name = "DaemonUnreachableError";
  }
}

/** Raised on the confirmed path when the target dims are illegal — refuses before any mutation. */
export class InvalidTargetError extends Error {
  readonly code = "INVALID_TARGET";
  constructor(message: string) {
    super(message);
    this.name = "InvalidTargetError";
  }
}

// ─── Target + cost types ─────────────────────────────────────────────

export interface TargetEmbedder {
  providerId: string;
  modelId: string;
  dims: number;
  /** `provider:model` — the value written to `embedding_model` and used for pricing. */
  model: string;
  /** `provider:model:dims` — the canonical store signature. */
  signature: string;
}

export interface CostPreview {
  /** Chunks/pages to (re)embed; null when a precise count needs the daemon. */
  chunkCount: number | null;
  /** Estimated tokens (internal / telemetry); null when unknown. */
  estimatedTokens: number | null;
  /** Provider list price per 1M tokens; null when the provider has no published price. */
  pricePerMTok: number | null;
  /** Estimated USD; null when either the count or the price is unknown. */
  estimatedUsd: number | null;
  /** Whether the provider price was found in the pricing table. */
  pricingKnown: boolean;
  /** Where the count came from: the engine estimator ('engine') or the labeled fallback ('rough'). */
  source: "engine" | "rough";
  /** Optional human note explaining a missing figure. */
  note?: string;
}

// ─── Pure helpers ────────────────────────────────────────────────────

/** PURE. USD for a token count at a per-1M price. Cost is telemetry — USD only. */
export function estimateUsd(tokens: number, pricePerMTok: number): number {
  return (tokens / 1_000_000) * pricePerMTok;
}

/**
 * PURE. Assemble a cost preview from a (possibly-null) chunk count and a (possibly-null) price.
 * When a precise char-count is supplied (the engine estimator's output) it is used directly; otherwise
 * tokens are the labeled rough `chunkCount × ROUGH_TOKENS_PER_CHUNK`. USD is null unless BOTH a count and
 * a known price are present.
 */
export function computeCostPreview(input: {
  chunkCount: number | null;
  pricePerMTok: number | null;
  pricingKnown: boolean;
  charCount?: number | null;
  tokensPerChunk?: number;
  source?: "engine" | "rough";
  note?: string;
}): CostPreview {
  const tokensPerChunk = input.tokensPerChunk ?? ROUGH_TOKENS_PER_CHUNK;
  let estimatedTokens: number | null = null;
  if (typeof input.charCount === "number" && input.charCount >= 0) {
    estimatedTokens = Math.ceil(input.charCount / 3.5); // engine's tiktoken-shaped approximation
  } else if (typeof input.chunkCount === "number" && input.chunkCount >= 0) {
    estimatedTokens = input.chunkCount * tokensPerChunk;
  }

  const estimatedUsd =
    estimatedTokens !== null && input.pricingKnown && typeof input.pricePerMTok === "number"
      ? estimateUsd(estimatedTokens, input.pricePerMTok)
      : null;

  return {
    chunkCount: input.chunkCount,
    estimatedTokens,
    pricePerMTok: input.pricePerMTok,
    estimatedUsd,
    pricingKnown: input.pricingKnown,
    source: input.source ?? "rough",
    note: input.note,
  };
}

/** PURE. Reduce a semantic decision to a concrete target, or null when the decision names no embedder. */
export function resolveTarget(decision: EmbedderDecision): TargetEmbedder | null {
  if (decision.mode !== "semantic" || !decision.selected || !decision.signature) return null;
  const s = decision.selected;
  return {
    providerId: s.providerId,
    modelId: s.modelId,
    dims: s.dims,
    model: `${s.providerId}:${s.modelId}`,
    signature: decision.signature,
  };
}

export interface ReembedSubmission {
  name: typeof REEMBED_JOB_NAME;
  data: { phases: string[]; source_id?: string };
  max_attempts: number;
}

/**
 * PURE. Build the `submit_job` payload for the daemon-mediated re-embed, mirroring the
 * `{ name, data:{ phases[, source_id] }, max_attempts }` shape assembled in cli/dream.ts and
 * cli/remote-tools.ts. `source_id` is included only when a source scope is provided.
 */
export function buildReembedSubmission(opts: { sourceId?: string; phases?: string[] } = {}): ReembedSubmission {
  const phases = opts.phases && opts.phases.length > 0 ? [...opts.phases] : [EMBED_PHASE];
  const data: { phases: string[]; source_id?: string } = { phases };
  if (opts.sourceId) data.source_id = opts.sourceId;
  return { name: REEMBED_JOB_NAME, data, max_attempts: REEMBED_MAX_ATTEMPTS };
}

/** PURE. The operator-facing preview. Cost is telemetry — USD only; token counts are not surfaced. */
export function formatPreview(target: TargetEmbedder, actions: EmbedderAction[], cost: CostPreview): string {
  const chunks =
    cost.chunkCount !== null
      ? String(cost.chunkCount)
      : "unknown — a precise count needs the running daemon";

  let costLine: string;
  if (cost.estimatedUsd !== null) {
    costLine = `~$${cost.estimatedUsd.toFixed(2)} (estimate)`;
  } else if (!cost.pricingKnown) {
    costLine = `estimate unavailable — no published price for ${target.providerId}`;
  } else {
    costLine = "estimate unavailable — chunk count needs the running daemon (re-run a confirmed migrate)";
  }

  const lines = [
    "ebrain embedder migrate — plan",
    `  target:  ${target.signature}`,
    `  actions: ${actions.join(", ")}`,
    `  chunks:  ${chunks}`,
    `  cost:    ${costLine}`,
  ];
  if (cost.note) lines.push(`  note:    ${cost.note}`);
  return lines.join("\n");
}

// ─── Default (impure) wiring — vendor imported lazily only ───────────

/**
 * Default cost preview. Uses ONLY the PURE pricing table (lazy `vendor/` import) and does NOT open the
 * store — so `--dry-run` on a real machine touches nothing effectful (no lock contention, no spend). A
 * precise chunk count comes from the engine estimator on the daemon-backed confirmed path.
 */
async function defaultEstimate(target: TargetEmbedder): Promise<CostPreview> {
  try {
    const { lookupEmbeddingPrice } = await import("../vendor/gbrain/src/core/embedding-pricing.ts");
    const price = lookupEmbeddingPrice(target.model);
    const pricingKnown = price.kind === "known";
    return computeCostPreview({
      chunkCount: null,
      pricePerMTok: pricingKnown ? price.pricePerMTok : null,
      pricingKnown,
      source: "rough",
      note: "rough preview — chunk count deferred to the daemon-backed estimate on a confirmed run",
    });
  } catch {
    // Vendor unavailable (e.g. CI without vendor/) — still a clearly-labeled, safe preview.
    return computeCostPreview({
      chunkCount: null,
      pricePerMTok: null,
      pricingKnown: false,
      source: "rough",
      note: "pricing table unavailable in this environment",
    });
  }
}

/**
 * Default daemon-reachability probe (mirrors cli/dream.ts): the presence of `remote_mcp` config is the
 * same precondition cli/remote-tools.ts enforces. Never reads secrets; any failure → not reachable.
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
 * Default config switch (EFFECTFUL — never executed by the build task). Loads the engine config
 * file-only, points it at the target provider, clears the keyword-only flag, and saves. Lazy `vendor/`
 * import. This writes a plain config (model/dims), never a credential.
 */
async function defaultWriteConfig(target: TargetEmbedder): Promise<void> {
  const { loadConfigFileOnly, saveConfig } = await import("../vendor/gbrain/src/core/config.ts");
  const cfg = (loadConfigFileOnly() ?? {}) as Record<string, unknown>;
  cfg.embedding_model = target.model;
  cfg.embedding_dimensions = target.dims;
  delete cfg.embedding_disabled;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveConfig(cfg as any);
}

/**
 * Default submit (EFFECTFUL — never executed by the build task). Reuses cli/remote-tools.ts → callTool to
 * submit the `submit_job` MCP tool with the re-embed payload, exactly as submitCycle does. Lazy import.
 */
async function defaultSubmit(payload: ReembedSubmission): Promise<unknown> {
  const { callTool } = await import("./remote-tools.ts");
  return callTool(SUBMIT_JOB_TOOL, payload as unknown as Record<string, unknown>);
}

/**
 * Default interactive confirm. Only ever reached on a TTY (the non-TTY path refuses before this). Uses
 * Bun's synchronous `prompt`; a non-`y` answer (or no prompt available) declines.
 */
function defaultConfirm(target: TargetEmbedder): boolean {
  const question = `Apply migration to ${target.signature}? This re-embeds the store and spends. [y/N] `;
  const answer =
    typeof (globalThis as { prompt?: (m?: string) => string | null }).prompt === "function"
      ? (globalThis as { prompt: (m?: string) => string | null }).prompt(question)
      : null;
  return typeof answer === "string" && /^y(es)?$/i.test(answer.trim());
}

/** Default: has a gbrain config been written at all? Used only to sharpen the "no brain yet" message. */
function brainConfigExists(): boolean {
  try {
    const base =
      (process.env.GBRAIN_HOME && process.env.GBRAIN_HOME.trim() !== "" && process.env.GBRAIN_HOME) ||
      process.env.HOME ||
      homedir();
    return existsSync(join(base, ".gbrain", "config.json"));
  } catch {
    return false;
  }
}

// ─── Orchestration ───────────────────────────────────────────────────

export type MigrateStatus =
  | "noop"
  | "invalid-target"
  | "dry-run"
  | "confirm-required"
  | "submitted";

export interface DetectResult {
  input: EmbedderInput;
  decision: EmbedderDecision;
  describe: string;
}

export interface RunMigrateOptions {
  /** Explicit target `provider:model@dims`; validated through selectEmbedder's override path. */
  to?: string | null;
  /** Optional source scope, passed through to the re-embed payload. */
  source?: string | null;
  /** Print the preview and exit 0 without changing anything. */
  dryRun?: boolean;
  /** Skip the interactive prompt (still the only non-TTY way to proceed). */
  yes?: boolean;
  /** Pretend stdin is/isn't a TTY (default: real stdin). */
  isTTY?: boolean;

  // Injectable seams — defaults are the real wiring; tests inject fakes.
  detect?: () => DetectResult;
  estimate?: (target: TargetEmbedder, actions: EmbedderAction[]) => Promise<CostPreview>;
  isDaemonReachable?: () => Promise<boolean>;
  writeConfig?: (target: TargetEmbedder) => Promise<void>;
  submit?: (payload: ReembedSubmission) => Promise<unknown>;
  confirm?: (target: TargetEmbedder) => boolean;
  log?: (line: string) => void;
  errorLog?: (line: string) => void;
}

export interface MigrateResult {
  status: MigrateStatus;
  exitCode: number;
  target?: TargetEmbedder;
  actions?: EmbedderAction[];
  cost?: CostPreview;
  payload?: ReembedSubmission;
  submitResult?: unknown;
  reason?: string;
}

/**
 * The guarded orchestration. Pure decisions up front; the two mutators are only reachable after the
 * confirmation gate, and only via the injectable seams. Confirmed-path guard failures THROW typed errors
 * (mirroring cli/dream.ts) so `main` maps them to distinct non-zero exit codes.
 */
export async function runMigrate(opts: RunMigrateOptions = {}): Promise<MigrateResult> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const errorLog = opts.errorLog ?? ((line: string) => console.error(line));
  const detect = opts.detect ?? (() => detectEmbedder({}));
  const estimate = opts.estimate ?? defaultEstimate;
  const isDaemonReachable = opts.isDaemonReachable ?? defaultIsDaemonReachable;
  const writeConfig = opts.writeConfig ?? defaultWriteConfig;
  const submit = opts.submit ?? defaultSubmit;
  const confirm = opts.confirm ?? defaultConfirm;
  const to = opts.to && opts.to.trim() !== "" ? opts.to.trim() : null;

  // 1. Detect current posture.
  const det = detect();

  // 2. Resolve the target decision. `--to` re-runs selectEmbedder through the override path (validated);
  //    without `--to` the detect's decision IS the decided default.
  const targetDecision = to ? selectEmbedder({ ...det.input, override: to }) : det.decision;

  // 2a. A non-semantic target means the request cannot be honored (bad override, illegal dims, no
  //     embedder). Refuse loudly BEFORE any effectful path — nothing is mutated.
  const target = resolveTarget(targetDecision);
  if (!target) {
    const reason = targetDecision.reasons[0] ?? "no-embedder";
    errorLog(`ebrain embedder migrate: cannot migrate — ${describeRefusal(reason, to)}`);
    return { status: "invalid-target", exitCode: EXIT_INVALID_TARGET, reason };
  }

  const actions = targetDecision.actions;

  // 3. Nothing to do — already on the target signature.
  if (actions.length === 0) {
    log(`already on ${target.signature}, nothing to migrate`);
    return { status: "noop", exitCode: EXIT_OK, target, actions };
  }

  // 4. Cost preview (telemetry — USD only).
  const cost = await estimate(target, actions);
  log(formatPreview(target, actions, cost));

  // 5. Confirmation gate (HARD).
  if (opts.dryRun) {
    log("dry run — nothing changed. Re-run with --yes to apply.");
    return { status: "dry-run", exitCode: EXIT_OK, target, actions, cost };
  }

  const isTTY = typeof opts.isTTY === "boolean" ? opts.isTTY : Boolean(process.stdin.isTTY);
  const approved = opts.yes === true || (isTTY && confirm(target));
  if (!approved) {
    log("re-run with --yes to apply");
    return { status: "confirm-required", exitCode: EXIT_CONFIRM_REQUIRED, target, actions, cost };
  }

  // 6. Effectful path (built, NEVER executed by the build task). Refuse before ANY mutation if the
  //    daemon is unreachable or the target dims are illegal; then config-write FIRST, submit SECOND.
  const reachable = await isDaemonReachable();
  if (!reachable) throw new DaemonUnreachableError();

  if (!Number.isInteger(target.dims) || target.dims <= 0 || target.dims > MAX_DIM) {
    throw new InvalidTargetError(
      `target dimensions ${target.dims} are invalid (must be 1..${MAX_DIM}); refusing before any change`,
    );
  }

  await writeConfig(target);
  const payload = buildReembedSubmission({ sourceId: opts.source ?? undefined });
  const submitResult = await submit(payload);

  log(`migrated to ${target.signature}; re-embed submitted (${payload.name}).`);
  return { status: "submitted", exitCode: EXIT_OK, target, actions, cost, payload, submitResult };
}

/** Turn a machine reason code into a one-line human refusal. */
function describeRefusal(reason: string, to: string | null): string {
  switch (reason) {
    case "override-invalid":
      return `the target "${to ?? ""}" could not be parsed (expected provider:model@dims)`;
    case "dims-illegal":
      return `the requested embedding dimensions exceed the ${MAX_DIM}-dimension limit`;
    case "no-embedder":
      return "no embedder is available (set OPENROUTER_API_KEY or start Ollama), and no valid --to was given";
    default:
      return `target unavailable (${reason})`;
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────

export interface ParsedMigrateArgs {
  to?: string;
  source?: string;
  dryRun: boolean;
  yes: boolean;
}

function flagValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function parseMigrateArgs(argv: string[]): ParsedMigrateArgs {
  return {
    to: flagValue(argv, "--to"),
    source: flagValue(argv, "--source"),
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes"),
  };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseMigrateArgs(argv);
  try {
    const res = await runMigrate({
      to: args.to,
      source: args.source,
      dryRun: args.dryRun,
      yes: args.yes,
    });
    return res.exitCode;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`ebrain embedder migrate: ${msg}`);
    if (err instanceof DaemonUnreachableError) return EXIT_DAEMON_UNREACHABLE;
    if (err instanceof InvalidTargetError) return EXIT_INVALID_TARGET;
    return 1;
  }
}

// Referenced so a future "no brain yet" branch can sharpen its message without an unused-import lint.
void brainConfigExists;

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`ebrain embedder migrate: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}
