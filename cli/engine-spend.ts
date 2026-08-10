#!/usr/bin/env bun
/**
 * Read-side parser for the memory engine's (gbrain's) own spend ledgers.
 *
 * `ebrain spend` only sees Tier-1 (route.ts / OpenRouter) spend and always
 * reports `gbrain_untracked: true` — the engine's own `think`/`dream` LLM
 * calls are priced and logged by gbrain itself, in a separate pair of
 * audit-JSONL ledgers under `~/.gbrain/audit/`, and never fold into
 * `ebrain spend`'s total. `ebrain doctor` flags this as a known gap
 * (see cli/spend.ts and cli/routing.ts, both of which hardcode
 * `gbrain_untracked: true`).
 *
 * This module is the READ lane for that gap: it parses the two ledger
 * families gbrain already writes and returns a typed spend total, so a
 * future change can fold it into `ebrain spend`'s output. It does not write
 * anything and does not import gbrain at runtime — it reads plain JSONL
 * text with `node:fs`, defensively, against the schema gbrain's writers
 * actually emit today.
 *
 * ── Real schema (discovered by reading the engine's writers) ──────────────
 *
 * 1. `budget-YYYY-Www.jsonl` — written by `BudgetTracker`
 *    (vendor/gbrain/src/core/budget/budget-tracker.ts). Every gateway-routed
 *    chat/embed/rerank call appends one line per `reserve()`/`record()` call,
 *    all carrying `schema_version: 1` (e.g. budget-tracker.ts:297, 314, 335,
 *    367, 383, 425). Relevant events:
 *      - `"record"` (budget-tracker.ts:382-396): the ACTUAL cost of a
 *        completed call. Cost field is `actual_cost_usd`
 *        (budget-tracker.ts:393). This is the only event in this ledger
 *        that reflects real, realized spend — it's what we sum.
 *      - `"reserve"` (budget-tracker.ts:334-345) carries a `projected_cost_usd`
 *        (budget-tracker.ts:342) for a call that hasn't happened yet; summing
 *        it alongside `record` would double-count the same call, so it is
 *        intentionally NOT summed.
 *      - `"reserve_denied"` / `"runtime_denied"` (budget-tracker.ts:313-324,
 *        424-432): the call was blocked before it ran — no spend occurred.
 *      - `"reserve_unpriced"` / `"record_unpriced"` (budget-tracker.ts:296-306,
 *        366-377): the model has no pricing entry, so real spend may have
 *        happened but its USD cost is unknown/unscoped by this ledger — a
 *        known coverage gap, not a parse failure. We flag `partiallyObserved`
 *        for these rather than summing a fabricated cost.
 *
 * 2. `dream-budget-YYYY-Www.jsonl` — written by `BudgetMeter`
 *    (vendor/gbrain/src/core/cycle/budget-meter.ts) for dream-cycle phases
 *    (auto_think / drift). Every line carries `schema_version: 1`
 *    (budget-meter.ts:103, 125, 141, 162). Relevant events:
 *      - `"submit"` (budget-meter.ts:124-134 and :161-171): cost field is
 *        `estimated_cost_usd` (budget-meter.ts:131, 168). Unlike
 *        BudgetTracker, BudgetMeter is a pre-flight gate with no matching
 *        "actual usage" event — `estimated_cost_usd` (an upper-bound
 *        max-output-tokens estimate, see budget-meter.ts:90) is the only
 *        cost figure this ledger ever records, so it is what we sum for
 *        dream-budget files.
 *      - `"submit_denied"` (budget-meter.ts:139-150): the submit was
 *        rejected — no call ran, no spend. Not summed.
 *      - `"submit_unpriced"` (budget-meter.ts:92-118): non-Anthropic /
 *        unpriced model bypassed the gate; cost unknown. Known coverage
 *        gap → flags `partiallyObserved`, not summed.
 *
 * Filenames come from `isoWeekFilename('budget' | 'dream-budget')`
 * (vendor/gbrain/src/core/audit-week-file.ts:44-47), e.g.
 * `budget-2026-W21.jsonl` / `dream-budget-2026-W21.jsonl`. This module
 * matches files by prefix + `.jsonl` suffix rather than pinning the exact
 * week-number format, so it stays robust to that detail.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface EngineSpend {
  usd: number;
  observed: boolean;
  partiallyObserved: boolean;
  files: number;
  lines: number;
  skipped: number;
}

/** Events in budget-*.jsonl that represent completed, priced spend. */
const BUDGET_TRACKER_SPEND_EVENTS = new Set(["record"]);
/** Events in budget-*.jsonl whose cost is real but unscoped (no pricing entry). */
const BUDGET_TRACKER_UNPRICED_EVENTS = new Set(["reserve_unpriced", "record_unpriced"]);

/** Events in dream-budget-*.jsonl that represent gated (estimated) spend. */
const DREAM_BUDGET_SPEND_EVENTS = new Set(["submit"]);
/** Events in dream-budget-*.jsonl whose cost is real but unscoped (no pricing entry). */
const DREAM_BUDGET_UNPRICED_EVENTS = new Set(["submit_unpriced"]);

interface ParsedLedgerLine {
  event?: unknown;
  actual_cost_usd?: unknown;
  estimated_cost_usd?: unknown;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Sum one ledger file's lines into `acc`. Never throws: unreadable files,
 * unparseable lines, and lines with the wrong shape are all skipped and
 * counted, not fatal.
 */
function accumulateFile(
  path: string,
  kind: "budget" | "dream-budget",
  acc: { usd: number; lines: number; skipped: number; partiallyObserved: boolean },
): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    // Unreadable file (permissions, race with rotation, etc.) — the file
    // was discovered but can't be read; treat as fully unobserved for this
    // file rather than throwing.
    acc.partiallyObserved = true;
    return;
  }

  const spendEvents = kind === "budget" ? BUDGET_TRACKER_SPEND_EVENTS : DREAM_BUDGET_SPEND_EVENTS;
  const unpricedEvents = kind === "budget" ? BUDGET_TRACKER_UNPRICED_EVENTS : DREAM_BUDGET_UNPRICED_EVENTS;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue; // blank/trailing lines are not "lines" — nothing to skip
    acc.lines++;

    let parsed: ParsedLedgerLine;
    try {
      const candidate = JSON.parse(line);
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        throw new Error("not a JSON object");
      }
      parsed = candidate as ParsedLedgerLine;
    } catch {
      acc.skipped++;
      acc.partiallyObserved = true;
      continue;
    }

    if (typeof parsed.event !== "string") {
      // Recognizable JSON but missing the field every known event carries —
      // corrupt/foreign line. Skip robustly rather than guessing.
      acc.skipped++;
      acc.partiallyObserved = true;
      continue;
    }

    if (unpricedEvents.has(parsed.event)) {
      // Known-unscoped record type: real spend may have occurred but this
      // ledger doesn't know its cost. Coverage is incomplete, not corrupt.
      acc.partiallyObserved = true;
      continue;
    }

    if (!spendEvents.has(parsed.event)) {
      // reserve / reserve_denied / runtime_denied / submit_denied — no
      // realized spend for this line. Nothing to sum, nothing corrupt.
      continue;
    }

    const cost = kind === "budget" ? parsed.actual_cost_usd : parsed.estimated_cost_usd;
    if (!isFiniteNumber(cost)) {
      // Spend event but the cost field is missing/malformed — corrupt line.
      acc.skipped++;
      acc.partiallyObserved = true;
      continue;
    }

    acc.usd += cost;
  }
}

/**
 * Parse gbrain's engine-spend JSONL ledgers (`budget-*.jsonl` and
 * `dream-budget-*.jsonl`) found directly under `auditDir` and return a
 * typed total.
 *
 * `auditDir` is always an argument — production callers pass the resolved
 * `~/.gbrain/audit` path, tests pass a fixture directory. This function
 * never touches a real gbrain install and never imports gbrain at runtime.
 */
export function readEngineSpend(auditDir: string): EngineSpend {
  const acc = { usd: 0, lines: 0, skipped: 0, partiallyObserved: false };

  let entries: string[];
  try {
    entries = readdirSync(auditDir);
  } catch {
    // Missing/unreadable directory — caller keeps gbrain_untracked: true.
    return { usd: 0, observed: false, partiallyObserved: false, files: 0, lines: 0, skipped: 0 };
  }

  const matches: Array<{ path: string; kind: "budget" | "dream-budget" }> = [];
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    const path = join(auditDir, name);
    try {
      if (!statSync(path).isFile()) continue;
    } catch {
      continue;
    }
    if (name.startsWith("dream-budget-")) {
      matches.push({ path, kind: "dream-budget" });
    } else if (name.startsWith("budget-")) {
      matches.push({ path, kind: "budget" });
    }
  }

  if (matches.length === 0) {
    return { usd: 0, observed: false, partiallyObserved: false, files: 0, lines: 0, skipped: 0 };
  }

  for (const m of matches) accumulateFile(m.path, m.kind, acc);

  return {
    usd: acc.usd,
    observed: true,
    partiallyObserved: acc.partiallyObserved,
    files: matches.length,
    lines: acc.lines,
    skipped: acc.skipped,
  };
}
