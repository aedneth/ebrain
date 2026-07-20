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
// Two tiers, because the two kinds of evidence differ in strength.
//
// STRONG: content words that are not words in English at all. One is conclusive — this is what the
// single-signal miss in remember.sh ("buscable en ebrain") taught us; a density rule alone needs a
// second word that a short output line may simply not have.
// NOTE: no `g` flag. A global regex carries `lastIndex` across `.test()` calls, so a shared global
// pattern used with `.test()` alternates between true and false on identical input — which would
// make this guard miss every other Spanish line.
const SPANISH_STRONG =
  /\b(?:pude|pudo|crear|escribir|buscable|leer|borrar|guardar|encontrar|resuelve|rechaza|rechazado|denegado|aislamiento|archivo|nombre|texto|contener|parece|guardo|duro|cliente|falta|vacio|creada|matada|enviado)\b/i;
// FUNCTION: grammatical glue. Individually weak (some are English words in other contexts), but two
// on one output line is not English prose.
const SPANISH_FUNCTION_WORDS =
  /\b(?:el|la|los|las|un|una|unos|unas|de|del|que|para|por|sin|bajo|sobre|entre|hacia|desde|hasta|como|pero|cuando|donde|porque|este|esta|ese|esa|eso|su|sus|se|ya|muy|cada|toda|nunca|siempre|debe|puede|tiene|fue|ser|otro|otra|antes|aunque|nada)\b/gi;

function spanishFunctionWords(line: string): number {
  return (line.match(SPANISH_FUNCTION_WORDS) ?? []).length;
}

function looksSpanish(line: string): boolean {
  return (
    SPANISH_DIACRITIC.test(line) ||
    SPANISH_WORDS.test(line) ||
    SPANISH_STRONG.test(line) ||
    spanishFunctionWords(line) >= 2
  );
}

// Split from `scan` so the regression test below can pin the whole detector — SINK selection plus
// all three signals — instead of only the density helper. A refactor that drops a signal from here
// must fail a test, not pass because the helper it no longer calls is still correct.
// A comment can quote a sink (`# echo "..."` in a usage block) without emitting anything. The
// contract has always been "comments may stay Spanish"; this is what actually enforces it.
const COMMENT_LINE = /^\s*(?:#|\/\/|\*|\/\*)/;

function scanText(text: string, label: string): string[] {
  const hits: string[] = [];
  text.split("\n").forEach((line, i) => {
    if (COMMENT_LINE.test(line)) return;
    if (!SINK.test(line)) return;
    if (looksSpanish(line)) hits.push(`${label}:${i + 1}: ${line.trim()}`);
  });
  return hits;
}

function scan(rel: string): string[] {
  return scanText(readFileSync(join(ROOT, rel), "utf8"), rel);
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
    // Pinned through the real detector, not the helper.
    expect(scanText(escaped, "fixture")).toHaveLength(1);

    // The three lines that survived in remember.sh past the first hardening, same reason.
    for (const line of [
      'echo "remember: no pude crear $DEST" >&2',
      'echo "remember: no pude escribir $OUT" >&2',
      'echo "  MCP put_page agent-memory OK (buscable en ebrain)"',
    ]) {
      expect(scanText(line, "fixture")).toHaveLength(1);
    }

    // …and English sink lines of comparable shape must stay clean.
    for (const line of [
      'message: "cwd resolves under a repository denied by the local deny policy — refused"',
      'echo "remember: could not create $DEST" >&2',
      'throw new Error("the text appears to contain a secret; nothing was written")',
      'console.log("no session found for that workspace, and no default is configured")',
    ]) {
      expect(scanText(line, "fixture")).toEqual([]);
    }
  });

  test("task-profile disclaimer is English (the live probe returned false)", () => {
    const rules: TaskProfileRules = { capabilities: { coding: { keywords: ["code"] }, general: { keywords: [] } } };
    const profile = buildTaskProfile("write some code", rules);
    expect(profile.disclaimer).toBe("Signals classify the task; they do not order models or pick an agent.");
    expect(SPANISH_DIACRITIC.test(profile.disclaimer)).toBe(false);
  });
});
