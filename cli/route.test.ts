/**
 * Tests de route.ts — funciones puras (sin red, sin gasto).
 * Cubre: clasificación (camino feliz + ambiguo→general), cap excedido (hard_stop),
 * candado frontier, y parseo/suma de spend.jsonl por mes. `bun test cli/route.test.ts`.
 */
import { test, expect } from "bun:test";
import { FRONTIER, applyFloor, buildRequestBody, capExceeded, chainHasFrontier, classify, expandHome, isProviderLevelFailure, monthKey, monthSpend, parseRouteArgs, selectKeyName } from "./route.ts";
import { parseRoutingConfig } from "./config-schema.ts";
import { tmpdir } from "os";
import { join } from "path";

const CLASSIFY = {
  coding: ["code", "function", "bug", "refactor", "script", "typescript"],
  web_design: ["component", "ui", "tailwind", "css", "design", "react"],
  reasoning: ["reason", "prove", "architecture", "tradeoff", "why"],
  terminal: ["bash", "shell", "terminal", "cli"],
};

test("classify: camino feliz — matchea la capacidad dominante", () => {
  expect(classify("arregla el bug en esta function typescript", { classify: CLASSIFY })).toBe("coding");
  expect(classify("un componente react con tailwind y buen css", { classify: CLASSIFY })).toBe("web_design");
  expect(classify("escribe un script de bash para el shell", { classify: CLASSIFY })).toBe("terminal");
});

test("classify: sin keywords → general (default seguro)", () => {
  expect(classify("hola qué tal todo bien", { classify: CLASSIFY })).toBe("general");
  expect(classify("", { classify: CLASSIFY })).toBe("general");
});

test("classify: empate al tope → general (spec: ambiguo→general, no la 1ra del yaml)", () => {
  // "script"(coding) vs "cli"(terminal): 1-1 → empate → general
  expect(classify("un script para el cli", { classify: CLASSIFY })).toBe("general");
});

test("parseRouteArgs preserves optional cost attribution outside the prompt", () => {
  const parsed = parseRouteArgs([
    "--cap", "coding", "--agent", "codex", "--session", "ebr-codex-build", "--workflow", "second-brain-sops-dev", "fix parser", "--json",
  ]);
  expect(parsed.cap).toBe("coding");
  expect(parsed.agent).toBe("codex");
  expect(parsed.session).toBe("ebr-codex-build");
  expect(parsed.workflow).toBe("second-brain-sops-dev");
  expect(parsed.prompt).toBe("fix parser");
});

test("applyFloor: :floor a slugs limpios; :free/suffixed intactos; off = sin cambio", () => {
  expect(applyFloor(["deepseek/deepseek-v4-pro", "qwen/qwen3-coder:free"], true))
    .toEqual(["deepseek/deepseek-v4-pro:floor", "qwen/qwen3-coder:free"]);
  expect(applyFloor(["z-ai/glm-5.2"], false)).toEqual(["z-ai/glm-5.2"]);
});

test("FRONTIER: hermético contra oN/gpt-N/gemini pro|ultra, permite el stack abierto", () => {
  expect(FRONTIER.test("openai/o4-mini")).toBe(true);   // antes se escapaba (solo o1/o3)
  expect(FRONTIER.test("openai/gpt-6")).toBe(true);
  expect(FRONTIER.test("google/gemini-3-ultra")).toBe(true);
  expect(FRONTIER.test("deepseek/deepseek-v4-pro")).toBe(false); // "pro" NO gatilla sin "gemini"
  expect(FRONTIER.test("qwen/qwen3-coder-plus")).toBe(false);
});

test("capExceeded: hard_stop aborta al alcanzar el tope, no antes", () => {
  const cfg = { budget: { monthly_usd: 4, hard_stop: true, log: "x" } };
  expect(capExceeded(3.99, cfg)).toBe(false);
  expect(capExceeded(4.0, cfg)).toBe(true);
  expect(capExceeded(9.9, cfg)).toBe(true);
});

test("capExceeded: hard_stop:false nunca aborta (solo loguea)", () => {
  const cfg = { budget: { monthly_usd: 4, hard_stop: false, log: "x" } };
  expect(capExceeded(100, cfg)).toBe(false);
});

test("chainHasFrontier: bloquea frontier, permite modelos abiertos", () => {
  // debe DEJAR pasar toda cadena abierta real del registry
  expect(chainHasFrontier(["deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash", "qwen/qwen3-coder:free"])).toBe(false);
  expect(chainHasFrontier(["z-ai/glm-5.2", "z-ai/glm-4.7"])).toBe(false);
  expect(chainHasFrontier(["moonshotai/kimi-k2.6", "minimax/minimax-m3"])).toBe(false);
  // debe BLOQUEAR cualquier frontier colado
  expect(chainHasFrontier(["anthropic/claude-opus-4"])).toBe(true);
  expect(chainHasFrontier(["openai/gpt-4o"])).toBe(true);
  expect(chainHasFrontier(["google/gemini-2.5-pro"])).toBe(true);
  expect(chainHasFrontier(["deepseek/deepseek-v4-pro", "anthropic/claude-sonnet-4"])).toBe(true);
});

test("monthKey: formato YYYY-MM en UTC", () => {
  expect(monthKey(new Date("2026-07-11T23:00:00Z"))).toBe("2026-07");
  expect(monthKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
});

test("monthSpend: suma solo el mes en curso, ignora líneas corruptas", async () => {
  const mk = monthKey();
  const other = mk.startsWith("2026-07") ? "2026-06" : "2020-01";
  const path = join(tmpdir(), `ebrain-spend-test-${Date.now()}.jsonl`);
  await Bun.write(path,
    `{"ts":"${mk}-05T10:00:00Z","usd":0.10}\n` +
    `{"ts":"${mk}-06T10:00:00Z","usd":0.05}\n` +
    `{"ts":"${other}-06T10:00:00Z","usd":9.99}\n` +   // otro mes: no cuenta
    `basura no-json\n` +                                // corrupta: se ignora
    `{"ts":"${mk}-07T10:00:00Z","usd":0.02}\n`
  );
  expect(await monthSpend(path)).toBeCloseTo(0.17, 6);
});

test("monthSpend: archivo inexistente → 0", async () => {
  expect(await monthSpend(join(tmpdir(), "no-existe-jamas.jsonl"))).toBe(0);
});

test("expandHome: expande ~ al home real", () => {
  expect(expandHome("~/x").endsWith("/x")).toBe(true);
  expect(expandHome("/abs/path")).toBe("/abs/path");
});

// Un fallo de credencial, permiso o cap es del provider entero: caminar al siguiente modelo no
// puede ayudar, y en el 429 insiste contra un límite que ya mordió.
test("fallo de provider: la cadena NO sigue", () => {
  for (const status of [401, 403, 429]) expect(isProviderLevelFailure(status)).toBe(true);
});

test("fallo de modelo: la cadena sigue al siguiente", () => {
  for (const status of [400, 404, 500, 502, 503]) expect(isProviderLevelFailure(status)).toBe(false);
});

// El descriptor puede listar más de un NOMBRE para la credencial (google: GEMINI_API_KEY o
// GOOGLE_API_KEY). Mirar solo el primero hacía que `providers list` dijera "set" y `route` muriera.
test("selectKeyName: el primer NOMBRE seteado gana; sin ninguno, el primero declarado (para el error)", () => {
  const names = ["GEMINI_API_KEY", "GOOGLE_API_KEY"];
  expect(selectKeyName(names, { GOOGLE_API_KEY: "fixture" })).toBe("GOOGLE_API_KEY");
  expect(selectKeyName(names, { GEMINI_API_KEY: "fixture", GOOGLE_API_KEY: "fixture" })).toBe("GEMINI_API_KEY");
  expect(selectKeyName(names, { GEMINI_API_KEY: "", GOOGLE_API_KEY: "fixture" })).toBe("GOOGLE_API_KEY");
  expect(selectKeyName(names, {})).toBe("GEMINI_API_KEY");
  expect(selectKeyName([], {})).toBeNull();
});

function resolved(provider: Record<string, unknown>) {
  return parseRoutingConfig({
    budget: { monthly_usd: 5, hard_stop: true, log: "~/x/spend.jsonl" },
    provider,
    capabilities: { general: { models: ["vendor/model-a"] } },
  });
}

test("buildRequestBody: pide costo y manda extras solo donde el descriptor lo respalda", () => {
  const routing = { provider_routing: { data_collection: "deny" }, completion_defaults: { max_tokens: 8 } };

  const openrouter = buildRequestBody(resolved({ id: "openrouter", ...routing }), "hola");
  expect(openrouter.messages).toEqual([{ role: "user", content: "hola" }]);
  expect(openrouter.usage).toEqual({ include: true });          // sin esto devuelve tokens pero no USD
  expect(openrouter.provider).toEqual({ data_collection: "deny" });
  expect(openrouter.max_tokens).toBe(8);
  expect("model" in openrouter || "models" in openrouter).toBe(false); // eso lo pone el camino de failover

  const openai = buildRequestBody(resolved({ id: "openai", ...routing }), "hola");
  expect(openai.usage).toBeUndefined();     // no reporta costo: pedirlo no sirve de nada
  expect(openai.provider).toBeUndefined();  // no entiende la clave: se descarta (y main() avisa)
  expect(openai.max_tokens).toBe(8);        // los params estándar viajan siempre

  const ollama = buildRequestBody(resolved({ id: "ollama" }), "hola");
  expect(ollama.usage).toBeUndefined();
  expect(ollama.provider).toBeUndefined();
});

test("buildRequestBody: un provider desconocido recibe los extras tal como la config los escribió", () => {
  // El registro no sabe nada de este endpoint; la config es la única autoridad sobre él. Descartar
  // `provider_routing` en silencio sería ignorar la preferencia del usuario sin decirlo.
  const body = buildRequestBody(
    resolved({ id: "mystery-gateway", base_url: "https://mystery.test/v1", key_env: "MYSTERY_KEY", provider_routing: { data_collection: "deny" } }),
    "hola",
  );
  expect(body.provider).toEqual({ data_collection: "deny" });
});
