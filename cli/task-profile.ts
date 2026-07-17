#!/usr/bin/env bun
/**
 * ebrain task-profile -- ADR-005's explainable task classifier.
 *
 * It reports matched capabilities and execution modes. It deliberately has no concept of the
 * best agent/model, pricing, subscriptions, benchmarks, or automatic execution.
 */
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const EBRAIN_HOME = process.env.EBRAIN_HOME || join(HOME, "eBrain");
const RULES_PATH = process.env.EBRAIN_TASK_PROFILE_RULES || join(EBRAIN_HOME, "config", "task-profile-rules.yaml");

export const CAPABILITIES = ["coding", "agentic", "web_design", "long_context", "terminal", "general"] as const;
export type Capability = typeof CAPABILITIES[number];
export interface TaskProfileRules { capabilities: Record<string, { keywords: string[] }> }
export interface CapabilitySignal { capability: Capability; matched: string[] }
export interface TaskProfile {
  task: string;
  signals: CapabilitySignal[];
  selected_capability: Capability;
  compatible_targets: ("manual-session" | "openrouter-one-shot")[];
  disclaimer: string;
}

function die(message: string, code = 1): never {
  console.error(`error: ${message}`);
  process.exit(code);
}

function asCapability(value: string): Capability {
  return (CAPABILITIES as readonly string[]).includes(value) ? value as Capability : "general";
}

export async function loadTaskProfileRules(path = RULES_PATH): Promise<TaskProfileRules> {
  const file = Bun.file(path);
  if (!(await file.exists())) die(`task-profile-rules.yaml does not exist at ${path}`);
  return (Bun as unknown as { YAML: { parse: (text: string) => TaskProfileRules } }).YAML.parse(await file.text());
}

/** Highest number of literal keyword hits wins; a non-zero tie deliberately resolves to general. */
export function classifyTask(task: string, rules: TaskProfileRules): { selected: Capability; signals: CapabilitySignal[] } {
  const lowered = task.toLowerCase();
  const signals = Object.entries(rules.capabilities)
    .filter(([capability]) => capability !== "general")
    .map(([capability, rule]) => ({
      capability: asCapability(capability),
      matched: (rule.keywords ?? []).filter((keyword) => lowered.includes(keyword.toLowerCase())),
    }))
    .filter((signal) => signal.matched.length > 0);
  const highest = Math.max(0, ...signals.map((signal) => signal.matched.length));
  const leaders = signals.filter((signal) => signal.matched.length === highest);
  const selected = highest === 0 || leaders.length !== 1 ? "general" : leaders[0]!.capability;
  return { selected, signals };
}

export function buildTaskProfile(task: string, rules: TaskProfileRules): TaskProfile {
  const trimmed = task.trim();
  if (!trimmed) throw new Error("the task cannot be empty");
  const { selected, signals } = classifyTask(trimmed, rules);
  return {
    task: trimmed,
    signals,
    selected_capability: selected,
    compatible_targets: ["manual-session", "openrouter-one-shot"],
    disclaimer: "Signals classify the task; they do not rank models or pick an agent.",
  };
}

export function parseTaskProfileArgs(argv: string[]): { json: boolean; task: string } {
  const json = argv.includes("--json");
  return { json, task: argv.filter((arg) => arg !== "--json").join(" ").trim() };
}

export async function runTaskProfileCli(argv = process.argv.slice(2), command = "task-profile"): Promise<void> {
  const parsed = parseTaskProfileArgs(argv);
  let task = parsed.task;
  if (!task && !process.stdin.isTTY) task = (await Bun.readableStreamToText(Bun.stdin.stream())).trim();
  if (!task) die(`usage: ebrain ${command} \"<task>\" [--json]  (or via stdin)`);
  const profile = buildTaskProfile(task, await loadTaskProfileRules());
  if (parsed.json) {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }
  console.log(`ebrain ${command} — \"${profile.task}\"`);
  console.log(`  capability  ${profile.selected_capability}`);
  console.log(`  signals     ${profile.signals.length ? profile.signals.map((s) => `${s.capability}:${s.matched.join(",")}`).join(" | ") : "none"}`);
  console.log(`  targets     ${profile.compatible_targets.join(", ")}`);
  console.log(`  note        ${profile.disclaimer}`);
}

if (import.meta.main) await runTaskProfileCli();
