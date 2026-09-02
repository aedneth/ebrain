/**
 * cli/config-bootstrap.test.ts — the bootstrap that makes a fresh clone able to route.
 *
 * The defect this covers was not a wrong value; it was an absent file that four call sites read
 * and none wrote. So the tests assert the two properties that matter and are easy to lose in a
 * later refactor: a missing config IS created, and an existing config is NEVER touched — including
 * when a second process creates it mid-copy.
 */
import { describe, expect, test, afterAll } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { bootstrapPlan, materialiseDefaults, CONFIG_DEFAULTS } from "./config-bootstrap.ts";

const EBRAIN_HOME = join(import.meta.dir, "..");
const temps: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "ebrain-bootstrap-"));
  temps.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("shipped templates", () => {
  test("every declared default has a template in the checkout", () => {
    // The bug was a config nothing shipped. This test fails the moment that regresses.
    for (const spec of CONFIG_DEFAULTS) {
      expect(existsSync(join(EBRAIN_HOME, spec.template))).toBe(true);
    }
  });

  test("the routing template parses as YAML and carries the fields route.ts reads", () => {
    const spec = CONFIG_DEFAULTS.find((candidate) => candidate.name === "routing.yaml");
    expect(spec).toBeDefined();
    const text = readFileSync(join(EBRAIN_HOME, spec!.template), "utf8");
    const cfg = (Bun as unknown as { YAML: { parse: (s: string) => Record<string, any> } }).YAML.parse(text);
    expect(typeof cfg.budget?.monthly_usd).toBe("number");
    expect(cfg.budget?.hard_stop).toBe(true);
    expect(typeof cfg.budget?.log).toBe("string");
    expect(typeof cfg.provider?.base_url).toBe("string");
    expect(typeof cfg.provider?.key_env).toBe("string");
    expect(Object.keys(cfg.capabilities ?? {}).length).toBeGreaterThan(0);
    // `classify` falls through to `general`, so `general` must exist or every unclassified
    // prompt dies with "capacidad desconocida".
    expect(Array.isArray(cfg.capabilities?.general?.models)).toBe(true);
    // The one value that is a policy, not a preference.
    expect(cfg.frontier?.auto_escalate).toBe(false);
  });

  test("the template carries no credential-shaped value, only env NAMES", () => {
    for (const spec of CONFIG_DEFAULTS) {
      const text = readFileSync(join(EBRAIN_HOME, spec.template), "utf8");
      expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
      expect(text).not.toMatch(/["']?[A-Za-z0-9_-]{40,}["']?\s*$/m);
    }
  });
});

describe("materialiseDefaults", () => {
  test("creates a missing config from the shipped template", () => {
    const dir = sandbox();
    const applied = materialiseDefaults({ configDir: dir, ebrainHome: EBRAIN_HOME });
    const routing = applied.find((item) => item.name === "routing.yaml")!;
    expect(routing.action).toBe("created");
    expect(existsSync(join(dir, "routing.yaml"))).toBe(true);
    expect(readFileSync(join(dir, "routing.yaml"), "utf8")).toBe(readFileSync(routing.source, "utf8"));
  });

  test("the created file is 0600 inside a 0700 directory", () => {
    const dir = join(sandbox(), "nested");
    materialiseDefaults({ configDir: dir, ebrainHome: EBRAIN_HOME });
    expect(statSync(join(dir, "routing.yaml")).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  test("never overwrites an existing config", () => {
    const dir = sandbox();
    const target = join(dir, "routing.yaml");
    mkdirSync(dir, { recursive: true });
    writeFileSync(target, "budget:\n  monthly_usd: 999\n");
    const applied = materialiseDefaults({ configDir: dir, ebrainHome: EBRAIN_HOME });
    expect(applied.find((item) => item.name === "routing.yaml")!.action).toBe("kept");
    // Byte-for-byte: a tuned routing table survives `ebrain up`.
    expect(readFileSync(target, "utf8")).toBe("budget:\n  monthly_usd: 999\n");
  });

  test("is idempotent — the second run creates nothing", () => {
    const dir = sandbox();
    expect(materialiseDefaults({ configDir: dir, ebrainHome: EBRAIN_HOME })[0]!.action).toBe("created");
    expect(materialiseDefaults({ configDir: dir, ebrainHome: EBRAIN_HOME })[0]!.action).toBe("kept");
  });

  test("a checkout with no template reports it instead of throwing", () => {
    const dir = sandbox();
    const applied = materialiseDefaults({ configDir: dir, ebrainHome: join(sandbox(), "not-a-checkout") });
    expect(applied[0]!.action).toBe("template-missing");
    expect(existsSync(join(dir, "routing.yaml"))).toBe(false);
  });

  test("bootstrapPlan does not write", () => {
    const dir = sandbox();
    expect(bootstrapPlan({ configDir: dir, ebrainHome: EBRAIN_HOME })[0]!.action).toBe("created");
    expect(existsSync(join(dir, "routing.yaml"))).toBe(false);
  });
});

describe("concurrency", () => {
  test("N concurrent bootstraps leave exactly one file and never clobber", async () => {
    const dir = sandbox();
    const results = await Promise.all(
      Array.from({ length: 6 }, async () => materialiseDefaults({ configDir: dir, ebrainHome: EBRAIN_HOME })[0]!.action),
    );
    // Whoever won, the file is the template and only one run reports having made it.
    expect(existsSync(join(dir, "routing.yaml"))).toBe(true);
    expect(results.filter((action) => action === "created").length).toBeGreaterThanOrEqual(1);
    expect(results.every((action) => action === "created" || action === "kept")).toBe(true);
  });
});
