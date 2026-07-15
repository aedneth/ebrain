import { describe, expect, test } from "bun:test";
import { assertCleanSources, parseSourcesJson, sourceIsolationGuards } from "./daemon-preflight.ts";

describe("daemon preflight source isolation", () => {
  test("parses gbrain sources list JSON", () => {
    const sources = parseSourcesJson(JSON.stringify({
      sources: [
        { id: "second-brain", name: "Second Brain", local_path: "/home/me/brain", federated: true },
      ],
    }));
    expect(sources).toEqual([
      { id: "second-brain", name: "Second Brain", local_path: "/home/me/brain", federated: true },
    ]);
  });

  test("builds guards from id, name, and local path", () => {
    expect(sourceIsolationGuards([
      { id: "agent-memory", name: "Agent Memory", local_path: "/home/me/eBrain/memory" },
    ])).toEqual(["agent-memory", "Agent Memory", "/home/me/eBrain/memory"]);
  });

  test("fails boot preflight when a client source is present", () => {
    expect(() => assertCleanSources([
      { id: "second-brain", federated: true },
      { id: "code-graph/brisas-del-golfo", federated: true },
    ])).toThrow("aislamiento roto");
    expect(() => assertCleanSources([
      { id: "safe-name", name: "Dekko export", federated: true },
    ])).toThrow("aislamiento roto");
  });
});
