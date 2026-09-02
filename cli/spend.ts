#!/usr/bin/env bun
/**
 * ebrain spend — MTD (mes-a-la-fecha) por capacidad, contra el cap de routing.yaml.
 * (SPRINT-TUI 6.1.3 — pieza del contrato CLI-first: el panel Routing/Spend, F6.5.3, renderiza esto.)
 *
 * Lee el MISMO ledger que route.ts (spend.jsonl) y el MISMO config (routing.yaml) — cero lógica
 * de negocio nueva, solo agregación de lo que route.ts ya loguea. Reusa monthKey/monthSpend/
 * expandHome de route.ts (una sola fuente de verdad para "qué cuenta como este mes").
 *
 * `engine` (added: memory-ootb) — folds in the memory engine's OWN spend ledgers
 * (`~/.gbrain/audit/budget-*.jsonl` + `dream-budget-*.jsonl`, parsed by `./engine-spend.ts`).
 * `gbrain_untracked` is `false` ONLY when `engine.observed` is `true` (a real ledger was found
 * and parsed); otherwise it stays `true` — the gap is never hidden without evidence. When the
 * engine ledger is present but has unpriced/corrupt lines, `engine.partiallyObserved` says so;
 * `engine.usd` still only ever sums what was actually priced, never a fabricated estimate.
 *
 * Uso:
 *   ebrain spend --json     # {month,budget,mtd,remaining,by_capability[],engine,gbrain_untracked}
 *   ebrain spend            # mismo dato, texto plano
 */
import { homedir } from "os";
import { join } from "path";
import { monthKey, monthSpend, expandHome } from "./route.ts";
import { readEngineSpend } from "./engine-spend.ts";
import { parseRoutingConfig, RoutingConfigError, type ResolvedRoutingConfig } from "./config-schema.ts";

const HOME = homedir();
const CFG_PATH = join(HOME, ".config", "ebrain", "routing.yaml");

/**
 * Resolve the memory engine's audit ledger directory: `<GBRAIN_HOME or $HOME>/.gbrain/audit`.
 * Mirrors `cli/embedder-detect.ts`'s `resolveConfigPath` convention exactly — GBRAIN_HOME is a
 * *parent* directory, `.gbrain` is always appended — so the two lanes (engine config detection,
 * engine spend detection) never drift on where "the engine's home" is. `env` is injectable for
 * tests; production callers use the default `process.env`.
 */
export function resolveEngineAuditDir(env: NodeJS.ProcessEnv = process.env): string {
  const base =
    (env.GBRAIN_HOME && env.GBRAIN_HOME.trim() !== "" && env.GBRAIN_HOME) ||
    env.HOME ||
    homedir();
  return join(base, ".gbrain", "audit");
}

/**
 * The routing config, validated rather than cast. Returning the resolved shape means every
 * consumer (spend, cost, routing) also learns WHICH provider the budget governs, instead of
 * assuming one.
 */
type RoutingCfg = ResolvedRoutingConfig;

export interface CapSpend { capability: string; mtd: number; routes: number }

function die(msg: string, code = 1): never {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

export async function loadRoutingCfg(cfgPath = CFG_PATH): Promise<RoutingCfg> {
  const f = Bun.file(cfgPath);
  if (!(await f.exists())) die(`routing.yaml no existe en ${cfgPath} — corré 'ebrain up' para crearlo desde el default`);
  const raw = (Bun as unknown as { YAML: { parse: (s: string) => unknown } }).YAML.parse(await f.text());
  try {
    return parseRoutingConfig(raw, cfgPath);
  } catch (e) {
    if (e instanceof RoutingConfigError) die(e.message);
    throw e;
  }
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
  const engineSpend = readEngineSpend(resolveEngineAuditDir());

  const payload = {
    month: monthKey(),
    budget: { monthly_usd: cfg.budget.monthly_usd, hard_stop: cfg.budget.hard_stop },
    mtd: +spentTotal.toFixed(6),
    remaining: +remaining.toFixed(6),
    by_capability: byCap,
    engine: {
      usd: +engineSpend.usd.toFixed(6),
      observed: engineSpend.observed,
      partiallyObserved: engineSpend.partiallyObserved,
    },
    // false ONLY when the engine ledger was actually found and parsed — never fabricated.
    gbrain_untracked: !engineSpend.observed,
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`ebrain spend — ${payload.month}`);
  console.log(`  mtd $${payload.mtd.toFixed(4)} / cap $${payload.budget.monthly_usd} (restante $${payload.remaining.toFixed(4)})`);
  for (const c of byCap) console.log(`  ${c.capability.padEnd(14)} $${c.mtd.toFixed(4)}  (${c.routes} rutas)`);
  if (payload.engine.observed) {
    const note = payload.engine.partiallyObserved ? " (parcial — llamadas sin precio)" : "";
    console.log(`  motor (think/dream) $${payload.engine.usd.toFixed(4)}${note}`);
  } else {
    console.log("  ⚠ el motor (think/dream) no entra a este ledger — su cap real es server-side");
  }
}

if (import.meta.main) main().catch((e) => die(String(e?.message ?? e)));
