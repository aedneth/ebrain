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

const HOME = homedir();
const CFG_PATH = join(HOME, ".config", "ebrain", "routing.yaml");

// Doble candado sobre frontier.auto_escalate:false — ningún frontier entra a una cadena Tier 1.
export const FRONTIER = /claude|gpt-4|gpt-5|(^|\/)o[13]-|opus|sonnet|fable|gemini-[0-9.]*-pro|grok/i;

type Chain = { models: string[] };
interface Cfg {
  budget: { monthly_usd: number; hard_stop: boolean; log: string };
  provider: { base_url: string; key_env: string; request_defaults: Record<string, unknown> };
  capabilities: Record<string, Chain>;
  classify: Record<string, string[]>;
  frontier: { auto_escalate: boolean };
}

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
  if (!(await f.exists())) die(`routing.yaml no existe en ${CFG_PATH}`);
  return (Bun as unknown as { YAML: { parse: (s: string) => Cfg } }).YAML.parse(await f.text());
}

function parseArgs(argv: string[]) {
  let cap: string | null = null;
  let dryRun = false;
  let json = false;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cap") cap = argv[++i] ?? null;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--json") json = true;
    else rest.push(a);
  }
  return { cap, dryRun, json, prompt: rest.join(" ").trim() };
}

// Clasificación rule-based: gana la capacidad con más keywords; empate/cero → general.
export function classify(prompt: string, cfg: Pick<Cfg, "classify">): string {
  const p = prompt.toLowerCase();
  let best = "general";
  let bestHits = 0;
  for (const [capName, kws] of Object.entries(cfg.classify)) {
    let hits = 0;
    for (const kw of kws) if (p.includes(kw.toLowerCase())) hits++;
    if (hits > bestHits) { bestHits = hits; best = capName; }
  }
  return best;
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

async function appendSpend(logPath: string, rec: unknown) {
  const f = Bun.file(logPath);
  const prev = (await f.exists()) ? await f.text() : "";
  await Bun.write(logPath, prev + JSON.stringify(rec) + "\n");
}

async function main() {
  const { cap, dryRun, json, prompt } = parseArgs(process.argv.slice(2));
  const cfg = await loadCfg();

  const capability = cap ?? classify(prompt, cfg);
  const chain = cfg.capabilities[capability];
  if (!chain) die(`capacidad desconocida: ${capability} (válidas: ${Object.keys(cfg.capabilities).join(", ")})`);

  // Doble candado frontier (config + hardcode)
  if (chainHasFrontier(chain.models)) die(`modelo frontier en la cadena '${capability}' — prohibido por diseño`);
  if (cfg.frontier?.auto_escalate) die("frontier.auto_escalate:true en config — prohibido (revertí routing.yaml)");

  const logPath = expandHome(cfg.budget.log);
  const spent = await monthSpend(logPath);

  if (dryRun) {
    console.log(JSON.stringify({
      capability, chain: chain.models,
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

  const key = process.env[cfg.provider.key_env];
  if (!key) die(`${cfg.provider.key_env} no está en el entorno — corré vía launcher ebrain-route (sourcea .env)`);

  const body = {
    models: chain.models,
    messages: [{ role: "user", content: finalPrompt }],
    provider: cfg.provider.request_defaults,
    usage: { include: true }, // ← sin esto OpenRouter devuelve tokens pero no el costo USD
  };

  let res: Response;
  try {
    res = await fetch(`${cfg.provider.base_url}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://github.com/aedneth/ebrain", "X-Title": "ebrain-route" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    die(`red/OpenRouter inalcanzable: ${(e as Error).message} — Tier 0 (Claude Code) es el fallback manual`, 4);
  }

  if (res.status === 429) die("429 — hard cap / rate limit de OpenRouter alcanzado (el candado server-side funciona).", 2);
  if (!res.ok) die(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 400)}`);

  const data = await res.json() as {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    choices?: { message?: { content?: string } }[];
  };
  const modelUsed = data.model ?? "?";
  const tin = data.usage?.prompt_tokens ?? 0;
  const tout = data.usage?.completion_tokens ?? 0;
  const usd = typeof data.usage?.cost === "number" ? data.usage.cost : 0;
  const content = data.choices?.[0]?.message?.content ?? "";

  const rec = { ts: new Date().toISOString(), cap: capability, model: modelUsed, tokens_in: tin, tokens_out: tout, usd };
  await appendSpend(logPath, rec);

  if (json) {
    console.log(JSON.stringify({ ...rec, content }, null, 2));
  } else {
    process.stdout.write(content + "\n");
    console.error(`\n— model=${modelUsed} cap=${capability} tokens=${tin}+${tout} cost=$${usd.toFixed(6)} · mes=$${(spent + usd).toFixed(4)}/$${cfg.budget.monthly_usd}`);
  }
}

if (import.meta.main) main().catch((e) => die(String(e?.message ?? e)));
