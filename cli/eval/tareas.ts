#!/usr/bin/env bun
/**
 * Casos de TAREA: ¿llegan juntas las capas de contexto que una tarea real necesita?
 *
 *   bun cli/eval/tareas.ts <casos-tarea.yaml> --validar
 *   bun cli/eval/tareas.ts <casos-tarea.yaml> --motor <nombre> [banderas del motor] [--filtrar-retirado]
 *       [--pool 50] [--presupuesto 10000] [--salida r.json]
 *
 * El motor recibe el pedido tal cual. Sus resultados se inyectan en el orden en que llegan, cada uno como «ruta +
 * texto devuelto», hasta llenar el presupuesto de caracteres; el resultado que empieza dentro del presupuesto cuenta
 * (un hook lo truncaría, pero su ruta y su arranque llegan). Una capa está cubierta si al menos uno de sus documentos
 * llegó. Fuga = documentos retirados que llegaron.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { estadoDeRuta, expandirHome, indiceDelCorpus, normalizar, type Corpus, type EstadoRuta } from "./casos.ts";
import { crearMotor, marcaDeProceso } from "./registro.ts";
import { memoriaProcesosKB, type Resultado } from "./motores.ts";

export type Capa = { capa: string; docs: string[] };
export type Tarea = { id: string; pedido: string; fuente: string; estado: string; capas: Capa[]; retiradas: string[] };
export type ArchivoDeTareas = { corpus: Corpus; presupuesto: number; tareas: Tarea[] };

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()) : []);

export function cargarTareas(texto: string): ArchivoDeTareas {
  const raw = Bun.YAML.parse(texto) as Record<string, any>;
  const c = raw?.corpus ?? {};
  const corpus: Corpus = {
    raiz: expandirHome(String(c.raiz ?? "")),
    excluir: lista(c.excluir),
    prefijosRetirados: lista(c.retirado?.prefijos),
    estadosRetirados: lista(c.retirado?.estados).map((s) => s.toLowerCase()),
    topK: 5,
  };
  const tareas: Tarea[] = (raw?.tareas ?? []).map((t: any, i: number) => ({
    id: String(t?.id ?? `#${i + 1}`),
    pedido: String(t?.pedido ?? "").trim(),
    fuente: String(t?.fuente ?? ""),
    estado: String(t?.estado ?? ""),
    capas: (t?.capas ?? []).map((k: any) => ({ capa: String(k?.capa ?? ""), docs: lista(k?.docs) })),
    retiradas: lista(t?.retiradas),
  }));
  return { corpus, presupuesto: Number(raw?.presupuesto_caracteres ?? 10_000), tareas };
}

export function validarTareas(a: ArchivoDeTareas): string[] {
  const errores: string[] = [];
  const vistos = new Set<string>();
  for (const t of a.tareas) {
    if (vistos.has(t.id)) errores.push(`${t.id}: id repetido`);
    vistos.add(t.id);
    if (!t.pedido) errores.push(`${t.id}: pedido vacío`);
    if (t.capas.length < 2) errores.push(`${t.id}: una tarea necesita al menos dos capas`);
    for (const k of t.capas) {
      if (k.docs.length === 0) errores.push(`${t.id}/${k.capa}: capa sin documentos`);
      for (const d of k.docs) {
        const e = estadoDeRuta(a.corpus, d);
        if (e !== "vigente") errores.push(`${t.id}/${k.capa}: ${e}: ${d}`);
      }
    }
    for (const d of t.retiradas) {
      const e = estadoDeRuta(a.corpus, d);
      if (e !== "retirada") errores.push(`${t.id}: retirada que la regla ve ${e}: ${d}`);
    }
  }
  return errores;
}

export type EvalTarea = {
  id: string;
  capas: number;
  cubiertas: string[];
  faltan: string[];
  cobertura: number;
  llegaron: number;
  caracteres: number;
  fugaRetirada: string[];
  fugaObsoleta: number;
  ms: number;
  /** Documentos distintos en el orden en que llegaron (todo el pool, no solo el presupuesto), para métricas a igual número de documentos. */
  orden: string[];
  /** Todo el pool en orden, con los caracteres que ocuparía cada resultado (para simular uniones con presupuesto). */
  pool: { k: string; c: number }[];
  otraFuente: number;
};

export function evaluarTarea(
  t: Tarea,
  resultados: Resultado[],
  presupuesto: number,
  indice: Map<string, string>,
  estado: (rel: string) => EstadoRuta,
  ms: number,
  otras: string[] = [],
): EvalTarea {
  const otrasN = otras.map(normalizar).filter(Boolean);
  const pool = resultados.map((r) => ({ k: normalizar(r.ruta), c: r.ruta.length + 2 + r.fragmento.length }));
  let otraFuente = 0;
  const llegados = new Set<string>();
  const orden: string[] = [];
  for (const r of resultados) { const k = normalizar(r.ruta); if (!orden.includes(k)) orden.push(k); }
  const retiradas = new Set(t.retiradas.map(normalizar));
  const fuga = new Set<string>();
  let usados = 0;
  let obsoletos = 0;
  let n = 0;
  for (const r of resultados) {
    if (usados >= presupuesto) break;
    usados += r.ruta.length + 2 + r.fragmento.length;
    n++;
    const k = normalizar(r.ruta);
    llegados.add(k);
    const rel = indice.get(k);
    if (rel === undefined && otrasN.some((p) => k === p || k.startsWith(`${p}/`))) otraFuente++;
    else if (rel === undefined) obsoletos++;
    else if (retiradas.has(k) || estado(rel) === "retirada") fuga.add(rel);
  }
  const cubiertas = t.capas.filter((c) => c.docs.some((d) => llegados.has(normalizar(d)))).map((c) => c.capa);
  const faltan = t.capas.map((c) => c.capa).filter((c) => !cubiertas.includes(c));
  return {
    id: t.id, capas: t.capas.length, cubiertas, faltan, cobertura: cubiertas.length / (t.capas.length || 1),
    llegaron: n, caracteres: Math.min(usados, presupuesto), fugaRetirada: [...fuga], fugaObsoleta: obsoletos, ms, orden, pool, otraFuente,
  };
}

function arg(argv: string[], flag: string, def?: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : def;
}

async function main() {
  const argv = process.argv.slice(2);
  const ruta = argv[0];
  if (!ruta || ruta.startsWith("--")) {
    console.error("uso: bun cli/eval/tareas.ts <casos-tarea.yaml> --validar | --motor <nombre> …");
    process.exit(2);
  }
  const a = cargarTareas(readFileSync(ruta, "utf8"));
  if (argv.includes("--validar")) {
    const errores = validarTareas(a);
    for (const e of errores) console.log(`✗ ${e}`);
    const docs = new Set(a.tareas.flatMap((t) => t.capas.flatMap((c) => c.docs)));
    console.log(`tareas: ${a.tareas.length} · capas: ${a.tareas.reduce((s, t) => s + t.capas.length, 0)} · documentos: ${docs.size} · errores: ${errores.length}`);
    process.exit(errores.length ? 1 : 0);
  }
  const nombre = arg(argv, "--motor");
  if (!nombre) throw new Error("falta --motor");
  const motor = crearMotor(nombre, (f, d) => arg(argv, f, d));
  const marca = marcaDeProceso(nombre);
  const pool = Number(arg(argv, "--pool", "50"));
  const presupuesto = Number(arg(argv, "--presupuesto", String(a.presupuesto)));
  const filtrar = argv.includes("--filtrar-retirado");
  const otras = (arg(argv, "--otras-fuentes") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const patronRuido = arg(argv, "--excluir-patron") ? new RegExp(arg(argv, "--excluir-patron")!) : null;
  const indice = indiceDelCorpus(a.corpus);
  const cache = new Map<string, EstadoRuta>();
  const estado = (rel: string) => cache.get(rel) ?? (cache.set(rel, estadoDeRuta(a.corpus, rel)), cache.get(rel)!);
  const evs: EvalTarea[] = [];
  let rssMax = 0;
  let residentePico = marca ? memoriaProcesosKB(marca) ?? 0 : 0;
  for (const t of a.tareas) {
    const t0 = performance.now();
    const r = await motor.buscar(t.pedido, pool);
    const ms = performance.now() - t0;
    rssMax = Math.max(rssMax, r.maxRssKB ?? 0);
    if (marca) residentePico = Math.max(residentePico, memoriaProcesosKB(marca) ?? 0);
    let rs = r.resultados;
    if (filtrar) rs = rs.filter((x) => { const rel = indice.get(normalizar(x.ruta)); return rel !== undefined && estado(rel) !== "retirada"; });
    if (patronRuido) rs = rs.filter((x) => !patronRuido.test(indice.get(normalizar(x.ruta)) ?? x.ruta));
    evs.push(evaluarTarea(t, rs, presupuesto, indice, estado, ms, otras));
  }
  (motor as { cerrar?: () => void }).cerrar?.();
  const n = evs.length || 1;
  const resumen = {
    motor: motor.nombre + (filtrar ? "+filtro-retirado" : "") + (patronRuido ? "+sin-ruido" : ""),
    tareas: evs.length,
    cobertura_media: evs.reduce((s, e) => s + e.cobertura, 0) / n,
    tareas_completas: evs.filter((e) => e.cobertura === 1).length,
    capas_cubiertas: `${evs.reduce((s, e) => s + e.cubiertas.length, 0)}/${evs.reduce((s, e) => s + e.capas, 0)}`,
    tareas_con_fuga: evs.filter((e) => e.fugaRetirada.length > 0).length,
    resultados_de_otras_fuentes: evs.reduce((a, e) => a + e.otraFuente, 0),
    resultados_por_tarea_media: evs.reduce((s, e) => s + e.llegaron, 0) / n,
    rss_motor_kb: rssMax || null,
    residente_pico_kb: marca ? residentePico : null,
  };
  const salida = arg(argv, "--salida");
  if (salida) writeFileSync(salida, JSON.stringify({ resumen, tareas: evs }, null, 2));
  console.log(JSON.stringify({ resumen, porTarea: evs.map((e) => ({ id: e.id, cobertura: `${e.cubiertas.length}/${e.capas}`, faltan: e.faltan, fuga: e.fugaRetirada.length, llegaron: e.llegaron })) }, null, 1));
}

if (import.meta.main) await main();
