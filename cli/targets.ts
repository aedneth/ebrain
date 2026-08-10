#!/usr/bin/env bun
/**
 * ebrain targets -- executable adapter capabilities (ADR-005 / F6.6.3).
 *
 * A target is the truth about whether an adapter can launch a selected model. It is deliberately
 * separate from Task Profile and user profiles: neither can invent CLI support for an adapter.
 */
import { homedir } from "node:os";
import { resolveEbrainHome } from "./ebrain-home.ts";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { appendAdapterEvent, makeAdapterEvent } from "./cost.ts";
import { readProfileStore, type ExecutionProfile } from "./profiles.ts";
import { newSession, sendToSession, type NewSessionInfo, type Result, type TmuxError } from "./sessions.ts";

const HOME = homedir();
const EBRAIN_HOME = resolveEbrainHome();
const ADAPTERS_DIR = process.env.EBRAIN_ADAPTERS_DIR || join(EBRAIN_HOME, "harness", "adapters");
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,160}$/;
const SAFE_TARGET_ID = /^[a-z][a-z0-9-]{0,63}$/;

export interface ExecutionTarget {
  id: string;
  agent: string;
  provider: "openrouter";
  ram_class: "heavy" | "light" | "unknown";
  argv: string[];
  model_flag: string;
  model_prefix: string;
}
export interface LaunchPlan {
  target: string;
  agent: string;
  provider: "openrouter";
  profile: string;
  capability: string;
  model: string;
  fallback_models: string[];
  argv: string[];
  cwd: string;
  ram_class: "heavy" | "light" | "unknown";
  cost_status: "untracked";
}

function die(message: string, code = 1): never {
  console.error(`error: ${message}`);
  process.exit(code);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function safeArg(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000\r\n]/.test(value);
}
function asRamClass(value: unknown): "heavy" | "light" | "unknown" {
  return value === "heavy" || value === "light" ? value : "unknown";
}

export function parseTarget(value: unknown, agent: string, ramClass: "heavy" | "light" | "unknown"): ExecutionTarget | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  const provider = value.provider;
  const argv = value.argv;
  const model = value.model;
  if (typeof id !== "string" || !SAFE_TARGET_ID.test(id) || provider !== "openrouter" || !Array.isArray(argv) || !argv.every(safeArg) || !isRecord(model)) return null;
  if (typeof model.flag !== "string" || !safeArg(model.flag) || typeof model.prefix !== "string" || !safeArg(model.prefix)) return null;
  return { id, agent, provider: "openrouter", ram_class: ramClass, argv: [...argv], model_flag: model.flag, model_prefix: model.prefix };
}

/** Discover targets from manifests only. No config, credentials, network or CLI probing is read. */
export async function listExecutionTargets(adaptersDir = ADAPTERS_DIR): Promise<ExecutionTarget[]> {
  if (!existsSync(adaptersDir)) return [];
  const entries = await Array.fromAsync(new Bun.Glob("*/manifest.yaml").scan({ cwd: adaptersDir, onlyFiles: true }));
  const targets: ExecutionTarget[] = [];
  for (const relative of entries.sort()) {
    const file = Bun.file(join(adaptersDir, relative));
    try {
      const manifest = (Bun as unknown as { YAML: { parse: (text: string) => Record<string, unknown> } }).YAML.parse(await file.text());
      const agent = typeof manifest.agent === "string" && SAFE_ID.test(manifest.agent) ? manifest.agent : relative.split("/")[0]!;
      const ramClass = asRamClass(manifest.class);
      const declared = Array.isArray(manifest.targets) ? manifest.targets : [];
      for (const candidate of declared) {
        const target = parseTarget(candidate, agent, ramClass);
        if (target) targets.push(target);
      }
    } catch {
      /* A malformed external manifest must not create a guessed executable target. */
    }
  }
  return targets.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildLaunchPlan(target: ExecutionTarget, profile: ExecutionProfile, capability: string, cwd: string): LaunchPlan {
  if (profile.provider !== target.provider) throw new Error(`profile ${profile.id} is not compatible with target ${target.id}`);
  if (!SAFE_ID.test(capability)) throw new Error("invalid capability");
  const models = profile.capabilities[capability];
  if (!models?.length) throw new Error(`profile ${profile.id} defines no models for ${capability}`);
  if (!models.every((model) => SAFE_ID.test(model))) throw new Error("profile contains an invalid model");
  const model = models[0]!;
  const selected = `${target.model_prefix}${model}`;
  if (!safeArg(selected)) throw new Error("invalid model for argv");
  return {
    target: target.id,
    agent: target.agent,
    provider: target.provider,
    profile: profile.id,
    capability,
    model,
    fallback_models: models.slice(1),
    argv: [...target.argv, target.model_flag, selected],
    cwd: resolve(cwd),
    ram_class: target.ram_class,
    cost_status: "untracked",
  };
}

export async function resolveLaunchPlan(input: { targetId: string; profileId: string; capability: string; cwd: string }, adaptersDir = ADAPTERS_DIR): Promise<LaunchPlan> {
  const [targets, store] = await Promise.all([listExecutionTargets(adaptersDir), readProfileStore()]);
  if (!store) throw new Error("no profile store exists; run 'ebrain profiles init --yes'");
  const target = targets.find((candidate) => candidate.id === input.targetId);
  if (!target) throw new Error(`target not found or without declared support: ${input.targetId}`);
  const profile = store.profiles.find((candidate) => candidate.id === input.profileId);
  if (!profile) throw new Error(`profile not found: ${input.profileId}`);
  return buildLaunchPlan(target, profile, input.capability, input.cwd);
}

/**
 * Outcome of launching a plan (G56-F2). On a prompt-delivery failure the session is RETAINED and
 * carried back so the caller can refresh Sessions and surface a recoverable error — the task prompt
 * is never echoed into the result.
 */
export type LaunchResult =
  | { ok: true; session: NewSessionInfo; delivered: boolean }
  | { ok: false; error: TmuxError; session?: NewSessionInfo };

export interface LaunchDeps {
  startSession: typeof newSession;
  deliver: typeof sendToSession;
  recordEvent: typeof appendAdapterEvent;
}
const DEFAULT_LAUNCH_DEPS: LaunchDeps = { startSession: newSession, deliver: sendToSession, recordEvent: appendAdapterEvent };

/**
 * Launch a pre-reviewed plan and deliver the reviewed task (G56-F2). Starting a process is not token
 * usage, so the initial ledger event is explicitly untracked (with workflow attribution); later
 * adapter telemetry can add token-only or metered events. The prompt, when present, is delivered as
 * exact bytes over `sendToSession` AFTER session creation; a delivery failure keeps the session.
 */
export async function launchPlan(
  plan: LaunchPlan,
  slug: string,
  opts: { workflow?: string; prompt?: string } = {},
  deps: LaunchDeps = DEFAULT_LAUNCH_DEPS,
): Promise<LaunchResult> {
  const started = await deps.startSession(plan.agent, slug, { cwd: plan.cwd, launchArgv: plan.argv });
  if (!started.ok) return started;
  await deps.recordEvent(makeAdapterEvent({
    provider: plan.provider,
    agent: plan.agent,
    model: plan.model,
    session: started.session.name,
    workflow: opts.workflow,
    capability: plan.capability,
    kind: "untracked",
  }));
  if (opts.prompt) {
    const sent = await deps.deliver(started.session.name, opts.prompt, true);
    if (!sent.ok) {
      // Retain the session; return a structured, recoverable prompt-send failure. Never echo the prompt.
      return {
        ok: false,
        error: { type: "prompt-send", message: `session '${started.session.name}' started but the task could not be delivered; the session is retained` },
        session: started.session,
      };
    }
  }
  return { ok: true, session: started.session, delivered: opts.prompt ? true : false };
}

function parseArgs(argv: string[]): { command: string; rest: string[]; json: boolean; yes: boolean } {
  const [command = "list", ...raw] = argv;
  return { command, rest: raw.filter((arg) => arg !== "--json" && arg !== "--yes"), json: raw.includes("--json"), yes: raw.includes("--yes") };
}
function valueOf(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  return typeof value === "string" && !value.startsWith("--") ? value : null;
}
function print(value: unknown): void { console.log(JSON.stringify(value, null, 2)); }

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "list") {
    print({ targets: await listExecutionTargets() });
    return;
  }
  const targetId = valueOf(args.rest, "--target");
  const profileId = valueOf(args.rest, "--profile");
  const capability = valueOf(args.rest, "--cap");
  const cwd = valueOf(args.rest, "--cwd") ?? process.env.EBRAIN_CALLER_CWD ?? process.cwd();
  if (!targetId || !profileId || !capability) die("usage: ebrain targets <plan|launch> --target ID --profile ID --cap CAP [--cwd DIR] [--slug SLUG] [--workflow ID] [--prompt-stdin] [--yes] [--json]");
  const plan = await resolveLaunchPlan({ targetId, profileId, capability, cwd });
  if (args.command === "plan") {
    print(plan);
    return;
  }
  if (args.command === "launch") {
    if (!args.yes) {
      print({ ok: false, error: { type: "confirm-required", message: "targets launch starts a session; repeat with --yes" }, would: plan });
      process.exit(2);
    }
    const slug = valueOf(args.rest, "--slug");
    if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) die("launch requires a safe --slug", 2);
    const workflow = valueOf(args.rest, "--workflow");
    if (workflow && !SAFE_ID.test(workflow)) die("invalid --workflow id", 2);
    // The reviewed task arrives over stdin (never argv/logs) so the prompt is not exposed on the
    // command line or in process listings (G56-F2). sendToSession appends the submit Enter, so a
    // single trailing newline is dropped here to avoid a spurious early submit.
    let prompt: string | undefined;
    if (args.rest.includes("--prompt-stdin")) {
      const raw = await Bun.readableStreamToText(Bun.stdin.stream());
      prompt = raw.replace(/\r?\n$/, "");
      if (!prompt) die("--prompt-stdin was set but stdin was empty", 2);
    }
    const result = await launchPlan(plan, slug, { workflow: workflow ?? undefined, prompt });
    print(result);
    if (!result.ok) process.exit(2);
    return;
  }
  die("usage: ebrain targets <list|plan|launch> ...");
}

if (import.meta.main) main().catch((error) => die(error instanceof Error ? error.message : String(error)));
