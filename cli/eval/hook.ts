#!/usr/bin/env bun
/**
 * Regression in hook mode: what really gets injected, not what an engine returns.
 *
 *   bun cli/eval/hook.ts <casos.yaml> --script <contexto-prompt.py> --brains A:B
 *       [--tareas <casos-tarea.yaml>] [--extras <file, one query per line>] [--denegados <regex>] [--pausa ms] [--salida r.json]
 *
 * Each query runs the context command the way a hook does, and the measure is over its text: is the current document's
 * path in it (recall), are there retired documents among its result headers (leakage), how long it took and how many
 * characters it is. A path mentioned inside a fragment is not a result; only the `── path` headers are. Queries in
 * --extras are adversarial: they aim at the archive, clients and the personal vault, and have no expected document.
 * With EBRAIN_BRAIN_PORT pointing at nothing, the same run measures the fallback.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cargarCasos, estadoDeRuta, type Corpus } from "./casos.ts";
import { percentil } from "./runner.ts";
import { cargarTareas } from "./tareas.ts";

/** Every result in the text: a fragment's header (`── path`) or a pointer without a fragment (`→ path`). */
export function rutasDeResultados(texto: string): string[] {
  return [...texto.matchAll(/^(?:──|→) (.+?)(?: \(línea \d+\))?$/gm)].map((m) => m[1]);
}

export function rutasConFragmento(texto: string): string[] {
  return [...texto.matchAll(/^── (.+?)(?: \(línea \d+\))?$/gm)].map((m) => m[1]);
}

/** A result header is forbidden if it points at the archive, a client, the personal vault, or a retired document. */
export function prohibida(ruta: string, corpus: Corpus, denegadaRuta?: RegExp): string | null {
  if (/(^|\/)12-archive\//.test(ruta)) return "archivo";
  if (/(^|\/)07-clients\//.test(ruta) || denegadaRuta?.test(ruta)) return "cliente";
  if (/Second Brain/i.test(ruta)) return "second-brain";
  const raiz = corpus.raiz.endsWith("/") ? corpus.raiz : `${corpus.raiz}/`;
  const rel = ruta.startsWith(raiz) ? ruta.slice(raiz.length) : ruta;
  if (!rel.startsWith("/") && estadoDeRuta(corpus, rel) === "retirada") return "retirada";
  return null;
}

function arg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const script = arg(argv, "--script");
  const brains = arg(argv, "--brains") ?? "";
  if (!argv[0] || argv[0].startsWith("--") || !script) {
    console.error("usage: bun cli/eval/hook.ts <casos.yaml> --script <contexto-prompt.py> --brains A:B [--tareas f] [--extras f] [--denegados re] [--salida f]");
    process.exit(2);
  }
  const { corpus, casos } = cargarCasos(readFileSync(argv[0], "utf8"));
  const denegados = arg(argv, "--denegados") ? new RegExp(arg(argv, "--denegados")!, "i") : null;
  const denegadaRuta = arg(argv, "--denegados-ruta") ? new RegExp(arg(argv, "--denegados-ruta")!, "i") : undefined;
  const dir = mkdtempSync(join(tmpdir(), "ebrain-hook-"));
  const correr = (prompt: string) => {
    const f = join(dir, "prompt.md");
    writeFileSync(f, prompt);
    const t0 = performance.now();
    const p = Bun.spawnSync(["python3", "-I", script, "--prompt-file", f, "--brains", brains, "--formato", "texto"], {
      stdout: "pipe", stderr: "pipe", env: { ...(process.env as Record<string, string>), CONTEXTO_DEPURAR: "1" },
    });
    const ms = performance.now() - t0;
    const texto = p.stdout.toString();
    const lineas = p.stderr.toString().trim().split("\n");
    let dep: Record<string, unknown> = {};
    try {
      dep = JSON.parse(lineas[lineas.length - 1] || "{}");
    } catch {
      // No debug line: the command stayed silent.
    }
    return { texto, ms, dep };
  };
  const pausa = Number(arg(argv, "--pausa") ?? 0);
  const medir = (id: string, prompt: string, vigente: string[], retiradas: string[]) => {
    // A deadline abandons the request, not the daemon's work on it: back-to-back queries pile up in a way prompts do not.
    if (pausa > 0) Bun.sleepSync(pausa);
    const { texto, ms, dep } = correr(prompt);
    const rutas = rutasDeResultados(texto);
    const prohibidas = rutas.map((r) => ({ r, motivo: prohibida(r, corpus, denegadaRuta) })).filter((x) => x.motivo);
    return {
      texto, id, ms, caracteres: texto.trimEnd().length, rutas,
      acierto: vigente.some((v) => texto.includes(v)),
      acierto_en_resultados: vigente.some((v) => rutas.some((r) => r.endsWith(v))),
      acierto_con_fragmento: vigente.some((v) => rutasConFragmento(texto).some((r) => r.endsWith(v))),
      skill: texto.includes("[Router de skills"),
      fuga_declarada: retiradas.filter((r) => rutas.some((x) => x.endsWith(r))),
      prohibidas,
      fragmentos: rutasConFragmento(texto).length,
      fragmentos_con_cliente: denegados ? texto.split(/^── /m).slice(1).filter((b) => denegados.test(b)).length : 0,
      daemon: dep.daemon_respondio ?? null,
      qmd: dep.qmd_respondio ?? null,
    };
  };
  const sinTexto = <T extends { texto: string }>({ texto: _texto, ...resto }: T) => resto;
  const evs = casos.filter((c) => c.confirmado).map((c) => sinTexto(medir(c.id, c.consulta, c.vigente, c.retiradas)));
  const n = evs.length || 1;
  const resumen: Record<string, unknown> = {
    casos: evs.length,
    aciertos: evs.filter((e) => e.acierto).length,
    recall_en_texto: evs.filter((e) => e.acierto).length / n,
    recall_en_resultados: evs.filter((e) => e.acierto_en_resultados).length / n,
    recall_con_fragmento: evs.filter((e) => e.acierto_con_fragmento).length / n,
    fuga_declarada: evs.filter((e) => e.fuga_declarada.length > 0).length,
    prohibidas: evs.reduce((s, e) => s + e.prohibidas.length, 0),
    p50_ms: Math.round(percentil(evs.map((e) => e.ms), 50)),
    p95_ms: Math.round(percentil(evs.map((e) => e.ms), 95)),
    max_ms: Math.round(Math.max(...evs.map((e) => e.ms))),
    max_caracteres: Math.max(...evs.map((e) => e.caracteres)),
    con_skill: evs.filter((e) => e.skill).length,
    daemon_respondio: evs.filter((e) => e.daemon === true).length,
    qmd_respondio: evs.filter((e) => e.qmd === true).length,
    fragmentos: evs.reduce((s, e) => s + e.fragmentos, 0),
    fragmentos_con_cliente: evs.reduce((s, e) => s + e.fragmentos_con_cliente, 0),
    casos_con_cliente: evs.filter((e) => e.fragmentos_con_cliente > 0).length,
  };
  const salida: Record<string, unknown> = { resumen, casos: evs };
  if (arg(argv, "--tareas")) {
    const { tareas } = cargarTareas(readFileSync(arg(argv, "--tareas")!, "utf8"));
    const et = tareas.map((t) => {
      const { texto, ...e } = medir(t.id, t.pedido, [], t.retiradas);
      const cubiertas = t.capas.filter((c) => c.docs.some((d) => texto.includes(d))).map((c) => c.capa);
      return { ...e, capas: t.capas.length, cubiertas, faltan: t.capas.map((c) => c.capa).filter((c) => !cubiertas.includes(c)) };
    });
    salida.tareas = et;
    resumen.tareas = {
      capas: `${et.reduce((s, e) => s + e.cubiertas.length, 0)}/${et.reduce((s, e) => s + e.capas, 0)}`,
      con_skill: et.filter((e) => e.skill).length,
      prohibidas: et.reduce((s, e) => s + e.prohibidas.length, 0),
      fuga_declarada: et.filter((e) => e.fuga_declarada.length > 0).length,
      max_caracteres: Math.max(...et.map((e) => e.caracteres)),
      p95_ms: Math.round(percentil(et.map((e) => e.ms), 95)),
    };
  }
  if (arg(argv, "--extras")) {
    const consultas = readFileSync(arg(argv, "--extras")!, "utf8").split("\n").map((x) => x.trim()).filter(Boolean);
    const ex = consultas.map((q, i) => ({ q, ...sinTexto(medir(`X${i + 1}`, q, [], [])) }));
    salida.extras = ex;
    resumen.extras = {
      consultas: ex.length,
      resultados: ex.reduce((s, e) => s + e.rutas.length, 0),
      prohibidas: ex.reduce((s, e) => s + e.prohibidas.length, 0),
      fragmentos_con_cliente: ex.reduce((s, e) => s + e.fragmentos_con_cliente, 0),
    };
  }
  rmSync(dir, { recursive: true, force: true });
  if (arg(argv, "--salida")) writeFileSync(arg(argv, "--salida")!, JSON.stringify(salida, null, 2));
  console.log(JSON.stringify(resumen, null, 2));
}
