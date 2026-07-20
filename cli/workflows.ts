#!/usr/bin/env bun
/**
 * ebrain workflows — workflow/skill memory contract (F6.6C/D).
 *
 * The repo must stay open-source safe: Eduardo's private SOPs/workflows are NOT
 * committed here. `ingest` copies normalized workflow records into a local user store
 * (~/.config/ebrain/workflows by default), with a content hash + monotonically
 * increasing version. The TUI consumes this CLI contract; it never reads vault files.
 *
 * Commands:
 *   ebrain workflows ingest --json
 *   ebrain workflows list --json
 *   ebrain workflows search "<query>" --json
 *   ebrain workflows show <id> --json
 *   ebrain workflows run <id> --json
 *   ebrain workflows capture --json
 *   ebrain workflows skillify <id> --yes --json
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from "fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "path";
import { createHash } from "crypto";
import { homedir } from "os";
import { isClientPath, scrubSecrets } from "./sessions.ts";
import { recentLearnings, recentSessions, type LearningEntry, type SessionEntry } from "./memory.ts";

const HOME = homedir();
const EBRAIN_HOME = process.env.EBRAIN_HOME || join(HOME, "eBrain");
const CONFIG_DIR = process.env.EBRAIN_CONFIG_DIR || join(HOME, ".config", "ebrain");
const DEFAULT_STORE_DIR = process.env.EBRAIN_WORKFLOWS_DIR || join(CONFIG_DIR, "workflows");
const DEFAULT_SKILLS_DIR = process.env.EBRAIN_SKILLS_DIR || join(CONFIG_DIR, "skills");
const MAX_MARKDOWN_BYTES = 512 * 1024;
const DEFAULT_LIMIT = 20;

export type WorkflowSource = "second-brain" | "company-brain" | "local" | "captured";

export interface WorkflowRecord {
  schema_version: 1;
  id: string;
  title: string;
  source: WorkflowSource;
  source_path: string;
  content_hash: string;
  version: number;
  updated_at: string;
  trigger: string;
  summary: string;
  tags: string[];
  steps: string[];
  gates: string[];
  body: string;
}

export interface WorkflowSummary {
  id: string;
  title: string;
  source: WorkflowSource;
  version: number;
  trigger: string;
  summary: string;
  tags: string[];
  steps: number;
  gates: number;
}

export interface WorkflowRun {
  id: string;
  title: string;
  version: number;
  prompt: string;
  checklist: string[];
}

export interface CaptureCandidate {
  id: string;
  title: string;
  count: number;
  sources: string[];
  snippets: string[];
}

interface SourceRoot {
  source: WorkflowSource;
  dir: string;
  /** Disambiguates same-relative-path workflows across roots of one brain. */
  scope?: string;
}

interface IngestOptions {
  storeDir?: string;
  sourceRoots?: SourceRoot[];
  now?: string;
}

interface SkillifyOptions {
  storeDir?: string;
  skillsDir?: string;
  yes?: boolean;
}

function die(msg: string, code = 1): never {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "workflow";
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: content.trim() };
  try {
    const meta = (Bun as unknown as { YAML: { parse: (s: string) => Record<string, unknown> } }).YAML.parse(m[1]) ?? {};
    return { meta, body: m[2].trim() };
  } catch {
    return { meta: {}, body: m[2].trim() };
  }
}

function firstHeading(body: string): string {
  for (const line of body.split("\n")) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  return "";
}

function firstParagraph(body: string): string {
  const lines = body.split("\n");
  const chunks: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("---")) {
      if (chunks.length > 0) break;
      continue;
    }
    if (/^[-*]\s+\[?[ xX]?\]?/.test(line) || /^\d+[.)]\s+/.test(line)) {
      if (chunks.length > 0) break;
      continue;
    }
    chunks.push(line);
    if (chunks.join(" ").length > 280) break;
  }
  return chunks.join(" ").slice(0, 320);
}

function asTags(meta: Record<string, unknown>, fallback: string[]): string[] {
  const raw = Array.isArray(meta.tags) ? meta.tags.map(String) : typeof meta.tags === "string" ? meta.tags.split(/[,\s]+/) : [];
  return [...new Set([...fallback, ...raw.map((t) => slugify(t)).filter(Boolean)])].slice(0, 16);
}

function extractSteps(body: string): string[] {
  const out: string[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    const numbered = line.match(/^\d+[.)]\s+(.{4,})$/);
    const checked = line.match(/^[-*]\s+\[[ xX]\]\s+(.{4,})$/);
    const bullet = line.match(/^[-*]\s+(?:Step|Paso|Fase|Phase)\s+\d*[:.-]?\s+(.{4,})$/i);
    const val = numbered?.[1] ?? checked?.[1] ?? bullet?.[1];
    if (val) out.push(val.replace(/\s+/g, " ").trim());
    if (out.length >= 30) break;
  }
  return out;
}

function extractGates(body: string): string[] {
  const out: string[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/(verify|gate|audit_pass|pass\/fail|checklist|criterio|validaci[oó]n|approval|aprobaci[oó]n)/i.test(line)) {
      out.push(line.replace(/^[-*]\s+/, "").replace(/\s+/g, " ").slice(0, 220));
    }
    if (out.length >= 20) break;
  }
  return out;
}

function relId(root: SourceRoot, file: string): string {
  const rel = relative(root.dir, file).replaceAll(sep, "/").replace(/\.md$/i, "");
  const normalized = rel.endsWith("/_workflow") ? rel.slice(0, -"/_workflow".length) : rel.replace(/\/_workflow$/i, "");
  const scope = root.scope ? `${slugify(root.scope)}-` : "";
  return `${root.source}-${scope}${slugify(normalized || rel)}`;
}

function fileAllowed(path: string): boolean {
  const lower = path.toLowerCase();
  if (!lower.endsWith(".md")) return false;
  if (/(^|\/)\.env($|[./])|\.pem$|\.key$|id_rsa$|\.npmrc$|\.netrc$/i.test(path)) return false;
  if (isClientPath(path)) return false;
  try {
    const st = statSync(path);
    return st.isFile() && st.size <= MAX_MARKDOWN_BYTES;
  } catch {
    return false;
  }
}

/** Canonicalize a path (resolving every symlink). Returns null when it can't be resolved. */
function canonicalPath(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/** True when `child` is `parent` itself or nested inside it. Both should already be canonical. */
function isInsideRoot(parent: string, child: string): boolean {
  if (child === parent) return true;
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * A stored source_path is denied when its textual form OR its canonical (symlink-resolved)
 * form lands under a client repo. Guards a hand-crafted store from materializing a skill
 * that reaches denied client content — the second half of G56-F1.
 */
function sourcePathDenied(sourcePath: string): boolean {
  if (isClientPath(sourcePath)) return true;
  const real = canonicalPath(sourcePath);
  return real !== null && isClientPath(real);
}

export function defaultSourceRoots(home = HOME): SourceRoot[] {
  const env = process.env.EBRAIN_WORKFLOW_SOURCES;
  if (env) {
    return env.split(":").filter(Boolean).map((dir) => {
      const resolved = resolve(dir);
      return { source: "local" as const, dir: resolved, scope: basename(resolved) };
    });
  }
  return [
    { source: "second-brain", scope: "workflows", dir: join(home, "Documents", "Second Brain", "01-systems", "workflows") },
    { source: "second-brain", scope: "sops", dir: join(home, "Documents", "Second Brain", "01-systems", "sops") },
    { source: "second-brain", scope: "ckis", dir: join(home, "Documents", "Second Brain", "01-systems", "ckis") },
    { source: "company-brain", scope: "workflows", dir: join(home, "Documents", "Company Brain", "01-systems", "processes", "workflows") },
    { source: "company-brain", scope: "sops", dir: join(home, "Documents", "Company Brain", "01-systems", "processes", "sops") },
    { source: "company-brain", scope: "backlog", dir: join(home, "Documents", "Company Brain", "01-systems", "processes", "backlog") },
  ];
}

export function discoverMarkdown(root: SourceRoot): string[] {
  // Fail closed on a denied textual root before touching the filesystem.
  if (isClientPath(root.dir)) return [];
  // Canonicalize the root: a symlinked root resolving into a client repo is denied fail-closed,
  // and a missing/offline root simply yields nothing (never an error).
  const canonicalRoot = canonicalPath(root.dir);
  if (!canonicalRoot || isClientPath(canonicalRoot)) return [];
  try {
    if (!statSync(canonicalRoot).isDirectory()) return [];
  } catch {
    return [];
  }
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = join(dir, ent.name);
      if (isClientPath(p)) continue;
      if (ent.isSymbolicLink()) {
        // Never trust or recurse through a symlink: resolve it and accept ONLY a real file that
        // stays inside the canonical root and passes the allow-list. Symlinked directories are
        // skipped entirely (no traversal), closing the G56-F1 symlink-escape vector.
        const real = canonicalPath(p);
        if (real && !isClientPath(real) && isInsideRoot(canonicalRoot, real) && fileAllowed(real)) out.push(real);
        continue;
      }
      if (ent.isDirectory()) {
        if (ent.name.startsWith(".") || ent.name === "node_modules" || ent.name === "vendor") continue;
        walk(p);
      } else if (ent.isFile()) {
        // A regular file under the canonical root is already canonical; the containment + deny
        // re-check are belt-and-suspenders against a mid-tree symlink we might have followed.
        const real = canonicalPath(p) ?? p;
        if (!isClientPath(real) && isInsideRoot(canonicalRoot, real) && fileAllowed(real)) out.push(real);
      }
    }
  };
  walk(canonicalRoot);
  return [...new Set(out)].sort();
}

export async function workflowFromMarkdown(root: SourceRoot, file: string, existing?: WorkflowRecord, now = nowIso()): Promise<WorkflowRecord> {
  // Private SOPs are user-local, but the normalized store may later feed an MCP skill.
  // Persist and materialize only the scrubbed representation.
  const raw = scrubSecrets(await Bun.file(file).text());
  const hash = sha256(raw);
  const { meta, body } = parseFrontmatter(raw);
  const title = typeof meta.title === "string" && meta.title.trim() ? meta.title.trim() : firstHeading(body) || file.split(/[\\/]/).pop()!.replace(/\.md$/i, "");
  const trigger = typeof meta.trigger === "string" && meta.trigger.trim()
    ? meta.trigger.trim()
    : `Use when the task matches ${title}.`;
  const summary = typeof meta.summary === "string" ? meta.summary
    : typeof meta.description === "string" ? meta.description
      : firstParagraph(body);
  const changed = existing?.content_hash !== hash;
  return {
    schema_version: 1,
    id: existing?.id ?? relId(root, file),
    title,
    source: root.source,
    // Persist the canonical (symlink-resolved) path so a later skillify can re-validate it (G56-F1).
    source_path: canonicalPath(file) ?? file,
    content_hash: hash,
    version: existing ? existing.version + (changed ? 1 : 0) : 1,
    updated_at: existing && !changed ? existing.updated_at : now,
    trigger,
    summary,
    tags: asTags(meta, ["workflow", root.source]),
    steps: extractSteps(body),
    gates: extractGates(body),
    body,
  };
}

function recordPath(storeDir: string, id: string): string {
  return join(storeDir, `${slugify(id)}.workflow.json`);
}

export async function readWorkflow(path: string): Promise<WorkflowRecord | null> {
  try {
    const text = await Bun.file(path).text();
    const doc = JSON.parse(text);
    if (doc?.schema_version !== 1 || typeof doc.id !== "string") return null;
    return doc as WorkflowRecord;
  } catch {
    return null;
  }
}

export async function loadWorkflows(storeDir = DEFAULT_STORE_DIR): Promise<WorkflowRecord[]> {
  if (!existsSync(storeDir)) return [];
  const out: WorkflowRecord[] = [];
  for (const ent of readdirSync(storeDir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith(".workflow.json")) continue;
    const rec = await readWorkflow(join(storeDir, ent.name));
    if (rec && !sourcePathDenied(rec.source_path)) out.push(rec);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

function writeWorkflow(storeDir: string, rec: WorkflowRecord): void {
  mkdirSync(storeDir, { recursive: true, mode: 0o700 });
  chmodSync(storeDir, 0o700);
  const path = recordPath(storeDir, rec.id);
  writeFileSync(path, JSON.stringify(rec, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function summarizeWorkflow(w: WorkflowRecord): WorkflowSummary {
  return {
    id: w.id,
    title: w.title,
    source: w.source,
    version: w.version,
    trigger: w.trigger,
    summary: w.summary,
    tags: w.tags,
    steps: w.steps.length,
    gates: w.gates.length,
  };
}

export async function ingestWorkflows(opts: IngestOptions = {}): Promise<{ ingested: number; changed: number; workflows: WorkflowSummary[]; store_dir: string }> {
  const storeDir = opts.storeDir ?? DEFAULT_STORE_DIR;
  const roots = opts.sourceRoots ?? defaultSourceRoots();
  const existing = new Map((await loadWorkflows(storeDir)).map((w) => [w.id, w]));
  const workflows: WorkflowSummary[] = [];
  let changed = 0;
  for (const root of roots) {
    // Canonicalize the root once so ids (relId) and stored source_paths agree with the canonical
    // files discoverMarkdown returns, and a symlinked/denied root is skipped fail-closed (G56-F1).
    if (isClientPath(root.dir)) continue;
    const canonicalDir = canonicalPath(root.dir);
    if (!canonicalDir || isClientPath(canonicalDir)) continue;
    const croot: SourceRoot = { ...root, dir: canonicalDir };
    for (const file of discoverMarkdown(croot)) {
      const id = relId(croot, file);
      const rec = await workflowFromMarkdown(croot, file, existing.get(id), opts.now ?? nowIso());
      if (!existing.get(id) || existing.get(id)!.content_hash !== rec.content_hash) changed += 1;
      writeWorkflow(storeDir, rec);
      workflows.push(summarizeWorkflow(rec));
    }
  }
  workflows.sort((a, b) => a.title.localeCompare(b.title));
  return { ingested: workflows.length, changed, workflows, store_dir: storeDir };
}

function scoreWorkflow(w: WorkflowRecord, query: string): number {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (q.length === 0) return 0;
  const fields = [
    [w.title, 5],
    [w.id, 4],
    [w.trigger, 3],
    [w.summary, 3],
    [w.tags.join(" "), 2],
    [w.steps.join(" "), 1],
    [w.gates.join(" "), 1],
  ] as const;
  let score = 0;
  for (const term of q) {
    for (const [field, weight] of fields) {
      if (field.toLowerCase().includes(term)) score += weight;
    }
  }
  return score;
}

export async function searchWorkflows(query: string, storeDir = DEFAULT_STORE_DIR, limit = DEFAULT_LIMIT): Promise<{ query: string; workflows: (WorkflowSummary & { score: number })[] }> {
  const rows = (await loadWorkflows(storeDir))
    .map((w) => ({ ...summarizeWorkflow(w), score: scoreWorkflow(w, query) }))
    .filter((w) => w.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
  return { query, workflows: rows };
}

export async function findWorkflow(id: string, storeDir = DEFAULT_STORE_DIR): Promise<WorkflowRecord | null> {
  const direct = await readWorkflow(recordPath(storeDir, id));
  if (direct && !sourcePathDenied(direct.source_path)) return direct;
  return (await loadWorkflows(storeDir)).find((w) => w.id === id || slugify(w.title) === slugify(id)) ?? null;
}

export function materializeRun(w: WorkflowRecord): WorkflowRun {
  const checklist = [
    ...w.steps.map((s, i) => `${i + 1}. ${s}`),
    ...w.gates.map((g) => `Gate: ${g}`),
  ];
  const prompt = [
    `Use ebrain workflow: ${w.title} (${w.id})`,
    `Version: ${w.version}`,
    `Trigger: ${w.trigger}`,
    w.summary ? `Summary: ${w.summary}` : "",
    "",
    "Steps:",
    ...(w.steps.length ? w.steps.map((s, i) => `${i + 1}. ${s}`) : ["1. Read the workflow body and derive the actionable steps."]),
    "",
    "Gates:",
    ...(w.gates.length ? w.gates.map((g) => `- ${g}`) : ["- Produce a concrete verify command or checklist before considering the workflow complete."]),
    "",
    "Rules:",
    "- Do not read or print dotenv/credential files.",
    "- Do not touch denied client repos.",
    "- Leave a trace: tests/verify, changelog when structural, and ebrain remember for durable learnings.",
  ].filter(Boolean).join("\n");
  return { id: w.id, title: w.title, version: w.version, prompt, checklist };
}

function candidateTitle(text: string): string {
  const scrubbed = scrubSecrets(text).replace(/\s+/g, " ").trim();
  const quoted = scrubbed.match(/[`"“']([^`"”']{4,80})[`"”']/)?.[1];
  if (quoted) return quoted;
  const after = scrubbed.match(/\b(?:workflow|sop|process|proceso|pipeline|playbook)\b[:\s-]+(.{4,90})/i)?.[1];
  if (after) return after.split(/[.;]/)[0].trim();
  return scrubbed.slice(0, 80);
}

export function captureCandidatesFromEntries(entries: { source: string; text: string }[], minCount = 2): CaptureCandidate[] {
  const map = new Map<string, CaptureCandidate>();
  for (const entry of entries) {
    const text = scrubSecrets(entry.text);
    if (!/(workflow|sop|process|proceso|pipeline|playbook|checklist|gate|repetibl|reusable|skill)/i.test(text)) continue;
    const title = candidateTitle(text);
    const id = `captured-${slugify(title)}`;
    const cur = map.get(id) ?? { id, title, count: 0, sources: [], snippets: [] };
    cur.count += 1;
    if (!cur.sources.includes(entry.source)) cur.sources.push(entry.source);
    if (cur.snippets.length < 3) cur.snippets.push(text.slice(0, 220));
    map.set(id, cur);
  }
  return [...map.values()]
    .filter((c) => c.count >= minCount)
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}

export async function captureCandidates(limit = 80, minCount = 2): Promise<{ candidates: CaptureCandidate[] }> {
  const [learnings, sessions] = await Promise.all([recentLearnings(undefined, limit), recentSessions(undefined, limit)]);
  const entries = [
    ...learnings.map((l: LearningEntry) => ({ source: `learning:${l.project}`, text: l.text })),
    ...sessions.map((s: SessionEntry) => ({ source: `session:${s.project}`, text: s.summary })),
  ];
  return { candidates: captureCandidatesFromEntries(entries, minCount) };
}

export function skillMarkdown(w: WorkflowRecord): string {
  const description = (w.summary || w.trigger || `Run workflow ${w.title}`).replace(/\n/g, " ").slice(0, 180);
  return [
    "---",
    `name: ${w.id}`,
    `description: "${description.replace(/"/g, "'")}"`,
    `trigger: "${w.trigger.replace(/"/g, "'")}"`,
    "source: ebrain-workflow",
    `workflow_id: ${w.id}`,
    `workflow_version: ${w.version}`,
    "---",
    "",
    `# ${w.title}`,
    "",
    "Use this skill when the user asks to run or follow this workflow.",
    "",
    "## Steps",
    ...(w.steps.length ? w.steps.map((s, i) => `${i + 1}. ${s}`) : ["1. Read the workflow body and derive the actionable steps before acting."]),
    "",
    "## Gates",
    ...(w.gates.length ? w.gates.map((g) => `- ${g}`) : ["- Define and run a concrete verification before reporting completion."]),
    "",
    "## Safety",
    "- Never read or print dotenv/credential files.",
    "- Never touch denied client repositories.",
    "- Ask for explicit approval before irreversible or outward-facing actions.",
    "- Record durable learnings with `ebrain remember` after the workflow produces a reusable lesson.",
    "",
    "## Workflow Body",
    w.body.trim(),
    "",
  ].join("\n");
}

export async function skillifyWorkflow(id: string, opts: SkillifyOptions = {}): Promise<{ ok: true; path: string; workflow: WorkflowSummary } | { ok: false; error: { type: "not-found" | "confirm-required"; message: string }; would?: { path: string } }> {
  const storeDir = opts.storeDir ?? DEFAULT_STORE_DIR;
  const skillsDir = opts.skillsDir ?? DEFAULT_SKILLS_DIR;
  const w = await findWorkflow(id, storeDir);
  if (!w) return { ok: false, error: { type: "not-found", message: `workflow not found: ${id}` } };
  // Defense in depth: never materialize a skill from a record that resolves into a client repo (G56-F1).
  if (sourcePathDenied(w.source_path)) return { ok: false, error: { type: "not-found", message: `workflow not found: ${id}` } };
  const outDir = join(skillsDir, w.id);
  const outPath = join(outDir, "SKILL.md");
  if (!opts.yes) {
    return { ok: false, error: { type: "confirm-required", message: "skillify writes a local SKILL.md; repeat with --yes to approve" }, would: { path: outPath } };
  }
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  chmodSync(outDir, 0o700);
  writeFileSync(outPath, skillMarkdown(w), { mode: 0o600 });
  chmodSync(outPath, 0o600);
  return { ok: true, path: outPath, workflow: summarizeWorkflow(w) };
}

export function parseArgs(args: string[]): { sub: string; json: boolean; yes: boolean; limit: number; minCount: number; id: string; query: string } {
  const sub = args[0] && !args[0].startsWith("--") ? args[0] : "list";
  const rest = args.slice(sub === args[0] ? 1 : 0);
  const limitIdx = rest.indexOf("--limit");
  const minIdx = rest.indexOf("--min-count");
  const positional = rest.filter((arg, index) =>
    !arg.startsWith("--") &&
    !(limitIdx >= 0 && index === limitIdx + 1) &&
    !(minIdx >= 0 && index === minIdx + 1),
  );
  return {
    sub,
    json: rest.includes("--json"),
    yes: rest.includes("--yes"),
    limit: limitIdx >= 0 && rest[limitIdx + 1] ? parseInt(rest[limitIdx + 1], 10) || DEFAULT_LIMIT : DEFAULT_LIMIT,
    minCount: minIdx >= 0 && rest[minIdx + 1] ? parseInt(rest[minIdx + 1], 10) || 2 : 2,
    id: positional[0] ?? "",
    query: positional.join(" "),
  };
}

function printJsonOrText(json: boolean, payload: unknown, text: () => void): void {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else text();
}

// Pass-3 F-P6, worst of the three: `parseArgs` treats any flag-shaped first argument as an absent
// subcommand and falls back to "list", so the documented `ebrain workflows --help` printed NOTHING
// and exited 0 — a reader cannot tell that from a command that ran and found no workflows.
const USAGE =
  "usage: ebrain workflows <list|capture|ingest|show|search|run|skillify> [--json] [--limit N] [--min-count N]";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const a = parseArgs(argv);

  if (a.sub === "ingest") {
    const payload = await ingestWorkflows();
    printJsonOrText(a.json, payload, () => {
      console.log(`ebrain workflows ingest: ${payload.ingested} workflows (${payload.changed} changed) → ${payload.store_dir}`);
    });
    return;
  }

  if (a.sub === "list") {
    const workflows = (await loadWorkflows()).map(summarizeWorkflow).slice(0, a.limit);
    printJsonOrText(a.json, { workflows }, () => {
      for (const w of workflows) console.log(`${w.id}\t${w.source}\tv${w.version}\t${w.title}`);
    });
    return;
  }

  if (a.sub === "search") {
    const query = a.query.trim();
    if (!query) die("usage: ebrain workflows search \"query\" [--json]", 2);
    const payload = await searchWorkflows(query, DEFAULT_STORE_DIR, a.limit);
    printJsonOrText(a.json, payload, () => {
      for (const w of payload.workflows) console.log(`${w.score}\t${w.id}\t${w.title}`);
    });
    return;
  }

  if (a.sub === "show" || a.sub === "run" || a.sub === "skillify") {
    if (!a.id) die(`usage: ebrain workflows ${a.sub} <id> [--json]`, 2);
    if (a.sub === "skillify") {
      const payload = await skillifyWorkflow(a.id, { yes: a.yes });
      if (!payload.ok && !a.json) {
        console.error(`✗ ${payload.error.message}`);
        process.exit(payload.error.type === "confirm-required" ? 2 : 1);
      }
      printJsonOrText(a.json, payload, () => console.log(`skill: ${(payload as { path: string }).path}`));
      if (!payload.ok) process.exit(payload.error.type === "confirm-required" ? 2 : 1);
      return;
    }
    const w = await findWorkflow(a.id);
    if (!w) die(`workflow not found: ${a.id}`, 1);
    const payload = a.sub === "show" ? { workflow: w } : materializeRun(w);
    printJsonOrText(a.json, payload, () => {
      if (a.sub === "show") console.log(`# ${w.title}\n\n${w.summary}\n\n${w.body}`);
      else console.log((payload as WorkflowRun).prompt);
    });
    return;
  }

  if (a.sub === "capture") {
    const payload = await captureCandidates(a.limit, a.minCount);
    printJsonOrText(a.json, payload, () => {
      for (const c of payload.candidates) console.log(`${c.count}\t${c.id}\t${c.title}`);
    });
    return;
  }

  die(`ebrain workflows: unknown subcommand '${a.sub}'`, 2);
}

if (import.meta.main) main().catch((e) => die(String(e?.message ?? e)));
