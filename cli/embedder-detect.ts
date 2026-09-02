#!/usr/bin/env bun
/**
 * cli/embedder-detect.ts — the I/O adapter around the pure embedder decision.
 *
 * `cli/embedder.ts` decides which embedder a brain should use, but it decides only: every dependency
 * arrives through its argument. Something has to gather those dependencies from the messy outside
 * world — which env NAMES are present, whether a local server answered, what the store was last
 * embedded with — and turn the decision back into one honest human line for `ebrain doctor`/`status`.
 * That is this module.
 *
 * The split is deliberate and load-bearing:
 *   - `buildEmbedderInput` and `describeEmbedder` are PURE (no process.env, no fs, no network, no
 *     clock). They take a `DetectSources` snapshot / a decision and are unit-tested in isolation.
 *   - Only `detectEmbedder` and `main()` touch I/O, and env access is PRESENCE-only: a key is read as
 *     a boolean (`!= null && !== ""`), never as a value, and never logged. Secrets are named, not shown.
 *
 * The memory engine (gbrain) writes its config to `<GBRAIN_HOME>/.gbrain/config.json` — where
 * GBRAIN_HOME is a *parent* directory and `.gbrain` is appended, matching the engine's own
 * `configDir()` convention (vendor/gbrain/src/core/config.ts). When unset, the default base is $HOME.
 * A fresh clone has no such file; that is tolerated as "no brain yet".
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  EMBEDDER_CATALOG,
  HNSW_DIM_CAP,
  MAX_DIM,
  selectEmbedder,
  type EmbedderDecision,
  type EmbedderInput,
} from "./embedder.ts";

/**
 * The parsed subset of the engine's config.json that the embedder decision cares about. All fields
 * optional/nullable because a config may predate a field, or be a fresh `--no-embedding` init.
 */
export interface EngineEmbedConfig {
  embedding_model?: string | null; // "provider:model", e.g. "openrouter:openai/text-embedding-3-small"
  embedding_dimensions?: number | null;
  embedding_disabled?: boolean | null;
}

/**
 * A snapshot of everything the decision depends on, already reduced to plain data. Booleans only for
 * presence/probe (never a secret value); `engineConfig` is null when there is no brain yet.
 */
export interface DetectSources {
  envPresent: Record<string, boolean>; // e.g. { OPENROUTER_API_KEY: true }
  probeOk: Record<string, boolean>; // e.g. { ollama: false }
  engineConfig: EngineEmbedConfig | null;
  override: string | null;
}

/** A positive integer, and nothing that merely coerces to one. */
function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

/**
 * PURE. Map an outside-world snapshot onto the decision's input.
 *
 * - `brain.signature`: the store's canonical `provider:model:dims` identity — but only when the
 *   config represents a real, enabled embedded store: not disabled, a non-empty `embedding_model`
 *   (which already carries the `provider:model` half), and a positive `embedding_dimensions`.
 *   Otherwise null. The signature is `<embedding_model>:<embedding_dimensions>`.
 * - `brain.columnDims`: the physical vector column width — present whenever `embedding_dimensions`
 *   is a positive integer, independent of whether embedding is disabled (the column can outlive the
 *   feature). Null for missing/malformed dims.
 * - `envPresent`, `probeOk`, `override` pass straight through.
 */
export function buildEmbedderInput(sources: DetectSources): EmbedderInput {
  const cfg = sources.engineConfig;

  let signature: string | null = null;
  let columnDims: number | null = null;

  if (cfg) {
    const dims = cfg.embedding_dimensions;
    if (isPositiveInt(dims)) columnDims = dims;

    const model = cfg.embedding_model;
    const modelNonEmpty = typeof model === "string" && model.trim() !== "";
    if (cfg.embedding_disabled !== true && modelNonEmpty && isPositiveInt(dims)) {
      signature = `${model}:${dims}`;
    }
  }

  return {
    envPresent: sources.envPresent,
    probeOk: sources.probeOk,
    brain: { signature, columnDims },
    override: sources.override,
  };
}

/**
 * The provider a store was embedded with, and a NAMED hint for how to make it available again — used
 * only for the "configured but now unavailable" line. Returns null unless the config carries a real,
 * enabled signature (same predicate as `buildEmbedderInput`'s signature branch). The hint refers to a
 * key by NAME (never a value) or to the local server by nature; an unrecognized provider degrades to a
 * generic "its API key" so we never fabricate an env name we don't have a recipe for.
 */
function storedProviderHint(cfg: EngineEmbedConfig | null): { label: string; hint: string } | null {
  if (!cfg || cfg.embedding_disabled === true) return null;
  const model = cfg.embedding_model;
  if (typeof model !== "string" || model.trim() === "") return null;
  if (!isPositiveInt(cfg.embedding_dimensions)) return null;

  const colon = model.indexOf(":");
  const providerId = colon === -1 ? model : model.slice(0, colon);
  const candidate = EMBEDDER_CATALOG.find((c) => c.providerId === providerId);

  let hint: string;
  if (candidate && candidate.tier === "hosted" && candidate.envKeys.length > 0) {
    hint = `${candidate.envKeys[0]} is not set`;
  } else if (candidate && candidate.tier === "local") {
    hint = "the Ollama server is not reachable";
  } else {
    hint = "its API key is not set";
  }
  return { label: model, hint };
}

/**
 * PURE. One honest English line describing the current recall posture, for `ebrain doctor`/`status`.
 * Never prints a secret value; keys are referred to by NAME. Branch order matters: reason-driven
 * failures (bad override, illegal dims) are the operator's most actionable signal and come first; the
 * "configured but now unavailable" degradation comes before the generic no-key hint.
 */
export function describeEmbedder(decision: EmbedderDecision, sources: DetectSources): string {
  if (decision.mode === "semantic" && decision.selected) {
    const s = decision.selected;
    // The decision names an embedder, but the store is only ACTUALLY on it when nothing is left to do.
    // A pending configure/re-embed (or an embedding-disabled store) means recall is still keyword until
    // a migrate applies it — say that honestly rather than claim a semantic recall that isn't live yet.
    if (decision.actions.length > 0) {
      return `keyword-only recall now · ${s.providerId}:${s.modelId} available (${s.dims}d) — run: ebrain embedder migrate to enable semantic`;
    }
    let line = `semantic recall · ${s.providerId}:${s.modelId} (${s.dims}d)`;
    if (decision.reasons.includes("dims-over-hnsw-cap")) {
      line += ` · flat scan (dimensions exceed the HNSW cap of ${HNSW_DIM_CAP})`;
    }
    return line;
  }

  // keyword-only from here down.
  if (decision.reasons.includes("override-invalid")) {
    return "keyword-only recall · embedder override could not be parsed; fix or clear it, then run: ebrain embedder migrate";
  }
  if (decision.reasons.includes("dims-illegal")) {
    return `keyword-only recall · requested embedding dimensions exceed the ${MAX_DIM}-dimension limit; choose a smaller model, then run: ebrain embedder migrate`;
  }

  const stored = storedProviderHint(sources.engineConfig);
  if (stored) {
    return `keyword-only recall · store was embedded with ${stored.label}, but ${stored.hint} — recall degraded to keyword; restore it or run: ebrain embedder migrate`;
  }

  return "keyword-only recall · set OPENROUTER_API_KEY or start Ollama, then run: ebrain embedder migrate";
}

// ── I/O boundary ────────────────────────────────────────────────────────────────────────────────

/** Presence, never value. A key is "present" iff it is neither null/undefined nor the empty string. */
function isPresent(value: string | undefined): boolean {
  return value != null && value !== "";
}

/**
 * Resolve the engine config path from an explicit base, else $GBRAIN_HOME, else $HOME. GBRAIN_HOME is
 * a *parent* directory; `.gbrain/config.json` is always appended, matching the engine's `configDir()`.
 * Never throws — an unset or exotic value simply yields a path that won't exist, read tolerantly below.
 */
function resolveConfigPath(gbrainHome: string | undefined, env: NodeJS.ProcessEnv): string {
  const base =
    (gbrainHome && gbrainHome.trim() !== "" && gbrainHome) ||
    (env.GBRAIN_HOME && env.GBRAIN_HOME.trim() !== "" && env.GBRAIN_HOME) ||
    env.HOME ||
    homedir();
  return join(base, ".gbrain", "config.json");
}

/**
 * Read + parse the engine config, tolerantly. A missing file (fresh clone) or corrupt JSON both mean
 * "no brain yet" → null. Fields are narrowed defensively; unknown/extra keys are ignored. This reads a
 * plain config (embedding model/dims/disabled) — it is NOT a credential file and carries no secret.
 */
function readEngineConfig(file: string): EngineEmbedConfig | null {
  try {
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    if (parsed == null || typeof parsed !== "object") return null;
    const model = parsed.embedding_model;
    const dims = parsed.embedding_dimensions;
    const disabled = parsed.embedding_disabled;
    return {
      embedding_model: typeof model === "string" ? model : null,
      embedding_dimensions: typeof dims === "number" ? dims : null,
      embedding_disabled: typeof disabled === "boolean" ? disabled : null,
    };
  } catch {
    return null; // missing OR corrupt → treat as no brain.
  }
}

/**
 * Default local probe. Synchronous by contract, bounded (~500ms), and total: any failure — no server,
 * connection refused, timeout, missing binary — is caught and reported as `{ ollama: false }`. It runs
 * the reachability fetch inside a short-lived Bun subprocess so the whole probe stays synchronous while
 * still honoring the timeout; the parent never sees an exception.
 */
function defaultProbe(): Record<string, boolean> {
  return { ollama: probeOllama() };
}

function probeOllama(): boolean {
  try {
    if (typeof Bun === "undefined") return false;
    const url = "http://127.0.0.1:11434/api/tags";
    const script = `try{const r=await fetch(${JSON.stringify(
      url,
    )},{signal:AbortSignal.timeout(500)});process.exit(r.status===200?0:1);}catch{process.exit(1);}`;
    const res = Bun.spawnSync([process.execPath, "-e", script], {
      stdout: "ignore",
      stderr: "ignore",
      timeout: 1500,
    });
    return res.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * THIN I/O wrapper: gather the snapshot, run the pure decision, and surface it. Everything impure is
 * confined here. `probe` is injectable (tests never hit the network); `env` defaults to process.env
 * but is only ever read for PRESENCE. The embedder override, when the operator sets one, arrives via
 * the EBRAIN_EMBEDDER env var — a model spec ("provider:model@dims"), not a secret, so its value is
 * read; it is passed verbatim to the pure decision, which validates it and degrades loudly if bad.
 */
export function detectEmbedder(opts: {
  gbrainHome?: string;
  env?: NodeJS.ProcessEnv;
  probe?: () => Record<string, boolean>;
}): { input: EmbedderInput; decision: EmbedderDecision; describe: string } {
  const env = opts.env ?? process.env;

  const engineConfig = readEngineConfig(resolveConfigPath(opts.gbrainHome, env));
  const probeOk = (opts.probe ?? defaultProbe)();

  const overrideRaw = env.EBRAIN_EMBEDDER;
  const override = typeof overrideRaw === "string" && overrideRaw.trim() !== "" ? overrideRaw : null;

  const sources: DetectSources = {
    envPresent: { OPENROUTER_API_KEY: isPresent(env.OPENROUTER_API_KEY) },
    probeOk,
    engineConfig,
    override,
  };

  const input = buildEmbedderInput(sources);
  const decision = selectEmbedder(input);
  const describe = describeEmbedder(decision, sources);
  return { input, decision, describe };
}

/**
 * Runnable entrypoint. Prints the decision + the human line as JSON so a shell launcher can `jq` it.
 * Reads the real config read-only (its purpose); never writes, never prints a secret.
 */
function main(): void {
  const { decision, describe } = detectEmbedder({});
  const active = decision.mode === "semantic" && decision.actions.length === 0;
  process.stdout.write(`${JSON.stringify({ mode: decision.mode, active, describe, decision }, null, 2)}\n`);
}

if (import.meta.main) main();
