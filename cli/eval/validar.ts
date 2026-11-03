#!/usr/bin/env bun
/**
 * Valida un archivo de casos de regresión antes de medir nada.
 *
 *   bun cli/eval/validar.ts <casos.yaml> [--deny a,b,c] [--min 30] [--max 50] [--json]
 *
 * ERRORES (salida 1): id repetido, consulta vacía, caso sin ruta vigente o sin fuente; una ruta
 * vigente que no existe, está excluida o está retirada; una ruta retirada que no existe o que la
 * regla no reconoce como retirada; una palabra denegada (repos de clientes) en el caso; un total
 * fuera de [min, max].
 * AVISOS (no fallan): `contradice:` con documentos vivos que dicen lo retirado sin estar marcados
 * (deriva que hay que corregir en la fuente) y casos que piden confirmación.
 *
 * Las palabras denegadas llegan por --deny o por EBRAIN_DENIED_REPOS (separadas por coma); el
 * código no trae ninguna.
 */
import { readFileSync } from "node:fs";
import { cargarCasos, estadoDeRuta, type ArchivoDeCasos } from "./casos.ts";

export type Hallazgo = { id: string; nivel: "error" | "aviso"; mensaje: string };

const plano = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function validar(a: ArchivoDeCasos, deny: string[], min: number, max: number): Hallazgo[] {
  const out: Hallazgo[] = [];
  const err = (id: string, mensaje: string) => out.push({ id, nivel: "error", mensaje });
  const aviso = (id: string, mensaje: string) => out.push({ id, nivel: "aviso", mensaje });
  const vistos = new Set<string>();
  const denegadas = deny.map(plano).filter(Boolean);

  if (a.casos.length < min || a.casos.length > max) err("*", `hay ${a.casos.length} casos; se piden entre ${min} y ${max}`);

  for (const c of a.casos) {
    if (vistos.has(c.id)) err(c.id, "id repetido");
    vistos.add(c.id);
    if (!c.consulta) err(c.id, "consulta vacía");
    if (!c.fuente) err(c.id, "falta la fuente");
    if (c.vigente.length === 0) err(c.id, "no tiene ruta vigente");

    const texto = plano([c.consulta, ...c.vigente, ...c.retiradas, ...c.contradice].join(" "));
    for (const d of denegadas) if (texto.includes(d)) err(c.id, "menciona un repo denegado (cliente)");

    for (const r of c.vigente) {
      const e = estadoDeRuta(a.corpus, r);
      if (e === "externa") aviso(c.id, `vigente fuera del corpus (ningún motor del corpus la indexa): ${r}`);
      else if (e !== "vigente") err(c.id, `vigente ${e}: ${r}`);
    }
    for (const r of c.retiradas) {
      const e = estadoDeRuta(a.corpus, r);
      if (e === "vigente") err(c.id, `marcada como retirada pero la regla la ve vigente (márquela en la fuente o quítela): ${r}`);
      else if (e !== "retirada") err(c.id, `retirada ${e}: ${r}`);
    }
    for (const r of c.contradice) {
      const e = estadoDeRuta(a.corpus, r);
      if (e === "vigente") aviso(c.id, `deriva sin marcar (dice lo retirado y está vivo): ${r}`);
      else if (e === "retirada") aviso(c.id, `ya está retirada; muévala a retiradas: ${r}`);
      else err(c.id, `contradice ${e}: ${r}`);
    }
    if (c.confirmar) aviso(c.id, `pide confirmación: ${c.confirmar}`);
  }
  return out;
}

function arg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const ruta = argv[0];
  if (!ruta || ruta.startsWith("--")) {
    console.error("uso: bun cli/eval/validar.ts <casos.yaml> [--deny a,b] [--min 30] [--max 50] [--json]");
    process.exit(2);
  }
  const a = cargarCasos(readFileSync(ruta, "utf8"));
  const deny = (arg(argv, "--deny") ?? process.env.EBRAIN_DENIED_REPOS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const hallazgos = validar(a, deny, Number(arg(argv, "--min") ?? 30), Number(arg(argv, "--max") ?? 50));
  const errores = hallazgos.filter((h) => h.nivel === "error");
  const avisos = hallazgos.filter((h) => h.nivel === "aviso");
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ casos: a.casos.length, confirmados: a.casos.filter((c) => c.confirmado).length, errores, avisos }, null, 2));
  } else {
    for (const h of hallazgos) console.log(`${h.nivel === "error" ? "✗" : "·"} ${h.id.padEnd(4)} ${h.mensaje}`);
    const rutas = new Set(a.casos.flatMap((c) => [...c.vigente, ...c.retiradas]));
    console.log(
      `\ncasos: ${a.casos.length} · confirmados: ${a.casos.filter((c) => c.confirmado).length} · rutas: ${rutas.size} · ` +
        `errores: ${errores.length} · avisos: ${avisos.length} · denegadas revisadas: ${deny.length}`,
    );
  }
  process.exit(errores.length ? 1 : 0);
}
