/**
 * cli/install.test.ts — G56-R1: the plug-and-play installer.
 *
 * Hermetic: an isolated temporary HOME, a LOCAL source repo (cloned like the real thing), and a
 * fake `bun` on PATH so nothing is downloaded and no daemon starts (EBRAIN_SKIP_GBRAIN / SKIP_UP).
 * Runs the installer twice to prove idempotence, verifies the launcher wiring, and asserts no
 * secret-bearing config is created.
 */
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const INSTALL_SH = join(import.meta.dir, "..", "scripts", "install.sh");

function sh(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
  const proc = Bun.spawnSync([cmd, ...args], {
    cwd: opts.cwd,
    env: opts.env ?? (process.env as Record<string, string>),
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

function makeSourceRepo(dir: string): void {
  mkdirSync(join(dir, "cli"), { recursive: true });
  writeFileSync(join(dir, "cli", "ebrain"), "#!/usr/bin/env bash\necho ebrain-stub \"$@\"\n", { mode: 0o755 });
  chmodSync(join(dir, "cli", "ebrain"), 0o755);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "ebrain", version: "0.1.0", dependencies: {} }) + "\n");
  writeFileSync(join(dir, "bun.lock"), "{}\n");
  const git = (...a: string[]) => sh("git", ["-C", dir, "-c", "user.email=t@t.dev", "-c", "user.name=t", ...a]);
  expect(sh("git", ["init", "-b", "main", dir]).code).toBe(0);
  expect(git("add", "-A").code).toBe(0);
  expect(git("commit", "-q", "-m", "init").code).toBe(0);
}

function fakeBun(dir: string): string {
  const bin = join(dir, "fakebin");
  mkdirSync(bin, { recursive: true });
  const bun = join(bin, "bun");
  writeFileSync(bun, "#!/bin/sh\ncase \"$1\" in --version) echo 1.3.14;; install) exit 0;; *) exit 0;; esac\n", { mode: 0o755 });
  chmodSync(bun, 0o755);
  return bin;
}

describe("installer (scripts/install.sh)", () => {
  test("installs idempotently under an isolated HOME, wires the launcher, leaves no secrets", () => {
    const base = mkdtempSync(join(tmpdir(), "ebrain-install-"));
    try {
      const home = join(base, "home");
      const src = join(base, "src");
      const ebrainHome = join(home, "eBrain");
      const binDir = join(home, "bin");
      mkdirSync(home, { recursive: true });
      makeSourceRepo(src);
      const bin = fakeBun(base);

      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        HOME: home,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        EBRAIN_REPO: src,
        EBRAIN_REF: "main",
        EBRAIN_HOME: ebrainHome,
        EBRAIN_BIN_DIR: binDir,
        EBRAIN_SKIP_GBRAIN: "1",
        EBRAIN_SKIP_UP: "1",
      };

      // First install: clones the source, installs deps (fake), links the launcher.
      const first = sh("sh", [INSTALL_SH], { env });
      expect(first.code).toBe(0);

      const launcher = join(binDir, "ebrain");
      expect(existsSync(launcher)).toBe(true);
      expect(existsSync(join(ebrainHome, "cli", "ebrain"))).toBe(true);
      const launcherText = readFileSync(launcher, "utf8");
      expect(launcherText).toContain("cli/ebrain");
      expect(launcherText).toContain(ebrainHome);

      // The launcher actually dispatches into the checkout.
      const dispatched = sh("bash", [launcher, "hello"], { env });
      expect(dispatched.code).toBe(0);
      expect(dispatched.stdout).toContain("ebrain-stub");

      // No secret-bearing config was created by the installer.
      expect(existsSync(join(ebrainHome, ".env"))).toBe(false);
      expect(existsSync(join(home, ".config", "ebrain", ".env"))).toBe(false);
      expect(launcherText).not.toMatch(/gbrain_[A-Za-z0-9]/);

      // Second install on the same HOME: idempotent, still healthy.
      const second = sh("sh", [INSTALL_SH], { env });
      expect(second.code).toBe(0);
      expect(existsSync(launcher)).toBe(true);
      expect(readFileSync(launcher, "utf8")).toContain(ebrainHome);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 30_000); // real git clone + double install: generous timeout so a cold CI runner can't flake (F-CF-1)

  test("--name installs the launcher under a custom binary name", () => {
    const base = mkdtempSync(join(tmpdir(), "ebrain-install-name-"));
    try {
      const home = join(base, "home");
      const src = join(base, "src");
      const ebrainHome = join(home, "eBrain");
      const binDir = join(home, "bin");
      mkdirSync(home, { recursive: true });
      makeSourceRepo(src);
      const bin = fakeBun(base);
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        HOME: home,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        EBRAIN_REPO: src,
        EBRAIN_REF: "main",
        EBRAIN_HOME: ebrainHome,
        EBRAIN_BIN_DIR: binDir,
        EBRAIN_SKIP_GBRAIN: "1",
        EBRAIN_SKIP_UP: "1",
      };
      const res = sh("sh", [INSTALL_SH, "--name", "eb"], { env });
      expect(res.code).toBe(0);
      expect(existsSync(join(binDir, "eb"))).toBe(true);
      expect(existsSync(join(binDir, "ebrain"))).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 30_000);
});

// ── the PUBLISHED quickstart, executed verbatim ───────────────────────────────────────────────
// The F7-F12 audit found the README / docs install sequence failing at step 4 (exit 1): it clones
// into a directory of the user's choosing, but --from-source only accepted a checkout at
// $HOME/eBrain. The suite missed it because every other case sets EBRAIN_HOME explicitly, which is
// exactly what a real reader does not do. This test therefore sets no EBRAIN_HOME at all.
describe("published quickstart sequence", () => {
  test("clone into an arbitrary directory + --from-source succeeds with no EBRAIN_HOME set", () => {
    const base = mkdtempSync(join(tmpdir(), "ebr-quickstart-"));
    try {
      const home = join(base, "home");
      const src = join(base, "src");
      const workdir = join(home, "projects"); // the user is standing anywhere, not in $HOME
      const binDir = join(home, ".local", "bin");
      mkdirSync(workdir, { recursive: true });
      mkdirSync(binDir, { recursive: true });

      // A source repo that carries the REAL installer, so this exercises shipped behavior.
      makeSourceRepo(src);
      mkdirSync(join(src, "scripts"), { recursive: true });
      writeFileSync(join(src, "scripts", "install.sh"), readFileSync(INSTALL_SH, "utf8"), { mode: 0o755 });
      chmodSync(join(src, "scripts", "install.sh"), 0o755);
      const git = (...a: string[]) => sh("git", ["-C", src, "-c", "user.email=t@t.dev", "-c", "user.name=t", ...a]);
      expect(git("add", "-A").code).toBe(0);
      expect(git("commit", "-q", "-m", "add installer").code).toBe(0);

      const bin = fakeBun(base);
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        HOME: home,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        EBRAIN_BIN_DIR: binDir,
        EBRAIN_SKIP_GBRAIN: "1",
        EBRAIN_SKIP_UP: "1",
      };
      delete env.EBRAIN_HOME; // the published sequence never sets it — that is the whole point

      // Documented line 1: git clone <repo> ebrain
      expect(sh("git", ["clone", "--quiet", src, "ebrain"], { cwd: workdir, env }).code).toBe(0);
      const checkout = join(workdir, "ebrain");

      // Documented line 4: ./scripts/install.sh --from-source (run from inside the checkout)
      const res = sh("sh", ["./scripts/install.sh", "--from-source"], { cwd: checkout, env });
      expect(res.stderr).not.toContain("expects an existing checkout");
      expect(res.code).toBe(0);

      // The launcher must point at the checkout the user actually made, not at $HOME/eBrain.
      const launcher = readFileSync(join(binDir, "ebrain"), "utf8");
      expect(launcher).toContain(checkout);
      expect(launcher).not.toContain(join(home, "eBrain"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 30_000);
});

// Pass-3 finding F-P3: the block above proved the installer's LOGIC and still shipped a quickstart
// that fails on line one, because `scripts/install.sh` was tracked at mode 100644 while the docs
// say `./scripts/install.sh`. Two habits hid it: the fixture wrote its own copy with a forced
// chmod 755, and the invocation was `sh ["./scripts/install.sh"]` — naming the interpreter
// bypasses the executable bit that a real reader depends on.
//
// So these tests take the artifact, not a copy of its contents: a real clone of the real HEAD,
// executed the way the documentation says to execute it.
const REPO_ROOT = join(import.meta.dir, "..");

describe("the shipped artifact, not a copy of it", () => {
  test("every script the published docs tell a reader to execute is tracked executable", () => {
    // Derived from the docs rather than hand-listed, so documenting a new `./script.sh` command
    // brings it under this guarantee automatically instead of silently escaping it.
    const docs = sh("git", ["-C", REPO_ROOT, "ls-files", "README.md", "CONTRIBUTING.md", "SECURITY.md", "docs/"]);
    expect(docs.code).toBe(0);

    const documented = new Set<string>();
    for (const rel of docs.stdout.split("\n").filter((l) => l.endsWith(".md"))) {
      const text = readFileSync(join(REPO_ROOT, rel), "utf8");
      for (const m of text.matchAll(/(?:^|[\s`("'])\.\/([\w./-]+\.sh)\b/g)) documented.add(m[1]!);
    }
    // The quickstart's own entrypoint must be in there; if a docs rewrite drops it, this test would
    // otherwise pass by checking nothing at all.
    expect(documented).toContain("scripts/install.sh");

    const notExecutable: string[] = [];
    for (const rel of [...documented].sort()) {
      const entry = sh("git", ["-C", REPO_ROOT, "ls-files", "-s", "--", rel]);
      if (!entry.stdout.trim()) continue; // documented but untracked (e.g. a user-created file)
      const mode = entry.stdout.trim().split(/\s+/)[0];
      if (mode !== "100755") notExecutable.push(`${rel} is tracked ${mode}, but the docs say ./${rel}`);
    }
    expect(notExecutable).toEqual([]);
  });

  test("a fresh clone of HEAD runs the documented command with no chmod and no interpreter named", () => {
    const base = mkdtempSync(join(tmpdir(), "ebr-artifact-"));
    try {
      const home = join(base, "home");
      const binDir = join(home, ".local", "bin");
      const checkout = join(base, "clone");
      mkdirSync(binDir, { recursive: true });

      // `checkout-index` materializes the tracked tree with its recorded modes — what a stranger
      // gets from `git clone`. Deliberately the index and not HEAD: a mode fix must be verifiable
      // before it is committed, or the test can only tell you about a mistake you already shipped.
      mkdirSync(checkout, { recursive: true });
      expect(sh("git", ["-C", REPO_ROOT, "checkout-index", "-a", "-f", `--prefix=${checkout}/`]).code).toBe(0);

      const bin = fakeBun(base);
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        HOME: home,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        EBRAIN_BIN_DIR: binDir,
        EBRAIN_SKIP_GBRAIN: "1",
        EBRAIN_SKIP_UP: "1",
      };
      delete env.EBRAIN_HOME;

      // Exactly what the README and docs/getting-started/install.md print — no `sh` prefix.
      const res = sh(join(checkout, "scripts", "install.sh"), ["--from-source"], { cwd: checkout, env });
      expect(res.stderr).not.toContain("Permission denied");
      expect(res.code).toBe(0);
      expect(readFileSync(join(binDir, "ebrain"), "utf8")).toContain(checkout);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 60_000);

  // Pass-3 finding F-P4: cloning the pinned engine is not installing it. The CLI's MCP bridge
  // imports the engine's modules directly, so `ebrain up` — the first command in the quickstart —
  // died with "Cannot find module" on any machine that had not installed them by hand. Every
  // existing test set EBRAIN_SKIP_GBRAIN=1, so the whole engine branch was untested; CI passed
  // only because the workflow installs that lockfile in a step of its own that the installer
  // never performed.
  test("the engine's own dependencies are installed, not just cloned", () => {
    const base = mkdtempSync(join(tmpdir(), "ebr-engine-"));
    try {
      const home = join(base, "home");
      const src = join(base, "src");
      const engine = join(base, "engine");
      const ebrainHome = join(home, "eBrain");
      const log = join(base, "bun-calls.log");
      mkdirSync(home, { recursive: true });
      makeSourceRepo(src);

      // A stand-in for the pinned upstream engine: a real repo with its own package.json.
      mkdirSync(engine, { recursive: true });
      writeFileSync(join(engine, "package.json"), JSON.stringify({ name: "gbrain", version: "0.0.0" }) + "\n");
      const egit = (...a: string[]) => sh("git", ["-C", engine, "-c", "user.email=t@t.dev", "-c", "user.name=t", ...a]);
      expect(sh("git", ["init", "-b", "main", engine]).code).toBe(0);
      expect(egit("add", "-A").code).toBe(0);
      expect(egit("commit", "-q", "-m", "engine").code).toBe(0);
      const engineRef = sh("git", ["-C", engine, "rev-parse", "HEAD"]).stdout.trim();

      // A fake bun that records the directory each install ran in — the whole question here.
      const bin = join(base, "fakebin");
      mkdirSync(bin, { recursive: true });
      writeFileSync(
        join(bin, "bun"),
        `#!/bin/sh\ncase "$1" in --version) echo 1.3.14;; install) printf '%s\\n' "$PWD" >> ${log};; esac\nexit 0\n`,
        { mode: 0o755 },
      );
      chmodSync(join(bin, "bun"), 0o755);

      const res = sh("sh", [INSTALL_SH], {
        env: {
          ...(process.env as Record<string, string>),
          HOME: home,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          EBRAIN_REPO: src,
          EBRAIN_REF: "main",
          EBRAIN_HOME: ebrainHome,
          EBRAIN_BIN_DIR: join(home, "bin"),
          GBRAIN_REPO: engine,
          GBRAIN_REF: engineRef,
          EBRAIN_SKIP_UP: "1",
        },
      });
      expect(res.code).toBe(0);

      const ranIn = readFileSync(log, "utf8").split("\n").filter(Boolean);
      expect(ranIn).toContain(ebrainHome);
      expect(ranIn).toContain(join(ebrainHome, "vendor", "gbrain"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 60_000);
});
