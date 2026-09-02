import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildLaunchPlan, launchPlan, listExecutionTargets, parseTarget, type ExecutionTarget, type LaunchDeps } from "./targets.ts";
import type { ExecutionProfile } from "./profiles.ts";

const TARGET: ExecutionTarget = {
  id: "opencode-openrouter",
  agent: "opencode",
  provider: "openrouter",
  ram_class: "heavy",
  argv: ["opencode", "--auto"],
  model_flag: "--model",
  model_prefix: "openrouter/",
};
const PROFILE: ExecutionProfile = {
  id: "my-stack",
  label: "My stack",
  provider: "openrouter",
  capabilities: { coding: ["deepseek/deepseek-v4-pro", "qwen/qwen3-coder:free"] },
  evidence: { source: "user-profile", as_of: "2026-07-15T00:00:00.000Z" },
};

describe("execution targets -- structured model launch", () => {
  test("the real OpenCode manifest declares its verified OpenRouter selector", async () => {
    const targets = await listExecutionTargets(join(import.meta.dir, "..", "harness", "adapters"));
    expect(targets).toContainEqual(TARGET);
  });

  test("builds exact argv from a user-selected profile, including fallbacks as data", () => {
    const plan = buildLaunchPlan(TARGET, PROFILE, "coding", "/tmp/project");
    expect(plan.argv).toEqual(["opencode", "--auto", "--model", "openrouter/deepseek/deepseek-v4-pro"]);
    expect(plan.fallback_models).toEqual(["qwen/qwen3-coder:free"]);
    expect(plan.cost_status).toBe("untracked");
  });

  test("refuses capabilities and target declarations that cannot be represented safely", () => {
    expect(() => buildLaunchPlan(TARGET, PROFILE, "terminal", "/tmp/project")).toThrow("defines no models");
    expect(parseTarget({ id: "bad target", provider: "openrouter", argv: ["opencode"], model: { flag: "--model", prefix: "openrouter/" } }, "opencode", "heavy")).toBeNull();
    expect(parseTarget({ id: "opencode-openrouter", provider: "openrouter", argv: ["opencode\nrm"], model: { flag: "--model", prefix: "openrouter/" } }, "opencode", "heavy")).toBeNull();
  });
});

// ── G56-F2 — launchPlan delivers the reviewed task + attributes the workflow ──
describe("launchPlan delivers the reviewed task (G56-F2)", () => {
  const PLAN = buildLaunchPlan(TARGET, PROFILE, "coding", "/tmp/project");

  function deps(overrides: Partial<LaunchDeps> = {}): { deps: LaunchDeps; sent: { text?: string; yes?: boolean; called: boolean }; event: { value?: Record<string, unknown> } } {
    const sent: { text?: string; yes?: boolean; called: boolean } = { called: false };
    const event: { value?: Record<string, unknown> } = {};
    const base: LaunchDeps = {
      startSession: (async (agent: string, slug: string, opts: { cwd?: string }) => ({
        ok: true as const,
        session: { name: `ebr-${agent}-${slug}`, agent, slug, cwd: opts.cwd ?? "" },
      })) as LaunchDeps["startSession"],
      deliver: (async (name: string, text: string, yes: boolean) => {
        sent.called = true; sent.text = text; sent.yes = yes;
        return { ok: true as const, name, sent: true };
      }) as LaunchDeps["deliver"],
      recordEvent: (async (e: Record<string, unknown>) => { event.value = e; }) as LaunchDeps["recordEvent"],
    };
    return { deps: { ...base, ...overrides }, sent, event };
  }

  test("delivers the exact reviewed prompt and records workflow attribution on the untracked event", async () => {
    const { deps: d, sent, event } = deps();
    const res = await launchPlan(PLAN, "task1", { workflow: "second-brain-dev-sop", prompt: "implement the parser" }, d);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.delivered).toBe(true);
    expect(sent.text).toBe("implement the parser");
    expect(sent.yes).toBe(true);
    expect(event.value?.workflow).toBe("second-brain-dev-sop");
    expect(event.value?.cost_kind).toBe("untracked");
  });

  test("no prompt → session starts, nothing is delivered", async () => {
    const { deps: d, sent } = deps();
    const res = await launchPlan(PLAN, "task2", {}, d);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.delivered).toBe(false);
    expect(sent.called).toBe(false);
  });

  test("session-creation failure returns the error and never attempts delivery", async () => {
    const { deps: d, sent } = deps({
      startSession: (async () => ({ ok: false as const, error: { type: "exists" as const, message: "session exists" } })) as LaunchDeps["startSession"],
    });
    const res = await launchPlan(PLAN, "task3", { prompt: "x" }, d);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.type).toBe("exists");
    expect(sent.called).toBe(false);
  });

  test("delivery failure retains the session, returns prompt-send, and never echoes the prompt", async () => {
    const { deps: d, event } = deps({
      deliver: (async (name: string) => ({ ok: false as const, error: { type: "not-found" as const, message: "no pane" }, would: { name, text: "" } })) as LaunchDeps["deliver"],
    });
    const secret = "confidential-task-body-xyz";
    const res = await launchPlan(PLAN, "task4", { prompt: secret }, d);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.type).toBe("prompt-send");
      expect(res.session?.name).toBe("ebr-opencode-task4"); // session retained
    }
    // The untracked launch event was still recorded (the session did start)…
    expect(event.value?.session).toBe("ebr-opencode-task4");
    // …and the prompt text is never echoed back in the structured result.
    expect(JSON.stringify(res)).not.toContain(secret);
  });
});
