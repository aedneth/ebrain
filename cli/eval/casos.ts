/**
 * Casos de regresión de recuperación (E1): carga, tipos y la regla de qué es doctrina retirada.
 *
 * Un caso es una consulta real con la ruta VIGENTE que el motor debería devolver en su top-k y
 * las rutas RETIRADAS que no deben salir. El archivo de casos vive en el brain privado; aquí solo
 * está el código, sin datos de ningún brain.
 *
 * Una ruta es retirada si (en este orden):
 *   1. está bajo un prefijo retirado (p. ej. `12-archive/`);
 *   2. su frontmatter tiene `status:` o `lifecycle:` en los estados retirados, o `superseded_by:`;
 *   3. abre con un banner de retiro («> **Descartada …», «> **Retirada …», «> **Reemplazada …»).
 * Una ruta que no existe en el árbol actual es «inexistente»: si un motor la devuelve, su índice
 * está atado a rutas viejas.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { homedir } from "node:os";

export type Caso = {
  id: string;
  consulta: string;
  tema?: string;
  vigente: string[];
  retiradas: string[];
  contradice: string[];
  fuente: string;
  confirmado: boolean;
  confirmar?: string;
  nota?: string;
};

export type Corpus = {
  raiz: string;
  excluir: string[];
  prefijosRetirados: string[];
  estadosRetirados: string[];
  topK: number;
};

export type ArchivoDeCasos = { version: number; corpus: Corpus; casos: Caso[] };

/** «externa»: la verdad vive fuera del corpus (p. ej. la auto-memory de un agente); ningún motor que
 *  indexe solo el corpus puede devolverla, y medirlo es justo el punto. */
export type EstadoRuta = "vigente" | "retirada" | "inexistente" | "excluida" | "externa";

export const esExterna = (p: string) => p.startsWith("~/") || p.startsWith("/");

const lista = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];

export function expandirHome(p: string): string {
  return p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

/** Parsea el YAML de casos. Lanza con un mensaje que nombra el campo si la forma no es válida. */
export function cargarCasos(texto: string): ArchivoDeCasos {
  const raw = Bun.YAML.parse(texto) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") throw new Error("casos: el archivo está vacío o no es un mapa");
  const c = (raw.corpus ?? {}) as Record<string, unknown>;
  const ret = (c.retirado ?? {}) as Record<string, unknown>;
  if (typeof c.raiz !== "string" || !c.raiz.trim()) throw new Error("casos: falta corpus.raiz");
  const corpus: Corpus = {
    raiz: expandirHome(c.raiz.trim()),
    excluir: lista(c.excluir),
    prefijosRetirados: lista(ret.prefijos),
    estadosRetirados: lista(ret.estados).map((s) => s.toLowerCase()),
    topK: typeof c.top_k === "number" && c.top_k > 0 ? c.top_k : 5,
  };
  if (!Array.isArray(raw.casos)) throw new Error("casos: falta la lista `casos`");
  const casos = raw.casos.map((x, i): Caso => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      id: typeof o.id === "string" ? o.id.trim() : `#${i + 1}`,
      consulta: typeof o.consulta === "string" ? o.consulta.trim() : "",
      tema: typeof o.tema === "string" ? o.tema : undefined,
      vigente: lista(o.vigente),
      retiradas: lista(o.retiradas),
      contradice: lista(o.contradice),
      fuente: typeof o.fuente === "string" ? o.fuente.trim() : "",
      confirmado: o.confirmado === true,
      confirmar: typeof o.confirmar === "string" ? o.confirmar : undefined,
      nota: typeof o.nota === "string" ? o.nota : undefined,
    };
  });
  return { version: typeof raw.version === "number" ? raw.version : 0, corpus, casos };
}

/** Lee el frontmatter YAML de un markdown (solo el bloque inicial entre `---`). */
export function frontmatter(texto: string): Record<string, unknown> {
  if (!texto.startsWith("---")) return {};
  const fin = texto.indexOf("\n---", 3);
  if (fin < 0) return {};
  try {
    const fm = Bun.YAML.parse(texto.slice(3, fin));
    return fm && typeof fm === "object" ? (fm as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const BANNER = /^>\s*\*\*(descartad|retirad|reemplazad|superad|obsolet)/i;

export function tieneBannerDeRetiro(texto: string): boolean {
  let cuerpo = texto;
  if (texto.startsWith("---")) {
    const fin = texto.indexOf("\n---", 3);
    if (fin >= 0) cuerpo = texto.slice(fin + 4);
  }
  return cuerpo.split("\n").slice(0, 20).some((l) => BANNER.test(l.trim()));
}

export function estaExcluida(corpus: Corpus, rel: string): boolean {
  return corpus.excluir.some((p) => rel === p.replace(/\/$/, "") || rel.startsWith(p.endsWith("/") ? p : `${p}/`));
}

/** Clasifica una ruta relativa a la raíz del corpus. */
export function estadoDeRuta(corpus: Corpus, rel: string): EstadoRuta {
  if (esExterna(rel)) return existsSync(expandirHome(rel)) ? "externa" : "inexistente";
  if (estaExcluida(corpus, rel)) return "excluida";
  const abs = join(corpus.raiz, rel);
  if (!existsSync(abs)) return "inexistente";
  if (corpus.prefijosRetirados.some((p) => rel.startsWith(p))) return "retirada";
  if (!rel.endsWith(".md")) return "vigente";
  const texto = readFileSync(abs, "utf8");
  const fm = frontmatter(texto);
  for (const k of ["status", "lifecycle"]) {
    const v = fm[k];
    if (typeof v === "string" && corpus.estadosRetirados.includes(v.trim().toLowerCase())) return "retirada";
  }
  if (typeof fm.superseded_by === "string" && fm.superseded_by.trim()) return "retirada";
  if (tieneBannerDeRetiro(texto)) return "retirada";
  return "vigente";
}

/**
 * Forma normal para comparar una ruta del árbol con lo que devuelve un motor (slug, URI qmd://…,
 * ruta absoluta): minúsculas, sin extensión .md, sin acentos, todo lo que no es letra o número → «-».
 */
export function normalizar(p: string): string {
  return p
    .replace(/^qmd:\/\/[^/]+\//, "")
    .replace(/[?#].*$/, "")
    .replace(/\.md$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split("/")
    .map((seg) => seg.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("/");
}

/** Índice normalizado → ruta relativa de todos los .md del corpus (sin las rutas excluidas). */
export function indiceDelCorpus(corpus: Corpus): Map<string, string> {
  const idx = new Map<string, string>();
  const saltar = new Set(["node_modules", ".git", ".venv", ".obsidian"]);
  const andar = (dir: string) => {
    let entradas: string[];
    try {
      entradas = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entradas) {
      if (saltar.has(e) || e.startsWith(".venv")) continue;
      const abs = join(dir, e);
      const rel = relative(corpus.raiz, abs).split(sep).join("/");
      if (estaExcluida(corpus, rel)) continue;
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) andar(abs);
      else if (e.endsWith(".md")) idx.set(normalizar(rel), rel);
    }
  };
  andar(corpus.raiz);
  return idx;
}
