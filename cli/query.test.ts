/**
 * cli/query.test.ts — G56-F5: the `ebrain q` structured cross-source adapter.
 *
 * Pure/offline: `queryAcrossSources` takes injectable deps so the merge, isolation, partial-
 * failure and all-failure contract is exercised without a live daemon. The executable wrapper
 * smoke is hermetic — it fails at arg parse, before any MCP call.
 */
import { describe, expect, test } from "bun:test";
import { join } from "path";
import {
  mergeQueryResults,
  parseFederatedSources,
  parseSourceResults,
  queryAcrossSources,
  type QueryResult,
} from "./query.ts";

const EBRAIN_HOME = join(import.meta.dir, "..");

// ── parseFederatedSources — default-deny federation + client isolation by id/name/path ──
describe("parseFederatedSources", () => {
  test("keeps only federated, non-default, non-client sources", () => {
    const payload = {
      sources: [
        { id: "second-brain", name: "Second Brain", local_path: "/home/e/Documents/Second Brain", federated: true },
        { id: "company-brain", name: "Company Brain", local_path: "/home/e/Documents/Company Brain", federated: true },
        { id: "default", federated: true },      // excluded: default
        { id: "some-local", federated: false },  // excluded: not federated
      ],
    };
    expect(parseFederatedSources(payload).map((s) => s.id)).toEqual(["second-brain", "company-brain"]);
  });

  test("excludes a client source by id, by display name, and by local_path (case-insensitive)", () => {
    const payload = {
      sources: [
        { id: "clean", federated: true },
        { id: "Brisas-Del-Golfo", federated: true },                                    // by id, case-insensitive
        { id: "cust-1", name: "DEKKO client", federated: true },                        // by name
        { id: "cust-2", local_path: "/home/e/repos/brisas-del-golfo", federated: true },// by local_path
        { id: "cust-3", local_path: "/home/e/work/dekko/src", federated: true },        // by local_path subdir
      ],
    };
    expect(parseFederatedSources(payload).map((s) => s.id)).toEqual(["clean"]);
  });

  test("throws on a malformed sources_list payload", () => {
    expect(() => parseFederatedSources({})).toThrow(/invalid payload/);
    expect(() => parseFederatedSources({ sources: "nope" })).toThrow(/invalid payload/);
    expect(() => parseFederatedSources(null)).toThrow(/invalid payload/);
  });
});

// ── parseSourceResults — malformed rows skipped, secrets scrubbed ──
describe("parseSourceResults", () => {
  test("throws when the per-source payload is not an array", () => {
    expect(() => parseSourceResults("second-brain", { nope: true })).toThrow(/invalid payload/);
  });

  test("skips malformed rows and keeps well-formed ones", () => {
    const rows = parseSourceResults("second-brain", [
      { score: 0.9, slug: "a/one", chunk_text: "hello" },
      { score: "high", slug: "a/two", chunk_text: "bad score" }, // skipped (score not a number)
      { slug: "a/three", chunk_text: "no score" },               // skipped (missing score)
      { score: 0.5, slug: "   ", chunk_text: "blank slug" },     // skipped (empty slug)
      { score: 0.4, slug: "a/four" },                            // snippet defaults to ""
    ]);
    expect(rows.map((r) => r.slug)).toEqual(["a/one", "a/four"]);
    expect(rows[0]!.source).toBe("second-brain");
    expect(rows[1]!.snippet).toBe("");
  });

  test("scrubs secret-shaped content from the snippet", () => {
    const rows = parseSourceResults("s", [
      { score: 1, slug: "note", chunk_text: "OPENAI_API_KEY=sk-not-a-real-value-000000000000" },
    ]);
    expect(rows[0]!.snippet).not.toContain("sk-not-a-real-value");
    expect(rows[0]!.snippet).toContain("[REDACTED]");
  });
});

// ── mergeQueryResults — score order + slug dedup + limit ──
describe("mergeQueryResults", () => {
  test("orders by score desc, dedups by slug (highest wins), applies the limit", () => {
    const rows: QueryResult[] = [
      { score: 0.4, source: "a", slug: "dup", snippet: "low" },
      { score: 0.9, source: "b", slug: "dup", snippet: "high" },
      { score: 0.7, source: "a", slug: "mid", snippet: "m" },
      { score: 0.8, source: "b", slug: "top", snippet: "t" },
    ];
    const merged = mergeQueryResults(rows, 2);
    expect(merged.map((r) => r.slug)).toEqual(["dup", "top"]);
    expect(merged[0]!.snippet).toBe("high"); // the higher-scored duplicate survived
  });
});

// ── queryAcrossSources — end-to-end with injected deps (no daemon) ──
function deps(sources: unknown, perSource: Record<string, unknown>) {
  return {
    listSources: async () => sources,
    querySource: async (source: string) => {
      const v = perSource[source];
      if (typeof v === "function") return (v as () => never)();
      return v;
    },
  };
}

describe("queryAcrossSources", () => {
  const twoSources = {
    sources: [
      { id: "second-brain", federated: true },
      { id: "company-brain", federated: true },
    ],
  };

  test("positive: structured merge across sources, score order, dedup, schema", async () => {
    const res = await queryAcrossSources("korvex", 10, deps(twoSources, {
      "second-brain": [{ score: 0.6, slug: "shared", chunk_text: "sb" }, { score: 0.5, slug: "sb-only", chunk_text: "x" }],
      "company-brain": [{ score: 0.9, slug: "shared", chunk_text: "cb" }, { score: 0.8, slug: "cb-only", chunk_text: "y" }],
    }));
    expect(res.schema_version).toBe(1);
    expect(res.query).toBe("korvex");
    expect(res.partial).toBe(false);
    expect(res.failures).toEqual([]);
    expect(res.results.map((r) => r.slug)).toEqual(["shared", "cb-only", "sb-only"]);
  });

  test("empty eligible sources throws (never a silent empty result)", async () => {
    await expect(
      queryAcrossSources("x", 10, deps({ sources: [{ id: "default", federated: true }] }, {})),
    ).rejects.toThrow(/no eligible/);
  });

  test("one source fails, the other succeeds → partial:true with failure metadata", async () => {
    const res = await queryAcrossSources("x", 10, deps(twoSources, {
      "second-brain": [{ score: 0.5, slug: "ok", chunk_text: "z" }],
      "company-brain": () => { throw new Error("boom"); },
    }));
    expect(res.partial).toBe(true);
    expect(res.results.map((r) => r.slug)).toEqual(["ok"]);
    expect(res.failures).toEqual([{ source: "company-brain", message: "boom" }]);
  });

  test("a secret in a source-failure message is scrubbed (assignment + token) — F-CF-3", async () => {
    const res = await queryAcrossSources("x", 10, deps(twoSources, {
      "second-brain": [{ score: 0.5, slug: "ok", chunk_text: "z" }],
      "company-brain": () => { throw new Error("upstream said OPENAI_API_KEY=sk-proj-Ab12Cd34Ef56Gh78Ij90Kl rejected"); },
    }));
    expect(res.partial).toBe(true);
    const msg = res.failures[0]!.message;
    expect(msg).not.toContain("sk-proj-Ab12Cd34Ef56Gh78Ij90Kl");
    expect(msg).toContain("[REDACTED]");
  });

  test("all sources fail → loud throw, never a silent empty result", async () => {
    await expect(queryAcrossSources("x", 10, deps(twoSources, {
      "second-brain": () => { throw new Error("a"); },
      "company-brain": () => { throw new Error("b"); },
    }))).rejects.toThrow(/all federated source queries failed/);
  });

  test("rejects an empty query and an out-of-range limit", async () => {
    await expect(queryAcrossSources("", 10, deps(twoSources, {}))).rejects.toThrow(/cannot be empty/);
    await expect(queryAcrossSources("x", 0, deps(twoSources, {}))).rejects.toThrow(/limit/);
    await expect(queryAcrossSources("x", 999, deps(twoSources, {}))).rejects.toThrow(/limit/);
  });
});

// ── scripts/ebrain-q wrapper — hermetic smoke (fails at arg parse, no daemon) ──
describe("scripts/ebrain-q wrapper", () => {
  test("executable wrapper prints usage and exits non-zero with no query", async () => {
    const proc = Bun.spawn(["bash", join(EBRAIN_HOME, "scripts", "ebrain-q")], {
      env: { ...process.env, EBRAIN_HOME },
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(code).not.toBe(0);
    expect(stderr).toContain("usage: ebrain q");
  });
});
