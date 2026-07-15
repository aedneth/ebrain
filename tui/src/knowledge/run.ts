/**
 * tui/src/knowledge/run.ts — IMPURE fetchers for the F6.5 knowledge panels.
 *
 * The ONLY side-effecting half of the knowledge data plane: it spawns the repo's own
 * `cli/ebrain <sub> --json` dispatcher (the same one `ebrain ui` came through, so the
 * harness env — routed keys, caller cwd — is re-established) and hands the raw JSON to
 * the pure parsers in contracts.ts. Nothing here computes panel data; it only fetches
 * and delegates. buildFrame never calls into this file — only runUi's effect
 * interpreter does (mirrors how sessions/tmux.ts is the only impure path there).
 *
 * Timeouts matter: `doctor` and `fleet` probe every adapter and are SLOW on the Celeron
 * (~17s / ~8s measured in F6.1). Each fetch is bounded so a panel degrades to an "error"
 * state instead of hanging — the 6.5.5 rule: NEVER a spinner-forever.
 */
import { join } from "node:path";

import {
  parseStatus,
  parseFleet,
  parseDoctor,
  parseSpend,
  parseRouting,
  parseCost,
  parseMemory,
  parseWorkflows,
  parseWorkflowRun,
  parseTaskProfile,
  parseProfiles,
  parseTargets,
  parseTargetPlan,
  parseRouteRun,
  type OverviewData,
  type FleetData,
  type DoctorData,
  type SpendData,
  type RoutingData,
  type CostData,
  type MemoryData,
  type WorkflowsData,
  type WorkflowRunData,
  type TaskProfileData,
  type ProfilesData,
  type TargetData,
  type TargetPlanData,
  type RouteRunData,
} from "./contracts.js";

/** The repo's dispatcher: tui/src/knowledge/ -> ../../../cli/ebrain. */
const EBRAIN = join(import.meta.dir, "..", "..", "..", "cli", "ebrain");

export type KResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Run `ebrain <args>` and JSON.parse its stdout, bounded by `timeoutMs`. Returns a
 * typed error (never throws) for: spawn failure, non-zero exit, timeout, or unparseable
 * output — so the caller always has something to render.
 */
async function runEbrainJson(args: string[], timeoutMs: number): Promise<KResult<unknown>> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([EBRAIN, ...args], { stdout: "pipe", stderr: "pipe" });
  } catch (e) {
    return { ok: false, error: `no se pudo ejecutar ebrain: ${msgOf(e)}` };
  }

  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }, timeoutMs);

  try {
    const [out, exit] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    clearTimeout(timer);
    if (exit !== 0) {
      return { ok: false, error: `ebrain ${args[0]} salió con código ${exit}` };
    }
    try {
      return { ok: true, data: JSON.parse(out) };
    } catch {
      return { ok: false, error: `ebrain ${args[0]} devolvió JSON inválido` };
    }
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: msgOf(e) };
  }
}

function msgOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Wrap a fetch: run the subcommand, then run the pure parser; a null parse -> error. */
async function fetchParsed<T>(
  args: string[],
  timeoutMs: number,
  parse: (j: unknown) => T | null,
): Promise<KResult<T>> {
  const raw = await runEbrainJson(args, timeoutMs);
  if (!raw.ok) return raw;
  const data = parse(raw.data);
  if (data == null) return { ok: false, error: `ebrain ${args[0]}: forma JSON inesperada` };
  return { ok: true, data };
}

export function fetchStatus(): Promise<KResult<OverviewData>> {
  return fetchParsed(["status", "--json"], 15000, parseStatus);
}
export function fetchFleet(): Promise<KResult<FleetData>> {
  return fetchParsed(["fleet", "--json"], 20000, parseFleet);
}
export function fetchDoctor(): Promise<KResult<DoctorData>> {
  return fetchParsed(["doctor", "--json"], 30000, parseDoctor);
}
export function fetchSpend(): Promise<KResult<SpendData>> {
  return fetchParsed(["spend", "--json"], 15000, parseSpend);
}
export function fetchRouting(): Promise<KResult<RoutingData>> {
  return fetchParsed(["routing", "--json"], 15000, parseRouting);
}
export function fetchCost(): Promise<KResult<CostData>> {
  return fetchParsed(["cost", "--json"], 15000, parseCost);
}
export function fetchMemory(limit = 8): Promise<KResult<MemoryData>> {
  return fetchParsed(["memory", "recent", "--json", "--limit", String(limit)], 15000, parseMemory);
}
export function fetchWorkflows(limit = 8): Promise<KResult<WorkflowsData>> {
  return fetchParsed(["workflows", "list", "--json", "--limit", String(limit)], 15000, parseWorkflows);
}
export function runWorkflow(id: string): Promise<KResult<WorkflowRunData>> {
  return fetchParsed(["workflows", "run", id, "--json"], 15000, parseWorkflowRun);
}

export function fetchTaskProfile(task: string): Promise<KResult<TaskProfileData>> {
  return fetchParsed(["task-profile", task, "--json"], 15000, parseTaskProfile);
}
export function fetchProfiles(): Promise<KResult<ProfilesData>> { return fetchParsed(["profiles", "list", "--json"], 15000, parseProfiles); }
export function fetchTargets(): Promise<KResult<TargetData[]>> { return fetchParsed(["targets", "list", "--json"], 15000, parseTargets); }
export function fetchTargetPlan(input: { target: string; profile: string; capability: string; cwd: string }): Promise<KResult<TargetPlanData>> {
  return fetchParsed(["targets", "plan", "--target", input.target, "--profile", input.profile, "--cap", input.capability, "--cwd", input.cwd, "--json"], 15000, parseTargetPlan);
}

export function runRoute(capability: string, task: string, opts: { workflow?: string } = {}): Promise<KResult<RouteRunData>> {
  const args = ["route", "--json", "--cap", capability];
  if (opts.workflow) args.push("--workflow", opts.workflow);
  args.push(task);
  return fetchParsed(args, 120000, parseRouteRun);
}

/**
 * Write a learning to permanent agentic memory via `ebrain remember`. Returns ok/err by
 * exit code — the primitive itself rejects secrets and trivialities, so this is a thin
 * pass-through (no client-side validation that could diverge from the primitive's).
 */
export async function runRemember(
  text: string,
  opts: { project?: string; tags?: string } = {},
): Promise<KResult<string>> {
  const args = ["remember"];
  if (opts.project) args.push("--project", opts.project);
  if (opts.tags) args.push("--tags", opts.tags);
  args.push(text);

  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([EBRAIN, ...args], { stdout: "pipe", stderr: "pipe" });
  } catch (e) {
    return { ok: false, error: `no se pudo ejecutar ebrain remember: ${msgOf(e)}` };
  }
  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }, 15000);
  try {
    const [out, err, exit] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    if (exit !== 0) return { ok: false, error: (err || out).trim().split("\n").pop() || `código ${exit}` };
    return { ok: true, data: out.trim() };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: msgOf(e) };
  }
}
