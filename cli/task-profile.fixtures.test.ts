import { describe, expect, test } from "bun:test";
import { CANONICAL_TASKS } from "./task-profile.fixtures.ts";
import { buildTaskProfile, loadTaskProfileRules } from "./task-profile.ts";

describe("F6.6.6 canonical task fixtures -- signals, not model winners", () => {
  test("covers exactly ten user tasks across every supported capability", () => {
    expect(CANONICAL_TASKS).toHaveLength(10);
    expect(new Set(CANONICAL_TASKS.map((fixture) => fixture.id)).size).toBe(10);
    expect(new Set(CANONICAL_TASKS.map((fixture) => fixture.capability))).toEqual(new Set(["coding", "agentic", "web_design", "long_context", "terminal", "general"]));
  });

  test("loads colocated source rules and emits only explainable capability signals and compatible modes", async () => {
    const rules = await loadTaskProfileRules();
    for (const fixture of CANONICAL_TASKS) {
      const profile = buildTaskProfile(fixture.task, rules);
      expect(profile.selected_capability, fixture.id).toBe(fixture.capability);
      expect(profile.compatible_targets, fixture.id).toEqual(["manual-session", "openrouter-one-shot"]);
      const signal = profile.signals.find((candidate) => candidate.capability === fixture.capability);
      expect(signal?.matched ?? [], fixture.id).toEqual(fixture.matched);
      expect(Object.keys(profile).sort(), fixture.id).toEqual(["compatible_targets", "disclaimer", "selected_capability", "signals", "task"]);
      expect(JSON.stringify(profile).toLowerCase(), fixture.id).not.toMatch(/"(agent|model|winner|best|rank|credit|subscription|cost)"\s*:/);
    }
  });
});
