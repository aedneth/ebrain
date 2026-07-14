/**
 * tui/src/sessions/governor.ts — RAM governor for launches (SPRINT-TUI 6.4.6).
 *
 * The 4GB Celeron cannot run two heavy agents at once (the standing norm: "un agente
 * interactivo a la vez"). Before a launch, this gates on the agent's RAM class (from
 * the manifest, via fleet.ts readClass — REUSED, zero orphan logic) + how many heavy
 * sessions are already alive + the REAL free memory (/proc/meminfo MemAvailable):
 *   - launching a LIGHT agent → always allowed (gemini/generic don't count),
 *   - launching a 2nd HEAVY  → confirm required, with the live count + free MB + norm,
 *   - launching the 1st HEAVY with critically low RAM → confirm required too.
 *
 * governLaunch() is PURE so the decision is testable with fixtures ("test con fleet
 * fixture", 6.4.6 verify); the impure readers (free MB, live-heavy count) are separate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { readClass, type AgentClass } from "../../../cli/fleet.ts";
import { listSessions } from "./tmux.js";

/** Rough floor of free memory (MB) a heavy agent needs on the 4GB Celeron. Below this,
 * even the FIRST heavy launch asks for confirmation. */
export const HEAVY_MIN_FREE_MB = 500;

export interface GovernInput {
  /** RAM class of the agent being launched. */
  launchingClass: AgentClass;
  /** Heavy sessions already alive. */
  liveHeavyCount: number;
  /** MemAvailable from /proc/meminfo, in MB (-1 if unknown). */
  availableMb: number;
}

export interface GovernResult {
  decision: "allow" | "confirm";
  /** Human-readable reason shown in the confirm dialog (empty when allowed). */
  reason: string;
}

/**
 * The launch gate. Pure: same inputs → same decision, no I/O. `availableMb === -1`
 * (meminfo unreadable) is treated as "unknown, don't block on RAM" — the 2nd-heavy
 * rule still applies regardless.
 */
export function governLaunch(input: GovernInput): GovernResult {
  const { launchingClass, liveHeavyCount, availableMb } = input;

  // Light (or unknown-class) agents never count against "un heavy a la vez".
  if (launchingClass !== "heavy") return { decision: "allow", reason: "" };

  if (liveHeavyCount >= 1) {
    return {
      decision: "confirm",
      reason:
        `ya hay ${liveHeavyCount} agente${liveHeavyCount === 1 ? "" : "s"} pesado${liveHeavyCount === 1 ? "" : "s"} vivo${liveHeavyCount === 1 ? "" : "s"}` +
        (availableMb >= 0 ? ` · ${availableMb} MB libres` : "") +
        " · la norma es UN heavy a la vez (Celeron 4GB)",
    };
  }

  if (availableMb >= 0 && availableMb < HEAVY_MIN_FREE_MB) {
    return {
      decision: "confirm",
      reason: `solo ${availableMb} MB libres (< ${HEAVY_MIN_FREE_MB} MB) para un agente pesado`,
    };
  }

  return { decision: "allow", reason: "" };
}

/** Parse MemAvailable (kB) out of a /proc/meminfo blob → MB. -1 if not present. */
export function parseAvailableMb(meminfo: string): number {
  const m = /^MemAvailable:\s+(\d+)\s*kB/m.exec(meminfo);
  if (!m) return -1;
  const kb = parseInt(m[1]!, 10);
  return Number.isFinite(kb) ? Math.floor(kb / 1024) : -1;
}

/** Free memory in MB from /proc/meminfo. -1 on any failure (non-Linux, unreadable). */
export function readAvailableMb(): number {
  try {
    return parseAvailableMb(readFileSync("/proc/meminfo", "utf8"));
  } catch {
    return -1;
  }
}

/** RAM class of a single adapter (thin wrapper over fleet.ts readClass — one import
 * surface for app.ts's launch gate). */
export async function classOf(agent: string): Promise<AgentClass> {
  return readClass(agent);
}

/** How many currently-live tmux sessions are heavy-class agents. 0 if tmux is down. */
export async function countLiveHeavy(): Promise<number> {
  const list = await listSessions();
  if (!list.ok) return 0;
  const classes = await Promise.all(list.sessions.map((s) => readClass(s.agent)));
  return classes.filter((c) => c === "heavy").length;
}

/** Append a governor-override record so a knowingly-risky 2nd-heavy launch leaves a
 * trail (spec 6.4.6 "registro del override"). Best-effort — never throws into the UI. */
export function logOverride(entry: { agent: string; cwd: string; reason: string }): void {
  try {
    const dir = process.env.EBRAIN_CONFIG_DIR || join(homedir(), ".config", "ebrain");
    const line = JSON.stringify({ ts: new Date().toISOString(), kind: "ram-governor-override", ...entry }) + "\n";
    const { appendFileSync, mkdirSync } = require("node:fs") as typeof import("node:fs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "governor-overrides.jsonl"), line);
  } catch {
    // swallow — an override that fails to log must not crash the launch.
  }
}
