#!/usr/bin/env bun
/**
 * ebrain advise — advisor v0 (SPRINT-TUI 6.1.7): recomienda el carril (lane) correcto para una
 * tarea en lenguaje natural. Determinista, rule-based: `config/advisor-rules.yaml` (keywords →
 * capacidad → carril) + `routing.yaml` (cadenas ganador/fallback/floor + costos, docs/model-registry.md).
 *
 * NUNCA lanza nada — es un recomendador puro (read-only). El launch flow (F6.6.1) decide si
 * ejecuta la recomendación. **HARD LOCK heredado F4/D5:** `frontier:true` es SIEMPRE una
 * recomendación a confirmar, jamás un default — el único lane con frontier:true (`claude_audit`)
 * es `kind:"confirm"` y el `reason` siempre lo marca explícitamente.
 *
 * Uso:
 *   ebrain advise "arregla un bug de login en el web app" --json
 *   ebrain advise "resume estos 200 transcripts en un digest diario"
 */
import { homedir } from "os";
import { join } from "path";
import { loadRoutingCfg } from "./spend.ts";

const HOME = homedir();
const EBRAIN_HOME = process.env.EBRAIN_HOME || join(HOME, "eBrain");
const RULES_PATH = process.env.EBRAIN_ADVISOR_RULES || join(EBRAIN_HOME, "config", "advisor-rules.yaml");

// ── tipos ──────────────────────────────────────────────────────────────────
export interface LaneDef {
  kind: string;
  agent: string;
  model_source: "routing" | "routing-floor" | "static";
  model?: string;
  frontier: boolean;
  note: string;
}
export interface AdvisorRules {
  capabilities: Record<string, { keywords: string[] }>;
  oneshot_signals: { keywords: string[] };
  audit_signals: { keywords: string[] };
  multimodal_signals: { keywords: string[] };
  lanes: Record<string, LaneDef>;
  capability_lane: Record<string, { oneshot: string; session: string }>;
}
// Subconjunto estructural de RoutingCfg (spend.ts/route.ts) — solo lo que advise.ts necesita.
export interface RoutingChains { capabilities: Record<string, { models: string[] }> }

export interface Alternative { lane: string; agent: string; model: string; note: string }
export interface EstCost { usd: number | null; note: string }
export interface AdviceResult {
  task: string;
  capability: string;
  lane: string;
  agent: string;
  model: string;
  reason: string;
  est_cost: EstCost;
  alternatives: Alternative[];
  frontier: boolean;
}

function die(msg: string, code = 1): never {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

export async function loadRules(path = RULES_PATH): Promise<AdvisorRules> {
  const f = Bun.file(path);
  if (!(await f.exists())) die(`advisor-rules.yaml no existe en ${path}`);
  return (Bun as unknown as { YAML: { parse: (s: string) => AdvisorRules } }).YAML.parse(await f.text());
}

// ── pricing (ESTIMADO, no billing real) ─────────────────────────────────────
// Snapshot de docs/model-registry.md (verificado en vivo OpenRouter 2026-07-11). Solo cubre los
// slugs que aparecen en las cadenas capabilities de routing.yaml (ver §1-3 de ese doc). Un modelo
// ausente de esta tabla (drift de routing.yaml sin actualizar acá) → est_cost.usd=null + nota
// explícita, NUNCA un número inventado.
export const PRICING_USD_PER_M: Record<string, { in: number; out: number }> = {
  "deepseek/deepseek-v4-pro": { in: 0.435, out: 0.87 },
  "deepseek/deepseek-v4-flash": { in: 0.077, out: 0.154 },
  "qwen/qwen3-coder:free": { in: 0, out: 0 },
  "moonshotai/kimi-k2.6": { in: 0.66, out: 3.41 },
  "qwen/qwen3-coder-plus": { in: 0.65, out: 3.25 },
  "qwen/qwen3-coder-flash": { in: 0.195, out: 0.975 },
  "z-ai/glm-5.2": { in: 0.35, out: 1.10 },
  "z-ai/glm-4.7": { in: 0.40, out: 1.75 },
  "minimax/minimax-m3": { in: 0.30, out: 1.20 },
  "qwen/qwen3.5-plus-20260420": { in: 0.30, out: 1.80 },
  "qwen/qwen3.5-flash-02-23": { in: 0.065, out: 0.26 },
  "qwen/qwen3.7-max": { in: 1.25, out: 3.75 },
  "qwen/qwen3.7-plus": { in: 0.32, out: 1.28 },
  "qwen/qwen3-next-80b-a3b-instruct:free": { in: 0, out: 0 },
};
// Presupuesto de tokens ASUMIDO para el estimado (documentado, no medido) — un one-shot típico.
const ASSUMED_TOKENS = { in: 3000, out: 1500 };

export function estimateRouteCost(model: string): EstCost {
  const p = PRICING_USD_PER_M[model];
  if (!p) {
    return { usd: null, note: `pricing no verificado para ${model} (ver docs/model-registry.md) — corré 'ebrain route --dry-run --cap <cap>' para el estimado real` };
  }
  const usd = (ASSUMED_TOKENS.in * p.in + ASSUMED_TOKENS.out * p.out) / 1e6;
  return {
    usd: +usd.toFixed(6),
    note: `estimado (${ASSUMED_TOKENS.in}in/${ASSUMED_TOKENS.out}out tokens asumidos @ ${model}, pricing docs/model-registry.md 2026-07-11) — NO es billing real, correlo con 'ebrain route --dry-run' para el número exacto`,
  };
}

// ── clasificación ────────────────────────────────────────────────────────────
export interface CapabilityHit { capability: string; hits: string[] }

// Mismo criterio que route.ts classify(): gana la capacidad con MÁS keywords; empate al tope
// (entre dos capacidades no-cero) o cero hits → "general" (nunca la primera del yaml por azar).
export function classifyCapability(task: string, rules: Pick<AdvisorRules, "capabilities">): CapabilityHit {
  const t = task.toLowerCase();
  let best = "general";
  let bestHits: string[] = [];
  let bestCount = 0;
  let tied = false;
  for (const [cap, def] of Object.entries(rules.capabilities)) {
    if (cap === "general") continue;
    const hits = (def.keywords ?? []).filter((kw) => t.includes(kw.toLowerCase()));
    if (hits.length > bestCount) { best = cap; bestHits = hits; bestCount = hits.length; tied = false; }
    else if (hits.length === bestCount && hits.length > 0) tied = true;
  }
  if (bestCount === 0 || tied) return { capability: "general", hits: [] };
  return { capability: best, hits: bestHits };
}

export function matchSignal(task: string, keywords: string[]): string[] {
  const t = task.toLowerCase();
  return keywords.filter((kw) => t.includes(kw.toLowerCase()));
}

function laneOf(rules: AdvisorRules, key: string): LaneDef {
  const lane = rules.lanes[key];
  if (!lane) throw new Error(`advisor-rules.yaml: lane desconocido '${key}'`);
  return lane;
}

function chainOf(routing: RoutingChains, capability: string): string[] {
  return routing.capabilities[capability]?.models ?? routing.capabilities.general?.models ?? [];
}

function buildAlternatives(rules: AdvisorRules, laneKey: string, capability: string, chain: string[]): Alternative[] {
  const alts: Alternative[] = [];
  const capLane = rules.capability_lane[capability] ?? rules.capability_lane.general;

  if (laneKey === "one_shot_route") {
    if (chain[1]) alts.push({ lane: "one_shot_route", agent: "route", model: chain[1], note: "fallback de la cadena (routing.yaml)" });
    if (chain[2] && chain[2] !== chain[1]) alts.push({ lane: "one_shot_route", agent: "route", model: chain[2], note: "floor/gratis de la cadena (routing.yaml)" });
    if (capLane.session !== laneKey) {
      const sessionLane = laneOf(rules, capLane.session);
      alts.push({ lane: capLane.session, agent: sessionLane.agent, model: sessionLane.model ?? sessionLane.agent, note: "si la tarea crece más allá de un one-shot, subí a sesión interactiva" });
    }
  } else if (laneKey === "claude_audit") {
    const codexLane = laneOf(rules, "interactive_codex");
    alts.push({ lane: "interactive_codex", agent: codexLane.agent, model: codexLane.model ?? codexLane.agent, note: "más barato pero sin el mismo nivel de rigor maker≠checker — usar solo si el riesgo es bajo" });
  } else if (laneKey === "gemini_multimodal") {
    alts.push({ lane: "claude_audit", agent: "claude", model: "claude-opus (frontier)", note: "si gemini free tier falla/rate-limitea, Claude Code con input multimodal (confirm-only)" });
  } else {
    // sesión interactiva "normal" (codex/opencode/cursor por capacidad)
    if (chain[0]) alts.push({ lane: "one_shot_route", agent: "route", model: chain[0], note: "si es más chico de lo que parece, one-shot barato vía route --cap" });
  }
  return alts;
}

// ── decisión ──────────────────────────────────────────────────────────────
export async function buildAdvice(task: string, rules: AdvisorRules, routing: RoutingChains): Promise<AdviceResult> {
  const { capability, hits } = classifyCapability(task, rules);
  const audit = matchSignal(task, rules.audit_signals.keywords);
  const multimodal = matchSignal(task, rules.multimodal_signals.keywords);
  const oneshot = matchSignal(task, rules.oneshot_signals.keywords);

  let laneKey: string;
  let overrideReason = "";
  if (audit.length > 0) {
    laneKey = "claude_audit";
    overrideReason = `señales de auditoría/arquitectura detectadas (${audit.join(", ")}) → override duro sobre cualquier capacidad`;
  } else if (multimodal.length > 0) {
    laneKey = "gemini_multimodal";
    overrideReason = `señales multimodales detectadas (${multimodal.join(", ")}) → override duro sobre cualquier capacidad`;
  } else {
    const capLane = rules.capability_lane[capability] ?? rules.capability_lane.general;
    laneKey = oneshot.length > 0 ? capLane.oneshot : capLane.session;
  }

  const lane = laneOf(rules, laneKey);
  const chain = chainOf(routing, capability);

  let model: string;
  let est_cost: EstCost;
  if (lane.model_source === "routing") {
    model = chain[0] ?? "(cadena vacía en routing.yaml)";
    est_cost = estimateRouteCost(model);
  } else if (lane.model_source === "routing-floor") {
    model = chain[chain.length - 1] ?? "(cadena vacía en routing.yaml)";
    est_cost = { usd: 0, note: `carril de sesión barata (floor: ${model}) — costo por-request despreciable, no billea aparte del uso normal de ${lane.agent}` };
  } else {
    model = lane.model ?? lane.agent;
    est_cost = { usd: 0, note: `cubierto por suscripción/crédito existente (${lane.agent}) — no pasa por el ledger de route.ts (ver 'ebrain spend' para el gap gbrain/tier0)` };
  }

  const reasonParts: string[] = [];
  reasonParts.push(
    overrideReason ||
    `tarea clasificada como capacidad '${capability}'${hits.length ? ` (keywords: ${hits.join(", ")})` : " (sin match — fallback general)"}`,
  );
  if (!overrideReason && oneshot.length > 0 && laneKey === (rules.capability_lane[capability] ?? rules.capability_lane.general).oneshot) {
    reasonParts.push(`señal one-shot (${oneshot.join(", ")}) → carril barato en vez de sesión interactiva`);
  }
  reasonParts.push(`carril '${laneKey}': ${lane.note}`);
  if (lane.frontier) {
    reasonParts.push("⚠ FRONTIER — esto es SOLO una recomendación; requiere confirmación explícita antes de lanzar (candado F4/D5, el advisor NUNCA auto-escala ni auto-lanza).");
  }

  return {
    task,
    capability,
    lane: laneKey,
    agent: lane.agent,
    model,
    reason: reasonParts.join(" — "),
    est_cost,
    alternatives: buildAlternatives(rules, laneKey, capability, chain),
    frontier: lane.frontier,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────
function parseArgs(argv: string[]) {
  const json = argv.includes("--json");
  const rest = argv.filter((a) => a !== "--json");
  return { json, task: rest.join(" ").trim() };
}

async function main() {
  const { json, task } = parseArgs(process.argv.slice(2));
  let finalTask = task;
  if (!finalTask && !process.stdin.isTTY) {
    finalTask = (await Bun.readableStreamToText(Bun.stdin.stream())).trim();
  }
  if (!finalTask) die('uso: ebrain advise "<tarea>" [--json]  (o por stdin)');

  const rules = await loadRules();
  const routing = (await loadRoutingCfg()) as unknown as RoutingChains;
  const advice = await buildAdvice(finalTask, rules, routing);

  if (json) {
    console.log(JSON.stringify(advice, null, 2));
    return;
  }

  console.log(`ebrain advise — "${advice.task}"`);
  console.log(`  capacidad  ${advice.capability}`);
  console.log(`  carril     ${advice.lane}${advice.frontier ? "  ⚠ FRONTIER (confirmar antes de lanzar)" : ""}`);
  console.log(`  agente     ${advice.agent}`);
  console.log(`  modelo     ${advice.model}`);
  console.log(`  costo est. ${advice.est_cost.usd === null ? "n/d" : `$${advice.est_cost.usd}`}  (${advice.est_cost.note})`);
  console.log(`  razón      ${advice.reason}`);
  if (advice.alternatives.length) {
    console.log("  alternativas:");
    for (const a of advice.alternatives) console.log(`    - [${a.lane}] ${a.agent} · ${a.model} — ${a.note}`);
  }
}

if (import.meta.main) main().catch((e) => die(String(e?.message ?? e)));
