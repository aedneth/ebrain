/**
 * cli/daemon-control.test.ts — the daemon protocol, which previously had no coverage at all.
 *
 * Two halves. The pure half pins the process-identity discriminator against the exact rows
 * that defeated the old `pgrep -f` guard. The hermetic half runs the real control plane
 * under an isolated HOME against a fake engine, so start/stop/status/ensure are exercised
 * end to end without touching the operator's live brain.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";
import {
  findForeignStdioServes,
  isEngineServe,
  isHttpHost,
  isStdioServe,
  parsePidFile,
  parsePsTable,
  pidIsOurHost,
  shouldRotate,
  systemdUnit,
  launchdPlist,
  serviceManager,
  serviceUnitStale,
  logLocation,
  LOG_MAX_BYTES,

  needsHandover,} from "./daemon-control.ts";

const CONTROL = join(import.meta.dir, "daemon-control.ts");
const REPO = join(import.meta.dir, "..");

// ── pure: process identity ────────────────────────────────────────────────

describe("process identity", () => {
  // Row 0 and row 3 are the two false positives reproduced against the previous
  // `pgrep -f "cli.ts serve"` guard: a shell whose command line merely mentions the
  // pattern, and a process wearing the pattern as its argv. Both made `daemon start`
  // refuse with "close your MCP sessions first" when nothing was holding the lock.
  const TABLE = `  64551 bash     /bin/bash -c source /x/snapshot.sh && pgrep -f "cli.ts serve"
  64555 bun      bun run /x/vendor/gbrain/src/cli.ts serve --http --port 8541 --bind 127.0.0.1
  70001 bun      bun run /x/vendor/gbrain/src/cli.ts serve
  70002 sleep    bun run /x/vendor/gbrain/src/cli.ts serve --http --port 8541
  70003 bun      bun run /x/cli/mcp-bridge.ts`;

  const rows = parsePsTable(TABLE);

  test("parses a ps table with leading padding", () => {
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ pid: 64551, comm: "bash", args: `/bin/bash -c source /x/snapshot.sh && pgrep -f "cli.ts serve"` });
  });

  test("a shell that merely mentions the pattern is not an engine process", () => {
    expect(isEngineServe(rows[0])).toBe(false);
    expect(isStdioServe(rows[0])).toBe(false);
  });

  test("argv alone is not identity — comm must be a JS runtime", () => {
    expect(rows[3].args).toContain("cli.ts serve");
    expect(isEngineServe(rows[3])).toBe(false);
  });

  test("the shared HTTP host and a per-agent stdio serve are told apart", () => {
    expect(isHttpHost(rows[1])).toBe(true);
    expect(isStdioServe(rows[1])).toBe(false);
    expect(isStdioServe(rows[2])).toBe(true);
    expect(isHttpHost(rows[2])).toBe(false);
  });

  test("the bridge is not mistaken for a serve", () => {
    expect(isEngineServe(rows[4])).toBe(false);
  });

  test("only foreign stdio serves block a start, and never our own process tree", () => {
    expect(findForeignStdioServes(rows, []).map((r) => r.pid)).toEqual([70001]);
    expect(findForeignStdioServes(rows, [70001])).toEqual([]);
    // Our own HTTP host must never count as the thing holding the lock against us.
    expect(findForeignStdioServes(rows, []).some((r) => r.pid === 64555)).toBe(false);
  });
});

describe("pidfile claims", () => {
  test("garbage, empty and negative pidfiles are rejected", () => {
    expect(parsePidFile("not-a-pid")).toBeNull();
    expect(parsePidFile("   ")).toBeNull();
    expect(parsePidFile("-4")).toBeNull();
    expect(parsePidFile("0")).toBeNull();
    expect(parsePidFile("1234\n")).toBe(1234);
  });

  test("a live but unrelated process at the recorded PID is not our host", () => {
    // This is PID reuse: the daemon died, the number was handed to something else.
    const stranger = { pid: 1234, comm: "firefox", args: "/usr/lib/firefox/firefox" };
    expect(pidIsOurHost(stranger, "/home/u/.config/ebrain/ebrain-brain")).toBe(false);
    expect(pidIsOurHost(null, "/home/u/.config/ebrain/ebrain-brain")).toBe(false);
  });

  test("the launcher counts as ours during the window before it execs the engine", () => {
    const launcher = "/home/u/.config/ebrain/ebrain-brain";
    expect(pidIsOurHost({ pid: 9, comm: "bash", args: launcher }, launcher)).toBe(true);
    expect(pidIsOurHost({ pid: 9, comm: "bun", args: "bun run /x/cli.ts serve --http" }, launcher)).toBe(true);
  });
});

describe("supervision units", () => {
  const LAUNCHER = "/home/u/.config/ebrain/ebrain-brain";

  test("the systemd unit restarts a host that dies — the whole point of installing it", () => {
    const unit = systemdUnit(LAUNCHER);
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("RestartSec=");
    expect(unit).toContain("WantedBy=default.target"); // starts at login, so a reboot recovers
    expect(unit).toContain(`ExecStart=${LAUNCHER}`);
  });

  test("the systemd unit does NOT redirect output to daemon.log", () => {
    // Redirecting would hand systemd a long-lived fd on that file, which makes rotation-by-rename
    // useless: the host keeps writing to the unlinked inode and the log grows without bound in
    // exactly the long-running case supervision creates. The journal is rotated by the OS, so the
    // output goes there and `logLocation()` points the user at journalctl instead.
    const unit = systemdUnit(LAUNCHER);
    expect(unit).not.toContain("StandardOutput=");
    expect(unit).not.toContain("StandardError=");
    expect(logLocation()).toBe(join(homedir(), ".config", "ebrain", "daemon.log")); // unsupervised here
  });

  test("the launchd plist keeps the host alive and captures its output", () => {
    const plist = launchdPlist(LAUNCHER, "/home/u/.config/ebrain/daemon.log");
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain(LAUNCHER);
    expect(plist).toContain("StandardErrorPath");
  });

  test("with no unit installed there is nothing to be stale about", () => {
    expect(serviceManager()).toBe("none");
    expect(serviceUnitStale()).toBe(false);
  });

  // The test above passes for the wrong reason on its own: `existsSync` short-circuits before the
  // PATH lookup, so it never exercised the code that decides WHICH supervisor is in play. That gap
  // hid a defect which made `install-service` fail on every machine — the binary probe spawned the
  // shell BUILTIN `command` directly, which throws rather than returning non-zero. A HOME that
  // actually contains a unit is the only shape that reaches it.
  test("a HOME that HAS a unit is inspected, not thrown on", () => {
    const home = mkdtempSync(join(tmpdir(), "ebrain-unit-"));
    SANDBOXES.push(home);
    mkdirSync(join(home, ".config", "systemd", "user"), { recursive: true });
    writeFileSync(
      join(home, ".config", "systemd", "user", "ebrain-daemon.service"),
      "[Service]\nExecStart=/nonexistent/ebrain-brain\n",
    );
    const probe = Bun.spawnSync(
      ["bun", "-e", 'import {serviceManager, serviceUnitStale} from "./cli/daemon-control.ts"; console.log(JSON.stringify({mgr: serviceManager(), stale: serviceUnitStale()}))'],
      { cwd: REPO, env: { ...(process.env as Record<string, string>), HOME: home }, stdout: "pipe", stderr: "pipe" },
    );
    expect(probe.stderr.toString()).not.toContain("Executable not found");
    expect(probe.exitCode).toBe(0);
    const out = JSON.parse(probe.stdout.toString().trim());
    expect(out.mgr).toBe("systemd");
    // The unit names a launcher that is not there, which is exactly the silently-disabled
    // crash-recovery state `status` has to surface.
    expect(out.stale).toBe(true);
  }, 20_000);
});

describe("log rotation", () => {
  test("rotates only past the cap", () => {
    expect(shouldRotate(LOG_MAX_BYTES + 1)).toBe(true);
    expect(shouldRotate(LOG_MAX_BYTES)).toBe(false);
    expect(shouldRotate(0)).toBe(false);
  });
});

// ── hermetic: the real control plane against a fake engine ────────────────

const SANDBOXES: string[] = [];

afterAll(() => {
  for (const dir of SANDBOXES) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

interface Sandbox {
  home: string;
  cfg: string;
  port: number;
  env: Record<string, string>;
}

/**
 * An isolated HOME with a fake engine that answers /health, reached through a launcher
 * shaped exactly like the real one — it execs `bun run <...>/cli.ts serve --http`, so the
 * identity check under test is the real one and not a weakened stand-in.
 */
function sandbox(port: number, opts: { serves?: boolean } = {}): Sandbox {
  const base = mkdtempSync(join(tmpdir(), "ebrain-daemon-"));
  SANDBOXES.push(base);
  const home = join(base, "home");
  const cfg = join(home, ".config", "ebrain");
  const engineDir = join(base, "engine");
  mkdirSync(cfg, { recursive: true });
  mkdirSync(join(cfg, "wd"), { recursive: true });
  mkdirSync(engineDir, { recursive: true });

  const serves = opts.serves !== false;
  writeFileSync(
    join(engineDir, "cli.ts"),
    serves
      ? `const port = Number(process.argv[process.argv.indexOf("--port") + 1]);\n` +
        `Bun.serve({ port, hostname: "127.0.0.1", fetch(req) {\n` +
        `  return new URL(req.url).pathname === "/health" ? new Response("ok") : new Response("no", { status: 404 });\n` +
        `} });\n` +
        `setInterval(() => {}, 1 << 30);\n`
      : // Alive, but never binds: the case a liveness-only check reports as a successful start.
        `setInterval(() => {}, 1 << 30);\n`,
  );

  const launcher = join(cfg, "ebrain-brain");
  writeFileSync(
    launcher,
    `#!/usr/bin/env bash\nset -euo pipefail\nexec bun run ${JSON.stringify(join(engineDir, "cli.ts"))} serve --http --port ${port} --bind 127.0.0.1\n`,
    { mode: 0o755 },
  );
  chmodSync(launcher, 0o755);

  return {
    home,
    cfg,
    port,
    env: {
      ...(process.env as Record<string, string>),
      HOME: home,
      EBRAIN_HOME: REPO,
      EBRAIN_BRAIN_PORT: String(port),
      EBRAIN_DAEMON_START_TIMEOUT_MS: "15000",
    },
  };
}

function ctl(box: Sandbox, args: string[], envOverride: Record<string, string> = {}) {
  const proc = Bun.spawnSync(["bun", "run", CONTROL, ...args], {
    env: { ...box.env, ...envOverride },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

function stopQuietly(box: Sandbox): void {
  try { ctl(box, ["stop", "--quiet"]); } catch { /* teardown is best effort */ }
}

describe("daemon control (hermetic)", () => {
  test("a clean machine reports DOWN with the exit code doctor reads", () => {
    const box = sandbox(18571);
    const s = ctl(box, ["status"]);
    expect(s.code).toBe(3);
    expect(s.stdout).toContain("DOWN");
  });

  test("start waits for /health, records the host, and stop takes it down", () => {
    const box = sandbox(18572);
    try {
      const started = ctl(box, ["start"]);
      expect(started.code).toBe(0);
      expect(started.stdout).toContain("UP");

      const status = ctl(box, ["status", "--json"]);
      expect(status.code).toBe(0);
      const parsed = JSON.parse(status.stdout);
      expect(parsed.state).toBe("up");
      expect(parsed.healthy).toBe(true);
      expect(parsed.pid).toBeGreaterThan(0);

      const stopped = ctl(box, ["stop"]);
      expect(stopped.code).toBe(0);
      expect(ctl(box, ["status"]).code).toBe(3);
      expect(existsSync(join(box.cfg, "ebrain-brain.pid"))).toBe(false);
    } finally {
      stopQuietly(box);
    }
  }, 40_000);

  test("a start that never serves fails loudly instead of reporting UP", () => {
    // The regression that matters: the previous control slept one second and checked only
    // that the PID was alive, so a host that never bound its port was announced as UP.
    const box = sandbox(18573, { serves: false });
    try {
      const started = ctl(box, ["start"], { EBRAIN_DAEMON_START_TIMEOUT_MS: "3000" });
      expect(started.code).toBe(1);
      expect(started.stderr).toContain("did not answer /health");
      expect(started.stdout).not.toContain("UP");
      expect(ctl(box, ["status"]).code).not.toBe(0);
    } finally {
      stopQuietly(box);
    }
  }, 30_000);

  test("a recycled PID in the pidfile does not report a dead daemon as UP", () => {
    const box = sandbox(18574);
    // A live process that is emphatically not our host, standing in for PID reuse.
    const stranger = Bun.spawn(["sleep", "30"], { stdout: "ignore", stderr: "ignore" });
    try {
      writeFileSync(join(box.cfg, "ebrain-brain.pid"), `${stranger.pid}\n`);
      const s = ctl(box, ["status"]);
      expect(s.code).toBe(3);
      expect(s.stdout).toContain("DOWN");

      // And the stale claim must not block a real start.
      const started = ctl(box, ["start"]);
      expect(started.code).toBe(0);
      expect(Number(readFileSync(join(box.cfg, "ebrain-brain.pid"), "utf8").trim())).not.toBe(stranger.pid);
    } finally {
      stranger.kill();
      stopQuietly(box);
    }
  }, 40_000);

  test("N concurrent starts produce exactly one host", async () => {
    const box = sandbox(18575);
    try {
      const runs = await Promise.all(
        [0, 1, 2, 3].map(async () => {
          const proc = Bun.spawn(["bun", "run", CONTROL, "start", "--quiet"], {
            env: box.env,
            stdout: "pipe",
            stderr: "pipe",
          });
          const code = await proc.exited;
          return { code, stderr: await new Response(proc.stderr).text() };
        }),
      );

      for (const r of runs) expect(r.code).toBe(0);

      // One healthy host, and every racer converged on the same recorded PID.
      const status = JSON.parse(ctl(box, ["status", "--json"]).stdout);
      expect(status.state).toBe("up");

      const hosts = Bun.spawnSync(["ps", "-eo", "pid=,comm=,args="], { stdout: "pipe" }).stdout.toString();
      const mine = parsePsTable(hosts).filter((r) => isHttpHost(r) && r.args.includes(`--port ${box.port}`));
      expect(mine).toHaveLength(1);
      expect(mine[0].pid).toBe(status.pid);
    } finally {
      stopQuietly(box);
    }
  }, 60_000);

  test("ensure is idempotent and is what callers should use", () => {
    const box = sandbox(18576);
    try {
      const first = ctl(box, ["ensure", "--json"]);
      expect(first.code).toBe(0);
      expect(JSON.parse(first.stdout).state).toBe("up");

      const second = ctl(box, ["ensure", "--json"]);
      expect(second.code).toBe(0);
      const parsed = JSON.parse(second.stdout);
      expect(parsed.state).toBe("up");
      expect(parsed.pid).toBe(JSON.parse(first.stdout).pid);
    } finally {
      stopQuietly(box);
    }
  }, 40_000);

  test("stop on a machine that is already down is a clean no-op", () => {
    const box = sandbox(18577);
    const stopped = ctl(box, ["stop"]);
    expect(stopped.code).toBe(0);
    expect(stopped.stdout).toContain("not running");
  });

  test("an unknown subcommand is a usage error, not a crash", () => {
    const box = sandbox(18578);
    const res = ctl(box, ["frobnicate"]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("usage:");
  });
});

// ── install-service hands over rather than racing the host that is already running ──
describe("needsHandover", () => {
  test("stops an unsupervised host, because the unit would otherwise fight it for the port", () => {
    // This is the state anyone is in when they decide to install supervision: the daemon is up,
    // started by hand. The unit is Type=simple with Restart=always, so enabling it starts a second
    // host against a port and a PGLite lock the first still owns — a crash loop every five seconds,
    // reported as a successful install because `systemctl enable --now` exits 0 for a unit that
    // started and then died.
    expect(needsHandover("up", "none")).toBe(true);
    expect(needsHandover("starting", "none")).toBe(true);
  });

  test("leaves a host that is already supervised alone", () => {
    // Re-running install-service against an installed unit is an upgrade of the unit file. Stopping
    // a working supervised daemon to reinstall its own unit would be an interruption for nothing.
    for (const manager of ["systemd", "launchd"] as const) {
      expect(needsHandover("up", manager)).toBe(false);
      expect(needsHandover("starting", manager)).toBe(false);
    }
  });

  test("has nothing to hand over when nothing is running", () => {
    expect(needsHandover("down", "none")).toBe(false);
    expect(needsHandover("down", "systemd")).toBe(false);
  });
});
