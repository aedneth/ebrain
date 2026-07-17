#!/usr/bin/env bun
/**
 * ebrain routing — contract for the OpenRouter stack UX.
 *
 * Read-only. It exposes the routed Chinese-model stack as an operable data model
 * for the TUI: capabilities, winner/fallback/floor chains, pricing, MTD spend,
 * and the exact one-shot command surface. The TUI must consume this JSON instead
 * of reading routing.yaml or spend.jsonl directly.
 */
import { loadRoutingCfg, spendByCapability, type CapSpend } from "./spend.ts";
import { chainHasFrontier, expandHome, monthKey, monthSpend } from "./route.ts";

export type ModelRole = "winner" | "fallback" | "floor";

// The routing contract carries NO per-token price snapshot and NO cost estimate: those
// were undated, unsourced numbers that read like verified billing (G56-F8). Cost is
// reported ONLY as factual, provider-reported token spend — the `mtd` field here and the
// separate `cost` ledger. `free` is asserted only when the slug itself says `:free`.
export interface RoutingModel {
  role: ModelRole;
  slug: string;
  free: boolean;
  frontier: boolean;
}

export interface RoutingCapability {
  capability: string;
  mtd: number;
  routes: number;
  command: string;
  models: RoutingModel[];
}

export interface RoutingOverview {
  month: string;
  budget: { monthly_usd: number; hard_stop: boolean };
  mtd: number;
  remaining: number;
  capabilities: RoutingCapability[];
  gbrain_untracked: true;
}

interface RoutingCfgLike {
  budget: { monthly_usd: number; hard_stop: boolean; log: string };
  capabilities: Record<string, { models: string[] }>;
}

const ROLE_BY_INDEX: ModelRole[] = ["winner", "fallback", "floor"];

function roleFor(index: number): ModelRole {
  return ROLE_BY_INDEX[index] ?? "fallback";
}

function modelInfo(slug: string, index: number): RoutingModel {
  return {
    role: roleFor(index),
    slug,
    free: slug.endsWith(":free"),
    frontier: chainHasFrontier([slug]),
  };
}

export function buildRoutingOverview(
  cfg: RoutingCfgLike,
  byCap: CapSpend[],
  spentTotal: number,
  month = monthKey(),
): RoutingOverview {
  const spend = new Map(byCap.map((c) => [c.capability, c]));
  const capabilities = Object.entries(cfg.capabilities ?? {}).map(([capability, chain]) => {
    const capSpend = spend.get(capability) ?? { capability, mtd: 0, routes: 0 };
    return {
      capability,
      mtd: capSpend.mtd,
      routes: capSpend.routes,
      command: `ebrain route --cap ${capability} "<prompt>"`,
      models: (chain.models ?? []).map(modelInfo),
    };
  });

  return {
    month,
    budget: {
      monthly_usd: cfg.budget.monthly_usd,
      hard_stop: cfg.budget.hard_stop,
    },
    mtd: +spentTotal.toFixed(6),
    remaining: +(cfg.budget.monthly_usd - spentTotal).toFixed(6),
    capabilities,
    gbrain_untracked: true,
  };
}

function printText(payload: RoutingOverview): void {
  console.log(`ebrain routing — ${payload.month}`);
  console.log(`  mtd $${payload.mtd.toFixed(4)} / cap $${payload.budget.monthly_usd} (remaining $${payload.remaining.toFixed(4)})`);
  for (const cap of payload.capabilities) {
    const chain = cap.models.map((m) => `${m.role}:${m.slug}${m.free ? " free" : ""}`).join(" → ");
    console.log(`  ${cap.capability.padEnd(14)} routes=${String(cap.routes).padStart(2)} mtd=$${cap.mtd.toFixed(4)}`);
    console.log(`    ${chain}`);
  }
  console.log("  warning: gbrain/agent subscription spend is tracked separately or untracked unless an adapter reports usage");
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const cfg = await loadRoutingCfg();
  const logPath = expandHome(cfg.budget.log);
  const [spentTotal, byCap] = await Promise.all([
    monthSpend(logPath),
    spendByCapability(logPath, Object.keys(cfg.capabilities ?? {})),
  ]);
  const payload = buildRoutingOverview(cfg, byCap, spentTotal);
  if (json) console.log(JSON.stringify(payload, null, 2));
  else printText(payload);
}

if (import.meta.main) main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
