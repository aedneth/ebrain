/**
 * Unit tests for the dream-cycle submission module. Everything here is pure,
 * offline, and daemon-free: the pure functions perform no I/O, and the thin
 * orchestration is exercised only through injected fakes (never a real submit,
 * never a real daemon, never the network). No `vendor/` import is triggered.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import {
  buildCycleSubmission,
  CURATED_PHASES,
  CYCLE_JOB_NAME,
  CYCLE_MAX_ATTEMPTS,
  DaemonUnreachableError,
  EMBEDDING_FREE_GC_PHASES,
  EMBED_PHASE,
  LLM_HEAVY_PHASES,
  parseDreamArgs,
  runDream,
  selectCyclePhases,
  SUBMIT_JOB_TOOL,
  type CycleSubmission,
} from "./dream.ts";

const ALL_COMBOS = [
  { atCap: false, keyless: false },
  { atCap: true, keyless: false },
  { atCap: false, keyless: true },
  { atCap: true, keyless: true },
];

describe("selectCyclePhases — curated set + degradation", () => {
  test("full curated set when NOT at cap and NOT keyless", () => {
    expect(selectCyclePhases({ atCap: false, keyless: false })).toEqual([
      "sync",
      "extract_facts",
      "consolidate",
      "embed",
      "orphans",
      "purge",
    ]);
    // baseline set is exactly the documented curated list, in order
    expect(selectCyclePhases({ atCap: false, keyless: false })).toEqual([...CURATED_PHASES]);
  });

  test("keyless drops `embed` (no embedder to run it)", () => {
    const phases = selectCyclePhases({ atCap: false, keyless: true });
    expect(phases).not.toContain(EMBED_PHASE);
  });

  test("keyless also drops the embedding-dependent heavy phase (consolidate)", () => {
    const phases = selectCyclePhases({ atCap: false, keyless: true });
    expect(phases).not.toContain("consolidate");
    expect(phases).toEqual(["sync", "extract_facts", "orphans", "purge"]);
  });

  test("at cap drops LLM-heavy phases (consolidate) AND `embed` (no new embedding spend at cap)", () => {
    const phases = selectCyclePhases({ atCap: true, keyless: false });
    for (const heavy of LLM_HEAVY_PHASES) expect(phases).not.toContain(heavy);
    expect(phases).not.toContain("consolidate");
    // At cap the cycle keeps only the embedding-free GC subset — `embed` would initiate new provider
    // spend, so it is dropped just like the LLM-heavy phases (the at-cap contract: no new spend).
    expect(phases).not.toContain("embed");
    expect(phases).toEqual(["sync", "extract_facts", "orphans", "purge"]);
  });

  test("at cap AND keyless degrades to the embedding-free GC subset only", () => {
    const phases = selectCyclePhases({ atCap: true, keyless: true });
    expect(phases).toEqual([...EMBEDDING_FREE_GC_PHASES]);
  });

  test("`extract_facts` is NOT treated as heavy — it survives at cap and keyless", () => {
    // Deterministic fence→DB reconcile, cost_usd: 0 (extract-facts.ts:278). Must
    // never be dropped as "LLM-heavy".
    expect(LLM_HEAVY_PHASES.has("extract_facts")).toBe(false);
    for (const combo of ALL_COMBOS) {
      expect(selectCyclePhases(combo)).toContain("extract_facts");
    }
  });

  test("the embedding-free GC/dedup subset is ALWAYS present (degrades, never fails)", () => {
    for (const combo of ALL_COMBOS) {
      const phases = selectCyclePhases(combo);
      for (const gc of EMBEDDING_FREE_GC_PHASES) {
        expect(phases).toContain(gc);
      }
    }
  });

  test("returns a fresh array and never mutates the shared curated constant", () => {
    const before = [...CURATED_PHASES];
    const out = selectCyclePhases({ atCap: false, keyless: false });
    out.push("mutated");
    expect([...CURATED_PHASES]).toEqual(before);
  });
});

describe("buildCycleSubmission — mirrors the real submitCycle contract", () => {
  test("shape: { name: 'autopilot-cycle', data: { phases }, max_attempts: 1 }", () => {
    const phases = ["sync", "extract_facts", "orphans", "purge"];
    const payload = buildCycleSubmission({ phases });
    expect(payload).toEqual({
      name: "autopilot-cycle",
      data: { phases },
      max_attempts: 1,
    });
    // named constants stay pinned to the real contract
    expect(payload.name).toBe(CYCLE_JOB_NAME);
    expect(payload.max_attempts).toBe(CYCLE_MAX_ATTEMPTS);
  });

  test("omits data.source_id when no source is given", () => {
    const payload = buildCycleSubmission({ phases: ["sync"] });
    expect("source_id" in payload.data).toBe(false);
  });

  test("includes data.source_id only when a source is provided (mirrors `if (source)`)", () => {
    const payload = buildCycleSubmission({ phases: ["sync"], sourceId: "agent-memory" });
    expect(payload.data.source_id).toBe("agent-memory");
  });

  test("copies the phases array (no aliasing of caller input)", () => {
    const phases = ["sync", "purge"];
    const payload = buildCycleSubmission({ phases });
    payload.data.phases.push("orphans");
    expect(phases).toEqual(["sync", "purge"]);
  });

  test("contract lock: the fields match those assembled in remote-tools.ts submitCycle", () => {
    // Assert directly against the real source we are mirroring, so a drift in the
    // engine's accepted shape fails this test.
    const src = readFileSync(new URL("./remote-tools.ts", import.meta.url), "utf8");
    expect(src).toContain(`"${SUBMIT_JOB_TOOL}"`); // MCP tool name: "submit_job"
    expect(src).toContain(`name: "${CYCLE_JOB_NAME}"`); // job name: "autopilot-cycle"
    expect(src).toContain(`max_attempts: ${CYCLE_MAX_ATTEMPTS}`); // max_attempts: 1
    expect(src).toMatch(/const data[^=]*=\s*\{\s*phases\s*\}/); // data: { phases }
    expect(src).toMatch(/data\.source_id\s*=\s*source/); // conditional source_id

    // ...and our builder emits exactly those keys.
    const payload = buildCycleSubmission({ phases: ["sync"], sourceId: "s" });
    expect(Object.keys(payload).sort()).toEqual(["data", "max_attempts", "name"]);
    expect(Object.keys(payload.data).sort()).toEqual(["phases", "source_id"]);
  });
});

describe("purity — the two exported pure functions do no I/O", () => {
  test("selectCyclePhases + buildCycleSubmission source has no env/fs/net/nondeterminism", () => {
    for (const fn of [selectCyclePhases, buildCycleSubmission]) {
      const source = fn.toString();
      expect(source).not.toMatch(/process\.env/);
      expect(source).not.toMatch(/\bfetch\(/);
      expect(source).not.toMatch(/readFileSync|writeFileSync|existsSync/);
      expect(source).not.toMatch(/\bimport\(/);
      expect(source).not.toMatch(/\brequire\(/);
      expect(source).not.toMatch(/Date\.now|Math\.random/);
    }
  });
});

describe("runDream — dry run never submits", () => {
  test("--dry-run prints phases + payload and does NOT call submit", async () => {
    const lines: string[] = [];
    let submitCalls = 0;
    const res = await runDream({
      dryRun: true,
      log: (l) => lines.push(l),
      submit: async () => {
        submitCalls += 1;
        return {};
      },
    });
    expect(submitCalls).toBe(0);
    expect(res.submitted).toBe(false);
    expect(res.phases).toEqual([...CURATED_PHASES]);
    // the payload is printed as pretty JSON
    const joined = lines.join("\n");
    expect(joined).toContain("dry run");
    expect(joined).toContain("phases:");
    expect(joined).toContain(`"${CYCLE_JOB_NAME}"`);
  });

  test("--dry-run honors an explicit phase override", async () => {
    const res = await runDream({
      dryRun: true,
      phases: ["sync", "purge"],
      log: () => {},
      submit: async () => ({}),
    });
    expect(res.phases).toEqual(["sync", "purge"]);
    expect(res.payload.data.phases).toEqual(["sync", "purge"]);
  });

  test("--dry-run reflects degradation flags", async () => {
    const res = await runDream({ dryRun: true, atCap: true, keyless: true, log: () => {} });
    expect(res.phases).toEqual([...EMBEDDING_FREE_GC_PHASES]);
  });
});

describe("runDream — guarded submit", () => {
  test("refuses with DaemonUnreachableError when the daemon is not reachable", async () => {
    let submitCalls = 0;
    await expect(
      runDream({
        isDaemonReachable: async () => false,
        submit: async () => {
          submitCalls += 1;
          return {};
        },
        log: () => {},
      }),
    ).rejects.toBeInstanceOf(DaemonUnreachableError);
    expect(submitCalls).toBe(0);
  });

  test("submits the built payload once when the daemon is reachable (injected)", async () => {
    const received: CycleSubmission[] = [];
    const res = await runDream({
      atCap: true,
      keyless: false,
      isDaemonReachable: async () => true,
      submit: async (payload) => {
        received.push(payload);
        return { job_id: "test-123" };
      },
      log: () => {},
    });
    expect(received.length).toBe(1);
    expect(received[0]).toEqual(buildCycleSubmission({ phases: selectCyclePhases({ atCap: true, keyless: false }) }));
    expect(res.submitted).toBe(true);
    expect(res.result).toEqual({ job_id: "test-123" });
  });
});

describe("parseDreamArgs", () => {
  test("parses flags, phase override, and source", () => {
    expect(parseDreamArgs(["--dry-run", "--at-cap", "--keyless"])).toEqual({
      dryRun: true,
      atCap: true,
      keyless: true,
      phases: undefined,
      sourceId: undefined,
    });
    expect(parseDreamArgs(["--phases", "sync, purge , orphans", "--source", "agent-memory"])).toEqual({
      dryRun: false,
      atCap: false,
      keyless: false,
      phases: ["sync", "purge", "orphans"],
      sourceId: "agent-memory",
    });
  });
});
