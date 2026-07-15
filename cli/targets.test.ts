import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildLaunchPlan, listExecutionTargets, parseTarget, type ExecutionTarget } from "./targets.ts";
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
    expect(() => buildLaunchPlan(TARGET, PROFILE, "terminal", "/tmp/project")).toThrow("no define modelos");
    expect(parseTarget({ id: "bad target", provider: "openrouter", argv: ["opencode"], model: { flag: "--model", prefix: "openrouter/" } }, "opencode", "heavy")).toBeNull();
    expect(parseTarget({ id: "opencode-openrouter", provider: "openrouter", argv: ["opencode\nrm"], model: { flag: "--model", prefix: "openrouter/" } }, "opencode", "heavy")).toBeNull();
  });
});
