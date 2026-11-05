#!/usr/bin/env bun
/**
 * ebrain memoria — keeps the memory index fresh, under spend caps.
 *
 *   ebrain memoria project        rebuild the filtered corpus of every source (no engine, no provider)
 *   ebrain memoria sync           project → sync what changed → embed what is pending, under the caps
 *   ebrain memoria status [--json]  sources, pending work, and this month's spend against the cap
 *   ebrain memoria install-timer  install the hourly systemd user timer that runs `sync`
 *   ebrain memoria probe          ask the running daemon whether recall really uses vectors
 *
 * Why a projected corpus. The engine indexes every Markdown file of a source and has no per-source exclusions, while
 * a brain holds archives, retired doctrine, operational noise and client material that must never be indexed. So each
 * source is a small local git repository (no remote) derived from the real tree by the rules in
 * ~/.config/ebrain/memoria.json. The real tree stays the single source of truth and is never written to.
 *
 * Why embed stops the daemon. A live `serve` owns the store's single-writer lock. `sync` is delegated to it over IPC,
 * but the embedding drain it would run has no spend cap, and the capped `embed --max-usd` cannot open a locked store.
 * So sync always runs --no-embed, and pending vectors are embedded in a short stop/start of the daemon, only when
 * there are pending vectors and the month's ledger leaves room. Keyword search keeps working on pages without vectors.
 *
 * The provider key is read from its file for that one child process. It is never printed, logged or written.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { engineHome } from "./engine-home.ts";
import { estadoDeRuta, expandirHome, normalizar, type Corpus } from "./eval/casos.ts";

export type Fuente = {
  id: string;
  raiz: string;
  /** A path must match this to enter (relative to raiz). Default: every Markdown file. */
  incluir?: string;
  /** Regexes over the relative path. */
  excluir?: string[];
  /** Directory names never descended into, at any depth. */
  podar?: string[];
  /** Drop documents whose TEXT names a denied term (see `denegados`). */
  denegadosEnContenido?: boolean;
};

export type Config = {
  corpus: string;
  fuentes: Fuente[];
  /** Regex of the denied terms for `denegadosEnContenido`. Lives in the private config, never in this repo. */
  denegados?: string;
  /** Case-insensitive regex: a relative path that matches never enters any corpus. Private config too. */
  denegadosRuta?: string;
  retirado: { prefijos: string[]; estados: string[] };
  llave: string;
  /** qmd over the same projected corpus: the complement for exact terms and the fallback when the daemon is down. */
  qmd?: { indice: string; bin: string; nodeDir: string };
  topeCorridaUsd: number;
  topeMensualUsd: number;
  /**
   * This machine keeps the projection (corpus, .rutas.json, qmd) fresh but has no daemon of its own: the daemon runs
   * elsewhere and is reached through a tunnel. `sync` then projects and stops, with no engine and no embeddings.
   */
  soloProyeccion?: boolean;
};

const HOME = homedir();
const CFG = join(HOME, ".config", "ebrain");
const LOG_DIR = join(HOME, ".local", "state", "ebrain");
const LLAVES_AJENAS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "ZEROENTROPY_API_KEY", "VOYAGE_API_KEY",
  "GROQ_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "DEEPSEEK_API_KEY", "MISTRAL_API_KEY", "COHERE_API_KEY"];

/**
 * With a provider key in its environment the engine picks a chat model by itself and spends on it, uncapped, on some
 * document imports and on every `think`; a pin in its config does not stop that. GBRAIN_MODEL overrides every tier, so
 * naming a provider whose key is absent leaves the engine with no LLM: embeddings and search are unaffected.
 */
const SIN_CHAT = "anthropic:claude-sonnet-4-6";

export function cargarConfig(file = join(CFG, "memoria.json")): Config {
  const c = JSON.parse(readFileSync(file, "utf8")) as Config;
  if (!c.corpus || !Array.isArray(c.fuentes) || !c.llave) throw new Error(`invalid config: ${file}`);
  return c;
}

/** A hidden or build-named segment would be skipped by the engine's walker, so it gets a visible name in the corpus. */
export function rutaVisible(rel: string): string {
  return rel.split("/").map((seg) => {
    const s = seg.replace(/^\.+/, "");
    return ["dist", "build", "vendor", "node_modules"].includes(s) ? `${s}_` : s;
  }).join("/");
}

/**
 * The engine rejects a whole document over `tags: [#a, #b]`: in YAML, `#` opens a comment and leaves the bracket
 * unclosed. Quoting those items keeps the document searchable. Applied to the projected copy only.
 */
export function sanearFrontmatter(texto: string): string {
  if (!texto.startsWith("---\n")) return texto;
  const fin = texto.indexOf("\n---", 4);
  if (fin < 0) return texto;
  const lineas = texto.slice(4, fin).split("\n").map((l) => {
    const m = l.match(/^([A-Za-z_][\w-]*):\s*\[(.*)\]\s*$/);
    if (!m || !m[2].includes("#")) return l;
    const items = m[2].split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    return `${m[1]}: [${items.map((x) => `"${x.replace(/"/g, "")}"`).join(", ")}]`;
  });
  return `---\n${lineas.join("\n")}${texto.slice(fin)}`;
}

function listarMd(raiz: string, podar: string[]): string[] {
  const out: string[] = [];
  const andar = (dir: string) => {
    let entradas: string[];
    try {
      entradas = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entradas) {
      if (podar.includes(e) || e === ".git" || e === "node_modules" || e.startsWith(".venv")) continue;
      const abs = join(dir, e);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) andar(abs);
      else if (st.isFile() && e.endsWith(".md")) out.push(relative(raiz, abs).split(sep).join("/"));
    }
  };
  andar(raiz);
  return out.sort();
}

/** The relative paths of a source that enter its corpus. Pure over the filesystem: writes nothing. */
export function seleccionar(f: Fuente, c: Config): { rel: string; texto: string }[] {
  const raiz = expandirHome(f.raiz);
  const incluir = f.incluir ? new RegExp(f.incluir) : null;
  const excluir = [...(f.excluir ?? []).map((x) => new RegExp(x)), ...(c.denegadosRuta ? [new RegExp(c.denegadosRuta, "i")] : [])];
  const denegados = f.denegadosEnContenido && c.denegados ? new RegExp(c.denegados, "i") : null;
  const corpus: Corpus = { raiz, excluir: [], prefijosRetirados: c.retirado.prefijos, estadosRetirados: c.retirado.estados, topK: 5 };
  const out: { rel: string; texto: string }[] = [];
  for (const rel of listarMd(raiz, f.podar ?? [])) {
    if (incluir && !incluir.test(rel)) continue;
    if (excluir.some((x) => x.test(rel))) continue;
    let texto: string;
    try {
      // Tolerant decode: a truncated byte in a log must not stop the projection or reach the engine.
      texto = new TextDecoder("utf-8").decode(readFileSync(join(raiz, rel)));
      if (estadoDeRuta(corpus, rel) !== "vigente") continue;
    } catch {
      continue;
    }
    if (denegados && denegados.test(texto)) continue;
    out.push({ rel, texto });
  }
  return out;
}

function git(dir: string, ...args: string[]) {
  return spawnSync("git", ["-c", "user.name=ebrain", "-c", "user.email=ebrain@localhost", "-c", "core.hooksPath=/dev/null", "-C", dir, ...args], { encoding: "utf8" });
}

export type Proyeccion = { id: string; dir: string; raiz: string; archivos: number; cambios: number; head: string; rutas: Record<string, string> };

/** Mirrors a source into its corpus repository. Returns the HEAD commit and how many files the projection changed. */
export function proyectar(f: Fuente, c: Config): Proyeccion {
  const dir = join(expandirHome(c.corpus), f.id);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, ".git"))) git(dir, "init", "-q");
  const deseado = new Map<string, string>();
  const rutas: Record<string, string> = {};
  for (const { rel, texto } of seleccionar(f, c)) {
    const visible = rutaVisible(rel);
    deseado.set(visible, sanearFrontmatter(texto));
    rutas[normalizar(visible)] = rel;
  }
  for (const rel of listarMd(dir, [])) {
    if (!deseado.has(rel)) rmSync(join(dir, rel));
  }
  for (const [rel, texto] of deseado) {
    const abs = join(dir, rel);
    if (existsSync(abs) && readFileSync(abs, "utf8") === texto) continue;
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, texto);
  }
  git(dir, "add", "-A");
  const cambios = git(dir, "diff", "--cached", "--name-only").stdout.split("\n").filter(Boolean).length;
  if (cambios > 0) git(dir, "commit", "-q", "-m", `projection ${new Date().toISOString()}`);
  return { id: f.id, dir, raiz: expandirHome(f.raiz), archivos: deseado.size, cambios, head: git(dir, "rev-parse", "HEAD").stdout.trim(), rutas };
}

/**
 * The allowlist of the prompt hook: a result whose document is not here is never injected, whatever an index returns.
 * It also maps an engine's slug back to the real path, because the projection renames hidden segments.
 */
export function escribirRutas(c: Config, ps: Proyeccion[]): void {
  const salida: Record<string, { raiz: string; docs: Record<string, string> }> = {};
  for (const p of ps) salida[p.id] = { raiz: p.raiz, docs: p.rutas };
  const f = join(expandirHome(c.corpus), ".rutas.json");
  writeFileSync(`${f}.tmp`, JSON.stringify(salida));
  renameSync(`${f}.tmp`, f);
}

function qmd(c: Config, args: string[]) {
  const q = c.qmd!;
  return spawnSync(expandirHome(q.bin), ["--index", q.indice, ...args], {
    cwd: join(CFG, "wd"), encoding: "utf8", timeout: 300_000,
    // The system's Node is too old for qmd, and a systemd unit has no nvm in its PATH.
    env: { ...process.env, PATH: `${expandirHome(q.nodeDir)}:${process.env.PATH ?? ""}` },
  });
}

/** Brings qmd's index up to the projection. It is local and free, and it is the fallback, so it runs with the daemon down too. */
export function actualizarQmd(c: Config, ps: Proyeccion[], estado: Record<string, string>): void {
  if (!c.qmd) return;
  const atrasadas = ps.filter((p) => p.head && estado[`qmd:${p.id}`] !== p.head);
  if (atrasadas.length === 0) return;
  const lista = qmd(c, ["collection", "list"]).stdout ?? "";
  for (const p of ps) {
    if (!lista.includes(`${p.id} (qmd://`)) qmd(c, ["collection", "add", p.dir, "--name", p.id]);
  }
  const r = qmd(c, ["update"]);
  if (r.status === 0) {
    for (const p of atrasadas) estado[`qmd:${p.id}`] = p.head;
    log(`qmd: index updated for ${atrasadas.map((p) => p.id).join(", ")}`);
  } else {
    log(`qmd: update failed with exit ${r.status}; retried next run`);
  }
}

/** Sum of the actual spend in the engine's budget ledger for one calendar month (YYYY-MM, UTC, as the ledger stamps it). */
export function gastoDelMes(auditDir: string, mes: string): number {
  let total = 0;
  let archivos: string[] = [];
  try {
    archivos = readdirSync(auditDir).filter((x) => /^budget-.*\.jsonl$/.test(x));
  } catch {
    return 0;
  }
  for (const a of archivos) {
    for (const linea of readFileSync(join(auditDir, a), "utf8").split("\n")) {
      if (!linea.includes("actual_cost_usd")) continue;
      try {
        const o = JSON.parse(linea);
        if (typeof o.ts === "string" && o.ts.startsWith(mes) && typeof o.actual_cost_usd === "number") total += o.actual_cost_usd;
      } catch {
        // A torn last line must not stop the sum: the cap is enforced again next hour.
      }
    }
  }
  return total;
}

/** Decides the cap for this run's embed: the smaller of the run cap and what the month leaves. 0 = skip. */
export function topeDeEstaCorrida(gastado: number, topeCorrida: number, topeMensual: number): number {
  const queda = topeMensual - gastado;
  return queda <= 0 ? 0 : Math.min(topeCorrida, queda);
}

function log(msg: string) {
  const linea = `${new Date().toISOString()} ${msg}`;
  console.log(linea);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(join(LOG_DIR, "memoria.log"), `${linea}\n`);
  } catch {
    // Logging must never stop the maintenance.
  }
}

function entornoMotor(conLlave?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GBRAIN_HOME: engineHome({ ...process.env, GBRAIN_HOME: undefined }), DO_NOT_TRACK: "1" };
  for (const k of LLAVES_AJENAS) delete env[k];
  env.GBRAIN_MODEL = SIN_CHAT;
  if (conLlave) env.OPENAI_API_KEY = conLlave;
  return env;
}

function motor(args: string[], env: NodeJS.ProcessEnv, timeoutMs = 590_000) {
  const ebrainHome = process.env.EBRAIN_HOME || join(import.meta.dir, "..");
  return spawnSync(process.execPath, ["run", join(ebrainHome, "vendor", "gbrain", "src", "cli.ts"), ...args], {
    cwd: join(CFG, "wd"), env, encoding: "utf8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"],
  });
}

/** How to stop/start the daemon: the user manager by default, or a system unit with EBRAIN_DAEMON_CTL="sudo -n systemctl". */
function daemon(accion: "stop" | "start") {
  const ctl = (process.env.EBRAIN_DAEMON_CTL || "systemctl --user").split(/\s+/).filter(Boolean);
  return spawnSync(ctl[0]!, [...ctl.slice(1), accion, "ebrain-daemon.service"], { encoding: "utf8", timeout: 60_000 }).status === 0;
}

async function daemonSano(puerto: number, esperaMs: number): Promise<boolean> {
  const fin = Date.now() + esperaMs;
  while (Date.now() < fin) {
    try {
      const r = await fetch(`http://127.0.0.1:${puerto}/health`, { signal: AbortSignal.timeout(2_000) });
      if (r.ok) return true;
    } catch {
      // Still starting.
    }
    await Bun.sleep(1_000);
  }
  return false;
}

async function pendientes(): Promise<number | null> {
  const { callTool } = await import("./remote-tools.ts");
  try {
    const h = await callTool<Record<string, unknown>>("get_health", {}, 60_000);
    return typeof h?.missing_embeddings === "number" ? h.missing_embeddings : null;
  } catch {
    return null;
  } finally {
    // callTool points GBRAIN_HOME at the thin client; the engine commands below must not inherit that.
    delete process.env.GBRAIN_HOME;
  }
}

/**
 * Does recall really use vectors? Asked of the running daemon, not of its config: a query whose words appear in no
 * document can only come back through the vector arm. Prints "hybrid" or "keyword"; costs one embedded query.
 */
async function probarRecall(): Promise<"hybrid" | "keyword" | "down"> {
  const { callTool } = await import("./remote-tools.ts");
  try {
    const filas = await callTool<Array<{ evidence?: unknown }>>("query", { query: "qwxzv ynkjtp vbhgrm", limit: 3, expand: false }, 60_000);
    return Array.isArray(filas) && filas.length > 0 ? "hybrid" : "keyword";
  } catch {
    return "down";
  } finally {
    delete process.env.GBRAIN_HOME;
  }
}

const estadoFile = (c: Config) => join(expandirHome(c.corpus), ".sincronizado.json");
function leerEstado(c: Config): Record<string, string> {
  try {
    return JSON.parse(readFileSync(estadoFile(c), "utf8"));
  } catch {
    return {};
  }
}

const mesActual = () => new Date().toISOString().slice(0, 7);
const auditDir = () => join(engineHome(), ".gbrain", "audit");

/** One run at a time: the timer and a manual run must not race on the corpus, the state file or the daemon's stop/start. */
function tomarCandado(): boolean {
  mkdirSync(LOG_DIR, { recursive: true });
  const f = join(LOG_DIR, "memoria.lock");
  try {
    const pid = Number(readFileSync(f, "utf8").trim());
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        // The holder died: its lock is stale.
      }
    }
  } catch {
    // No lock yet.
  }
  writeFileSync(f, String(process.pid));
  process.on("exit", () => {
    try {
      rmSync(f);
    } catch {
      // Already gone.
    }
  });
  return true;
}

async function sincronizar(c: Config): Promise<number> {
  if (!tomarCandado()) {
    log("another run is in progress: skipped");
    return 0;
  }
  const puerto =Number(process.env.EBRAIN_BRAIN_PORT || 8541);
  const estado = leerEstado(c);
  const proyecciones = c.fuentes.map((f) => proyectar(f, c));
  escribirRutas(c, proyecciones);
  actualizarQmd(c, proyecciones, estado);
  writeFileSync(estadoFile(c), JSON.stringify(estado, null, 2));
  if (c.soloProyeccion) {
    log("projection only (the daemon runs elsewhere): corpus, allowlist and qmd are fresh");
    return 0;
  }
  const porSincronizar = proyecciones.filter((p) => p.head && estado[p.id] !== p.head);
  if (!(await daemonSano(puerto, 5_000))) {
    log("daemon down: the corpus is projected, the sync waits for the next run");
    return 0;
  }
  for (const p of porSincronizar) {
    const r = motor(["sync", "--source", p.id, "--no-embed"], entornoMotor());
    if (r.status === 0) {
      estado[p.id] = p.head;
      log(`sync ${p.id}: ok (${p.cambios} files changed in this projection, ${p.archivos} in the corpus)`);
    } else {
      log(`sync ${p.id}: failed with exit ${r.status}; retried next run`);
    }
  }
  writeFileSync(estadoFile(c), JSON.stringify(estado, null, 2));

  const faltan = await pendientes();
  if (faltan === 0) {
    if (porSincronizar.length === 0) log("no changes, nothing pending");
    return 0;
  }
  if (faltan === null) {
    log("could not read pending vectors from the daemon; embed skipped this run");
    return 1;
  }
  const antes = gastoDelMes(auditDir(), mesActual());
  const tope = topeDeEstaCorrida(antes, c.topeCorridaUsd, c.topeMensualUsd);
  if (tope <= 0) {
    log(`monthly cap reached (US$${antes.toFixed(4)} of US$${c.topeMensualUsd}): ${faltan} vectors wait for next month; keyword search still covers them`);
    return 0;
  }
  // The key is read here, for this child only. Without it the embed simply waits: the search keeps working.
  let llave: string;
  try {
    llave = readFileSync(expandirHome(c.llave), "utf8").trim();
  } catch {
    log("provider key file unreadable: embed skipped this run");
    return 1;
  }
  daemon("stop");
  let rc = 1;
  try {
    const r = motor(["embed", "--stale", "--max-usd", tope.toFixed(4), "--json"], entornoMotor(llave));
    rc = r.status ?? 1;
  } finally {
    daemon("start");
  }
  const sano = await daemonSano(puerto, 90_000);
  const despues = gastoDelMes(auditDir(), mesActual());
  log(`embed: ${faltan} pending, cap US$${tope.toFixed(4)}, exit ${rc}, spent US$${(despues - antes).toFixed(6)}, month US$${despues.toFixed(4)} of US$${c.topeMensualUsd}, daemon ${sano ? "up" : "NOT UP"}`);
  return sano ? 0 : 1;
}

async function estado(c: Config, json: boolean) {
  const est = leerEstado(c);
  const fuentes = c.fuentes.map((f) => {
    const dir = join(expandirHome(c.corpus), f.id);
    const head = existsSync(join(dir, ".git")) ? git(dir, "rev-parse", "HEAD").stdout.trim() : "";
    return { id: f.id, archivos: head ? git(dir, "ls-files").stdout.split("\n").filter(Boolean).length : 0, al_dia: !!head && est[f.id] === head };
  });
  const gasto = gastoDelMes(auditDir(), mesActual());
  const out = { fuentes, vectores_pendientes: await pendientes(), mes: mesActual(), gasto_usd: +gasto.toFixed(6), tope_mensual_usd: c.topeMensualUsd, tope_corrida_usd: c.topeCorridaUsd };
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    for (const f of fuentes) console.log(`${f.id.padEnd(14)} ${String(f.archivos).padStart(5)} files  ${f.al_dia ? "in sync" : "sync pending"}`);
    console.log(`vectors pending: ${out.vectores_pendientes ?? "unknown"}`);
    console.log(`spend ${out.mes}: US$${gasto.toFixed(4)} of US$${c.topeMensualUsd} (run cap US$${c.topeCorridaUsd})`);
  }
}

function instalarTimer() {
  const ebrainHome = process.env.EBRAIN_HOME || join(import.meta.dir, "..");
  const dir = join(HOME, ".config", "systemd", "user");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ebrain-memoria.service"), `[Unit]
Description=eBrain: keep the memory index fresh, under spend caps
After=ebrain-daemon.service

[Service]
Type=oneshot
WorkingDirectory=${CFG}/wd
Environment=EBRAIN_HOME=${ebrainHome}
ExecStart=${HOME}/.local/share/ebrain/bun/bun run ${ebrainHome}/cli/memoria.ts sync
Nice=19
IOSchedulingClass=idle
TimeoutStartSec=900
`);
  writeFileSync(join(dir, "ebrain-memoria.timer"), `[Unit]
Description=eBrain: hourly memory index check (does nothing when nothing changed)

[Timer]
OnBootSec=15min
OnUnitActiveSec=1h

[Install]
WantedBy=timers.target
`);
  spawnSync("systemctl", ["--user", "daemon-reload"]);
  const r = spawnSync("systemctl", ["--user", "enable", "--now", "ebrain-memoria.timer"], { encoding: "utf8" });
  console.log(r.status === 0 ? "timer installed: ebrain-memoria.timer" : `timer install failed: ${r.stderr}`);
}

if (import.meta.main) {
  const [cmd, ...resto] = process.argv.slice(2);
  const usage = "usage: ebrain memoria <project|sync|status [--json]|install-timer>";
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(usage);
    process.exit(cmd ? 0 : 2);
  }
  if (cmd === "install-timer") {
    instalarTimer();
    process.exit(0);
  }
  if (cmd === "probe") {
    console.log(await probarRecall());
    process.exit(0);
  }
  const c = cargarConfig();
  if (cmd === "project") {
    const ps = c.fuentes.map((f) => proyectar(f, c));
    escribirRutas(c, ps);
    for (const p of ps) console.log(`${p.id}: ${p.archivos} files, ${p.cambios} changed, ${p.dir}`);
  } else if (cmd === "sync") {
    process.exit(await sincronizar(c));
  } else if (cmd === "status") {
    await estado(c, resto.includes("--json"));
  } else {
    console.error(usage);
    process.exit(2);
  }
}
