#!/usr/bin/env bun
/**
 * Runner de la regresión de recuperación (E1). Sin LLM: corre cada caso contra un motor y mide
 * recall@k de lo vigente, fuga de doctrina retirada, bytes devueltos, latencia y RAM.
 *
 *   bun cli/eval/runner.ts <casos.yaml> --motor <nombre> (ver registro.ts: qmd-search, qmd-query, gbrain-daemon-*, …)
 *       [--coleccion company-brain] [--fuente <source_id>] [--corridas 3]
 *       [--max-usd 1] [--reranker-usd 0.0003] [--incluir-sin-confirmar] [--dry-run] [--salida r.json]
 *
 * Motores:
 *   qmd            `qmd search` (BM25 local, costo 0). Piso de control.
 *   gbrain-search  herramienta `search` del daemon (palabra clave; no manda la consulta a embeddings).
 *   gbrain-query   herramienta `query` del daemon (híbrida, expand:false). Cada consulta se convierte
 *                  en embedding (OpenAI 3-large, US$0.13/M tokens) y, con el modo `balanced` por
 *                  defecto de GBrain, pasa por un reranker de pago. Por eso hay un techo de gasto.
 *
 * Techo de gasto (se calcula ANTES de llamar; si pasa --max-usd no se llama nada):
 *   embeddings = Σ bytes UTF-8 de las consultas × corridas × 0.13 / 1e6. Es un techo estricto:
 *   cada token de cl100k cubre al menos un byte. Lo exacto sale del panel de uso de OpenAI.
 *   reranker   = consultas × corridas × --reranker-usd (estimación de GBrain: ~US$0.0003).
 *
 * El daemon se usa tal cual (no se reinicia ni se reconfigura); la credencial la resuelve
 * remote-tools.ts dentro del proceso y nunca se imprime.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { cargarCasos, estadoDeRuta, indiceDelCorpus, normalizar, type Caso, type Corpus, type EstadoRuta } from "./casos.ts";
import { memoriaProcesosKB, type Motor, type Resultado } from "./motores.ts";
import { crearMotor, marcaDeProceso } from "./registro.ts";

export type { Motor, Resultado } from "./motores.ts";

export const PRECIO_EMBEDDING_USD_POR_MTOK = 0.13;
const POOL = 20; // se piden 20 fragmentos y se deduplican por documento antes de cortar en top-k

export type EvalCaso = {
  id: string;
  acierto: boolean;
  rango: number | null;
  devueltas: string[];
  fugaRetirada: string[];
  fugaObsoleta: string[];
  fugaSinMarcar: string[];
  /** Resultados bajo un prefijo excluido (clientes): no son fuga de doctrina, pero ocupan el top-k. Se guardan sin ruta. */
  excluidas: number;
  bytesTopK: number;
  bytesCrudos: number;
  ms: number;
};

/** Primeros k documentos distintos, en el orden del motor. */
export function topKDocumentos(rs: Resultado[], k: number): Resultado[] {
  const vistos = new Set<string>();
  const out: Resultado[] = [];
  for (const r of rs) {
    const n = normalizar(r.ruta);
    if (!n || vistos.has(n)) continue;
    vistos.add(n);
    out.push(r);
    if (out.length >= k) break;
  }
  return out;
}

export function evaluarCaso(
  caso: Caso,
  top: Resultado[],
  indice: Map<string, string>,
  estado: (rel: string) => EstadoRuta,
  medida: { bytesCrudos: number; ms: number },
  prefijosRetirados: string[] = [],
  excluir: string[] = [],
): EvalCaso {
  const pref = prefijosRetirados.map(normalizar).filter(Boolean);
  const excl = excluir.map(normalizar).filter(Boolean);
  const bajo = (n: string, ps: string[]) => ps.some((p) => n === p || n.startsWith(`${p}/`));
  const vig = new Set(caso.vigente.map(normalizar));
  const ret = new Set(caso.retiradas.map(normalizar));
  const contra = new Set(caso.contradice.map(normalizar));
  const ev: EvalCaso = {
    id: caso.id, acierto: false, rango: null, devueltas: [], fugaRetirada: [], fugaObsoleta: [], fugaSinMarcar: [], excluidas: 0,
    bytesTopK: 0, bytesCrudos: medida.bytesCrudos, ms: medida.ms,
  };
  top.forEach((r, i) => {
    const n = normalizar(r.ruta);
    const rel = indice.get(n);
    ev.bytesTopK += Buffer.byteLength(r.fragmento, "utf8");
    if (rel === undefined && bajo(n, excl)) {
      ev.excluidas++;
      ev.devueltas.push("<excluida>");
      return;
    }
    ev.devueltas.push(rel ?? r.ruta);
    if (vig.has(n) && ev.rango === null) {
      ev.acierto = true;
      ev.rango = i + 1;
    }
    if (rel === undefined) {
      // Ya no existe en el árbol: índice viejo. Si además venía de un prefijo retirado, también es fuga retirada.
      ev.fugaObsoleta.push(r.ruta);
      if (bajo(n, pref)) ev.fugaRetirada.push(r.ruta);
    } else if (ret.has(n) || estado(rel) === "retirada") ev.fugaRetirada.push(rel);
    else if (contra.has(n)) ev.fugaSinMarcar.push(rel);
  });
  return ev;
}

export function percentil(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

export function resumir(evs: EvalCaso[]) {
  const n = evs.length || 1;
  return {
    casos: evs.length,
    recall_at_k: evs.filter((e) => e.acierto).length / n,
    fuga_retirada: evs.filter((e) => e.fugaRetirada.length > 0).length / n,
    fuga_obsoleta: evs.filter((e) => e.fugaObsoleta.length > 0).length / n,
    fuga_sin_marcar: evs.filter((e) => e.fugaSinMarcar.length > 0).length / n,
    casos_con_resultados_de_clientes: evs.filter((e) => e.excluidas > 0).length,
    bytes_topk_p50: percentil(evs.map((e) => e.bytesTopK), 50),
    bytes_topk_p95: percentil(evs.map((e) => e.bytesTopK), 95),
    latencia_ms_p50: percentil(evs.map((e) => e.ms), 50),
    latencia_ms_p95: percentil(evs.map((e) => e.ms), 95),
  };
}

export function techoDeGasto(consultas: string[], corridas: number, rerankerUsd: number) {
  const bytes = consultas.reduce((s, q) => s + Buffer.byteLength(q, "utf8"), 0) * corridas;
  const embeddings = (bytes * PRECIO_EMBEDDING_USD_POR_MTOK) / 1e6;
  const reranker = consultas.length * corridas * rerankerUsd;
  return { llamadas: consultas.length * corridas, tokens_techo: bytes, embeddings_usd: embeddings, reranker_usd: reranker, total_usd: embeddings + reranker };
}

/**
 * Tokens exactos de las consultas con cl100k_base, el tokenizador de text-embedding-3-large, usando el
 * @dqbd/tiktoken que ya trae vendor/gbrain. Devuelve null si no está (entonces solo vale el techo).
 */
export async function tokensCl100k(textos: string[]): Promise<number[] | null> {
  try {
    const mod = require("../../vendor/gbrain/node_modules/@dqbd/tiktoken/tiktoken.cjs");
    const enc = mod.get_encoding("cl100k_base");
    try {
      return textos.map((t) => enc.encode(t).length);
    } finally {
      enc.free();
    }
  } catch {
    return null;
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function arg(argv: string[], flag: string, def?: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : def;
}

async function main() {
  const argv = process.argv.slice(2);
  const ruta = argv[0];
  const motorNombre = arg(argv, "--motor");
  if (!ruta || ruta.startsWith("--") || !motorNombre) {
    console.error("uso: bun cli/eval/runner.ts <casos.yaml> --motor qmd|gbrain-search|gbrain-query [--dry-run] …");
    process.exit(2);
  }
  const archivo = cargarCasos(readFileSync(ruta, "utf8"));
  const corpus: Corpus = archivo.corpus;
  const casos = argv.includes("--incluir-sin-confirmar") ? archivo.casos : archivo.casos.filter((c) => c.confirmado);
  const corridas = Math.max(1, Number(arg(argv, "--corridas", "3")));
  const maxUsd = Number(arg(argv, "--max-usd", "1"));
  const rerankerUsd = Number(arg(argv, "--reranker-usd", "0.0003"));
  const filtrarRetirado = argv.includes("--filtrar-retirado");
  // --excluir-patron <regex>: simula no indexar rutas que casan (p. ej. logs y órdenes operativas), además de lo retirado.
  const patronRuido = arg(argv, "--excluir-patron") ? new RegExp(arg(argv, "--excluir-patron")!) : null;
  const motor: Motor = crearMotor(motorNombre, (f, d) => arg(argv, f, d));
  const marca = marcaDeProceso(motorNombre);

  const techo = motor.pagado ? techoDeGasto(casos.map((c) => c.consulta), corridas, rerankerUsd) : null;
  const plan = { motor: motor.nombre + (filtrarRetirado ? "+filtro-retirado" : "") + (patronRuido ? "+sin-ruido" : ""), casos: casos.length, sin_confirmar_excluidos: archivo.casos.length - casos.length, corridas, top_k: corpus.topK, techo_gasto: techo };
  console.log(JSON.stringify({ plan }, null, 2));
  if (techo && techo.total_usd > maxUsd) {
    console.error(`ALTO: el techo de gasto (US$${techo.total_usd.toFixed(4)}) pasa de --max-usd ${maxUsd}. No se llamó al motor.`);
    process.exit(3);
  }
  if (argv.includes("--dry-run")) return;
  if (casos.length === 0) {
    console.error("no hay casos confirmados; nada que medir (use --incluir-sin-confirmar solo para pruebas)");
    process.exit(4);
  }

  const indice = indiceDelCorpus(corpus);
  const cache = new Map<string, EstadoRuta>();
  const estado = (rel: string) => cache.get(rel) ?? (cache.set(rel, estadoDeRuta(corpus, rel)), cache.get(rel)!);
  const daemonAntes = marca ? memoriaProcesosKB(marca) : null;
  let rssMaxKB = 0;
  let daemonPicoKB = daemonAntes ?? 0;
  let runnerPicoKB = 0;
  let llamadas = 0;
  let tokensEmbebidos = 0;
  const tokensPorCaso = motor.pagado ? await tokensCl100k(casos.map((c) => c.consulta)) : null;
  const porCorrida: Array<{ corrida: number; resumen: ReturnType<typeof resumir>; casos: EvalCaso[] }> = [];
  for (let corrida = 1; corrida <= corridas; corrida++) {
    const evs: EvalCaso[] = [];
    for (const caso of casos) {
      const t0 = performance.now();
      const r = await motor.buscar(caso.consulta, POOL);
      const ms = performance.now() - t0;
      if (filtrarRetirado) {
        // Simula excluir lo retirado AL INDEXAR: fuera lo retirado, lo que ya no existe y lo excluido, antes del top-k.
        r.resultados = r.resultados.filter((x) => {
          const rel = indice.get(normalizar(x.ruta));
          return rel !== undefined && estado(rel) !== "retirada";
        });
      }
      if (patronRuido) r.resultados = r.resultados.filter((x) => !patronRuido.test(indice.get(normalizar(x.ruta)) ?? x.ruta));
      llamadas++;
      if (tokensPorCaso) tokensEmbebidos += tokensPorCaso[casos.indexOf(caso)];
      rssMaxKB = Math.max(rssMaxKB, r.maxRssKB ?? 0);
      runnerPicoKB = Math.max(runnerPicoKB, Math.round(process.memoryUsage().rss / 1024));
      if (marca) daemonPicoKB = Math.max(daemonPicoKB, memoriaProcesosKB(marca) ?? 0);
      evs.push(evaluarCaso(caso, topKDocumentos(r.resultados, corpus.topK), indice, estado, { bytesCrudos: r.bytesCrudos, ms }, corpus.prefijosRetirados, corpus.excluir));
    }
    porCorrida.push({ corrida, resumen: resumir(evs), casos: evs });
  }
  const daemonDespues = marca ? memoriaProcesosKB(marca) : null;
  (motor as { cerrar?: () => void }).cerrar?.();
  const todas = porCorrida.flatMap((c) => c.casos);
  const estable = porCorrida.every((c) => JSON.stringify(c.casos.map((e) => e.devueltas)) === JSON.stringify(porCorrida[0].casos.map((e) => e.devueltas)));
  const informe = {
    plan,
    llamadas,
    gasto_techo_usd: techo ? techo.total_usd : 0,
    embeddings: motor.pagado
      ? { tokens_cl100k: tokensPorCaso ? tokensEmbebidos : null, usd: tokensPorCaso ? (tokensEmbebidos * PRECIO_EMBEDDING_USD_POR_MTOK) / 1e6 : null }
      : null,
    resultados_identicos_entre_corridas: estable,
    resumen: { ...resumir(porCorrida[0].casos), latencia_ms_p95_todas: percentil(todas.map((e) => e.ms), 95) },
    resumen_por_corrida: porCorrida.map((c) => ({ corrida: c.corrida, ...c.resumen })),
    ram: { motor_max_rss_kb: rssMaxKB || null, runner_pico_kb: runnerPicoKB, daemon_kb_antes: daemonAntes, daemon_kb_pico: marca ? daemonPicoKB : null, daemon_kb_despues: daemonDespues },
    corridas: porCorrida,
  };
  const salida = arg(argv, "--salida");
  if (salida) writeFileSync(salida, JSON.stringify(informe, null, 2));
  console.log(JSON.stringify({ resumen_por_corrida: informe.resumen_por_corrida, llamadas, estable, ram: informe.ram, gasto_techo_usd: informe.gasto_techo_usd, embeddings: informe.embeddings }, null, 2));
}

if (import.meta.main) await main();
