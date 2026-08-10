/**
 * Unit tests for the pure embedder-selection decision. Each of the eight documented invariants
 * gets at least one dedicated test. Everything here runs keyless and offline — the function under
 * test never performs I/O, so the tests never provide any.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import {
  EMBEDDER_CATALOG,
  HNSW_DIM_CAP,
  MAX_DIM,
  selectEmbedder,
  type EmbedderInput,
} from "./embedder.ts";

const HOSTED = EMBEDDER_CATALOG.find((c) => c.tier === "hosted")!;
const LOCAL = EMBEDDER_CATALOG.find((c) => c.tier === "local")!;
const HOSTED_SIG = `${HOSTED.providerId}:${HOSTED.modelId}:${HOSTED.dims}`;
const LOCAL_SIG = `${LOCAL.providerId}:${LOCAL.modelId}:${LOCAL.dims}`;

/** A neutral, fully-specified input; spread over to vary one axis at a time. */
function makeInput(overrides: Partial<EmbedderInput> = {}): EmbedderInput {
  return {
    envPresent: {},
    probeOk: {},
    brain: { signature: null, columnDims: null },
    override: null,
    ...overrides,
  };
}

describe("catalog + constants", () => {
  test("exposes exactly the two documented candidates and the dim bounds", () => {
    expect(EMBEDDER_CATALOG.length).toBe(2);
    expect(HOSTED).toMatchObject({
      providerId: "openrouter",
      modelId: "openai/text-embedding-3-small",
      dims: 1536,
      tier: "hosted",
      envKeys: ["OPENROUTER_API_KEY"],
    });
    expect(LOCAL).toMatchObject({
      providerId: "ollama",
      modelId: "nomic-embed-text",
      dims: 768,
      tier: "local",
      envKeys: [],
      probeKey: "ollama",
    });
    expect(HNSW_DIM_CAP).toBe(2000);
    expect(MAX_DIM).toBe(16000);
  });
});

describe("invariant 1 — pure & total", () => {
  const cases: EmbedderInput[] = [
    makeInput(),
    makeInput({ envPresent: { OPENROUTER_API_KEY: true } }),
    makeInput({ probeOk: { ollama: true } }),
    makeInput({ envPresent: { OPENROUTER_API_KEY: false }, probeOk: { ollama: false } }),
    makeInput({ brain: { signature: LOCAL_SIG, columnDims: 768 }, probeOk: { ollama: true } }),
    makeInput({ override: "openrouter:openai/text-embedding-3-small@1536" }),
    makeInput({ override: "not-a-real-override" }),
    makeInput({ override: "" }),
    makeInput({ override: "openrouter:model@20000" }),
  ];

  test("representative inputs never throw", () => {
    for (const input of cases) expect(() => selectEmbedder(input)).not.toThrow();
  });

  test("identical input produces deep-equal output on repeated calls", () => {
    for (const input of cases) {
      const a = selectEmbedder(input);
      const b = selectEmbedder(input);
      expect(a).toEqual(b);
    }
  });
});

describe("invariant 2 — secrets by name (no process.env in the function source)", () => {
  test("cli/embedder.ts never reads process.env", () => {
    const source = readFileSync(new URL("./embedder.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/process\.env/);
    // and no other ambient I/O leaked in
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/readFileSync/);
    expect(source).not.toMatch(/Date\.now|Math\.random/);
  });

  test("selection is driven only by the boolean presence map", () => {
    const decision = selectEmbedder(makeInput({ envPresent: { OPENROUTER_API_KEY: true } }));
    expect(decision.selected?.providerId).toBe("openrouter");
    // The candidate carries env NAMES only — never a value.
    expect(decision.selected?.envKeys).toEqual(["OPENROUTER_API_KEY"]);
  });
});

describe("invariant 3 — override wins when legal, degrades loudly when not", () => {
  test("a legal override is selected verbatim, even with no env/probe available", () => {
    const decision = selectEmbedder(makeInput({ override: "openrouter:openai/text-embedding-3-small@1536" }));
    expect(decision.mode).toBe("semantic");
    expect(decision.reasons).toContain("override");
    expect(decision.selected).toMatchObject({ providerId: "openrouter", modelId: "openai/text-embedding-3-small", dims: 1536 });
    expect(decision.signature).toBe("openrouter:openai/text-embedding-3-small:1536");
  });

  test("unparseable override → keyword-only, override-invalid (no silent fallback)", () => {
    // OPENROUTER_API_KEY is present: a silent guess would have selected hosted. It must not.
    const decision = selectEmbedder(makeInput({ override: "garbage-no-structure", envPresent: { OPENROUTER_API_KEY: true } }));
    expect(decision.mode).toBe("keyword-only");
    expect(decision.reasons).toEqual(["override-invalid"]);
    expect(decision.selected).toBeNull();
  });

  test("unknown provider → override-invalid", () => {
    const decision = selectEmbedder(makeInput({ override: "acme:some-model@512" }));
    expect(decision.mode).toBe("keyword-only");
    expect(decision.reasons).toEqual(["override-invalid"]);
  });

  test("non-integer / malformed dims → override-invalid", () => {
    for (const bad of ["openrouter:model@abc", "openrouter:model@1e3", "openrouter:model@1536.0", "openrouter:model@0", "openrouter:model@-5"]) {
      const decision = selectEmbedder(makeInput({ override: bad }));
      expect(decision.reasons).toEqual(["override-invalid"]);
    }
  });
});

describe("invariant 4 — stickiness (a working store is never auto-switched)", () => {
  test("ollama signature stays ollama even when the hosted key is also present", () => {
    const decision = selectEmbedder(
      makeInput({
        brain: { signature: LOCAL_SIG, columnDims: 768 },
        probeOk: { ollama: true },
        envPresent: { OPENROUTER_API_KEY: true },
      }),
    );
    expect(decision.selected?.providerId).toBe("ollama");
    expect(decision.reasons).toContain("sticky");
    expect(decision.signature).toBe(LOCAL_SIG);
    // On the exact same signature there is nothing to migrate.
    expect(decision.actions).toEqual([]);
  });
});

describe("invariant 5 — precedence when unconfigured", () => {
  test("OPENROUTER_API_KEY present → hosted", () => {
    const decision = selectEmbedder(makeInput({ envPresent: { OPENROUTER_API_KEY: true } }));
    expect(decision.selected?.providerId).toBe("openrouter");
    expect(decision.reasons).toContain("hosted-default");
  });

  test("only ollama probe ok → local", () => {
    const decision = selectEmbedder(makeInput({ probeOk: { ollama: true } }));
    expect(decision.selected?.providerId).toBe("ollama");
    expect(decision.reasons).toContain("local-probe");
  });

  test("neither available → keyword-only, no-embedder", () => {
    const decision = selectEmbedder(makeInput({ envPresent: { OPENROUTER_API_KEY: false }, probeOk: { ollama: false } }));
    expect(decision.mode).toBe("keyword-only");
    expect(decision.reasons).toEqual(["no-embedder"]);
  });
});

describe("invariant 6 — re-embed trigger", () => {
  const LEGACY_SIG = "openai:text-embedding-3-large:1536";

  test("legacy 1536 store selecting the openrouter 1536 default → reembed, NOT alter-column", () => {
    const decision = selectEmbedder(
      makeInput({
        brain: { signature: LEGACY_SIG, columnDims: 1536 },
        envPresent: { OPENROUTER_API_KEY: true },
      }),
    );
    expect(decision.selected?.providerId).toBe("openrouter");
    expect(decision.signature).toBe(HOSTED_SIG);
    expect(decision.actions).toContain("reembed");
    // Dims are equal (1536 == 1536), so the column does not need altering.
    expect(decision.actions).not.toContain("alter-column");
    expect(decision.actions).toEqual(["reembed"]);
  });

  test("768 selection over a 1536 column → reembed AND alter-column", () => {
    const decision = selectEmbedder(
      makeInput({
        brain: { signature: LEGACY_SIG, columnDims: 1536 },
        envPresent: { OPENROUTER_API_KEY: false },
        probeOk: { ollama: true },
      }),
    );
    expect(decision.selected?.providerId).toBe("ollama");
    expect(decision.actions).toContain("reembed");
    expect(decision.actions).toContain("alter-column");
    expect(decision.actions).toEqual(["reembed", "alter-column"]);
  });

  test("first-time configure emits configure (+ alter-column when the column is unset)", () => {
    const decision = selectEmbedder(makeInput({ envPresent: { OPENROUTER_API_KEY: true } }));
    expect(decision.actions).toEqual(["configure", "alter-column"]);
  });
});

describe("invariant 7 — keyword-only shape", () => {
  test("keyword-only ⇒ selected null, signature null, actions []", () => {
    const decision = selectEmbedder(makeInput());
    expect(decision.mode).toBe("keyword-only");
    expect(decision.selected).toBeNull();
    expect(decision.signature).toBeNull();
    expect(decision.actions).toEqual([]);
  });
});

describe("invariant 8 — dims legality", () => {
  test("dims 3072 (> HNSW cap, <= MAX) still selects, flagged dims-over-hnsw-cap", () => {
    const decision = selectEmbedder(makeInput({ override: "openrouter:openai/text-embedding-3-large@3072" }));
    expect(decision.mode).toBe("semantic");
    expect(decision.selected?.dims).toBe(3072);
    expect(decision.reasons).toContain("dims-over-hnsw-cap");
    expect(decision.reasons).toContain("override");
  });

  test("dims 20000 (> MAX) → keyword-only, dims-illegal", () => {
    const decision = selectEmbedder(makeInput({ override: "openrouter:openai/text-embedding-3-large@20000" }));
    expect(decision.mode).toBe("keyword-only");
    expect(decision.selected).toBeNull();
    expect(decision.signature).toBeNull();
    expect(decision.actions).toEqual([]);
    expect(decision.reasons).toEqual(["dims-illegal"]);
  });
});
