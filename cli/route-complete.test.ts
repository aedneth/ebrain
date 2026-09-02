/**
 * cli/route-complete.test.ts — la única llamada HTTP a un LLM del repo, de punta a punta.
 *
 * `complete()` elige entre failover server-side y caminar la cadena localmente, arma el body y lee
 * el costo. Las funciones puras se prueban en route.test.ts; acá se corre `route.ts` como proceso
 * contra un servidor loopback que se hace pasar por el provider, porque lo que importa es lo que
 * llega al otro lado del cable: `model` vs `models`, qué extras viajan, que un body de Response se
 * lea una sola vez, y que un costo cero reportado NO se confunda con un costo ausente.
 *
 * Hermético: HOME es un tempdir, el provider es 127.0.0.1, la "credencial" es una fixture bajo un
 * NOMBRE que ningún descriptor usa. Ningún valor real entra al proceso hijo.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const ROUTE = join(import.meta.dir, "route.ts");
const KEY_NAME = "EBRAIN_ROUTE_TEST_KEY";
const KEY_FIXTURE = "fixture-not-a-secret";
// A cold `bun run` on the 4 GB laptop can take a few seconds; the default 5 s is too tight.
const SPAWN_TIMEOUT_MS = 30_000;

interface Seen { body: Record<string, unknown>; headers: Record<string, string> }
type Handler = (body: Record<string, unknown>) => { status: number; json: unknown };

let server: ReturnType<typeof Bun.serve> | null = null;
const homes: string[] = [];

afterEach(() => {
  server?.stop(true);
  server = null;
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function fakeProvider(handler: Handler): { port: number; seen: Seen[] } {
  const seen: Seen[] = [];
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const body = (await req.json()) as Record<string, unknown>;
      seen.push({ body, headers: Object.fromEntries(req.headers.entries()) });
      const { status, json } = handler(body);
      return Response.json(json, { status });
    },
  });
  return { port: server.port!, seen };
}

function homeWith(provider: string): string {
  const home = mkdtempSync(join(tmpdir(), "ebrain-route-e2e-"));
  homes.push(home);
  const cfg = join(home, ".config", "ebrain");
  mkdirSync(cfg, { recursive: true });
  writeFileSync(join(cfg, "routing.yaml"), [
    "budget:",
    "  monthly_usd: 5",
    "  hard_stop: true",
    "  log: ~/.config/ebrain/spend.jsonl",
    "provider:",
    ...provider.split("\n").map((line) => `  ${line}`),
    "  provider_routing:",
    "    data_collection: deny",
    "  completion_defaults:",
    "    max_tokens: 64",
    "capabilities:",
    "  general:",
    "    models: [vendor/model-a, vendor/model-b]",
    "",
  ].join("\n"));
  return home;
}

// Async on purpose: the fake provider runs on this same event loop, so a synchronous spawn would
// block the very server the child is waiting on.
async function route(home: string, withKey = true) {
  const proc = Bun.spawn(["bun", "run", ROUTE, "--cap", "general", "--json", "hola"], {
    env: { PATH: process.env.PATH ?? "", HOME: home, ...(withKey ? { [KEY_NAME]: KEY_FIXTURE } : {}) },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

function ledger(home: string): Record<string, unknown>[] {
  const path = join(home, ".config", "ebrain", "spend.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
}

const OK = (model: string, usage: Record<string, unknown>) => ({
  status: 200,
  json: { model, usage, choices: [{ message: { content: "ok" } }] },
});

describe("un provider sin failover server-side: la cadena se camina localmente", () => {
  test("model por model, el body de cada Response se lee una vez, y el gasto se atribuye al provider", async () => {
    const { port, seen } = fakeProvider((body) =>
      body.model === "vendor/model-a"
        ? { status: 404, json: { error: { message: "no such model" } } }
        : OK("vendor/model-b", { prompt_tokens: 3, completion_tokens: 2 }),
    );
    const home = homeWith(`id: loopback-gateway\nbase_url: http://127.0.0.1:${port}/v1\nkey_env: ${KEY_NAME}`);

    const run = await route(home);
    expect(run.code).toBe(0);
    expect(seen.map((s) => s.body.model)).toEqual(["vendor/model-a", "vendor/model-b"]);
    for (const { body, headers } of seen) {
      expect(body.models).toBeUndefined();                         // `models` es un 400 en un endpoint así
      expect(body.usage).toBeUndefined();                          // no reporta costo: no se pide
      expect(body.max_tokens).toBe(64);
      // Un id que el registro no conoce: la config es la única autoridad, los extras viajan.
      expect(body.provider).toEqual({ data_collection: "deny" });
      expect(headers.authorization).toBe(`Bearer ${KEY_FIXTURE}`);
    }

    const out = JSON.parse(run.stdout);
    expect(out.provider).toBe("loopback-gateway");
    expect(out.model).toBe("vendor/model-b");                      // el que sirvió, no el primero pedido
    expect(out.tokens_in).toBe(3);
    expect(out.tokens_out).toBe(2);
    expect(out.usd_estimated).toBe(true);                          // sin costo reportado: estimado, nunca $0 mudo
    expect(out.usd).toBeCloseTo(5 * 4e-6, 12);
    expect(out.content).toBe("ok");
    expect(ledger(home)).toHaveLength(1);
    expect(ledger(home)[0]!.provider).toBe("loopback-gateway");
    // La credencial no aparece ni en la salida ni en el ledger.
    expect(run.stdout + run.stderr + readFileSync(join(home, ".config", "ebrain", "spend.jsonl"), "utf8")).not.toContain(KEY_FIXTURE);
  }, SPAWN_TIMEOUT_MS);

  test("un fallo del provider entero (401) corta la cadena en el primer intento", async () => {
    const { port, seen } = fakeProvider(() => ({ status: 401, json: { error: { message: "bad key" } } }));
    const home = homeWith(`id: loopback-gateway\nbase_url: http://127.0.0.1:${port}/v1\nkey_env: ${KEY_NAME}`);

    const run = await route(home);
    expect(run.code).toBe(1);
    expect(seen).toHaveLength(1);                                  // no insiste con model-b
    expect(run.stderr).toContain("401");
    expect(ledger(home)).toHaveLength(0);                          // nada que cobrar, nada en el ledger
  }, SPAWN_TIMEOUT_MS);

  test("un server local no exige credencial y su costo es cero real, no una estimación", async () => {
    const { port, seen } = fakeProvider(() => OK("llama3", { prompt_tokens: 3, completion_tokens: 2 }));
    const home = homeWith(`id: ollama\nbase_url: http://127.0.0.1:${port}/v1`);

    const run = await route(home, false);
    expect(run.code).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.headers.authorization).toBeUndefined();
    // Ollama es conocido y no entiende `provider`: el extra se descarta — pero se dice.
    expect(seen[0]!.body.provider).toBeUndefined();
    expect(run.stderr).toContain("provider_routing ignorado");

    const out = JSON.parse(run.stdout);
    expect(out.provider).toBe("ollama");
    expect(out.usd).toBe(0);
    expect(out.usd_estimated).toBeUndefined();
  }, SPAWN_TIMEOUT_MS);
});

describe("un provider con failover server-side: una sola ida y vuelta", () => {
  test("manda la cadena entera como `models`, pide el costo, y un costo cero reportado queda como cero", async () => {
    const { port, seen } = fakeProvider(() => OK("vendor/model-a", { prompt_tokens: 3, completion_tokens: 2, cost: 0 }));
    // openrouter con base_url apuntado al loopback: el descriptor (failover, cost_path, headers)
    // sobrevive al override del endpoint.
    const home = homeWith(`id: openrouter\nbase_url: http://127.0.0.1:${port}/v1\nkey_env: ${KEY_NAME}`);

    const run = await route(home);
    expect(run.code).toBe(0);
    expect(seen).toHaveLength(1);
    const { body, headers } = seen[0]!;
    expect(body.models).toEqual(["vendor/model-a", "vendor/model-b"]);
    expect(body.model).toBeUndefined();
    expect(body.usage).toEqual({ include: true });
    expect(body.provider).toEqual({ data_collection: "deny" });
    expect(headers["x-title"]).toBe("ebrain-route");
    expect(run.stderr).not.toContain("provider_routing ignorado");

    const out = JSON.parse(run.stdout);
    expect(out.provider).toBe("openrouter");
    expect(out.usd).toBe(0);                                       // un :free real cuesta 0 y se registra como 0
    expect(out.usd_estimated).toBeUndefined();                     // …no como "el provider no reportó"
  }, SPAWN_TIMEOUT_MS);
});
