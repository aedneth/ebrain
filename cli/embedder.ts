/**
 * cli/embedder.ts — the pure embedder-selection decision.
 *
 * Which embedding model a brain should use is a decision with real consequences: a wrong switch
 * silently invalidates an entire vector store and forces a re-embed. That decision has to be
 * auditable and testable in isolation, so it lives here as a PURE, deterministic, I/O-free
 * function. Everything the decision depends on — which env vars are present, whether a local
 * server answered a probe, what the store was last embedded with, an explicit operator override —
 * arrives through the argument. This module never touches the process environment, the filesystem,
 * the network, or the clock; presence is passed in as booleans and secrets are referred to by NAME.
 *
 * The caller (a configure/doctor path elsewhere) is responsible for probing, reading env, and
 * acting on the returned `actions`. This function only decides.
 */

export type EmbedderTier = "hosted" | "local" | "none";

export interface EmbedderCandidate {
  providerId: string; // gbrain recipe id, e.g. "openrouter" | "ollama"
  modelId: string; // e.g. "openai/text-embedding-3-small"
  dims: number;
  tier: EmbedderTier;
  envKeys: string[]; // env NAMES only, never values
  probeKey?: string; // for local servers that need a reachability probe
}

export interface BrainEmbedState {
  signature: string | null;
  columnDims: number | null;
}

export interface EmbedderInput {
  envPresent: Record<string, boolean>; // booleans only, e.g. { OPENROUTER_API_KEY: true }
  probeOk: Record<string, boolean>; // e.g. { ollama: false }
  brain: BrainEmbedState;
  override: string | null; // explicit "provider:model@dims" or null
}

export type EmbedderAction = "configure" | "reembed" | "alter-column";

export interface EmbedderDecision {
  mode: "semantic" | "keyword-only";
  selected: EmbedderCandidate | null;
  signature: string | null; // always `${providerId}:${modelId}:${dims}` when selected
  actions: EmbedderAction[];
  reasons: string[]; // stable machine-readable codes
}

/**
 * Above this the store still embeds and searches, but the HNSW index cannot be built over the
 * column: we select anyway and flag `dims-over-hnsw-cap` so the caller can fall back to a flat
 * scan instead of failing outright.
 */
export const HNSW_DIM_CAP = 2000;

/** Beyond this a vector column is illegal outright — refuse and stay keyword-only. */
export const MAX_DIM = 16000;

/**
 * The candidate catalog. Named and extensible on purpose: new recipes are added here, and the
 * precedence logic below reads from it generically (first-available-hosted, first-available-local).
 */
export const EMBEDDER_CATALOG: readonly EmbedderCandidate[] = [
  {
    providerId: "openrouter",
    modelId: "openai/text-embedding-3-small",
    dims: 1536,
    tier: "hosted",
    envKeys: ["OPENROUTER_API_KEY"],
  },
  {
    providerId: "ollama",
    modelId: "nomic-embed-text",
    dims: 768,
    tier: "local",
    envKeys: [],
    probeKey: "ollama",
  },
];

/** The canonical, comparable identity of an embedder. Store signatures use this exact shape. */
function signatureOf(candidate: EmbedderCandidate): string {
  return `${candidate.providerId}:${candidate.modelId}:${candidate.dims}`;
}

/**
 * Availability is a property of the tier, not of the model name: a hosted candidate is available
 * when every one of its env NAMES is present (booleans only — we never see the values), a local
 * candidate when its reachability probe came back ok.
 */
function isAvailable(candidate: EmbedderCandidate, input: EmbedderInput): boolean {
  if (candidate.tier === "hosted") {
    return candidate.envKeys.every((key) => input.envPresent[key] === true);
  }
  if (candidate.tier === "local") {
    return candidate.probeKey != null && input.probeOk[candidate.probeKey] === true;
  }
  return false;
}

const keywordOnly = (reasons: string[]): EmbedderDecision => ({
  mode: "keyword-only",
  selected: null,
  signature: null,
  actions: [],
  reasons,
});

/**
 * Parse an explicit override of the form "provider:model@dims" into a synthetic candidate, or
 * `null` when the string is unparseable or names a provider we have no recipe for. The provider is
 * split on the FIRST colon and the dims on the LAST `@`, so a model id that itself contains a slash
 * (e.g. "openai/text-embedding-3-small") is preserved intact. Dims are only accepted as a bare
 * positive integer — this refuses "1e3", "0x10", "1536.0", "-5" and "0" rather than coercing them.
 * The tier/env/probe metadata is inherited from the named provider's catalog recipe, so an override
 * can change the model or dims but not invent a provider that has no way to be reached.
 */
function parseOverride(raw: string): EmbedderCandidate | null {
  const s = raw.trim();
  const colonIdx = s.indexOf(":");
  if (colonIdx <= 0) return null; // missing provider or missing colon
  const provider = s.slice(0, colonIdx);
  const rest = s.slice(colonIdx + 1);

  const atIdx = rest.lastIndexOf("@");
  if (atIdx <= 0) return null; // missing model or missing "@dims"
  const modelId = rest.slice(0, atIdx);
  const dimsStr = rest.slice(atIdx + 1);
  if (modelId.length === 0 || dimsStr.length === 0) return null;
  if (!/^[0-9]+$/.test(dimsStr)) return null; // dims must be a bare positive integer
  const dims = Number.parseInt(dimsStr, 10);
  if (!Number.isInteger(dims) || dims <= 0) return null;

  const base = EMBEDDER_CATALOG.find((c) => c.providerId === provider);
  if (!base) return null; // unknown provider — never guess a fallback

  return {
    providerId: base.providerId,
    modelId,
    dims,
    tier: base.tier,
    envKeys: [...base.envKeys],
    probeKey: base.probeKey,
  };
}

/**
 * Pick a candidate by precedence when there is no override:
 *   sticky        — a store already embedded with an available provider is never auto-switched.
 *   hosted-default — the first available hosted recipe.
 *   local-probe   — the first available local recipe.
 * Returns `null` when nothing is available (the caller stays keyword-only).
 */
function pickByPrecedence(input: EmbedderInput): { candidate: EmbedderCandidate; reason: string } | null {
  const { brain } = input;
  if (brain.signature !== null) {
    const match = EMBEDDER_CATALOG.find((c) => signatureOf(c) === brain.signature);
    if (match && isAvailable(match, input)) return { candidate: match, reason: "sticky" };
  }
  const hosted = EMBEDDER_CATALOG.find((c) => c.tier === "hosted" && isAvailable(c, input));
  if (hosted) return { candidate: hosted, reason: "hosted-default" };
  const local = EMBEDDER_CATALOG.find((c) => c.tier === "local" && isAvailable(c, input));
  if (local) return { candidate: local, reason: "local-probe" };
  return null;
}

/** Compute the migration actions implied by moving the store to `candidate`. */
function computeActions(brain: BrainEmbedState, candidate: EmbedderCandidate, signature: string): EmbedderAction[] {
  if (brain.signature === null) {
    const actions: EmbedderAction[] = ["configure"];
    if (brain.columnDims === null || brain.columnDims !== candidate.dims) actions.push("alter-column");
    return actions;
  }
  if (brain.signature !== signature) {
    const actions: EmbedderAction[] = ["reembed"];
    if (brain.columnDims !== candidate.dims) actions.push("alter-column");
    return actions;
  }
  return []; // already on this exact signature — nothing to do
}

/**
 * Turn a chosen candidate into the final decision, applying dims legality last: a candidate over
 * `MAX_DIM` is refused entirely (keyword-only, `dims-illegal`); one over `HNSW_DIM_CAP` but within
 * `MAX_DIM` is kept, with `dims-over-hnsw-cap` flagged for the caller.
 */
function finalize(candidate: EmbedderCandidate, baseReason: string, brain: BrainEmbedState): EmbedderDecision {
  if (candidate.dims > MAX_DIM) return keywordOnly(["dims-illegal"]);
  const reasons = [baseReason];
  if (candidate.dims > HNSW_DIM_CAP) reasons.push("dims-over-hnsw-cap");
  const signature = signatureOf(candidate);
  return {
    mode: "semantic",
    selected: candidate,
    signature,
    actions: computeActions(brain, candidate, signature),
    reasons,
  };
}

/**
 * Decide the embedder for a brain. Pure and total: every dependency comes through `input`, and no
 * input throws. An explicit override is authoritative when legal — it is never silently overridden
 * by a fallback; an unparseable or unknown override degrades to keyword-only so the operator's
 * intent is not quietly replaced by a guess.
 */
export function selectEmbedder(input: EmbedderInput): EmbedderDecision {
  const override = input.override;
  if (override !== null && override.trim() !== "") {
    const candidate = parseOverride(override);
    if (candidate === null) return keywordOnly(["override-invalid"]);
    return finalize(candidate, "override", input.brain);
  }

  const selection = pickByPrecedence(input);
  if (selection === null) return keywordOnly(["no-embedder"]);
  return finalize(selection.candidate, selection.reason, input.brain);
}
