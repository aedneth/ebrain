/**
 * cli/providers.test.ts — the registry and the routing-config schema.
 *
 * These two modules exist to turn "which provider" from a compile-time fact into a config one, so
 * the tests pin the properties that make that safe: an unknown id is usable but only with the
 * endpoint spelled out, a pre-registry config still resolves, the cap cannot silently become NaN,
 * and no descriptor ever carries a credential.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  PROVIDERS,
  completionsUrl,
  configuredKeyNames,
  findProvider,
  isValidProviderId,
  providerIds,
  providerRows,
  providerStatusFor,
  readCost,
  resolveProvider,
} from "./providers.ts";
import { inferProviderId, parseRoutingConfig, RoutingConfigError } from "./config-schema.ts";

const EBRAIN_HOME = join(import.meta.dir, "..");

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    budget: { monthly_usd: 5, hard_stop: true, log: "~/.config/ebrain/spend.jsonl" },
    provider: { id: "openrouter" },
    capabilities: { general: { models: ["vendor/model-a"] } },
    classify: {},
    frontier: { auto_escalate: false },
    ...overrides,
  };
}

describe("registry", () => {
  test("ids are unique, well-formed slugs", () => {
    const ids = providerIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isValidProviderId(id)).toBe(true);
  });

  test("every descriptor has an absolute base_url and an OpenAI-compatible chat path", () => {
    for (const provider of PROVIDERS) {
      expect(() => new URL(provider.base_url)).not.toThrow();
      expect(provider.chat_path.startsWith("/")).toBe(true);
    }
  });

  test("credentials appear only as env var NAMES, never as values", () => {
    for (const provider of PROVIDERS) {
      for (const name of provider.key_env) expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
      // A header must never be a place a secret hides.
      for (const value of Object.values(provider.headers ?? {})) {
        expect(value).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
      }
    }
    // Whole-file check: no descriptor may carry anything credential-shaped.
    const source = readFileSync(join(import.meta.dir, "providers.ts"), "utf8");
    expect(source).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
  });

  test("local providers need no key; hosted ones name one", () => {
    for (const provider of PROVIDERS) {
      if (provider.metering === "local") expect(provider.key_env.length).toBe(0);
      else expect(provider.key_env.length).toBeGreaterThan(0);
    }
  });

  test("only a provider that reports cost declares where to read it", () => {
    for (const provider of PROVIDERS) {
      if (provider.metering === "reported") expect(provider.cost_path?.length).toBeGreaterThan(0);
      else expect(provider.cost_path).toBeNull();
    }
  });

  test("completionsUrl joins without doubling or dropping a slash", () => {
    expect(completionsUrl({ base_url: "https://x.test/v1", chat_path: "/chat/completions" })).toBe("https://x.test/v1/chat/completions");
    expect(completionsUrl({ base_url: "https://x.test/v1/", chat_path: "/chat/completions" })).toBe("https://x.test/v1/chat/completions");
  });
});

describe("credential presence", () => {
  const dotenv = join(tmpdir(), `ebrain-providers-${process.pid}.env-test`);

  afterAll(() => rmSync(dotenv, { force: true }));

  test("answers from the environment and from the config dotenv, and returns only NAMES", () => {
    // The dispatcher runs from a neutral cwd so a foreign project's dotenv cannot be auto-loaded.
    // That correct choice used to make every key read as missing; presence must come from both.
    writeFileSync(
      dotenv,
      [
        "# a comment",
        "GROQ_API_KEY=not-a-real-key-just-a-fixture",
        'export MISTRAL_API_KEY="also-not-a-real-key"',
        "DEEPSEEK_API_KEY=",
        "TOGETHER_API_KEY=   ",
        "NOT_A_PROVIDER_KEY=whatever",
      ].join("\n"),
    );
    const present = configuredKeyNames({ XAI_API_KEY: "from-env" } as NodeJS.ProcessEnv, dotenv);

    expect(present.has("GROQ_API_KEY")).toBe(true);
    expect(present.has("MISTRAL_API_KEY")).toBe(true);
    expect(present.has("XAI_API_KEY")).toBe(true);
    // An empty or whitespace-only assignment is not a configured key.
    expect(present.has("DEEPSEEK_API_KEY")).toBe(false);
    expect(present.has("TOGETHER_API_KEY")).toBe(false);
    expect(present.has("OPENAI_API_KEY")).toBe(false);

    // The whole point: the set contains NAMES. No value from the file may appear in it.
    for (const entry of present) {
      expect(entry).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(entry).not.toContain("not-a-real-key-just-a-fixture");
      expect(entry).not.toContain("also-not-a-real-key");
      expect(entry).not.toContain("from-env");
    }
  });

  test("a missing dotenv is not an error", () => {
    expect(() => configuredKeyNames({} as NodeJS.ProcessEnv, join(tmpdir(), "definitely-absent.env-test"))).not.toThrow();
  });

  test("rows report presence as a boolean-ish label and never a value", () => {
    const rows = providerRows({ GROQ_API_KEY: "placeholder-not-a-key" } as NodeJS.ProcessEnv, new Set(["GROQ_API_KEY"]));
    const groq = rows.find((row) => row.id === "groq")!;
    expect(groq.credential).toBe("present");
    expect(JSON.stringify(rows)).not.toContain("placeholder-not-a-key");
    expect(rows.find((row) => row.id === "ollama")!.credential).toBe("not-required");
    expect(rows.find((row) => row.id === "openai")!.credential).toBe("missing");
  });

  test("routing is universal; the memory engine lane is narrower", () => {
    const rows = providerRows({} as NodeJS.ProcessEnv, new Set());
    expect(rows.every((row) => row.routing)).toBe(true);
    // Recorded honestly rather than implied: these route today but the engine has no recipe.
    expect(rows.find((row) => row.id === "mistral")!.memory_engine).toBe(false);
    expect(rows.find((row) => row.id === "xai")!.memory_engine).toBe(false);
    expect(rows.find((row) => row.id === "openrouter")!.memory_engine).toBe(true);
  });
});

describe("resolveProvider", () => {
  test("a known id needs no overrides", () => {
    const resolved = resolveProvider("groq");
    expect(resolved.known).toBe(true);
    expect(resolved.missing).toEqual([]);
    expect(resolved.provider.base_url).toBe(findProvider("groq")!.base_url);
  });

  test("config overrides win over the registry default", () => {
    const resolved = resolveProvider("openrouter", { base_url: "https://gateway.internal/v1", key_env: "GATEWAY_KEY" });
    expect(resolved.provider.base_url).toBe("https://gateway.internal/v1");
    expect(resolved.provider.key_env).toEqual(["GATEWAY_KEY"]);
    // Behaviour the registry knows about survives an endpoint override.
    expect(resolved.provider.cost_path).toEqual(["usage", "cost"]);
  });

  test("an unknown id is allowed, but must bring its own endpoint", () => {
    const bare = resolveProvider("some-new-gateway");
    expect(bare.known).toBe(false);
    expect(bare.missing).toEqual(["base_url", "key_env"]);

    const supplied = resolveProvider("some-new-gateway", { base_url: "https://new.test/v1", key_env: "NEW_KEY" });
    expect(supplied.missing).toEqual([]);
    expect(supplied.known).toBe(false);
  });
});

describe("readCost", () => {
  test("reads a reported cost and refuses anything else", () => {
    expect(readCost({ usage: { cost: 0.0031 } }, ["usage", "cost"])).toBe(0.0031);
    expect(readCost({ usage: { cost: "0.1" } }, ["usage", "cost"])).toBeNull();
    expect(readCost({ usage: { cost: -1 } }, ["usage", "cost"])).toBeNull();
    expect(readCost({ usage: {} }, ["usage", "cost"])).toBeNull();
    expect(readCost({ usage: null }, ["usage", "cost"])).toBeNull();
    expect(readCost({ usage: { cost: 1 } }, null)).toBeNull();
    // A cost of exactly zero is a real answer, not a missing one.
    expect(readCost({ usage: { cost: 0 } }, ["usage", "cost"])).toBe(0);
  });
});

describe("providerStatusFor", () => {
  test("distinguishes metered, estimated, local and unknown", () => {
    expect(providerStatusFor("openrouter")).toBe("metered");
    expect(providerStatusFor("groq")).toBe("estimated");
    expect(providerStatusFor("ollama")).toBe("local");
    expect(providerStatusFor("not-a-provider")).toBe("untracked");
  });
});

describe("inferProviderId", () => {
  test("matches a pre-registry config back to its provider by URL", () => {
    expect(inferProviderId("https://openrouter.ai/api/v1")).toBe("openrouter");
    expect(inferProviderId("https://api.groq.com/openai/v1")).toBe("groq");
    // Host match, so a trailing slash or a different path on the same host still resolves.
    expect(inferProviderId("https://openrouter.ai/api/v1/")).toBe("openrouter");
    expect(inferProviderId("https://unknown.test/v1")).toBeNull();
    expect(inferProviderId(undefined)).toBeNull();
    expect(inferProviderId("not a url")).toBeNull();
  });
});

describe("parseRoutingConfig", () => {
  test("accepts the shipped default", () => {
    const text = readFileSync(join(EBRAIN_HOME, "config", "routing.default.yaml"), "utf8");
    const raw = (Bun as unknown as { YAML: { parse: (s: string) => unknown } }).YAML.parse(text);
    const config = parseRoutingConfig(raw);
    expect(config.provider.id).toBe("openrouter");
    expect(config.providerKnown).toBe(true);
    expect(config.frontier.auto_escalate).toBe(false);
  });

  test("a config predating provider.id resolves through its base_url", () => {
    const config = parseRoutingConfig(baseConfig({ provider: { base_url: "https://api.deepseek.com/v1" } }));
    expect(config.provider.id).toBe("deepseek");
  });

  test("reports every problem at once", () => {
    try {
      parseRoutingConfig(baseConfig({ budget: { monthly_usd: "ten", hard_stop: 1, log: "" } }));
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RoutingConfigError);
      // A user fixing a config should not have to re-run to find the second mistake.
      expect((error as RoutingConfigError).issues.length).toBeGreaterThanOrEqual(3);
    }
  });

  test("a non-numeric cap is rejected rather than becoming NaN", () => {
    // NaN compares false against every number, so `spent >= monthly_usd` would never fire and the
    // spend cap would silently stop existing. That is the failure this schema exists to prevent.
    expect(() => parseRoutingConfig(baseConfig({ budget: { monthly_usd: NaN, hard_stop: true, log: "x" } }))).toThrow(RoutingConfigError);
  });

  test("an empty capability chain is rejected", () => {
    expect(() => parseRoutingConfig(baseConfig({ capabilities: { general: { models: [] } } }))).toThrow(RoutingConfigError);
  });

  test("an unknown provider with no endpoint is refused, with the known ids named", () => {
    try {
      parseRoutingConfig(baseConfig({ provider: { id: "mystery-gateway" } }));
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RoutingConfigError);
      expect((error as RoutingConfigError).message).toContain("base_url");
      expect((error as RoutingConfigError).message).toContain("openrouter");
    }
  });

  test("an unknown provider that supplies its endpoint is accepted", () => {
    const config = parseRoutingConfig(
      baseConfig({ provider: { id: "mystery-gateway", base_url: "https://mystery.test/v1", key_env: "MYSTERY_KEY" } }),
    );
    expect(config.provider.id).toBe("mystery-gateway");
    expect(config.providerKnown).toBe(false);
    expect(config.provider.key_env).toEqual(["MYSTERY_KEY"]);
  });

  test("a key_env that looks like a value rather than a NAME is refused", () => {
    // The one mistake that would put a credential in a file meant to be shareable.
    expect(() => parseRoutingConfig(baseConfig({ provider: { id: "openrouter", key_env: "sk-abc123def456" } }))).toThrow(RoutingConfigError);
  });

  test("classify and frontier are optional", () => {
    const config = parseRoutingConfig({
      budget: { monthly_usd: 1, hard_stop: true, log: "x" },
      provider: { id: "ollama" },
      capabilities: { general: { models: ["llama3"] } },
    });
    expect(config.classify).toEqual({});
    expect(config.frontier.auto_escalate).toBe(false);
    // A local provider needs no credential and must not be asked for one.
    expect(config.provider.key_env).toEqual([]);
  });
});
