import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { addCatalogEntry, addExecutionProfile, migrateRoutingConfig, parseProfileStore, readProfileStore, summarizeProfiles, writeProfileStore } from "./profiles.ts";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ebrain-profiles-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const ROUTING = {
  capabilities: {
    coding: { models: ["deepseek/deepseek-v4-pro", "qwen/qwen3-coder:free"] },
    terminal: { models: ["qwen/qwen3.7-max"] },
  },
};

describe("execution profiles -- ADR-005", () => {
  test("migrates routing chains as a legacy user profile, never a universal default", () => {
    const store = migrateRoutingConfig(ROUTING, "2026-07-15T00:00:00.000Z");
    expect(store.profiles[0]!.id).toBe("legacy-openrouter");
    expect(store.profiles[0]!.capabilities.coding).toEqual(ROUTING.capabilities.coding.models);
    expect(store.catalog.map((entry) => entry.id)).toEqual(["deepseek/deepseek-v4-pro", "qwen/qwen3-coder:free", "qwen/qwen3.7-max"]);
    expect(summarizeProfiles(store)[0]).toMatchObject({ models: 3, evidence: { source: "local-routing.yaml" } });
  });

  test("validates an exact, secret-free schema", () => {
    const store = migrateRoutingConfig(ROUTING, "2026-07-15T00:00:00.000Z");
    expect(parseProfileStore(store)).toEqual(store);
    expect(() => parseProfileStore({ ...store, token: "forbidden" })).toThrow("schema_version=1 required");
    expect(() => parseProfileStore({ ...store, profiles: [{ ...store.profiles[0], api_key: "forbidden" }] })).toThrow("unknown fields");
    expect(() => parseProfileStore({ ...store, profiles: [{ ...store.profiles[0], capabilities: { coding: ["bad model with spaces"] } }] })).toThrow("invalid capability/models");
  });

  test("writes atomically with private permissions", async () => {
    const dir = tempDir();
    const path = join(dir, "nested", "execution-profiles.json");
    const store = migrateRoutingConfig(ROUTING, "2026-07-15T00:00:00.000Z");
    await writeProfileStore(store, path);
    expect((statSync(dirname(path)).mode & 0o777)).toBe(0o700);
    expect((statSync(path).mode & 0o777)).toBe(0o600);
    expect(await readProfileStore(path)).toEqual(store);
  });

  test("requires catalog provenance before a user profile can select a new model", () => {
    const store = migrateRoutingConfig(ROUTING, "2026-07-15T00:00:00.000Z");
    const profile = {
      id: "personal-stack",
      label: "Personal stack",
      provider: "openrouter" as const,
      capabilities: { coding: ["qwen/qwen3-coder-plus"] },
      evidence: { source: "user-profile", as_of: "2026-07-15T00:00:00.000Z" },
    };
    expect(() => addExecutionProfile(store, profile)).toThrow("not in catalog");
    const withModel = addCatalogEntry(store, { id: "qwen/qwen3-coder-plus", source: "https://example.invalid/catalog", as_of: "2026-07-15T00:00:00.000Z" });
    const next = addExecutionProfile(withModel, profile);
    expect(next.profiles.map((candidate) => candidate.id)).toEqual(["legacy-openrouter", "personal-stack"]);
    expect(() => addExecutionProfile(next, profile)).toThrow("profile already exists");
  });

  test("rejects a malformed existing store instead of silently using it", async () => {
    const dir = tempDir();
    const path = join(dir, "profiles.json");
    await Bun.write(path, '{"schema_version":1,"catalog":[],"profiles":[{"id":"bad"}]}');
    chmodSync(path, 0o600);
    await expect(readProfileStore(path)).rejects.toThrow("invalid profile store");
  });

  // ── G56-F7 — provenance invariants enforced in the parser, not just the mutation helpers ──
  test("rejects a store that combines empty profile provenance, empty catalog provenance and a duplicate catalog id", () => {
    const malformed = {
      schema_version: 1,
      catalog: [
        { id: "deepseek/deepseek-v4-pro", source: "   ", as_of: "2026-07-15T00:00:00.000Z" }, // empty catalog source
        { id: "deepseek/deepseek-v4-pro", source: "routing.yaml", as_of: "2026-07-15T00:00:00.000Z" }, // duplicate id
      ],
      profiles: [{
        id: "legacy-openrouter",
        label: "Migrated OpenRouter routing",
        provider: "openrouter",
        capabilities: { coding: ["deepseek/deepseek-v4-pro"] },
        evidence: { source: "  ", as_of: "2026-07-15T00:00:00.000Z" }, // empty profile provenance
      }],
    };
    // Empty catalog source is caught first; each defect independently fails the parser too.
    expect(() => parseProfileStore(malformed)).toThrow();
    expect(() => parseProfileStore({ ...malformed, catalog: [{ id: "a/b", source: "", as_of: "2026-07-15T00:00:00.000Z" }] })).toThrow("invalid catalog entry");
  });

  test("rejects a duplicate catalog id explicitly", () => {
    const store = {
      schema_version: 1,
      catalog: [
        { id: "a/b", source: "routing.yaml", as_of: "2026-07-15T00:00:00.000Z" },
        { id: "a/b", source: "routing.yaml", as_of: "2026-07-15T00:00:00.000Z" },
      ],
      profiles: [],
    };
    expect(() => parseProfileStore(store)).toThrow("duplicate catalog id");
  });

  test("rejects empty/whitespace profile evidence source", () => {
    const store = migrateRoutingConfig(ROUTING, "2026-07-15T00:00:00.000Z");
    const broken = { ...store, profiles: [{ ...store.profiles[0]!, evidence: { source: "   ", as_of: "2026-07-15T00:00:00.000Z" } }] };
    expect(() => parseProfileStore(broken)).toThrow("non-empty source");
  });

  test("as_of must be strict ISO-8601 UTC (rejects date-only and offset, accepts Z with/without millis)", () => {
    const store = migrateRoutingConfig(ROUTING, "2026-07-15T00:00:00.000Z");
    const withAsOf = (asOf: string) => ({ ...store, profiles: [{ ...store.profiles[0]!, evidence: { source: "user-profile", as_of: asOf } }] });
    expect(() => parseProfileStore(withAsOf("2026-07-15"))).toThrow(); // date-only
    expect(() => parseProfileStore(withAsOf("2026-07-15T00:00:00+02:00"))).toThrow(); // offset, not UTC
    expect(() => parseProfileStore(withAsOf("yesterday"))).toThrow(); // free-form
    expect(() => parseProfileStore(withAsOf("2026-07-15T00:00:00Z"))).not.toThrow(); // Z, no millis
    expect(() => parseProfileStore(withAsOf("2026-07-15T00:00:00.123Z"))).not.toThrow(); // Z, millis
  });
});
