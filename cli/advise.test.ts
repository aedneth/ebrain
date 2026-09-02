/** ADR-005 regression tests: `advise` remains a compatibility alias for Task Profile. */
import { test, expect, describe } from "bun:test";
import {
  buildTaskProfile,
  classifyTask,
  loadTaskProfileRules,
  parseTaskProfileArgs,
  type TaskProfileRules,
} from "./task-profile.ts";

const FIXTURE_RULES: TaskProfileRules = {
  capabilities: {
    coding: { keywords: ["bug", "refactor", "regex"] },
    web_design: { keywords: ["ui", "design", "css"] },
    general: { keywords: [] },
  },
};

describe("Task Profile -- signals, never a recommendation", () => {
  test("selects the unique capability with the most explainable hits", () => {
    const result = classifyTask("arregla este bug con un refactor", FIXTURE_RULES);
    expect(result.selected).toBe("coding");
    expect(result.signals).toEqual([{ capability: "coding", matched: ["bug", "refactor"] }]);
  });

  test("falls back to general for no hit or a tie", () => {
    expect(classifyTask("hola que tal", FIXTURE_RULES).selected).toBe("general");
    expect(classifyTask("hay un bug en la ui", FIXTURE_RULES).selected).toBe("general");
  });

  test("output has only signals and execution modes -- no agent/model/ranking/cost", () => {
    const profile = buildTaskProfile("fix a bug and add tests", FIXTURE_RULES);
    expect(profile.selected_capability).toBe("coding");
    expect(profile.compatible_targets).toEqual(["manual-session", "openrouter-one-shot"]);
    expect(Object.keys(profile).sort()).toEqual(["compatible_targets", "disclaimer", "selected_capability", "signals", "task"]);
    expect(JSON.stringify(profile).toLowerCase()).not.toMatch(/best|rank|credit|subscr|est_cost/);
  });

  test("real rules expose all supported capabilities without policy lanes", async () => {
    const rules = await loadTaskProfileRules();
    expect(Object.keys(rules.capabilities).sort()).toEqual(["agentic", "coding", "general", "long_context", "terminal", "web_design"]);
    expect(JSON.stringify(rules).toLowerCase()).not.toMatch(/lane|model|credit|subscr/);
  });

  test("parser accepts positional task and json flag in either position", () => {
    expect(parseTaskProfileArgs(["--json", "fix", "the", "bug"])).toEqual({ json: true, task: "fix the bug" });
    expect(parseTaskProfileArgs(["fix", "the", "bug", "--json"])).toEqual({ json: true, task: "fix the bug" });
  });
});
