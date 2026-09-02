#!/usr/bin/env bun
/**
 * ebrain route — Tier 1 router sobre OpenRouter (spec: docs/ROUTING.md §3.4, model-registry.md).
 *
 * Clasifica una tarea por CAPACIDAD y la llama con el array [ganador, fallback, floor]
 * (el failover lo ejecuta OpenRouter, no un loop local). Loguea gasto real a spend.jsonl
 * e imprime el costo al final. Cap DOBLE: hard cap server-side (la key) + cap local mensual
 * (routing.yaml, hard_stop aborta ANTES de llamar). Frontier jamás auto-escala (config + hardcode).
 *
 * Uso:
 *   ebrain-route "escribe una función slugify en TS"        # clasifica solo por keywords
 *   ebrain-route --cap coding "..."                          # capacidad explícita (gana)
 *   echo "prompt largo" | ebrain-route --cap long_context    # prompt por stdin
 *   ebrain-route --dry-run --cap web_design "..."            # no llama: muestra plan+presupuesto
 *   ebrain-route --json --cap general "..."                  # salida estructurada
 */
import { homedir } from "os";
import { join } from "path";
import { appendFile } from "fs/promises";
import { parseRoutingConfig, RoutingConfigError, unsupportedExtras, type ResolvedRoutingConfig } from "./config-schema.ts";
import { completionsUrl, readCost } from "./providers.ts";

const HOME = homedir();
const CFG_PATH = join(HOME, ".config", "ebrain", "routing.yaml");
const FETCH_TIMEOUT_MS = 120_000;
const FALLBACK_RATE_USD_PER_TOKEN = 4.0 / 1e6; // ~$4/M conservador si el provider no devuelve cost

// Doble candado sobre frontier.auto_escalate:false — ningún frontier entra a una cadena Tier 1.
// Hermético: gpt-N, oN-, gemini-*(pro|ultra), y los frontier de Anthropic/xAI por nombre.
export const FRONTIER = /claude|opus|sonnet|fable|grok|gpt-[0-9]|(^|\/)o[0-9]+-|gemini[-a-z0-9.]*(pro|ultra)/i;

/**
 * La config ya no se castea: `parseRoutingConfig` la valida y resuelve el provider contra el
 * registro. `Cfg` queda como el tipo resuelto, así el resto del archivo no cambia de forma.
 */
type Cfg = ResolvedRoutingConfig;

function die(msg: string, code = 1): never {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

export function expandHome(p: string): string {
  return p.startsWith("~") ? join(HOME, p.slice(1)) : p;
}

// Cap excedido = hay hard_stop Y el gasto del mes ya alcanzó el tope local.
export function capExceeded(spent: number, cfg: Pick<Cfg, "budget">): boolean {
  return cfg.budget.hard_stop === true && spent >= cfg.budget.monthly_usd;
}

// Una cadena es segura si NINGÚN modelo matchea el patrón frontier.
export function chainHasFrontier(models: string[]): boolean {
  return models.some((m) => FRONTIER.test(m));
}

async function loadCfg(): Promise<Cfg> {
  const f = Bun.file(CFG_PATH);
  if (!(await f.exists())) {
    // Ahora `ebrain up` lo crea desde config/routing.default.yaml, así que el mensaje puede
    // nombrar la acción exacta en vez de dejar al usuario buscándola.
    die(`routing.yaml no existe en ${CFG_PATH} — corré 'ebrain up' para crearlo desde el default`);
  }
  const raw = (Bun as unknown as { YAML: { parse: (s: string) => unknown } }).YAML.parse(await f.text());
  try {
    return parseRoutingConfig(raw, CFG_PATH);
  } catch (e) {
    if (e instanceof RoutingConfigError) die(e.message);
    throw e;
  }
}

export function parseRouteArgs(argv: string[]) {
  let cap: string | null = null;
  let dryRun = false;
  let json = false;
  let floor = false;
  let agent: string | null = null;
  let session: string | null = null;
  let workflow: string | null = null;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cap") cap = argv[++i] ?? null;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--json") json = true;
    else if (a === "--floor") floor = true;   // fuerza el provider más barato (batch/jobs)
    else if (a === "--agent") agent = argv[++i] ?? null;
    else if (a === "--session") session = argv[++i] ?? null;
    else if (a === "--workflow") workflow = argv[++i] ?? null;
    else rest.push(a);
  }
  return { cap, dryRun, json, floor, agent, session, workflow, prompt: rest.join(" ").trim() };
}

function safeCostLabel(value: string | null, flag: string): string | null {
  if (value == null) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,160}$/.test(value)) die(`${flag} inválido para atribución de costo`, 2);
  return value;
}

// :floor a cada slug sin sufijo (los :free / ya-suffixed se dejan intactos).
export function applyFloor(models: string[], floor: boolean): string[] {
  return floor ? models.map((m) => (m.includes(":") ? m : `${m}:floor`)) : models;
}

// Clasificación rule-based: gana la capacidad con MÁS keywords. Empate al tope o cero → general
// (comportamiento del spec: ambiguo → general, no la primera capacidad del yaml).
export function classify(prompt: string, cfg: Pick<Cfg, "classify">): string {
  const p = prompt.toLowerCase();
  let best = "general";
  let bestHits = 0;
  let tied = false;
  for (const [capName, kws] of Object.entries(cfg.classify)) {
    let hits = 0;
    for (const kw of kws) if (p.includes(kw.toLowerCase())) hits++;
    if (hits > bestHits) { bestHits = hits; best = capName; tied = false; }
    else if (hits === bestHits && hits > 0) tied = true;
  }
  return bestHits === 0 || tied ? "general" : best;
}

export function monthKey(ts = new Date()): string {
  return `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function monthSpend(logPath: string): Promise<number> {
  const f = Bun.file(logPath);
  if (!(await f.exists())) return 0;
  const mk = monthKey();
  let sum = 0;
  for (const line of (await f.text()).split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (typeof r.usd === "number" && String(r.ts).startsWith(mk)) sum += r.usd;
    } catch { /* línea corrupta: se ignora, no rompe el cap */ }
  }
  return sum;
}

// Append REAL (una syscall) — dos invocaciones concurrentes (cron + manual) no se pisan
// registros. `appendFile` crea el archivo si no existe.
async function appendSpend(logPath: string, rec: unknown) {
  await appendFile(logPath, JSON.stringify(rec) + "\n");
}

interface CompletionResponse {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  choices?: { message?: { content?: string } }[];
}

/**
 * Un status que NO tiene sentido reintentar con otro modelo: la credencial, el permiso o el cap
 * son del provider entero. Insistir con el siguiente slug solo gasta tiempo y, en el caso del
 * 429, empuja contra un límite que ya mordió.
 */
export function isProviderLevelFailure(status: number): boolean {
  return status === 401 || status === 403 || status === 429;
}

/**
 * El descriptor lista los NOMBRES que pueden tener la credencial, el mejor primero (google acepta
 * GEMINI_API_KEY o GOOGLE_API_KEY). Se elige el primero que esté seteado; si ninguno lo está, el
 * primero, para que el error nombre el que el usuario debería crear. Mirar solo `[0]` hacía que
 * `ebrain providers list` dijera "set" y `ebrain route` muriera pidiendo otra variable.
 */
export function selectKeyName(names: readonly string[], env: NodeJS.ProcessEnv = process.env): string | null {
  return names.find((name) => (env[name] ?? "").length > 0) ?? names[0] ?? null;
}

/**
 * El body común a cualquier intento contra este provider — todo menos `model`/`models`, que lo
 * pone el camino de failover. Puro, para poder afirmar en un test qué se manda a quién sin red.
 */
export function buildRequestBody(cfg: Cfg, prompt: string): Record<string, unknown> {
  // Los extras del provider son DATOS: se mandan cuando el endpoint los entiende, así una
  // routing.yaml copiada entre providers no explota con un 400 opaco. Para un id que el registro
  // no conoce, la config es la única autoridad sobre ese endpoint: el usuario los escribió para él,
  // y descartarlos en silencio sería ignorar (p. ej.) su preferencia de privacidad sin decirlo.
  const sendsProviderExtras = !cfg.providerKnown || cfg.provider.extra_body_keys.includes("provider");
  return {
    messages: [{ role: "user", content: prompt }],
    ...(sendsProviderExtras && Object.keys(cfg.providerRouting).length > 0
      ? { provider: cfg.providerRouting }
      : {}),
    ...cfg.completionDefaults,
    // Solo tiene sentido pedir el costo donde el descriptor dice que lo devuelven.
    ...(cfg.provider.cost_path ? { usage: { include: true } } : {}),
  };
}

/**
 * Ejecuta la cadena de capacidad.
 *
 * Dos caminos, elegidos por el descriptor del provider y no por el nombre de nadie:
 *
 *  - `server_side_failover`: se manda `models: [...]` y el provider hace el failover. Es lo que
 *    hacía la versión anterior, y sigue siendo lo mejor cuando el endpoint lo soporta — una sola
 *    ida y vuelta.
 *  - si no: se camina la cadena localmente con `model: <id>`. Sin esto, el registro sería una
 *    promesa vacía: mandarle un array `models` a un endpoint que espera `model` es un 400, así
 *    que "cualquier provider OpenAI-compatible" habría fallado en el primer intento.
 */
async function complete(
  cfg: Cfg,
  models: string[],
  prompt: string,
  key: string,
): Promise<{ data: CompletionResponse; modelRequested: string }> {
  const url = completionsUrl(cfg.provider);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
    ...(cfg.provider.headers ?? {}),
  };
  const base = buildRequestBody(cfg, prompt);

  const post = async (body: Record<string, unknown>): Promise<Response> => {
    try {
      return await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), // un request colgado no bloquea para siempre
      });
    } catch (e) {
      die(`${cfg.provider.label} inalcanzable o timeout (${url}): ${(e as Error).message} — el agente interactivo es el fallback manual`, 4);
    }
  };

  if (cfg.provider.server_side_failover) {
    const res = await post({ ...base, models });
    if (res.status === 429) die(`429 — cap/rate limit de ${cfg.provider.label} alcanzado (el candado server-side funciona).`, 2);
    if (!res.ok) die(`${cfg.provider.label} ${res.status}: ${(await res.text()).slice(0, 400)}`);
    return { data: (await res.json()) as CompletionResponse, modelRequested: models[0]! };
  }

  const failures: string[] = [];
  for (const model of models) {
    const res = await post({ ...base, model });
    if (res.ok) return { data: (await res.json()) as CompletionResponse, modelRequested: model };
    if (isProviderLevelFailure(res.status)) {
      die(`${cfg.provider.label} ${res.status} — credencial, permiso o cap del provider; la cadena no se sigue.`, res.status === 429 ? 2 : 1);
    }
    failures.push(`${model}: ${res.status} ${(await res.text()).slice(0, 160)}`);
  }
  die(`ningún modelo de la cadena respondió en ${cfg.provider.label}:\n  ${failures.join("\n  ")}`);
}

async function main() {
  const { cap, dryRun, json, floor, agent, session, workflow, prompt } = parseRouteArgs(process.argv.slice(2));
  const cfg = await loadCfg();

  const capability = cap ?? classify(prompt, cfg);
  const chain = cfg.capabilities[capability];
  if (!chain) die(`capacidad desconocida: ${capability} (válidas: ${Object.keys(cfg.capabilities).join(", ")})`);

  const models = applyFloor(chain.models, floor);
  const costAgent = safeCostLabel(agent, "--agent");
  const costSession = safeCostLabel(session, "--session");
  const costWorkflow = safeCostLabel(workflow, "--workflow");

  // Doble candado frontier (config + hardcode)
  if (chainHasFrontier(models)) die(`modelo frontier en la cadena '${capability}' — prohibido por diseño`);
  if (cfg.frontier?.auto_escalate) die("frontier.auto_escalate:true en config — prohibido (revertí routing.yaml)");

  const logPath = expandHome(cfg.budget.log);
  const spent = await monthSpend(logPath);

  // Un extra que este provider no entiende se descarta del body (ver buildRequestBody), pero no en
  // silencio: la config lo pide y el usuario merece saber que su preferencia no viaja.
  for (const key of unsupportedExtras(cfg)) {
    console.error(`⚠ provider_routing ignorado: ${cfg.provider.label} no entiende la clave '${key}' del body — se manda sin ella`);
  }

  if (dryRun) {
    console.log(JSON.stringify({
      capability, chain: models,
      month_spend_usd: +spent.toFixed(6), cap_usd: cfg.budget.monthly_usd,
      remaining_usd: +(cfg.budget.monthly_usd - spent).toFixed(6),
    }, null, 2));
    return;
  }

  // hard_stop: aborta ANTES de llamar
  if (capExceeded(spent, cfg)) {
    die(`cap mensual local excedido: $${spent.toFixed(4)} / $${cfg.budget.monthly_usd} (${monthKey()}). Aborta antes de llamar.`, 3);
  }

  // prompt: argumento o stdin
  let finalPrompt = prompt;
  if (!finalPrompt && !process.stdin.isTTY) {
    finalPrompt = (await Bun.readableStreamToText(Bun.stdin.stream())).trim();
  }
  if (!finalPrompt) die("prompt vacío (pásalo como argumento o por stdin)");

  const keyName = selectKeyName(cfg.provider.key_env);
  const key = keyName ? process.env[keyName] : "";
  // Un server local (ollama, llama-server) no necesita credencial: solo exigila cuando el
  // descriptor dice que este provider cobra.
  if (keyName && !key) {
    die(`${cfg.provider.key_env.join(" / ")} no está en el entorno — corré vía el launcher ebrain-route, que carga la config privada`);
  }

  const { data, modelRequested } = await complete(cfg, models, finalPrompt, key ?? "");

  // El provider puede o no devolver qué modelo sirvió. Si no lo dice, el que pedimos es la
  // mejor respuesta honesta — mucho mejor que "?" para atribuir gasto.
  const modelUsed = typeof data.model === "string" && data.model ? data.model : modelRequested;
  const tin = data.usage?.prompt_tokens ?? 0;
  const tout = data.usage?.completion_tokens ?? 0;
  const content = data.choices?.[0]?.message?.content ?? "";

  // Costo: el real del provider cuando el descriptor dice dónde vive; si no, ESTIMAR conservador
  // (nunca $0 silencioso, o el cap jamás mordería). Se marca usd_estimated para no ensuciar la
  // contabilidad real. Un provider local no cobra: ahí el costo es 0 y NO es una estimación.
  const reported = readCost(data, cfg.provider.cost_path);
  const isLocal = cfg.provider.metering === "local";
  let usd = reported ?? (isLocal ? 0 : undefined);
  let estimated = false;
  if (typeof usd !== "number") {
    estimated = true;
    usd = (tin + tout) * FALLBACK_RATE_USD_PER_TOKEN;
    console.error(`⚠ el provider no reportó costo — ESTIMADO conservador (~$4/M): $${usd.toFixed(6)}`);
  }

  const rec = {
    ts: new Date().toISOString(), src: "route", cap: capability, model: modelUsed,
    provider: cfg.provider.id,
    agent: costAgent ?? "route", tokens_in: tin, tokens_out: tout, usd,
    ...(costSession ? { session: costSession } : {}),
    ...(costWorkflow ? { workflow: costWorkflow } : {}),
    ...(estimated ? { usd_estimated: true } : {}),
  };
  await appendSpend(logPath, rec);

  if (json) {
    console.log(JSON.stringify({ ...rec, content }, null, 2));
  } else {
    process.stdout.write(content + "\n");
    console.error(`\n— provider=${cfg.provider.id} model=${modelUsed} cap=${capability}${floor ? " (:floor)" : ""} tokens=${tin}+${tout} cost=$${usd.toFixed(6)}${estimated ? "~" : ""} · mes=$${(spent + usd).toFixed(4)}/$${cfg.budget.monthly_usd}`);
  }
}

if (import.meta.main) main().catch((e) => die(String(e?.message ?? e)));
