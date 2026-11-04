#!/usr/bin/env bun
/**
 * Complementariedad y unión de dos motores, a partir de los resultados guardados por runner.ts y tareas.ts.
 *
 *   bun cli/eval/union.ts <casos.yaml> <casos-tarea.yaml> <A.json> <B.json> <tareas-A.json> <tareas-B.json>
 *
 * Casos: aciertos de cada uno, los que solo acierta uno, y el recall@5 de uniones dentro de 5 documentos
 * (A top-3 + B top-2; intercalado A1 B1 A2 B2 A3; RRF) y de A top-3 + B top-5, que cabe en el mismo presupuesto de
 * caracteres cuando B devuelve fragmentos cortos. Tareas: capas cubiertas al repartir 10,000 caracteres entre los dos.
 */
import { readFileSync } from "node:fs";
import { cargarCasos, normalizar } from "./casos.ts";
import { cargarTareas } from "./tareas.ts";

type Ev = { id: string; acierto: boolean; devueltas: string[]; bytesTopK: number };
const leer = (p: string) => JSON.parse(readFileSync(p, "utf8"));

export function unir(listas: string[][], cuantos: number[]): string[] {
  const out: string[] = [];
  listas.forEach((l, i) => { for (const x of l.slice(0, cuantos[i])) if (!out.includes(x)) out.push(x); });
  for (const l of listas) for (const x of l) if (out.length < cuantos.reduce((a, b) => a + b, 0) && !out.includes(x)) out.push(x);
  return out;
}
export function intercalar(a: string[], b: string[], k: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < k && (i < a.length || i < b.length); i++) {
    for (const x of [a[i], b[i]]) if (x !== undefined && !out.includes(x) && out.length < k) out.push(x);
  }
  return out;
}
export function rrf(listas: string[][], k: number, c = 60): string[] {
  const s = new Map<string, number>();
  for (const l of listas) l.forEach((x, i) => s.set(x, (s.get(x) ?? 0) + 1 / (c + i + 1)));
  return [...s.entries()].sort((x, y) => y[1] - x[1]).map((x) => x[0]).slice(0, k);
}

if (import.meta.main) {
  const [casosP, tareasP, aP, bP, taP, tbP] = process.argv.slice(2);
  const casos = cargarCasos(readFileSync(casosP, "utf8")).casos;
  const A: Ev[] = leer(aP).corridas[0].casos;
  const B: Ev[] = leer(bP).corridas[0].casos;
  const vig = new Map(casos.map((c) => [c.id, new Set(c.vigente.map(normalizar))]));
  const acierta = (id: string, docs: string[]) => docs.some((d) => vig.get(id)!.has(normalizar(d)));
  const n = A.length;
  const r = (f: (a: Ev, b: Ev) => string[]) => A.filter((a, i) => acierta(a.id, f(a, B[i]))).length;
  const soloA = A.filter((a, i) => a.acierto && !B[i].acierto).map((a) => a.id);
  const soloB = A.filter((a, i) => !a.acierto && B[i].acierto).map((a) => a.id);
  const bytesA = A.reduce((s, e) => s + e.bytesTopK, 0) / n / 5;
  const bytesB = B.reduce((s, e) => s + e.bytesTopK, 0) / n / 5;
  console.log(JSON.stringify({
    casos: n,
    aciertos_A: A.filter((a) => a.acierto).length,
    aciertos_B: B.filter((b) => b.acierto).length,
    solo_A: soloA, solo_B: soloB,
    union_A3_B2: r((a, b) => unir([a.devueltas, b.devueltas], [3, 2])),
    intercalado_5: r((a, b) => intercalar(a.devueltas, b.devueltas, 5)),
    rrf_5: r((a, b) => rrf([a.devueltas, b.devueltas], 5)),
    A3_mas_B5: r((a, b) => unir([a.devueltas, b.devueltas], [3, 5])),
    techo_A5_o_B5: r((a, b) => [...a.devueltas, ...b.devueltas]),
    bytes_por_resultado: { A: Math.round(bytesA), B: Math.round(bytesB) },
    bytes_A3_mas_B5: Math.round(3 * bytesA + 5 * bytesB),
  }));

  const tareas = cargarTareas(readFileSync(tareasP, "utf8")).tareas;
  const TA = leer(taP).tareas, TB = leer(tbP).tareas;
  const cubre = (pres: number, repartoA: number) => {
    let cub = 0, tot = 0;
    for (const t of tareas) {
      const a = TA.find((e: any) => e.id === t.id)?.pool ?? [], b = TB.find((e: any) => e.id === t.id)?.pool ?? [];
      const llega = new Set<string>();
      let usado = 0;
      for (const x of a) { if (usado >= repartoA) break; usado += x.c; llega.add(x.k); }
      for (const x of b) { if (usado >= pres) break; usado += x.c; llega.add(x.k); }
      for (const c of t.capas) { tot++; if (c.docs.some((d) => llega.has(normalizar(d)))) cub++; }
    }
    return `${cub}/${tot}`;
  };
  console.log(JSON.stringify({ tareas_10000: { solo_A: cubre(10_000, 10_000), A7000_B3000: cubre(10_000, 7_000), A5000_B5000: cubre(10_000, 5_000), solo_B: cubre(10_000, 0) } }));
}
