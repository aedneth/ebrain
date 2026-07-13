#!/usr/bin/env bun
/**
 * ebrain sessions <list|new|peek|send|kill> — orquestación de terminales agénticas sobre tmux
 * (SPRINT-TUI 6.1.6 · ADR-003 §2 · ULTRAPLAN-TUI §2/§5.4). La TUI (F6.4) es SOLO el control plane;
 * tmux es el data plane — las sesiones sobreviven a la TUI y a este proceso CLI.
 *
 * Naming: `ebr-<agente>-<slug>` (p.ej. `ebr-claude-korvex`). `list` enumera SOLO sesiones `ebr-*`.
 *
 * SEGURIDAD (hard requirements — no negociables, ver SPRINT-TUI 6.1.6):
 *   - `peek` SIEMPRE pasa el pane por scrubSecrets() antes de imprimirse/devolverse. Cero excepción.
 *   - `send`/`kill` (mutan) exigen --yes explícito. Sin --yes: se REHÚSA (no crashea) y dice qué haría.
 *   - `new --cwd <dir>`: si el cwd resuelve bajo un repo de cliente (brisas-del-golfo/dekko) → deny
 *     duro. Nunca se ofrece ni se acepta como target, en ningún subcomando.
 *
 * `new <agent> <slug>` lanza el comando del adapter (`launch:` en harness/adapters/<agent>/manifest.yaml)
 * con el env del harness inyectado (`env:` del manifest, p.ej. AGENT_NAME) vía `tmux new-session -e`.
 *
 * Uso:
 *   ebrain sessions list --json
 *   ebrain sessions new <agent> <slug> [--cwd <dir>] --json
 *   ebrain sessions peek <name> [--lines N] --json
 *   ebrain sessions send <name> "<texto>" --yes --json
 *   ebrain sessions kill <name> --yes --json
 */
import { existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

const HOME = homedir();
const EBRAIN_HOME = process.env.EBRAIN_HOME || join(HOME, "eBrain");
const ADAPTERS_DIR = process.env.EBRAIN_ADAPTERS_DIR || join(EBRAIN_HOME, "harness", "adapters");

export const SESSION_PREFIX = "ebr-";
export const DEFAULT_PEEK_LINES = 200;

// Repos de cliente — NUNCA target de `sessions new --cwd`, en ningún subcomando ni panel futuro
// (norma dura cross-agente, ver ~/.claude/CLAUDE.md "REPOS DE CLIENTE"). Chequeo por SEGMENTO de
// path exacto (case-insensitive), no substring — evita over-blocking de dirs que solo contienen
// el nombre como parte de otra palabra.
export const CLIENT_DENYLIST = ["brisas-del-golfo", "dekko"];

export function isClientPath(p: string): boolean {
  const segments = p.split(/[\\/]+/).map((s) => s.toLowerCase());
  return CLIENT_DENYLIST.some((d) => segments.includes(d));
}

// ── naming ───────────────────────────────────────────────────────────────
export function sessionName(agent: string, slug: string): string {
  return `${SESSION_PREFIX}${agent}-${slug}`;
}

export function parseSessionName(name: string): { agent: string; slug: string } | null {
  if (!name.startsWith(SESSION_PREFIX)) return null;
  const rest = name.slice(SESSION_PREFIX.length);
  const idx = rest.indexOf("-");
  if (idx < 0) return null;
  const agent = rest.slice(0, idx);
  const slug = rest.slice(idx + 1);
  if (!agent || !slug) return null;
  return { agent, slug };
}

const SAFE_TOKEN = /^[a-zA-Z0-9_-]+$/;
export function isSafeToken(s: string): boolean {
  return SAFE_TOKEN.test(s);
}

// ── scrubber de secretos (SPRINT-TUI 6.1.6 — hard requirement) ─────────────
// capture-pane devuelve texto CRUDO de terminal — puede contener un secreto real que el agente
// imprimió sin querer (o que un `cat .env` se coló por otro camino). guard-secrets.sh (harness/core)
// bloquea COMANDOS lectores de archivos de secretos ANTES de que corran; esto es distinto y
// complementario: acá ya no hay comando que bloquear, hay TEXTO YA IMPRESO en el pane que hay que
// redactar antes de que salga de este proceso. Reusa el mismo vocabulario de guard-secrets.sh
// (key/token/password/.env-value) pero como patrones de FORMA-DE-VALOR, no de nombre-de-archivo.
// Nunca se imprime/retorna pane sin pasar por acá — ver peekSession().
const KEYLIKE_NAME = /((?:[A-Z0-9_]*_)?(?:API[_-]?KEY|ACCESS[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL[S]?|PRIVATE[_-]?KEY))/i;
// `NOMBRE=valor` o `NOMBRE: valor` o `NOMBRE valor` donde NOMBRE matchea forma de secreto — redacta
// el VALOR, preserva el nombre (útil para depurar sin filtrar el secreto).
const KV_SECRET = new RegExp(`(${KEYLIKE_NAME.source})\\s*[:=]\\s*(\\S+)`, "gi");
// Prefijos de proveedor conocidos (Anthropic/OpenAI/OpenRouter/GitHub/AWS/Google/Slack) + Bearer
// tokens genéricos — redacta el token completo dondequiera que aparezca en el texto.
const KNOWN_TOKEN_SHAPES = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk-or-v1-[A-Za-z0-9]{8,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /xox[baprs]-[0-9A-Za-z-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._-]{15,}/gi,
];

export function scrubSecrets(text: string): string {
  let out = text.replace(KV_SECRET, (_m, name: string) => `${name}=[REDACTED]`);
  for (const re of KNOWN_TOKEN_SHAPES) out = out.replace(re, "[REDACTED]");
  return out;
}

// ── tmux wrapper (errores tipados — no-server / not-found nunca crashean) ──
export type TmuxErrorType = "tmux-not-installed" | "no-server" | "not-found" | "deny-client" | "confirm-required" | "bad-agent" | "exists" | "other";
export interface TmuxError { type: TmuxErrorType; message: string }

async function tmuxRaw(args: string[]): Promise<{ code: number; stdout: string; stderr: string } | { spawnError: string }> {
  try {
    const proc = Bun.spawn(["tmux", ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { code, stdout, stderr };
  } catch (e) {
    return { spawnError: String((e as Error)?.message ?? e) };
  }
}

function classifyTmuxError(stderr: string): TmuxErrorType {
  const s = stderr.toLowerCase();
  if (s.includes("no server running") || s.includes("failed to connect to server")) return "no-server";
  if (s.includes("can't find session") || s.includes("session not found") || s.includes("unknown session") || s.includes("no such session")) return "not-found";
  return "other";
}

export interface SessionRow { name: string; agent: string; slug: string; cwd: string; created: string; attached: boolean }
export type Result<T> = { ok: true } & T | { ok: false; error: TmuxError };

export async function listSessions(): Promise<Result<{ sessions: SessionRow[] }>> {
  const r = await tmuxRaw(["list-sessions", "-F", "#{session_name}\t#{session_created}\t#{session_attached}\t#{session_path}"]);
  if ("spawnError" in r) return { ok: false, error: { type: "tmux-not-installed", message: `tmux no disponible: ${r.spawnError}` } };
  if (r.code !== 0) {
    const type = classifyTmuxError(r.stderr);
    if (type === "no-server") return { ok: true, sessions: [] }; // sin server = cero sesiones, no es un fallo duro
    return { ok: false, error: { type, message: r.stderr.trim() || "tmux list-sessions falló" } };
  }
  const sessions: SessionRow[] = [];
  for (const line of r.stdout.split("\n")) {
    if (!line.trim()) continue;
    const [name, createdEpoch, attachedFlag, cwd] = line.split("\t");
    if (!name || !name.startsWith(SESSION_PREFIX)) continue;
    const parsed = parseSessionName(name);
    if (!parsed) continue;
    const epoch = parseInt(createdEpoch ?? "0", 10);
    sessions.push({
      name, agent: parsed.agent, slug: parsed.slug, cwd: cwd ?? "",
      created: Number.isFinite(epoch) ? new Date(epoch * 1000).toISOString() : "",
      attached: attachedFlag === "1",
    });
  }
  return { ok: true, sessions };
}

// ── resolución del comando de lanzamiento (manifest del adapter) ──────────
export interface ManifestLaunch { cmd: string; env: Record<string, string> }

// Lee `launch:` (string, comando) + `env:` (objeto, AGENT_NAME etc.) del manifest declarativo del
// adapter — MISMO env que `ebrain harness install` documenta para ese agente (harness/core/install.sh
// ya usa manifest-get.ts para esto; acá lo leemos directo con Bun.YAML por ser un solo archivo chico,
// mismo patrón que fleet.ts readClass()). Ausente/YAML corrupto → null (fail-visible, no asume nada).
export async function resolveLaunch(agent: string, adaptersDir = ADAPTERS_DIR): Promise<ManifestLaunch | null> {
  const manifestPath = join(adaptersDir, agent, "manifest.yaml");
  const f = Bun.file(manifestPath);
  if (!(await f.exists())) return null;
  try {
    const doc = (Bun as unknown as { YAML: { parse: (s: string) => Record<string, unknown> } }).YAML.parse(await f.text());
    const cmd = typeof doc?.launch === "string" ? doc.launch : null;
    if (!cmd) return null;
    const envDoc = (doc?.env && typeof doc.env === "object" ? doc.env : {}) as Record<string, unknown>;
    const env: Record<string, string> = { AGENT_NAME: agent };
    for (const [k, v] of Object.entries(envDoc)) env[k] = String(v);
    return { cmd, env };
  } catch {
    return null;
  }
}

// ── new ──────────────────────────────────────────────────────────────────
export interface NewSessionOpts { cwd?: string; env?: Record<string, string>; launchCmd?: string; adaptersDir?: string }
export interface NewSessionInfo { name: string; agent: string; slug: string; cwd: string }

export async function newSession(agent: string, slug: string, opts: NewSessionOpts = {}): Promise<Result<{ session: NewSessionInfo }>> {
  if (!isSafeToken(agent) || !isSafeToken(slug)) {
    return { ok: false, error: { type: "bad-agent", message: "agente/slug inválidos (solo [a-zA-Z0-9_-])" } };
  }
  const name = sessionName(agent, slug);
  const cwd = resolve(opts.cwd ?? process.cwd());

  if (isClientPath(cwd)) {
    return { ok: false, error: { type: "deny-client", message: `cwd resuelve bajo un repo de cliente (${CLIENT_DENYLIST.join(" / ")}) — rechazado (aislamiento duro, ver CLAUDE.md)` } };
  }
  if (!existsSync(cwd)) {
    return { ok: false, error: { type: "other", message: `cwd no existe: ${cwd}` } };
  }

  let cmd: string;
  let env: Record<string, string>;
  if (opts.launchCmd) {
    // escape hatch de test/dev (E2E con scripts/fake-agent.sh) — NO usado por el launch flow real
    // (F6.6.1), que siempre resuelve desde el manifest. `agent` sigue siendo el nombre lógico
    // (puede no ser un adapter real, p.ej. "test") — se exporta igual como AGENT_NAME.
    cmd = opts.launchCmd;
    env = { AGENT_NAME: agent, ...(opts.env ?? {}) };
  } else {
    const resolved = await resolveLaunch(agent, opts.adaptersDir);
    if (!resolved) {
      return { ok: false, error: { type: "bad-agent", message: `adapter desconocido o sin 'launch' en su manifest: '${agent}'` } };
    }
    cmd = resolved.cmd;
    env = { ...resolved.env, ...(opts.env ?? {}) };
  }

  const existing = await listSessions();
  if (existing.ok && existing.sessions.some((s) => s.name === name)) {
    return { ok: false, error: { type: "exists", message: `la sesión '${name}' ya existe (usá 'sessions kill' primero, o un slug distinto)` } };
  }

  const envFlags = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  const r = await tmuxRaw(["new-session", "-d", "-s", name, "-c", cwd, ...envFlags, cmd]);
  if ("spawnError" in r) return { ok: false, error: { type: "tmux-not-installed", message: r.spawnError } };
  if (r.code !== 0) return { ok: false, error: { type: classifyTmuxError(r.stderr), message: r.stderr.trim() || "tmux new-session falló" } };

  return { ok: true, session: { name, agent, slug, cwd } };
}

// ── peek (SIEMPRE scrubbeado) ───────────────────────────────────────────────
export async function peekSession(name: string, lines = DEFAULT_PEEK_LINES): Promise<Result<{ name: string; lines: number; text: string }>> {
  if (!name.startsWith(SESSION_PREFIX)) {
    return { ok: false, error: { type: "other", message: `nombre inválido (esperado prefijo '${SESSION_PREFIX}'): ${name}` } };
  }
  const r = await tmuxRaw(["capture-pane", "-p", "-t", name, "-S", `-${lines}`]);
  if ("spawnError" in r) return { ok: false, error: { type: "tmux-not-installed", message: r.spawnError } };
  if (r.code !== 0) return { ok: false, error: { type: classifyTmuxError(r.stderr), message: r.stderr.trim() || "tmux capture-pane falló" } };
  // Hard requirement: cero pane crudo sale de esta función. scrubSecrets() SIEMPRE corre acá,
  // sin excepción ni flag de bypass.
  return { ok: true, name, lines, text: scrubSecrets(r.stdout) };
}

// ── send / kill (mutan → exigen --yes explícito, sin excepción) ────────────
export async function sendToSession(name: string, text: string, yes: boolean): Promise<Result<{ name: string; sent: boolean }> | { ok: false; error: TmuxError; would: { name: string; text: string } }> {
  if (!yes) {
    return {
      ok: false,
      error: { type: "confirm-required", message: `falta --yes: sin confirmación NO se envía nada. Con --yes se enviaría a '${name}'.` },
      would: { name, text },
    };
  }
  const r = await tmuxRaw(["send-keys", "-t", name, text, "Enter"]);
  if ("spawnError" in r) return { ok: false, error: { type: "tmux-not-installed", message: r.spawnError } };
  if (r.code !== 0) return { ok: false, error: { type: classifyTmuxError(r.stderr), message: r.stderr.trim() || "tmux send-keys falló" } };
  return { ok: true, name, sent: true };
}

export async function killSession(name: string, yes: boolean): Promise<Result<{ name: string; killed: boolean }> | { ok: false; error: TmuxError; would: { name: string } }> {
  if (!yes) {
    return {
      ok: false,
      error: { type: "confirm-required", message: `falta --yes: sin confirmación NO se mata nada. Con --yes se mataría '${name}'.` },
      would: { name },
    };
  }
  const r = await tmuxRaw(["kill-session", "-t", name]);
  if ("spawnError" in r) return { ok: false, error: { type: "tmux-not-installed", message: r.spawnError } };
  if (r.code !== 0) return { ok: false, error: { type: classifyTmuxError(r.stderr), message: r.stderr.trim() || "tmux kill-session falló" } };
  return { ok: true, name, killed: true };
}

// ── CLI ──────────────────────────────────────────────────────────────────
function die(msg: string, code = 1): never {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

function parseArgs(argv: string[]) {
  const json = argv.includes("--json");
  const yes = argv.includes("--yes");
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json" || a === "--yes") continue;
    if (a === "--cwd" || a === "--lines") { flags[a.slice(2)] = argv[++i] ?? ""; continue; }
    positional.push(a);
  }
  return { json, yes, positional, flags };
}

function printResult(json: boolean, ok: boolean, payload: unknown, plainOk: string, plainErr: (e: TmuxError) => string) {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (ok) {
    console.log(plainOk);
  } else {
    const err = (payload as { error: TmuxError }).error;
    console.error(`✗ ${plainErr(err)}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  const { json, yes, positional, flags } = parseArgs(argv.slice(1));

  switch (sub) {
    case "list": {
      const r = await listSessions();
      if (!r.ok) { printResult(json, false, r, "", (e) => e.message); process.exit(1); }
      if (json) { console.log(JSON.stringify({ sessions: r.sessions }, null, 2)); return; }
      console.log(`ebrain sessions (${r.sessions.length})`);
      for (const s of r.sessions) console.log(`  ${s.attached ? "●" : "○"} ${s.name}  agent=${s.agent} slug=${s.slug} cwd=${s.cwd} created=${s.created}`);
      return;
    }
    case "new": {
      const [agent, slug] = positional;
      if (!agent || !slug) die("uso: ebrain sessions new <agent> <slug> [--cwd <dir>] [--json]");
      // Sin --cwd explícito: preferí el cwd REAL desde donde se invocó `ebrain` (el dispatcher lo
      // exporta como EBRAIN_CALLER_CWD antes de saltar al dir neutral de run_bun — ver cli/ebrain).
      // Corriendo sessions.ts directo (bun run cli/sessions.ts, como en los tests) esa var no está
      // seteada → newSession() cae a process.cwd() como siempre.
      const cwd = flags.cwd || process.env.EBRAIN_CALLER_CWD || undefined;
      const r = await newSession(agent, slug, { cwd });
      if (json) { console.log(JSON.stringify(r, null, 2)); }
      if (!r.ok) { if (!json) console.error(`✗ ${r.error.message}`); process.exit(r.error.type === "deny-client" ? 2 : 1); }
      if (!json) console.log(`✓ sesión creada: ${r.session.name} (cwd=${r.session.cwd})`);
      return;
    }
    case "peek": {
      const [name] = positional;
      if (!name) die("uso: ebrain sessions peek <name> [--lines N] [--json]");
      const lines = flags.lines ? parseInt(flags.lines, 10) || DEFAULT_PEEK_LINES : DEFAULT_PEEK_LINES;
      const r = await peekSession(name, lines);
      if (json) { console.log(JSON.stringify(r, null, 2)); }
      if (!r.ok) { if (!json) console.error(`✗ ${r.error.message}`); process.exit(1); }
      if (!json) console.log(r.text);
      return;
    }
    case "send": {
      const [name, text] = positional;
      if (!name || text === undefined) die('uso: ebrain sessions send <name> "<texto>" --yes [--json]');
      const r = await sendToSession(name, text, yes);
      if (json) { console.log(JSON.stringify(r, null, 2)); }
      if (!r.ok) { if (!json) console.error(`✗ ${r.error.message}`); process.exit(r.error.type === "confirm-required" ? 2 : 1); }
      if (!json) console.log(`✓ enviado a ${r.name}`);
      return;
    }
    case "kill": {
      const [name] = positional;
      if (!name) die("uso: ebrain sessions kill <name> --yes [--json]");
      const r = await killSession(name, yes);
      if (json) { console.log(JSON.stringify(r, null, 2)); }
      if (!r.ok) { if (!json) console.error(`✗ ${r.error.message}`); process.exit(r.error.type === "confirm-required" ? 2 : 1); }
      if (!json) console.log(`✓ sesión matada: ${r.name}`);
      return;
    }
    default:
      die(`ebrain sessions: subcomando desconocido '${sub ?? ""}' (soportado: list · new · peek · send · kill)`, 2);
  }
}

if (import.meta.main) main().catch((e) => die(String(e?.message ?? e)));
