#!/usr/bin/env bun
/**
 * ebrain spend — MTD (mes-a-la-fecha) por capacidad, contra el cap de routing.yaml.
 * (SPRINT-TUI 6.1.3 — pieza del contrato CLI-first: el panel Routing/Spend, F6.5.3, renderiza esto.)
 *
 * Lee el MISMO ledger que route.ts (spend.jsonl) y el MISMO config (routing.yaml) — cero lógica
 * de negocio nueva, solo agregación de lo que route.ts ya loguea. Reusa monthKey/monthSpend/
 * expandHome de route.ts (una sola fuente de verdad para "qué cuenta como este mes").
 *
 * gbrain_untracked:true — gap conocido (ver harness/core/doctor.sh check "spend:gbrain-gap"):
 * el gasto de gbrain (think/dream, servidor MCP) NO pasa por este ledger; su cap real es
 * server-side (key OpenAI). Esta CLI solo ve el carril Tier 1 (route.ts/OpenRouter).
 *
 * Uso:
 *   ebrain spend --json     # {month,budget,mtd,remaining,by_capability[],gbrain_untracked}
 *   ebrain spend            # mismo dato, texto plano
 */
import { homedir } from "os";
import { join } from "path";
import { monthKey, monthSpend, expandHome } from "./route.ts";

const HOME = homedir();
const CFG_PATH = join(HOME, ".config", "ebrain", "routing.yaml");

interface Budget { monthly_usd: number; hard_stop: boolean; log: string }
interface RoutingCfg { budget: Budget; capabilities: Record<string, { models: string[] }> }

export interface CapSpend { capability: string; mtd: number; routes: number }

function die(msg: string, code = 1): never {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

export async function loadRoutingCfg(cfgPath = CFG_PATH): Promise<RoutingCfg> {
  const f = Bun.file(cfgPath);
  if (!(await f.exists())) die(`routing.yaml no existe en ${cfgPath}`);
  return (Bun as unknown as { YAML: { parse: (s: string) => RoutingCfg } }).YAML.parse(await f.text());
}

// Agrega MTD + conteo de rutas POR capacidad desde el ledger. Las capacidades conocidas (de
// routing.yaml) arrancan en 0 — para que un gauge las muestre aunque no se hayan usado este mes.
// Cualquier `cap` que aparezca en el ledger pero no esté en `knownCapabilities` (drift/rename en
// routing.yaml) se agrega igual: nunca se descarta gasto real silenciosamente.
export async function spendByCapability(logPath: string, knownCapabilities: string[]): Promise<CapSpend[]> {
  const totals = new Map<string, { mtd: number; routes: number }>();
  for (const c of knownCapabilities) totals.set(c, { mtd: 0, routes: 0 });

  const f = Bun.file(logPath);
  if (await f.exists()) {
    const mk = monthKey();
    for (const line of (await f.text()).split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (typeof r.usd === "number" && typeof r.cap === "string" && String(r.ts).startsWith(mk)) {
          const cur = totals.get(r.cap) ?? { mtd: 0, routes: 0 };
          cur.mtd += r.usd; cur.routes += 1;
          totals.set(r.cap, cur);
        }
      } catch { /* línea corrupta: se ignora, igual que monthSpend en route.ts */ }
    }
  }
  return [...totals.entries()]
    .map(([capability, v]) => ({ capability, mtd: +v.mtd.toFixed(6), routes: v.routes }))
    .sort((a, b) => b.mtd - a.mtd);
}

async function main() {
  const json = process.argv.includes("--json");
  const cfg = await loadRoutingCfg();
  const logPath = expandHome(cfg.budget.log);
  const spentTotal = await monthSpend(logPath);
  const byCap = await spendByCapability(logPath, Object.keys(cfg.capabilities ?? {}));
  const remaining = cfg.budget.monthly_usd - spentTotal;

  const payload = {
    month: monthKey(),
    budget: { monthly_usd: cfg.budget.monthly_usd, hard_stop: cfg.budget.hard_stop },
    mtd: +spentTotal.toFixed(6),
    remaining: +remaining.toFixed(6),
    by_capability: byCap,
    gbrain_untracked: true, // gap conocido: gasto de gbrain (think/dream) no entra a este ledger
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`ebrain spend — ${payload.month}`);
  console.log(`  mtd $${payload.mtd.toFixed(4)} / cap $${payload.budget.monthly_usd} (restante $${payload.remaining.toFixed(4)})`);
  for (const c of byCap) console.log(`  ${c.capability.padEnd(14)} $${c.mtd.toFixed(4)}  (${c.routes} rutas)`);
  console.log("  ⚠ el motor (think/dream) no entra a este ledger — su cap real es server-side");
}

if (import.meta.main) main().catch((e) => die(String(e?.message ?? e)));
