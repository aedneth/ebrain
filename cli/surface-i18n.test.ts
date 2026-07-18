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

function scan(rel: string): string[] {
  const text = readFileSync(join(ROOT, rel), "utf8");
  const hits: string[] = [];
  text.split("\n").forEach((line, i) => {
    if (!SINK.test(line)) return;
    if (SPANISH_DIACRITIC.test(line) || SPANISH_WORDS.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
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
  "tui/src/knowledge/run.ts",
  "cli/ebrain",
];

describe("G56-F6 — the visible surface is English-only", () => {
  for (const rel of SURFACES) {
    test(`${rel} emits no Spanish on user-visible lines`, () => {
      expect(scan(rel)).toEqual([]);
    });
  }

  test("task-profile disclaimer is English (the live probe returned false)", () => {
    const rules: TaskProfileRules = { capabilities: { coding: { keywords: ["code"] }, general: { keywords: [] } } };
    const profile = buildTaskProfile("write some code", rules);
    expect(profile.disclaimer).toBe("Signals classify the task; they do not order models or pick an agent.");
    expect(SPANISH_DIACRITIC.test(profile.disclaimer)).toBe(false);
  });
});
