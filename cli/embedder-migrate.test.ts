/**
 * Unit tests for `ebrain embedder migrate` — the most safety-sensitive command in the CLI.
 *
 * EVERY test is offline, keyless, and store-free: the orchestration is driven ONLY through injected
 * fakes (detect, estimate, isDaemonReachable, writeConfig, submit, confirm). No test reads a secret,
 * opens a real `~/.gbrain`, reaches a daemon, calls a provider, or spends a cent. The load-bearing
 * assertions are the ones proving the confirmation gate blocks mutation: the injected `writeConfig`
 * and `submit` mutators are asserted NOT to have been called on every non-confirmed path.
 */
import { describe, expect, test } from "bun:test";
import {
  buildReembedSubmission,
  computeCostPreview,
  DaemonUnreachableError,
  EMBED_PHASE,
  estimateUsd,
  EXIT_CONFIRM_REQUIRED,
  EXIT_DAEMON_UNREACHABLE,
  EXIT_INVALID_TARGET,
  EXIT_OK,
  formatPreview,
  parseMigrateArgs,
  REEMBED_JOB_NAME,
  REEMBED_MAX_ATTEMPTS,
  resolveTarget,
  ROUGH_TOKENS_PER_CHUNK,
  runMigrate,
  type CostPreview,
  type DetectResult,
  type ReembedSubmission,
  type TargetEmbedder,
} from "./embedder-migrate.ts";
import type { EmbedderCandidate, EmbedderDecision, EmbedderInput } from "./embedder.ts";

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────

const TARGET_MODEL = "openrouter:openai/text-embedding-3-small";
const TARGET_SIG = `${TARGET_MODEL}:1536`;
const DEAD_SIG = "openai:text-embedding-3-large:1536";

const TARGET_CANDIDATE: EmbedderCandidate = {
  providerId: "openrouter",
  modelId: "openai/text-embedding-3-small",
  dims: 1536,
  tier: "hosted",
  envKeys: ["OPENROUTER_API_KEY"],
};

/** A brain currently on the dead openai config, with the openrouter target available. */
function migrationNeededInput(): EmbedderInput {
  return {
    envPresent: { OPENROUTER_API_KEY: true },
    probeOk: { ollama: false },
    brain: { signature: DEAD_SIG, columnDims: 1536 },
    override: null,
  };
}

/** Decision that a re-embed is needed to reach the target. */
function migrationNeededDecision(): EmbedderDecision {
  return {
    mode: "semantic",
    selected: TARGET_CANDIDATE,
    signature: TARGET_SIG,
    actions: ["reembed"],
    reasons: ["hosted-default"],
  };
}

function detectFake(
  decision: EmbedderDecision = migrationNeededDecision(),
  input: EmbedderInput = migrationNeededInput(),
): () => DetectResult {
  return () => ({ input, decision, describe: "test" });
}

const FAKE_COST: CostPreview = {
  chunkCount: 1000,
  estimatedTokens: 256_000,
  pricePerMTok: 0.02,
  estimatedUsd: 0.00512,
  pricingKnown: true,
  source: "rough",
};

/** A recording harness for the two effectful mutators + the daemon probe + estimate. */
function spies(overrides: { reachable?: boolean; submitResult?: unknown } = {}) {
  const calls: string[] = [];
  let writeArg: TargetEmbedder | undefined;
  let submitArg: ReembedSubmission | undefined;
  let estimateCalls = 0;
  let reachableCalls = 0;
  const logs: string[] = [];
  return {
    calls,
    logs,
    get writeArg() {
      return writeArg;
    },
    get submitArg() {
      return submitArg;
    },
    get estimateCalls() {
      return estimateCalls;
    },
    get reachableCalls() {
      return reachableCalls;
    },
    deps: {
      estimate: async () => {
        estimateCalls++;
        return FAKE_COST;
      },
      isDaemonReachable: async () => {
        reachableCalls++;
        return overrides.reachable ?? true;
      },
      writeConfig: async (t: TargetEmbedder) => {
        calls.push("write");
        writeArg = t;
      },
      submit: async (p: ReembedSubmission) => {
        calls.push("submit");
        submitArg = p;
        return overrides.submitResult ?? { jobId: 1 };
      },
      log: (line: string) => logs.push(line),
      errorLog: (line: string) => logs.push(line),
    },
  };
}

// ── Pure helpers ────────────────────────────────────────────────────────────────────────────────

describe("pure helpers", () => {
  test("estimateUsd — tokens × per-1M price", () => {
    expect(estimateUsd(1_000_000, 0.02)).toBeCloseTo(0.02, 10);
    expect(estimateUsd(256_000, 0.02)).toBeCloseTo(0.00512, 10);
  });

  test("computeCostPreview — injected chunk count + price → expected USD estimate", () => {
    const preview = computeCostPreview({ chunkCount: 1000, pricePerMTok: 0.02, pricingKnown: true });
    expect(preview.estimatedTokens).toBe(1000 * ROUGH_TOKENS_PER_CHUNK);
    expect(preview.estimatedUsd).toBeCloseTo(0.00512, 10);
    expect(preview.pricingKnown).toBe(true);
  });

  test("computeCostPreview — engine char count wins over the rough chunk heuristic", () => {
    const preview = computeCostPreview({
      chunkCount: 10,
      charCount: 35_000,
      pricePerMTok: 0.02,
      pricingKnown: true,
      source: "engine",
    });
    expect(preview.estimatedTokens).toBe(Math.ceil(35_000 / 3.5)); // 10_000
    expect(preview.estimatedUsd).toBeCloseTo((10_000 / 1_000_000) * 0.02, 10);
    expect(preview.source).toBe("engine");
  });

  test("computeCostPreview — unknown price → null USD (never fabricated)", () => {
    const preview = computeCostPreview({ chunkCount: 1000, pricePerMTok: null, pricingKnown: false });
    expect(preview.estimatedUsd).toBeNull();
  });

  test("computeCostPreview — unknown count → null USD even with a known price", () => {
    const preview = computeCostPreview({ chunkCount: null, pricePerMTok: 0.02, pricingKnown: true });
    expect(preview.estimatedTokens).toBeNull();
    expect(preview.estimatedUsd).toBeNull();
  });

  test("buildReembedSubmission — mirrors the dream.ts submit_job shape", () => {
    expect(buildReembedSubmission()).toEqual({
      name: REEMBED_JOB_NAME,
      data: { phases: [EMBED_PHASE] },
      max_attempts: REEMBED_MAX_ATTEMPTS,
    });
  });

  test("buildReembedSubmission — source scope is included only when provided", () => {
    expect(buildReembedSubmission({ sourceId: "second-brain" })).toEqual({
      name: REEMBED_JOB_NAME,
      data: { phases: [EMBED_PHASE], source_id: "second-brain" },
      max_attempts: REEMBED_MAX_ATTEMPTS,
    });
  });

  test("resolveTarget — semantic decision → concrete target; keyword-only → null", () => {
    const target = resolveTarget(migrationNeededDecision());
    expect(target).toEqual({
      providerId: "openrouter",
      modelId: "openai/text-embedding-3-small",
      dims: 1536,
      model: TARGET_MODEL,
      signature: TARGET_SIG,
    });
    expect(
      resolveTarget({ mode: "keyword-only", selected: null, signature: null, actions: [], reasons: ["no-embedder"] }),
    ).toBeNull();
  });

  test("formatPreview — surfaces USD (labeled estimate), not raw token counts", () => {
    const target = resolveTarget(migrationNeededDecision())!;
    const line = formatPreview(target, ["reembed"], FAKE_COST);
    expect(line).toContain(TARGET_SIG);
    expect(line).toContain("reembed");
    expect(line).toContain("(estimate)");
    expect(line).toContain("$0.01"); // 0.00512 → toFixed(2)
    expect(line).not.toContain("256000"); // token count is telemetry, not user-facing
  });

  test("parseMigrateArgs — flags", () => {
    expect(parseMigrateArgs(["--to", "openrouter:m@1536", "--dry-run"])).toEqual({
      to: "openrouter:m@1536",
      source: undefined,
      dryRun: true,
      yes: false,
    });
    expect(parseMigrateArgs(["--yes", "--source", "sb"])).toEqual({
      to: undefined,
      source: "sb",
      dryRun: false,
      yes: true,
    });
  });
});

// ── Orchestration ──────────────────────────────────────────────────────────────────────────────

describe("runMigrate — no migration needed", () => {
  test("already-active target → exits 0, mutates nothing, estimate not even computed", async () => {
    const s = spies();
    const decision: EmbedderDecision = {
      mode: "semantic",
      selected: TARGET_CANDIDATE,
      signature: TARGET_SIG,
      actions: [], // nothing to do
      reasons: ["sticky"],
    };
    const activeInput: EmbedderInput = {
      envPresent: { OPENROUTER_API_KEY: true },
      probeOk: { ollama: false },
      brain: { signature: TARGET_SIG, columnDims: 1536 },
      override: null,
    };
    const res = await runMigrate({ detect: detectFake(decision, activeInput), ...s.deps });
    expect(res.status).toBe("noop");
    expect(res.exitCode).toBe(EXIT_OK);
    expect(s.calls).toEqual([]); // no write, no submit
    expect(s.estimateCalls).toBe(0);
    expect(s.reachableCalls).toBe(0);
    expect(s.logs.some((l) => l.includes("already on") && l.includes(TARGET_SIG))).toBe(true);
  });
});

describe("runMigrate — --dry-run", () => {
  test("prints the preview and NEVER calls the mutators", async () => {
    const s = spies();
    const res = await runMigrate({ detect: detectFake(), dryRun: true, ...s.deps });
    expect(res.status).toBe("dry-run");
    expect(res.exitCode).toBe(EXIT_OK);
    expect(s.estimateCalls).toBe(1); // preview WAS computed
    expect(s.calls).toEqual([]); // but nothing was mutated
    expect(s.reachableCalls).toBe(0); // and the daemon was never probed
    expect(s.logs.some((l) => l.includes("ebrain embedder migrate — plan"))).toBe(true);
  });
});

describe("runMigrate — confirmation gate (HARD)", () => {
  test("no --yes, non-TTY → refuses, non-zero, mutators NEVER called", async () => {
    const s = spies();
    const res = await runMigrate({ detect: detectFake(), yes: false, isTTY: false, ...s.deps });
    expect(res.status).toBe("confirm-required");
    expect(res.exitCode).toBe(EXIT_CONFIRM_REQUIRED);
    expect(res.exitCode).not.toBe(0);
    expect(s.calls).toEqual([]); // the load-bearing assertion: nothing mutated
    expect(s.reachableCalls).toBe(0);
    expect(s.logs.some((l) => l.includes("re-run with --yes"))).toBe(true);
  });

  test("TTY confirm declined → refuses, mutators NEVER called", async () => {
    const s = spies();
    const res = await runMigrate({
      detect: detectFake(),
      yes: false,
      isTTY: true,
      confirm: () => false,
      ...s.deps,
    });
    expect(res.status).toBe("confirm-required");
    expect(s.calls).toEqual([]);
  });

  test("TTY confirm accepted → proceeds through the effectful path", async () => {
    const s = spies();
    const res = await runMigrate({
      detect: detectFake(),
      yes: false,
      isTTY: true,
      confirm: () => true,
      ...s.deps,
    });
    expect(res.status).toBe("submitted");
    expect(s.calls).toEqual(["write", "submit"]);
  });
});

describe("runMigrate — --yes (confirmed effectful path)", () => {
  test("config-write + submit called once each, IN ORDER, with the right target/payload", async () => {
    const s = spies({ reachable: true, submitResult: { jobId: 42 } });
    const res = await runMigrate({
      detect: detectFake(),
      yes: true,
      isTTY: false,
      source: "second-brain",
      ...s.deps,
    });
    expect(res.status).toBe("submitted");
    expect(res.exitCode).toBe(EXIT_OK);
    expect(s.calls).toEqual(["write", "submit"]); // order: config switch BEFORE submit
    expect(s.writeArg?.signature).toBe(TARGET_SIG);
    expect(s.writeArg?.model).toBe(TARGET_MODEL);
    expect(s.writeArg?.dims).toBe(1536);
    expect(s.submitArg).toEqual({
      name: REEMBED_JOB_NAME,
      data: { phases: [EMBED_PHASE], source_id: "second-brain" },
      max_attempts: REEMBED_MAX_ATTEMPTS,
    });
    expect(res.submitResult).toEqual({ jobId: 42 });
  });

  test("no --source → payload carries no source_id", async () => {
    const s = spies();
    await runMigrate({ detect: detectFake(), yes: true, isTTY: false, ...s.deps });
    expect(s.submitArg).toEqual({
      name: REEMBED_JOB_NAME,
      data: { phases: [EMBED_PHASE] },
      max_attempts: REEMBED_MAX_ATTEMPTS,
    });
  });
});

describe("runMigrate — refuses before any mutation", () => {
  test("daemon unreachable → throws, mutators NEVER called", async () => {
    const s = spies({ reachable: false });
    await expect(
      runMigrate({ detect: detectFake(), yes: true, isTTY: false, ...s.deps }),
    ).rejects.toBeInstanceOf(DaemonUnreachableError);
    expect(s.calls).toEqual([]); // config-write + submit never reached
    expect(s.reachableCalls).toBe(1); // probe happened, then refused
  });

  test("invalid --to dims (over MAX_DIM) → invalid-target, mutators NEVER called", async () => {
    const s = spies();
    const res = await runMigrate({
      detect: detectFake(),
      to: "openrouter:some-model@20000", // 20000 > MAX_DIM (16000)
      yes: true,
      isTTY: false,
      ...s.deps,
    });
    expect(res.status).toBe("invalid-target");
    expect(res.exitCode).toBe(EXIT_INVALID_TARGET);
    expect(res.reason).toBe("dims-illegal");
    expect(s.calls).toEqual([]);
    expect(s.estimateCalls).toBe(0); // refused before even pricing it
    expect(s.reachableCalls).toBe(0);
  });

  test("unparseable --to → invalid-target, mutators NEVER called", async () => {
    const s = spies();
    const res = await runMigrate({
      detect: detectFake(),
      to: "not-a-valid-spec",
      yes: true,
      isTTY: false,
      ...s.deps,
    });
    expect(res.status).toBe("invalid-target");
    expect(res.reason).toBe("override-invalid");
    expect(s.calls).toEqual([]);
  });
});

describe("runMigrate — --to routes through selectEmbedder's override path", () => {
  test("valid --to changes the target signature", async () => {
    const s = spies();
    const res = await runMigrate({
      detect: detectFake(),
      to: "openrouter:openai/text-embedding-3-small@512",
      yes: true,
      isTTY: false,
      ...s.deps,
    });
    expect(res.status).toBe("submitted");
    expect(res.target?.signature).toBe("openrouter:openai/text-embedding-3-small:512");
    expect(s.writeArg?.dims).toBe(512);
  });
});

// Exit-code sanity: distinct non-zero codes for distinct refusals.
describe("exit codes", () => {
  test("distinct non-zero codes", () => {
    expect(EXIT_OK).toBe(0);
    expect(EXIT_CONFIRM_REQUIRED).not.toBe(0);
    expect(EXIT_DAEMON_UNREACHABLE).not.toBe(0);
    expect(EXIT_INVALID_TARGET).not.toBe(0);
  });
});
