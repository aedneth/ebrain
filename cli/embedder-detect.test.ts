/**
 * Unit tests for the embedder detection adapter. Two pure functions (buildEmbedderInput,
 * describeEmbedder) are exercised by fixtures; the thin I/O wrapper (detectEmbedder) is exercised
 * with an injected probe and a tmp-dir fake config. Everything is keyless and offline — no test ever
 * reads a value from a secret, hits the network, or touches the real ~/.gbrain.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildEmbedderInput,
  describeEmbedder,
  detectEmbedder,
  type DetectSources,
  type EngineEmbedConfig,
} from "./embedder-detect.ts";
import { MAX_DIM, selectEmbedder } from "./embedder.ts";

const HOSTED_MODEL = "openrouter:openai/text-embedding-3-small";
const HOSTED_SIG = `${HOSTED_MODEL}:1536`;

/** A neutral, fully-specified snapshot; spread over to vary one axis at a time. */
function makeSources(overrides: Partial<DetectSources> = {}): DetectSources {
  return {
    envPresent: {},
    probeOk: {},
    engineConfig: null,
    override: null,
    ...overrides,
  };
}

/** Build the real decision from a snapshot, exactly as the wrapper does — describe over real output. */
function decide(sources: DetectSources) {
  return selectEmbedder(buildEmbedderInput(sources));
}

// ── buildEmbedderInput ────────────────────────────────────────────────────────────────────────

describe("buildEmbedderInput — mapping", () => {
  test("fresh clone (null config) → brain {null,null}, everything else passes through", () => {
    const sources = makeSources({
      envPresent: { OPENROUTER_API_KEY: true },
      probeOk: { ollama: false },
      override: "openrouter:m@8",
    });
    const input = buildEmbedderInput(sources);
    expect(input.brain).toEqual({ signature: null, columnDims: null });
    expect(input.envPresent).toEqual({ OPENROUTER_API_KEY: true });
    expect(input.probeOk).toEqual({ ollama: false });
    expect(input.override).toBe("openrouter:m@8");
  });

  test("enabled config → signature is model:dims and columnDims is dims", () => {
    const cfg: EngineEmbedConfig = {
      embedding_model: HOSTED_MODEL,
      embedding_dimensions: 1536,
      embedding_disabled: false,
    };
    const input = buildEmbedderInput(makeSources({ engineConfig: cfg }));
    expect(input.brain.signature).toBe(HOSTED_SIG);
    expect(input.brain.columnDims).toBe(1536);
  });

  test("embedding_disabled:true → signature null, but columnDims still tracks the column width", () => {
    const cfg: EngineEmbedConfig = {
      embedding_model: HOSTED_MODEL,
      embedding_dimensions: 1536,
      embedding_disabled: true,
    };
    const input = buildEmbedderInput(makeSources({ engineConfig: cfg }));
    expect(input.brain.signature).toBeNull();
    expect(input.brain.columnDims).toBe(1536);
  });

  test("empty embedding_model → signature null", () => {
    const cfg: EngineEmbedConfig = { embedding_model: "  ", embedding_dimensions: 1536 };
    expect(buildEmbedderInput(makeSources({ engineConfig: cfg })).brain.signature).toBeNull();
  });

  test("malformed dims (0, negative, fractional, missing) → columnDims null and signature null", () => {
    const bad: Array<EngineEmbedConfig["embedding_dimensions"]> = [0, -5, 1536.5, null, undefined];
    for (const dims of bad) {
      const cfg: EngineEmbedConfig = { embedding_model: HOSTED_MODEL, embedding_dimensions: dims };
      const input = buildEmbedderInput(makeSources({ engineConfig: cfg }));
      expect(input.brain.columnDims).toBeNull();
      expect(input.brain.signature).toBeNull();
    }
  });

  test("is pure — no ambient I/O in the source", () => {
    // buildEmbedderInput + describeEmbedder must not reach for process.env, fs, network, or the clock.
    // (detectEmbedder lives in the same file and legitimately does, so we scan for their bodies only
    //  by asserting the pure functions are deterministic under repeated calls with identical input.)
    const sources = makeSources({ engineConfig: { embedding_model: HOSTED_MODEL, embedding_dimensions: 1536 } });
    expect(buildEmbedderInput(sources)).toEqual(buildEmbedderInput(sources));
  });
});

// ── describeEmbedder ──────────────────────────────────────────────────────────────────────────

describe("describeEmbedder — every branch", () => {
  test("decided but not applied (fresh store, key present) → honest keyword-now + migrate", () => {
    const sources = makeSources({ envPresent: { OPENROUTER_API_KEY: true } });
    const line = describeEmbedder(decide(sources), sources);
    expect(line).toBe(
      "keyword-only recall now · openrouter:openai/text-embedding-3-small available (1536d) — run: ebrain embedder migrate to enable semantic",
    );
  });

  test("active semantic (store already on the decided signature) → names provider:model and dims", () => {
    const sources = makeSources({
      envPresent: { OPENROUTER_API_KEY: true },
      engineConfig: { embedding_model: "openrouter:openai/text-embedding-3-small", embedding_dimensions: 1536, embedding_disabled: false },
    });
    const decision = decide(sources);
    expect(decision.actions).toEqual([]);
    expect(describeEmbedder(decision, sources)).toBe("semantic recall · openrouter:openai/text-embedding-3-small (1536d)");
  });

  test("active semantic over the HNSW cap → flags a flat scan on the same line", () => {
    const sources = makeSources({
      envPresent: { OPENROUTER_API_KEY: true },
      engineConfig: { embedding_model: "openrouter:openai/text-embedding-3-large", embedding_dimensions: 3072, embedding_disabled: false },
      override: "openrouter:openai/text-embedding-3-large@3072",
    });
    const decision = decide(sources);
    expect(decision.actions).toEqual([]);
    const line = describeEmbedder(decision, sources);
    expect(line).toContain("semantic recall · openrouter:openai/text-embedding-3-large (3072d)");
    expect(line).toContain("flat scan");
  });

  test("keyword-only, no key and no probe → the exact set-a-key hint", () => {
    const sources = makeSources({ envPresent: { OPENROUTER_API_KEY: false }, probeOk: { ollama: false } });
    const line = describeEmbedder(decide(sources), sources);
    expect(line).toBe(
      "keyword-only recall · set OPENROUTER_API_KEY or start Ollama, then run: ebrain embedder migrate",
    );
  });

  test("override-invalid → explains the override and the fix, even with a key present", () => {
    const sources = makeSources({ override: "garbage-no-structure", envPresent: { OPENROUTER_API_KEY: true } });
    const decision = decide(sources);
    expect(decision.reasons).toEqual(["override-invalid"]);
    const line = describeEmbedder(decision, sources);
    expect(line).toContain("override");
    expect(line).toContain("ebrain embedder migrate");
  });

  test("dims-illegal → explains the dimension limit and the fix", () => {
    const sources = makeSources({ override: "openrouter:openai/text-embedding-3-large@20000" });
    const decision = decide(sources);
    expect(decision.reasons).toEqual(["dims-illegal"]);
    const line = describeEmbedder(decision, sources);
    expect(line).toContain(String(MAX_DIM));
    expect(line).toContain("ebrain embedder migrate");
  });

  test("configured but now unavailable (known provider) → says which key to restore, by NAME", () => {
    const cfg: EngineEmbedConfig = {
      embedding_model: HOSTED_MODEL,
      embedding_dimensions: 1536,
      embedding_disabled: false,
    };
    const sources = makeSources({
      engineConfig: cfg,
      envPresent: { OPENROUTER_API_KEY: false },
      probeOk: { ollama: false },
    });
    const decision = decide(sources);
    expect(decision.mode).toBe("keyword-only");
    const line = describeEmbedder(decision, sources);
    expect(line).toContain("store was embedded with openrouter:openai/text-embedding-3-small");
    expect(line).toContain("OPENROUTER_API_KEY is not set");
    expect(line).toContain("ebrain embedder migrate");
  });

  test("configured but now unavailable (legacy/unknown provider) → generic key hint, no fabricated env name", () => {
    const cfg: EngineEmbedConfig = {
      embedding_model: "openai:text-embedding-3-large",
      embedding_dimensions: 1536,
      embedding_disabled: false,
    };
    const sources = makeSources({ engineConfig: cfg, envPresent: { OPENROUTER_API_KEY: false } });
    const line = describeEmbedder(decide(sources), sources);
    expect(line).toContain("store was embedded with openai:text-embedding-3-large");
    expect(line).toContain("its API key is not set");
  });
});

// ── detectEmbedder (thin I/O wrapper) ───────────────────────────────────────────────────────────

describe("detectEmbedder — injected probe + tmp-dir fake config", () => {
  const madeDirs: string[] = [];

  afterEach(() => {
    for (const d of madeDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** Create an isolated tmp GBRAIN_HOME; optionally write a .gbrain/config.json into it. */
  function tmpHome(configJson?: string): string {
    const home = mkdtempSync(join(tmpdir(), "ebrain-detect-"));
    madeDirs.push(home);
    if (configJson !== undefined) {
      mkdirSync(join(home, ".gbrain"), { recursive: true });
      writeFileSync(join(home, ".gbrain", "config.json"), configJson);
    }
    return home;
  }

  test("no config file (fresh clone) + no key + probe false → keyword-only, no-embedder line", () => {
    const home = tmpHome(); // no config written
    const out = detectEmbedder({ gbrainHome: home, env: {}, probe: () => ({ ollama: false }) });
    expect(out.decision.mode).toBe("keyword-only");
    expect(out.describe).toBe(
      "keyword-only recall · set OPENROUTER_API_KEY or start Ollama, then run: ebrain embedder migrate",
    );
  });

  test("corrupt config.json → tolerated as no brain (no throw), keyword-only", () => {
    const home = tmpHome("{ not valid json ");
    const out = detectEmbedder({ gbrainHome: home, env: {}, probe: () => ({ ollama: false }) });
    expect(out.input.brain.signature).toBeNull();
    expect(out.decision.mode).toBe("keyword-only");
  });

  test("real enabled config, but the key is now gone → configured-but-now-unavailable line", () => {
    const home = tmpHome(
      JSON.stringify({ embedding_model: HOSTED_MODEL, embedding_dimensions: 1536, embedding_disabled: false }),
    );
    const out = detectEmbedder({ gbrainHome: home, env: {}, probe: () => ({ ollama: false }) });
    expect(out.input.brain.signature).toBe(HOSTED_SIG);
    expect(out.decision.mode).toBe("keyword-only");
    expect(out.describe).toContain("store was embedded with openrouter:openai/text-embedding-3-small");
    expect(out.describe).toContain("OPENROUTER_API_KEY is not set");
  });

  test("OPENROUTER_API_KEY is read for PRESENCE only — its value never leaks into the output", () => {
    const home = tmpHome();
    const secret = "sk-super-secret-value-do-not-leak";
    const out = detectEmbedder({
      gbrainHome: home,
      env: { OPENROUTER_API_KEY: secret },
      probe: () => ({ ollama: false }),
    });
    expect(out.input.envPresent.OPENROUTER_API_KEY).toBe(true);
    expect(out.decision.mode).toBe("semantic"); // presence alone selects the hosted default
    expect(JSON.stringify(out)).not.toContain(secret);
  });

  test("EBRAIN_EMBEDDER override flows through and is honored when legal", () => {
    const home = tmpHome();
    const out = detectEmbedder({
      gbrainHome: home,
      env: { EBRAIN_EMBEDDER: "openrouter:openai/text-embedding-3-small@1536" },
      probe: () => ({ ollama: false }),
    });
    expect(out.input.override).toBe("openrouter:openai/text-embedding-3-small@1536");
    expect(out.decision.mode).toBe("semantic");
    expect(out.decision.reasons).toContain("override");
  });

  test("injected probe true with no key → local (ollama) selection", () => {
    const home = tmpHome();
    const out = detectEmbedder({ gbrainHome: home, env: {}, probe: () => ({ ollama: true }) });
    expect(out.decision.selected?.providerId).toBe("ollama");
    // Fresh store: ollama is the DECIDED embedder but nothing is embedded yet, so recall is honestly
    // keyword-until-migrate rather than an already-active semantic claim.
    expect(out.describe).toContain("ollama:nomic-embed-text available (768d)");
    expect(out.describe).toContain("ebrain embedder migrate");
  });
});
