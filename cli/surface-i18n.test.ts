/**
 * cli/surface-i18n.test.ts — G56-F6 regression guard: the user-visible surface is English-only.
 *
 * The audit found Spanish success/empty/error strings reaching the TUI and CLI
 * (task-profile disclaimer, knowledge/run.ts spawn/exit/JSON errors, sessions errors, the
 * ebrain dispatcher usage/errors). Internal comments MAY stay Spanish — so this scan only
 * inspects OUTPUT-SINK lines (console.log/error, die/throw, `message:`/`error:` payloads,
 * shell `echo`), never comments, and flags any Spanish diacritic or unambiguous Spanish word.
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTaskProfile, type TaskProfileRules } from "./task-profile.ts";

const ROOT = join(import.meta.dir, "..");

// Lines that emit text a user sees (TS output sinks + shell echo).
const SINK = /(console\.(log|error)\(|(?<![A-Za-z])die\(|throw new Error\(|\bmessage:\s*[`"']|\berror:\s*[`"']|\bdisclaimer:\s*[`"']|\becho\s+["'])/;
// Spanish signal: accented chars / inverted marks, or an unambiguous Spanish word/phrase that
// would never appear in an English message. (Curated to avoid code-identifier false positives.)
const SPANISH_DIACRITIC = /[ñ¿¡áéíóúÁÉÍÓÚ]/;
const SPANISH_WORDS = new RegExp(
  [
    "no puede", "no existe", "no disponible", "no se pudo", "no encontr",
    "invalido", "invalida", "inválid", "sesión", "sesion", "según", "segun",
    "código", "codigo", "desconocido", "creada", "matada", "enviado", "vacia", "vacía",
    "esperado prefijo", "pendientes", "toda ok", "por stdin", "salió", "salio",
    "devolvió", "devolvio", "forma json", "hace falta", "falta --yes", "argv de launch",
    "nombre inválido", "nombre invalido", "usá ", "senales clasifican", "no ordenan",
  ].join("|"),
  "i",
);

// Structural signal. A curated word list is inherently leaky: the F7-F12 audit follow-up found a
// Spanish deny-client message whose every word was outside the list above and which carried no
// diacritic, so it passed this guard for two phases. Function words are the robust tell — each
// entry below is a non-word in English, so an English sink line cannot accumulate two of them,
// while Spanish prose reaches two almost immediately.
const SPANISH_FUNCTION_WORDS =
  /\b(?:el|la|los|las|un|una|unos|unas|de|del|que|para|por|sin|bajo|sobre|entre|hacia|desde|hasta|como|pero|cuando|donde|porque|este|esta|ese|esa|eso|su|sus|se|ya|muy|cada|toda|nunca|siempre|debe|puede|tiene|fue|ser|otro|otra|antes|aunque|nada|texto|archivo|nombre|falta|cliente|resuelve|rechazado|aislamiento|duro|guardo|parece|contener)\b/gi;

function spanishFunctionWords(line: string): number {
  return (line.match(SPANISH_FUNCTION_WORDS) ?? []).length;
}

function scan(rel: string): string[] {
  const text = readFileSync(join(ROOT, rel), "utf8");
  const hits: string[] = [];
  text.split("\n").forEach((line, i) => {
    if (!SINK.test(line)) return;
    if (SPANISH_DIACRITIC.test(line) || SPANISH_WORDS.test(line) || spanishFunctionWords(line) >= 2) {
      hits.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  });
  return hits;
}

const SURFACES = [
  "cli/task-profile.ts",
  "cli/sessions.ts",
  "cli/profiles.ts",
  "cli/context.ts",
  "cli/episodes.ts",
  "cli/episode-migration.ts",
  "cli/procedures.ts",
  "cli/targets.ts",
  "cli/workflows.ts",
  "cli/isolation.ts",
  "tui/src/knowledge/run.ts",
  "cli/ebrain",
  // `ebrain remember` is step 3 of the published quickstart — its output is public surface.
  "harness/core/remember.sh",
];

describe("G56-F6 — the visible surface is English-only", () => {
  for (const rel of SURFACES) {
    test(`${rel} emits no Spanish on user-visible lines`, () => {
      expect(scan(rel)).toEqual([]);
    });
  }

  test("the detector catches the message that escaped it (regression on the guard itself)", () => {
    // The exact string that shipped in cli/sessions.ts for two phases: no diacritic, and not one
    // word from the curated list. If a future refactor weakens the detector, this fails first.
    const escaped =
      'message: `cwd resuelve bajo un repo de cliente (${CLIENT_DENYLIST.join(" / ")}) - rechazado (aislamiento duro, ver CLAUDE.md)`';
    expect(SPANISH_DIACRITIC.test(escaped)).toBe(false);
    expect(SPANISH_WORDS.test(escaped)).toBe(false);
    expect(spanishFunctionWords(escaped)).toBeGreaterThanOrEqual(2);

    // …and an English sink line of comparable length must stay clean.
    const english = 'message: "cwd resolves under a repository denied by the local deny policy — refused"';
    expect(spanishFunctionWords(english)).toBeLessThan(2);
  });

  test("task-profile disclaimer is English (the live probe returned false)", () => {
    const rules: TaskProfileRules = { capabilities: { coding: { keywords: ["code"] }, general: { keywords: [] } } };
    const profile = buildTaskProfile("write some code", rules);
    expect(profile.disclaimer).toBe("Signals classify the task; they do not order models or pick an agent.");
    expect(SPANISH_DIACRITIC.test(profile.disclaimer)).toBe(false);
  });
});
