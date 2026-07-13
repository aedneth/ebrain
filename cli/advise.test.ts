/**
 * Tests de advise.ts (SPRINT-TUI 6.1.7). Dos capas:
 *   1. Unit tests de las funciones puras (classifyCapability/matchSignal/estimateRouteCost) con
 *      una regla fixture pequeña — sin depender del archivo real.
 *   2. El criterio de éxito #5 (primera pasada): 10 TAREAS CANÓNICAS contra las reglas REALES
 *      (config/advisor-rules.yaml, el artefacto bajo test) + una cadena de routing FIXTURE (no el
 *      routing.yaml real de ~/.config/ebrain — así el test es hermético y no driftea si Eduardo
 *      edita sus cadenas de modelo; solo le importan capability/lane/frontier, no el slug exacto).
 *
 * `bun test cli/advise.test.ts`.
 */
import { test, expect, describe } from "bun:test";
import { classifyCapability, matchSignal, estimateRouteCost, buildAdvice, loadRules, type AdvisorRules, type RoutingChains } from "./advise.ts";

const FIXTURE_RULES: Pick<AdvisorRules, "capabilities"> = {
  capabilities: {
    coding: { keywords: ["bug", "refactor", "regex"] },
    web_design: { keywords: ["ui", "design", "css"] },
    general: { keywords: [] },
  },
};

describe("classifyCapability (fixture chico)", () => {
  test("camino feliz — matchea la capacidad dominante", () => {
    expect(classifyCapability("arregla este bug con un refactor", FIXTURE_RULES).capability).toBe("coding");
    expect(classifyCapability("un componente con buen css y ui", FIXTURE_RULES).capability).toBe("web_design");
  });
  test("sin keywords → general", () => {
    expect(classifyCapability("hola qué tal todo bien", FIXTURE_RULES).capability).toBe("general");
  });
  test("empate al tope (no-cero) → general, no la primera del objeto", () => {
    // "bug"(coding) vs "ui"(web_design): 1-1 → empate → general
    expect(classifyCapability("hay un bug en la ui", FIXTURE_RULES).capability).toBe("general");
  });
  test("hits[] refleja las keywords que matchearon (para el reason string)", () => {
    const r = classifyCapability("refactor + regex sobre el bug", FIXTURE_RULES);
    expect(r.hits.sort()).toEqual(["bug", "refactor", "regex"]);
  });
});

describe("matchSignal", () => {
  test("case-insensitive, substring, devuelve las keywords matcheadas", () => {
    expect(matchSignal("Architecture Audit needed", ["architecture", "audit"])).toEqual(["architecture", "audit"]);
    expect(matchSignal("nada que ver", ["architecture", "audit"])).toEqual([]);
  });
});

describe("estimateRouteCost", () => {
  test("modelo conocido → usd numérico > 0 con nota", () => {
    const c = estimateRouteCost("deepseek/deepseek-v4-pro");
    expect(c.usd).not.toBeNull();
    expect(c.usd!).toBeGreaterThan(0);
    expect(c.note).toContain("estimado");
  });
  test("modelo :free → usd = 0", () => {
    expect(estimateRouteCost("qwen/qwen3-coder:free").usd).toBe(0);
  });
  test("modelo desconocido (drift routing.yaml↔pricing table) → usd null, nunca inventa un número", () => {
    const c = estimateRouteCost("some/unknown-model-v99");
    expect(c.usd).toBeNull();
    expect(c.note).toContain("no verificado");
  });
});

// ── 10 tareas canónicas (criterio de éxito #5 — ULTRAPLAN-TUI.md §7.5, SPRINT-TUI 6.1.7) ──────
const ROUTING_FIXTURE: RoutingChains = {
  capabilities: {
    coding: { models: ["deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash", "qwen/qwen3-coder:free"] },
    agentic: { models: ["moonshotai/kimi-k2.6", "qwen/qwen3-coder-plus", "qwen/qwen3-coder-flash"] },
    web_design: { models: ["z-ai/glm-5.2", "z-ai/glm-4.7", "z-ai/glm-4.7-flash"] },
    long_context: { models: ["minimax/minimax-m3", "qwen/qwen3.5-plus-20260420", "qwen/qwen3.5-flash-02-23"] },
    terminal: { models: ["qwen/qwen3.7-max", "qwen/qwen3.7-plus", "qwen/qwen3.5-flash-02-23"] },
    general: { models: ["qwen/qwen3.7-max", "qwen/qwen3.7-plus", "qwen/qwen3-next-80b-a3b-instruct:free"] },
  },
};

interface Canonical { name: string; task: string; capability: string; lane: string; frontier: boolean }

const CANONICAL_TASKS: Canonical[] = [
  { name: "fix bug in a web app", task: "Fix a login bug in the Korvex web app (Next.js)", capability: "coding", lane: "interactive_codex", frontier: false },
  { name: "batch summaries", task: "Summarize this batch of 200 customer support call transcripts into a daily digest", capability: "long_context", lane: "one_shot_route", frontier: false },
  { name: "web design", task: "Design the pricing page UI in Tailwind CSS for the Korvex marketing site", capability: "web_design", lane: "interactive_cursor", frontier: false },
  { name: "architecture audit", task: "Do an architecture audit of the ebrain harness before we ship v1", capability: "general", lane: "claude_audit", frontier: true },
  { name: "scrape", task: "Scrape the competitor's pricing page and put the numbers in a report", capability: "agentic", lane: "one_shot_route", frontier: false },
  { name: "long refactor", task: "Refactor the payments module across many files — will take multiple sessions to get right", capability: "coding", lane: "interactive_codex", frontier: false },
  { name: "one-shot regex", task: "One-shot regex to strip trailing whitespace from all markdown files in the repo", capability: "coding", lane: "one_shot_route", frontier: false },
  { name: "technical doc", task: "Write a technical doc explaining how the model routing works, for onboarding new contributors", capability: "general", lane: "one_shot_route", frontier: false },
  { name: "UI component", task: "Build a reusable Badge UI component with color and size variants for the design system", capability: "web_design", lane: "interactive_cursor", frontier: false },
  { name: "video/multimodal", task: "Watch this product demo video and pull out screenshots of the key UI moments", capability: "web_design", lane: "gemini_multimodal", frontier: false },
];

describe("6.1.7 — 10 tareas canónicas (criterio de éxito #5, primera pasada)", () => {
  test("las reglas reales cargan (config/advisor-rules.yaml)", async () => {
    const rules = await loadRules();
    expect(Object.keys(rules.capabilities).sort()).toEqual(["agentic", "coding", "general", "long_context", "terminal", "web_design"]);
    expect(rules.lanes.claude_audit.frontier).toBe(true);
  });

  for (const c of CANONICAL_TASKS) {
    test(`${c.name} → capability=${c.capability} lane=${c.lane} frontier=${c.frontier}`, async () => {
      const rules = await loadRules();
      const advice = await buildAdvice(c.task, rules, ROUTING_FIXTURE);
      expect(advice.capability).toBe(c.capability);
      expect(advice.lane).toBe(c.lane);
      expect(advice.frontier).toBe(c.frontier);
    });
  }

  test("HARD LOCK: todo lane con frontier:true trae la advertencia de confirmación en 'reason'", async () => {
    const rules = await loadRules();
    const advice = await buildAdvice("Do an architecture audit of the payments service", rules, ROUTING_FIXTURE);
    expect(advice.frontier).toBe(true);
    expect(advice.reason.toLowerCase()).toContain("confirmaci");
    expect(advice.lane).toBe("claude_audit");
  });

  test("carril one_shot_route siempre trae alternatives con fallback/floor de la cadena", async () => {
    const rules = await loadRules();
    const advice = await buildAdvice("Summarize this batch of transcripts into a digest", rules, ROUTING_FIXTURE);
    expect(advice.lane).toBe("one_shot_route");
    expect(advice.alternatives.length).toBeGreaterThan(0);
    expect(advice.alternatives.some((a) => a.model === ROUTING_FIXTURE.capabilities.long_context.models[1])).toBe(true);
  });
});
