#!/usr/bin/env bun
/**
 * ebrain memory recent — últimos N learnings de agent-memory + últimas sesiones cross-`.brain`
 * (índice Dev Brain). (SPRINT-TUI 6.1.5 — insumo del panel Memory, F6.5.2.)
 *
 * PURO filesystem: nunca toca gbrain/PGLite, cero lock. Lee:
 *   - $EBRAIN_HOME/memory/learnings/<project>/*.md   (páginas agent-learning que escribe remember.sh)
 *   - ~/Documents/Dev Brain/sessions/index.md         (índice cross-repo que escribe log-session.sh)
 *
 * El índice de sesiones tiene DOS estilos de escritor coexistiendo (harness/core/log-session.sh
 * nuevo vs. el hook viejo del vault CKIS): 6 campos "ts | project | X | commit | summary | path"
 * donde X es "-" (duration, agente va como "[agent] " al frente del summary) o directamente el
 * nombre del agente ("unknown" cuando no se trackeaba). parseSessionLine() normaliza ambos.
 *
 * Uso:
 *   ebrain memory recent --json [--limit N]   # {learnings:[...], sessions:[...]}
 *   ebrain memory recent [--limit N]          # texto plano
 */
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HOME = homedir();
const EBRAIN_HOME = process.env.EBRAIN_HOME || join(HOME, "eBrain");
const LEARNINGS_DIR = join(EBRAIN_HOME, "memory", "learnings");
const DEV_BRAIN = process.env.DEV_BRAIN_VAULT || join(HOME, "Documents", "Dev Brain");
const SESSIONS_INDEX = join(DEV_BRAIN, "sessions", "index.md");
const DEFAULT_LIMIT = 10;

export interface LearningEntry {
  project: string; agent: string; date: string; tags: string[]; text: string; path: string;
}
export interface SessionEntry {
  ts: string; project: string; agent: string; commit: string; summary: string; path: string;
}

// Frontmatter YAML entre '---'. Reusa Bun.YAML (misma primitiva que manifest-get.ts) — nada de
// parseo manual de key:value que driftaría del spec real de frontmatter (arrays, comillas, etc.).
function parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: content.trim() };
  let meta: Record<string, unknown> = {};
  try {
    meta = (Bun as unknown as { YAML: { parse: (s: string) => Record<string, unknown> } }).YAML.parse(m[1]) ?? {};
  } catch { /* frontmatter corrupto: meta queda {} — no rompe el listado */ }
  return { meta, body: m[2].trim() };
}

// El body suele ser "# heading\n\n<párrafo>" (remember.sh duplica el heading como resumen) —
// nos quedamos con el párrafo; si no hay heading, el body completo.
function bodyText(body: string): string {
  const lines = body.split("\n");
  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstIdx < 0) return "";
  if (lines[firstIdx].trim().startsWith("#")) return lines.slice(firstIdx + 1).join("\n").trim();
  return body;
}

export function listLearningFiles(dir = LEARNINGS_DIR): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const project of readdirSync(dir, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const pdir = join(dir, project.name);
    for (const f of readdirSync(pdir, { withFileTypes: true })) {
      if (f.isFile() && f.name.endsWith(".md")) out.push(join(pdir, f.name));
    }
  }
  return out;
}

// Orden: `created` (timestamp del remember) → `date` → mtime del archivo como último fallback.
// Nunca descarta un learning por falta de timestamp (a diferencia de dejarlo fuera silenciosamente).
export async function recentLearnings(dir = LEARNINGS_DIR, limit = DEFAULT_LIMIT): Promise<LearningEntry[]> {
  const files = listLearningFiles(dir);
  const entries: (LearningEntry & { sortKey: number })[] = [];
  for (const path of files) {
    const content = await Bun.file(path).text();
    const { meta, body } = parseFrontmatter(content);
    let sortKey = typeof meta.created === "string" ? Date.parse(meta.created) : NaN;
    if (Number.isNaN(sortKey) && typeof meta.date === "string") sortKey = Date.parse(meta.date);
    if (Number.isNaN(sortKey)) { try { sortKey = statSync(path).mtimeMs; } catch { sortKey = 0; } }
    entries.push({
      project: typeof meta.project === "string" ? meta.project : "unknown",
      agent: typeof meta.agent === "string" ? meta.agent : "unknown",
      date: typeof meta.date === "string" ? meta.date : "",
      tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      text: bodyText(body),
      path,
      sortKey,
    });
  }
  entries.sort((a, b) => b.sortKey - a.sortKey);
  return entries.slice(0, limit).map(({ sortKey: _sortKey, ...rest }) => rest);
}

// Normaliza una línea del índice Dev Brain a los dos estilos de escritor conocidos (ver header).
export function parseSessionLine(line: string): SessionEntry | null {
  const parts = line.split(" | ").map((p) => p.trim());
  if (parts.length < 6) return null;
  const [ts, project, field3, commit, ...rest] = parts;
  if (rest.length < 2) return null;
  const path = rest[rest.length - 1];
  let summary = rest.slice(0, -1).join(" | ");
  let agent = field3;
  const bracket = summary.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (bracket) { agent = bracket[1]; summary = bracket[2]; }
  return { ts, project, agent, commit, summary, path };
}

// El índice es append-only en orden cronológico → las últimas N líneas del archivo SON las más
// recientes, sin depender de parsear `ts` de formatos mixtos entre escritores distintos.
export async function recentSessions(indexPath = SESSIONS_INDEX, limit = DEFAULT_LIMIT): Promise<SessionEntry[]> {
  const f = Bun.file(indexPath);
  if (!(await f.exists())) return [];
  const lines = (await f.text()).split("\n").filter((l) => l.trim().length > 0);
  const parsed = lines.map(parseSessionLine).filter((x): x is SessionEntry => x !== null);
  return parsed.slice(-limit).reverse();
}

async function main() {
  const args = process.argv.slice(2);
  const sub = args[0] && !args[0].startsWith("--") ? args[0] : "recent";
  if (sub !== "recent") {
    console.error(`✗ ebrain memory: subcomando desconocido '${sub}' (soportado: recent)`);
    process.exit(2);
  }
  const json = args.includes("--json");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? (parseInt(args[limitIdx + 1], 10) || DEFAULT_LIMIT) : DEFAULT_LIMIT;

  const [learnings, sessions] = await Promise.all([
    recentLearnings(LEARNINGS_DIR, limit),
    recentSessions(SESSIONS_INDEX, limit),
  ]);

  if (json) {
    console.log(JSON.stringify({ learnings, sessions }, null, 2));
    return;
  }

  console.log(`ebrain memory recent (últimos ${limit})`);
  console.log("\n-- learnings --");
  for (const l of learnings) console.log(`  [${l.project}/${l.agent}] ${l.date}  ${l.text.slice(0, 90)}`);
  console.log("\n-- sesiones --");
  for (const s of sessions) console.log(`  [${s.project}/${s.agent}] ${s.ts}  ${s.summary}`);
}

if (import.meta.main) main().catch((e) => { console.error(`✗ ${e?.message ?? e}`); process.exit(1); });
