#!/usr/bin/env bun
/**
 * cli/daemon-control.ts — supervision of the shared-brain host (ADR-004).
 *
 * The host is ONE `gbrain serve --http` bound to loopback that owns the PGLite
 * single-writer lock; every agent reaches it through the stdio bridge. This module is
 * the control plane for that process: `start`, `stop`, `status`, `restart`, and the
 * idempotent `ensure` that everything else calls.
 *
 * Three properties this file exists to guarantee, none of which the pidfile-and-`pgrep`
 * shell control could:
 *
 *  1. A pidfile is a claim, not a fact. A PID belongs to us only if the live process at
 *     that PID still looks like our host, so every liveness check verifies identity
 *     (`comm` plus argv) before believing the file. Without that, a recycled PID reports
 *     a long-dead daemon as UP and `start` refuses to fix it.
 *  2. Starting is exclusive. Two agents booting at once must produce one host, not two
 *     racing for the same single-writer lock, so `start` runs under an atomic directory
 *     lock and re-checks health after acquiring it.
 *  3. "Started" means serving. A process still alive one second later proves nothing — a
 *     failed bind and a slow store open look identical from the outside — so `start`
 *     waits for /health and surfaces the log when it never arrives.
 */
import { existsSync, mkdirSync, mkdtempSync, openSync, closeSync, chmodSync, readFileSync, writeFileSync, rmSync, renameSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { spawn } from "child_process";
import { resolveEbrainHome } from "./ebrain-home.ts";
import { DEFAULT_PORT, healthCheck, healthUrl, redactSecrets } from "./mcp-token.ts";

const HOME = homedir();
const CFG = join(HOME, ".config", "ebrain");
const PIDFILE = join(CFG, "ebrain-brain.pid");
const LOG = join(CFG, "daemon.log");
const LOCKDIR = join(CFG, "daemon.lock");

/** Rotate the daemon log past this size. An unbounded append-only log is a slow disk leak. */
export const LOG_MAX_BYTES = 5 * 1024 * 1024;

function port(): number {
  const n = Number(process.env.EBRAIN_BRAIN_PORT || DEFAULT_PORT);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PORT;
}

function startTimeoutMs(): number {
  const n = Number(process.env.EBRAIN_DAEMON_START_TIMEOUT_MS || 60_000);
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

// ── process identity ──────────────────────────────────────────────────────
// `pgrep -f <pattern>` cannot be used here. It matches any process whose *command line*
// contains the pattern, which includes every shell running a command that merely mentions
// it (an agent grepping the logs, this project's own doctor) and our own HTTP host. Both
// classes were reproduced against the previous guard: a start refused because an unrelated
// shell was on screen. `comm` is the executable actually running, so it separates a real
// engine process from a shell that only talks about one.

export interface ProcRow {
  pid: number;
  comm: string;
  args: string;
}

/** Runtimes the engine can legitimately be executing under. */
const ENGINE_RUNTIMES = new Set(["bun", "node", "bun-profile"]);

/** Parse `ps -eo pid=,comm=,args=` output. Tolerates the leading padding ps adds. */
export function parsePsTable(stdout: string): ProcRow[] {
  const rows: ProcRow[] = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    rows.push({ pid: Number(m[1]), comm: m[2], args: m[3] });
  }
  return rows;
}

/** True when the row is the engine CLI running its `serve` subcommand under a JS runtime. */
export function isEngineServe(row: ProcRow): boolean {
  if (!ENGINE_RUNTIMES.has(row.comm)) return false;
  return /(?:^|[/\s])cli\.ts\s+serve(?:\s|$)/.test(row.args);
}

/** The shared HTTP host: an engine serve with `--http`. */
export function isHttpHost(row: ProcRow): boolean {
  return isEngineServe(row) && /(?:^|\s)--http(?:\s|$)/.test(row.args);
}

/** A per-agent stdio serve: an engine serve WITHOUT `--http`. These hold the writer lock. */
export function isStdioServe(row: ProcRow): boolean {
  return isEngineServe(row) && !isHttpHost(row);
}

/**
 * Foreign stdio serves — the ones that would make an HTTP host block forever on the
 * single-writer lock. Our own process tree is excluded: a control command is never the
 * thing holding the lock, and counting it deadlocks `start` against itself.
 */
export function findForeignStdioServes(rows: readonly ProcRow[], excludePids: readonly number[]): ProcRow[] {
  const skip = new Set(excludePids.filter((p) => Number.isFinite(p) && p > 0));
  return rows.filter((r) => isStdioServe(r) && !skip.has(r.pid));
}

function psTable(): ProcRow[] {
  const res = Bun.spawnSync(["ps", "-eo", "pid=,comm=,args="], { stdout: "pipe", stderr: "pipe" });
  if (res.exitCode !== 0) return [];
  return parsePsTable(res.stdout.toString());
}

/** The row for one PID, or null when it is gone. `ps -p` is portable across Linux and BSD. */
export function processRow(pid: number): ProcRow | null {
  if (!Number.isFinite(pid) || pid <= 0) return null;
  const res = Bun.spawnSync(["ps", "-p", String(pid), "-o", "pid=,comm=,args="], { stdout: "pipe", stderr: "pipe" });
  if (res.exitCode !== 0) return null;
  const rows = parsePsTable(res.stdout.toString());
  return rows.length > 0 ? rows[0] : null;
}

// ── pidfile ───────────────────────────────────────────────────────────────

export function parsePidFile(raw: string): number | null {
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

function readPid(): number | null {
  if (!existsSync(PIDFILE)) return null;
  try {
    return parsePidFile(readFileSync(PIDFILE, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Is the recorded PID *our* host? A live process is not enough: after a crash the OS may
 * hand that number to anything, and the launcher only becomes the engine once it execs, so
 * the launcher path counts as ours too during the boot window.
 */
const LAUNCHER_RUNTIMES = new Set(["bash", "sh", "dash", "zsh", ...ENGINE_RUNTIMES]);

export function pidIsOurHost(row: ProcRow | null, launcher: string): boolean {
  if (!row) return false;
  if (isEngineServe(row)) return true;
  // The launcher branch covers the window before bash execs the engine, so it must ALSO check
  // what is executing. Matching argv alone would accept an editor or a `cat` of the launcher
  // path — and `stop()` escalates to SIGKILL on whatever this returns true for.
  return launcher.length > 0 && LAUNCHER_RUNTIMES.has(row.comm) && row.args.includes(launcher);
}

function launcherPath(): string {
  const installed = join(CFG, "ebrain-brain");
  if (existsSync(installed)) return installed;
  return join(resolveEbrainHome(), "scripts", "ebrain-brain");
}

/** The recorded PID if it is alive AND still looks like our host; otherwise null. */
function livePid(opts: { reap?: boolean } = {}): number | null {
  const pid = readPid();
  if (pid === null) return null;
  if (pidIsOurHost(processRow(pid), launcherPath())) return pid;
  // A stale claim. Leaving it on disk is what makes a dead daemon report UP forever.
  if (opts.reap !== false) {
    try { rmSync(PIDFILE, { force: true }); } catch { /* best effort */ }
  }
  return null;
}

// ── start lock ────────────────────────────────────────────────────────────
// `mkdir` is the portable atomic create-or-fail primitive: it needs no flock, behaves the
// same on Linux and macOS, and leaves an owner PID behind so a lock orphaned by a crash can
// be told apart from one that is genuinely held.

function lockOwner(): number | null {
  try {
    return parsePidFile(readFileSync(join(LOCKDIR, "owner"), "utf8"));
  } catch {
    return null;
  }
}

function discard(path: string): void {
  try { rmSync(path, { recursive: true, force: true }); } catch { /* best effort */ }
}

/**
 * Acquire the start lock, owner PID and all, in one atomic step.
 *
 * `mkdir` then write-owner is not atomic: a racer arriving between the two reads no owner, decides
 * the lock is orphaned, and breaks a lock that was just legitimately taken. Building the lock
 * fully-formed in a scratch directory and `rename`-ing it into place closes that window — renaming
 * a directory onto an existing one fails, so either you own it with its owner file already there,
 * or you did not get it.
 *
 * Breaking an orphaned lock uses the same trick: exactly one racer's `rename` of the stale lock
 * out of the way can succeed, so two processes cannot both conclude they broke it.
 */
function tryAcquireLock(): boolean {
  mkdirSync(CFG, { recursive: true, mode: 0o700 });
  const stage = (): string => {
    const scratch = mkdtempSync(join(CFG, ".daemon-lock-"));
    writeFileSync(join(scratch, "owner"), `${process.pid}\n`, { mode: 0o600 });
    return scratch;
  };

  let scratch = stage();
  try {
    renameSync(scratch, LOCKDIR);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "ENOTEMPTY" && code !== "EEXIST" && code !== "EACCES" && code !== "ENOTDIR") {
      discard(scratch);
      throw e;
    }
  }

  const owner = lockOwner();
  if (owner !== null && processRow(owner)) {
    discard(scratch); // genuinely held by a live starter
    return false;
  }

  // Orphaned by a crash. Move it aside; only one racer can win that rename.
  const stale = `${LOCKDIR}.stale-${process.pid}`;
  try {
    renameSync(LOCKDIR, stale);
    discard(stale);
  } catch {
    discard(scratch); // another racer broke it first — let the caller wait and retry
    return false;
  }
  try {
    renameSync(scratch, LOCKDIR);
    return true;
  } catch {
    discard(scratch);
    return false;
  }
}

/**
 * Release the lock only if it is still ours. A bare `rm -rf` here deletes a lock a DIFFERENT
 * process legitimately acquired after ours was broken or timed out — and `ensure()` now runs
 * in-process inside every agent's bridge, so concurrent starters are the normal case, not an edge.
 */
function releaseLock(): void {
  const owner = lockOwner();
  if (owner !== null && owner !== process.pid) return;
  discard(LOCKDIR);
}

/**
 * Wait longer than the work the lock protects.
 *
 * The holder keeps the lock for the whole of `waitHealthy`, so a fixed 20 s wait was shorter than
 * the 60 s start it was serializing: on a cold, slow first boot the second starter — another
 * `ebrain up`, or another agent's bridge auto-start — gave up and reported failure while the host
 * it was waiting for was seconds from being healthy.
 */
function lockWaitMs(): number {
  return startTimeoutMs() + 30_000;
}

async function withStartLock<T>(fn: () => Promise<T>, timeoutMs = lockWaitMs()): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (!tryAcquireLock()) {
    if (Date.now() > deadline) throw new Error("another 'ebrain daemon start' is holding the start lock");
    await Bun.sleep(200);
  }
  try {
    return await fn();
  } finally {
    releaseLock();
  }
}

// ── log ───────────────────────────────────────────────────────────────────

export function shouldRotate(sizeBytes: number, maxBytes = LOG_MAX_BYTES): boolean {
  return sizeBytes > maxBytes;
}

function rotateLogIfLarge(): void {
  try {
    if (!existsSync(LOG)) return;
    if (!shouldRotate(statSync(LOG).size)) return;
    renameSync(LOG, `${LOG}.1`);
  } catch { /* rotation is best effort; never block a start on it */ }
}

/**
 * Where the host's output actually is, which depends on who is running it. Every message that
 * tells a user where to look goes through this, so the product can never point at an empty file.
 */
export function logLocation(): string {
  return serviceManager() === "systemd" ? `journalctl --user -u ${SERVICE_LABEL} -n 50` : LOG;
}

function logTail(lines = 15): string {
  if (serviceManager() === "systemd") {
    const res = Bun.spawnSync(["journalctl", "--user", "-u", `${SERVICE_LABEL}.service`, "-n", String(lines), "--no-pager"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (res.exitCode === 0) return redactSecrets(res.stdout.toString().trim());
  }
  try {
    const text = readFileSync(LOG, "utf8").split("\n");
    return redactSecrets(text.slice(-lines).join("\n").trim());
  } catch {
    return "";
  }
}

// ── state ─────────────────────────────────────────────────────────────────

export type DaemonState = "up" | "starting" | "down";

export interface DaemonStatus {
  state: DaemonState;
  pid: number | null;
  port: number;
  healthy: boolean;
  url: string;
  detail: string;
  supervisor: ServiceManager;
  /** The installed unit points at a launcher that is no longer there. */
  supervisor_stale: boolean;
}

export async function status(): Promise<DaemonStatus> {
  const p = port();
  const pid = livePid({ reap: false });
  const healthy = await healthCheck(healthUrl(p), 3_000);
  const supervisor = serviceManager();
  const supervisor_stale = serviceUnitStale();
  const stale = supervisor_stale ? " · the installed service unit points at a launcher that no longer exists; re-run 'ebrain daemon install-service'" : "";
  const base = { pid, port: p, url: `http://127.0.0.1:${p}`, supervisor, supervisor_stale };
  if (healthy) {
    return { ...base, state: "up", healthy: true, detail: `daemon UP · :${p} healthy${stale}` };
  }
  if (pid !== null) {
    return { ...base, state: "starting", healthy: false, detail: `daemon process ${pid} is alive but :${p} is not answering /health yet${stale}` };
  }
  return { ...base, pid: null, state: "down", healthy: false, detail: `daemon DOWN${stale}` };
}

async function waitHealthy(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await healthCheck(healthUrl(port()), 2_000)) return true;
    await Bun.sleep(400);
  }
  return false;
}

// ── commands ──────────────────────────────────────────────────────────────

function spawnHost(): number {
  mkdirSync(CFG, { recursive: true, mode: 0o700 });
  mkdirSync(join(CFG, "wd"), { recursive: true, mode: 0o700 });
  rotateLogIfLarge();
  const launcher = launcherPath();
  if (!existsSync(launcher)) throw new Error(`launcher not found (${launcher})`);
  const fd = openSync(LOG, "a");
  // The host's stdout lands here, and host output is not something to leave world-readable.
  // `openSync` applies the umask, so a 0644 log survives on a default umask unless we say otherwise.
  try { chmodSync(LOG, 0o600); } catch { /* best effort */ }
  try {
    // `detached` calls setsid(2), so the host survives the shell, the harness and the agent
    // session that started it. The launcher execs the engine, so this PID stays the host's.
    const child = spawn(launcher, [], { detached: true, stdio: ["ignore", fd, fd] });
    child.unref();
    if (typeof child.pid !== "number") throw new Error("could not spawn the host process");
    writeFileSync(PIDFILE, `${child.pid}\n`, { mode: 0o600 });
    return child.pid;
  } finally {
    closeSync(fd);
  }
}

/**
 * When a service manager owns the host, it is the only thing allowed to start or stop it.
 * Two supervisors fighting over one process is worse than none: our SIGTERM becomes the
 * supervisor's cue to restart, and the user watches `stop` appear to do nothing.
 */
/**
 * Never inherit stdout here.
 *
 * `ensure()` runs IN-PROCESS inside every agent's stdio MCP bridge, where fd 1 is the JSON-RPC
 * framing channel — a stray line from `systemctl` there is not noise, it is a corrupted protocol
 * stream. The same fd carries the `--json` contracts the cockpit parses. The supervisor's output
 * is captured and handed back, so a caller that wants to show it can, at a moment of its choosing.
 */
function delegateToService(action: "start" | "stop" | "restart"): { handled: boolean; code: number; output: string } {
  const mgr = serviceManager();
  if (mgr === "none") return { handled: false, code: 0, output: "" };
  const run = (cmd: string[]) => {
    const res = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
    return {
      handled: true,
      code: res.exitCode ?? 1,
      output: redactSecrets(`${res.stdout?.toString() ?? ""}${res.stderr?.toString() ?? ""}`).trim(),
    };
  };
  if (mgr === "systemd") return run(["systemctl", "--user", action, `${SERVICE_LABEL}.service`]);
  const path = launchdPlistPath();
  if (action === "stop") return run(["launchctl", "unload", path]);
  if (action === "restart") Bun.spawnSync(["launchctl", "unload", path], { stdout: "ignore", stderr: "ignore" });
  return run(["launchctl", "load", path]);
}

export async function start(opts: { quiet?: boolean } = {}): Promise<DaemonStatus> {
  const delegated = delegateToService("start");
  if (delegated.handled) {
    // The supervisor's exit code is not the answer: `systemctl start` returns 0 for a unit that
    // then fails its own start, and returns non-zero without ever reaching the host. Either way
    // the guarantee in this file's header still has to hold — "started" means serving — so the
    // supervised path verifies health exactly like the direct one, and says why when it does not.
    await waitHealthy(startTimeoutMs());
    const s = await status();
    if (s.state !== "up") {
      const mgr = serviceManager();
      const tail = logTail();
      throw new Error(
        `the ${mgr} unit did not bring the host up on :${port()} within ${Math.round(startTimeoutMs() / 1000)}s` +
          (delegated.code !== 0 ? ` (${mgr} exited ${delegated.code})` : "") +
          (delegated.output ? `\n  ${mgr}: ${delegated.output.split("\n").join("\n  ")}` : "") +
          (mgr === "systemd" ? `\n  inspect it with: systemctl --user status ${SERVICE_LABEL}` : "") +
          (tail ? `\n  last lines from ${logLocation()}:\n${tail.split("\n").map((l) => `    ${l}`).join("\n")}` : ""),
      );
    }
    if (!opts.quiet) console.log(`ebrain daemon: ${s.detail} (managed by ${serviceManager()})`);
    return s;
  }
  return withStartLock(async () => {
    // Re-check inside the lock: whoever queued behind us may have started it already.
    const current = await status();
    if (current.state === "up") {
      if (!opts.quiet) console.log(`ebrain daemon: already running (PID ${current.pid ?? "?"}) · :${current.port}`);
      return current;
    }

    const self = [process.pid, process.ppid].filter((n): n is number => typeof n === "number");
    const foreign = findForeignStdioServes(psTable(), [...self, readPid() ?? -1]);
    if (foreign.length > 0) {
      throw new Error(
        `a per-agent 'serve' (stdio) holds the PGLite single-writer lock (PID ${foreign.map((f) => f.pid).join(", ")}).\n` +
          "  The HTTP host would block waiting for it. Close those MCP sessions first,\n" +
          "  then run 'ebrain daemon start' again.",
      );
    }

    if (!opts.quiet) console.log(`ebrain daemon: starting host on 127.0.0.1:${port()} …`);
    const pid = spawnHost();
    if (await waitHealthy(startTimeoutMs())) {
      const up = await status();
      if (!opts.quiet) console.log(`ebrain daemon: UP (PID ${up.pid ?? pid}) · log: ${logLocation()}`);
      return up;
    }

    // Never report a start that did not serve. Say why, with the host's own last words.
    const alive = processRow(pid) !== null;
    try { if (alive) process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
    try { rmSync(PIDFILE, { force: true }); } catch { /* best effort */ }
    const tail = logTail();
    throw new Error(
      `the host did not answer /health on :${port()} within ${Math.round(startTimeoutMs() / 1000)}s` +
        (alive ? " (the process was alive but never served — is the port already taken?)" : " (the process exited)") +
        (tail ? `\n  last lines from ${logLocation()}:\n${tail.split("\n").map((l) => `    ${l}`).join("\n")}` : ""),
    );
  });
}

export async function stop(opts: { quiet?: boolean } = {}): Promise<void> {
  const delegated = delegateToService("stop");
  if (delegated.handled) {
    // Verify, the way `start` does. A supervised stop that silently failed — no user D-Bus on a
    // headless box, a masked unit — used to print success and exit 0, which is what the installer's
    // upgrade guard relies on to know the old code is no longer serving.
    const mgr = serviceManager();
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (!(await healthCheck(healthUrl(port()), 2_000))) {
        if (!opts.quiet) console.log(`ebrain daemon: stopped through ${mgr}`);
        return;
      }
      await Bun.sleep(300);
    }
    throw new Error(
      `the ${mgr} unit did not stop the host — :${port()} is still answering` +
        (delegated.code !== 0 ? ` (${mgr} exited ${delegated.code})` : "") +
        (delegated.output ? `\n  ${mgr}: ${delegated.output.split("\n").join("\n  ")}` : "") +
        (mgr === "systemd" ? `\n  inspect it with: systemctl --user status ${SERVICE_LABEL}` : ""),
    );
  }
  const pid = livePid();
  if (pid === null) {
    try { rmSync(PIDFILE, { force: true }); } catch { /* best effort */ }
    if (!opts.quiet) console.log("ebrain daemon: not running");
    return;
  }
  try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (processRow(pid) === null) break;
    await Bun.sleep(250);
  }
  if (processRow(pid) !== null) {
    try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
  }
  // Only clear the claim we acted on. A concurrent `start` — and every agent's bridge can now
  // trigger one — may already have written a NEW pid here while we were waiting for the old
  // process to die; deleting that would strand a host nothing can find again. The start lock is
  // likewise not ours to release: `tryAcquireLock` already reclaims one orphaned by a crash.
  if (readPid() === pid) {
    try { rmSync(PIDFILE, { force: true }); } catch { /* best effort */ }
  }
  if (!opts.quiet) console.log("ebrain daemon: DOWN");
}

/**
 * The idempotent primitive every other surface should call: healthy already, or started
 * and healthy now. Safe to call from N agents at once — the start lock makes the losers
 * wait and then observe the winner's healthy host.
 */
export async function ensure(opts: { quiet?: boolean } = {}): Promise<DaemonStatus> {
  const current = await status();
  if (current.state === "up") return current;
  return start(opts);
}

// ── supervision ───────────────────────────────────────────────────────────
// Without a service manager the host has exactly one lifecycle: someone runs `ebrain up`. A
// reboot, an OOM kill or a crash therefore takes shared memory offline until a human notices —
// which, on the machine this was written on, took forty days. The units below are generated
// rather than shipped as files because they must carry the resolved launcher path; keeping the
// generators pure is also what makes them testable.

export type ServiceManager = "systemd" | "launchd" | "none";

export const SERVICE_LABEL = "ebrain-daemon";
export const LAUNCHD_LABEL = "dev.ebrain.daemon";

export function systemdUnit(launcher: string): string {
  return [
    "[Unit]",
    "Description=eBrain shared-brain host (MCP over loopback)",
    "Documentation=https://github.com/aedneth/ebrain",
    "After=network.target",
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=${launcher}`,
    // The host is the single writer for every agent's memory: if it dies, bring it back.
    "Restart=always",
    "RestartSec=5",
    // Opening a large PGLite store takes time; do not SIGKILL a clean shutdown.
    "TimeoutStopSec=30",
    // Laptop-friendly: never compete with interactive work.
    "Nice=5",
    // Output goes to the JOURNAL, deliberately. Redirecting to daemon.log instead would hand
    // systemd a long-lived fd on that file, which makes rotation-by-rename useless: the host
    // keeps writing to the unlinked inode and the log grows without bound in exactly the
    // long-running case supervision creates. The journal is already rotated by the OS. What this
    // costs is that daemon.log is not the place to look under systemd — so nothing in eBrain says
    // it is; `logLocation()` names journalctl whenever a systemd unit is in charge.
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

export function launchdPlist(launcher: string, log: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${LAUNCHD_LABEL}</string>`,
    "  <key>ProgramArguments</key>",
    `  <array><string>${launcher}</string></array>`,
    "  <key>RunAtLoad</key><true/>",
    "  <key>KeepAlive</key><true/>",
    "  <key>StandardOutPath</key>",
    `  <string>${log}</string>`,
    "  <key>StandardErrorPath</key>",
    `  <string>${log}</string>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

/**
 * Is this binary on PATH?
 *
 * It has to go through a shell: `command` is a shell BUILTIN, not an executable, so spawning it
 * directly does not return a non-zero exit code — it throws `Executable not found in $PATH`, and
 * the throw escapes before any fallback can run. That mistake made `install-service` fail on every
 * Linux machine and, once a plist existed, took the whole control plane down on macOS.
 */
function hasBinary(name: string): boolean {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return false; // never interpolate an unvetted name into a shell
  try {
    return Bun.spawnSync(["sh", "-c", `command -v ${name}`], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;
  } catch {
    return false;
  }
}

export function systemdUnitPath(home = HOME): string {
  return join(home, ".config", "systemd", "user", `${SERVICE_LABEL}.service`);
}

export function launchdPlistPath(home = HOME): string {
  return join(home, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

/** Which supervisor, if any, currently owns this host. */
export function serviceManager(): ServiceManager {
  if (process.platform === "darwin" && existsSync(launchdPlistPath()) && hasBinary("launchctl")) return "launchd";
  if (existsSync(systemdUnitPath()) && hasBinary("systemctl")) return "systemd";
  return "none";
}

/**
 * Does the installed unit still name a launcher that exists?
 *
 * `installService` bakes an absolute path resolved at install time, and nothing regenerates it.
 * Move or re-clone the checkout and the unit keeps pointing at a launcher that is gone — crash
 * recovery is silently disabled while every other check still reports green. Cheap to detect,
 * so it belongs in `status` rather than in a user's incident.
 */
export function serviceUnitStale(): boolean {
  const mgr = serviceManager();
  if (mgr === "none") return false;
  const unit = mgr === "launchd" ? launchdPlistPath() : systemdUnitPath();
  try {
    const text = readFileSync(unit, "utf8");
    const match = text.match(/ExecStart=(\S+)/) ?? text.match(/<array><string>([^<]+)<\/string>/);
    const referenced = match?.[1];
    return referenced ? !existsSync(referenced) : false;
  } catch {
    return false;
  }
}

function serviceIsActive(): boolean {
  const mgr = serviceManager();
  if (mgr === "systemd") {
    return Bun.spawnSync(["systemctl", "--user", "is-active", "--quiet", `${SERVICE_LABEL}.service`], {
      stdout: "ignore",
      stderr: "ignore",
    }).exitCode === 0;
  }
  if (mgr === "launchd") {
    const res = Bun.spawnSync(["launchctl", "list", LAUNCHD_LABEL], { stdout: "ignore", stderr: "ignore" });
    return res.exitCode === 0;
  }
  return false;
}

export interface InstallServiceResult {
  manager: ServiceManager;
  path: string;
  hint: string;
  /** True when a manually started host was stopped so the supervised one could take the port. */
  handed_over: boolean;
  healthy: boolean;
}

/**
 * Does an already-running host have to be stopped before a unit can take over?
 *
 * Only when something is running AND nothing is supervising it. A host already owned by systemd or
 * launchd is left alone: re-running install-service against an installed unit is an upgrade of the
 * unit file, and stopping there would interrupt a working daemon for no reason.
 */
export function needsHandover(state: DaemonState, supervisor: ServiceManager): boolean {
  return state !== "down" && supervisor === "none";
}

/**
 * Install a service unit and hand the running host over to it.
 *
 * The handover is the point. Anyone running this command is, by definition, on a machine where the
 * daemon is already running the way it has always run: started by hand. The unit is `Type=simple`
 * with `Restart=always`, so enabling it starts a SECOND host against a port and a PGLite lock the
 * first one still owns. That second process cannot bind, systemd restarts it five seconds later,
 * and the user has traded a working daemon for a crash loop — while being told the install
 * succeeded, because `systemctl enable --now` returns 0 for a unit that started and then died.
 *
 * So: stop the unsupervised host first, let the unit take the port, and confirm against /health
 * that something is actually serving before claiming supervision is in place.
 */
export async function installService(): Promise<InstallServiceResult> {
  const launcher = launcherPath();
  if (!existsSync(launcher)) throw new Error(`launcher not found (${launcher})`);

  // Only a host we are NOT already supervising needs handing over; re-running this command against
  // an installed unit is an upgrade of the unit file, and stopping there would be a pointless
  // interruption.
  const before = await status();
  const handOver = needsHandover(before.state, before.supervisor);
  if (handOver) await stop({ quiet: true });

  if (process.platform === "darwin") {
    const path = launchdPlistPath();
    mkdirSync(join(HOME, "Library", "LaunchAgents"), { recursive: true });
    writeFileSync(path, launchdPlist(launcher, LOG), { mode: 0o644 });
    Bun.spawnSync(["launchctl", "unload", path], { stdout: "ignore", stderr: "ignore" });
    const load = Bun.spawnSync(["launchctl", "load", path], { stdout: "pipe", stderr: "pipe" });
    if (load.exitCode !== 0) throw new Error(`launchctl load failed: ${load.stderr.toString().trim()}`);
    return {
      manager: "launchd", path, hint: `launchctl list ${LAUNCHD_LABEL}`,
      handed_over: handOver, healthy: await awaitSupervisedHealth(),
    };
  }

  if (!hasBinary("systemctl")) {
    throw new Error(
      "no supported service manager found (systemd on Linux, launchd on macOS).\n" +
        "  Start the host manually with 'ebrain daemon start', or add it to your session startup.",
    );
  }
  const path = systemdUnitPath();
  mkdirSync(join(HOME, ".config", "systemd", "user"), { recursive: true });
  writeFileSync(path, systemdUnit(launcher), { mode: 0o644 });
  Bun.spawnSync(["systemctl", "--user", "daemon-reload"], { stdout: "ignore", stderr: "ignore" });
  const enable = Bun.spawnSync(["systemctl", "--user", "enable", "--now", `${SERVICE_LABEL}.service`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (enable.exitCode !== 0) throw new Error(`systemctl enable failed: ${enable.stderr.toString().trim()}`);
  return {
    manager: "systemd", path, hint: `systemctl --user status ${SERVICE_LABEL}`,
    handed_over: handOver, healthy: await awaitSupervisedHealth(),
  };
}

/**
 * Wait for the supervised host to answer. `systemctl enable --now` exits 0 for a unit that started
 * and immediately died, so its exit code says the unit was accepted, not that anything is serving.
 */
async function awaitSupervisedHealth(timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await healthCheck(healthUrl(port()), 2_000)) return true;
    await Bun.sleep(500);
  }
  return false;
}

export function uninstallService(): { removed: boolean; path: string | null } {
  if (process.platform === "darwin" && existsSync(launchdPlistPath())) {
    const path = launchdPlistPath();
    Bun.spawnSync(["launchctl", "unload", path], { stdout: "ignore", stderr: "ignore" });
    rmSync(path, { force: true });
    return { removed: true, path };
  }
  const path = systemdUnitPath();
  if (!existsSync(path)) return { removed: false, path: null };
  Bun.spawnSync(["systemctl", "--user", "disable", "--now", `${SERVICE_LABEL}.service`], { stdout: "ignore", stderr: "ignore" });
  rmSync(path, { force: true });
  Bun.spawnSync(["systemctl", "--user", "daemon-reload"], { stdout: "ignore", stderr: "ignore" });
  return { removed: true, path };
}

function usage(): never {
  console.error("usage: ebrain daemon {start|stop|status|restart|ensure|install-service|uninstall-service} [--json] [--quiet]");
  process.exit(2);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv.find((a) => !a.startsWith("--")) ?? "status";
  const json = argv.includes("--json");
  // `--json` is a machine contract, so stdout carries the payload and nothing else. Progress
  // chatter alongside it would break every caller that parses this, the cockpit included.
  const quiet = argv.includes("--quiet") || json;

  switch (cmd) {
    case "status": {
      const s = await status();
      if (json) console.log(JSON.stringify(s, null, 2));
      else console.log(`ebrain daemon: ${s.detail}`);
      // 0 healthy · 4 alive but not serving · 3 down. `doctor` treats any non-zero as
      // "not up", which is the honest answer for a host that is not answering.
      process.exit(s.state === "up" ? 0 : s.state === "starting" ? 4 : 3);
      break;
    }
    case "start":
    case "ensure": {
      const s = cmd === "ensure" ? await ensure({ quiet }) : await start({ quiet });
      if (json) console.log(JSON.stringify(s, null, 2));
      break;
    }
    case "stop":
      await stop({ quiet });
      break;
    case "restart": {
      const delegated = delegateToService("restart");
      if (!delegated.handled) {
        await stop({ quiet });
        await start({ quiet });
        break;
      }
      // Verify, exactly like `start`. The installer's upgrade guard treats a non-zero restart as
      // fatal precisely so the old code cannot keep serving after an upgrade.
      const mgr = serviceManager();
      if (!(await waitHealthy(startTimeoutMs()))) {
        throw new Error(
          `the ${mgr} unit did not bring the host back on :${port()}` +
            (delegated.code !== 0 ? ` (${mgr} exited ${delegated.code})` : "") +
            (delegated.output ? `\n  ${mgr}: ${delegated.output.split("\n").join("\n  ")}` : "") +
            (mgr === "systemd" ? `\n  inspect it with: systemctl --user status ${SERVICE_LABEL}` : ""),
        );
      }
      if (!quiet) console.log(`ebrain daemon: restarted through ${mgr}`);
      break;
    }
    case "install-service": {
      const res = await installService();
      if (json) console.log(JSON.stringify(res, null, 2));
      else {
        console.log(`ebrain daemon: supervised by ${res.manager} · ${res.path}`);
        if (res.handed_over) console.log("  the manually started host was stopped so the supervised one could take the port");
        console.log(`  the host now starts at login and is restarted if it dies · check: ${res.hint}`);
        if (!res.healthy) {
          console.log(`  ⚠ nothing is answering /health yet · inspect: ${logLocation()}`);
        }
      }
      // A unit that was accepted but is not serving is not supervision in place; say so with the
      // exit code as well as on screen, so a script installing this does not report success.
      if (!res.healthy) process.exitCode = 1;
      break;
    }
    case "uninstall-service": {
      const res = uninstallService();
      if (json) console.log(JSON.stringify(res, null, 2));
      else console.log(res.removed ? `ebrain daemon: supervision removed (${res.path})` : "ebrain daemon: no service unit installed");
      break;
    }
    default:
      usage();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`ebrain daemon: ${redactSecrets(e instanceof Error ? e.message : String(e))}`);
    process.exit(1);
  });
}
