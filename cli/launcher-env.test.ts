// cli/launcher-env.test.ts — invariant I2 of docs/SPEC-PORTABILITY-HARDENING.md:
// the resolved checkout must survive the process boundary between a shell launcher and the `bun`
// process it execs into.
//
// Pass 5 (F-S1) found this open. Every launcher resolved the checkout correctly and assigned it to a
// plain shell variable; a plain assignment is not inherited by a child process, so `cli/up.ts` — the
// module that writes the MCP command string into every agent's config — read back `undefined` and
// guessed `$HOME/eBrain`. On the author's machine that guess is right, which is why four passes and a
// green suite never saw it.
//
// These tests deliberately do not unit-test the resolver function. They spawn the SHIPPED launcher
// scripts, extracted from the git index, from a checkout at an arbitrary path, under a sandboxed
// $HOME, with EBRAIN_HOME absent from the ancestry — and assert what a real child process observes.

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, chmodSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

let checkout = "";
let sandboxHome = "";
let fakeBinDir = "";

/** The shipped artifact, not the working tree: same discipline pass 3 forced on install.sh. */
function extractShippedCheckout(dest: string): void {
  const res = spawnSync("git", ["-C", REPO_ROOT, "checkout-index", "-a", "-f", `--prefix=${dest}/`], {
    encoding: "utf8",
  });
  if (res.status !== 0) throw new Error(`git checkout-index failed: ${res.stderr}`);
}

/**
 * A stand-in for the interpreter. It is NOT a copy of any eBrain logic — it only reports what the
 * environment looked like at the moment the launcher handed control to its child, which is precisely
 * the boundary under test.
 */
function installFakeBun(binDir: string): void {
  mkdirSync(binDir, { recursive: true });
  const fake = join(binDir, "bun");
  writeFileSync(
    fake,
    [
      "#!/usr/bin/env bash",
      // Report the inherited value (empty if the launcher failed to export) and the argv it was
      // asked to run, so a wrong path in either place is visible.
      'printf "INHERITED_EBRAIN_HOME=%s\\n" "${EBRAIN_HOME-<unset>}"',
      'printf "ARGV=%s\\n" "$*"',
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  chmodSync(fake, 0o755);
}

beforeAll(() => {
  const base = mkdtempSync(join(tmpdir(), "ebrain-launcher-"));
  // An arbitrary path that is emphatically not $HOME/eBrain.
  checkout = join(base, "some", "where", "else", "project-checkout");
  mkdirSync(dirname(checkout), { recursive: true });
  extractShippedCheckout(checkout);
  sandboxHome = join(base, "sandbox-home");
  mkdirSync(join(sandboxHome, ".config"), { recursive: true });
  fakeBinDir = join(base, "fakebin");
  installFakeBun(fakeBinDir);
});

afterAll(() => {
  if (checkout) rmSync(join(checkout, "..", "..", "..", ".."), { recursive: true, force: true });
});

/** Run a shipped launcher with nothing inherited: no EBRAIN_HOME, a sandboxed HOME, C locale. */
function runLauncher(relPath: string, args: string[] = []): { stdout: string; stderr: string; status: number | null } {
  const res = spawnSync(join(checkout, relPath), args, {
    encoding: "utf8",
    cwd: checkout,
    env: {
      PATH: `${fakeBinDir}:/usr/bin:/bin`,
      HOME: sandboxHome,
      LC_ALL: "C",
      LANG: "C",
      // BUN_BIN is how the launchers locate the interpreter; point it at the reporter.
      BUN_BIN: join(fakeBinDir, "bun"),
    },
  });
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", status: res.status };
}

/** Every shipped launcher that resolves the location and then hands off to an interpreter. */
function launchersThatExecIntoBun(): string[] {
  const scriptsDir = join(REPO_ROOT, "scripts");
  const out: string[] = [];
  for (const name of readdirSync(scriptsDir)) {
    const p = join(scriptsDir, name);
    let src = "";
    try {
      src = readFileSync(p, "utf8");
    } catch {
      continue; // a directory (scripts/systemd) or an unreadable entry
    }
    if (src.includes("ebrain_resolve_home") || src.includes("ebrain_export_home")) {
      out.push(join("scripts", name));
    }
  }
  return out.sort();
}

describe("I2 — the resolved location crosses the process boundary", () => {
  test("there is a non-trivial set of launchers under test", () => {
    // Guards against this whole file silently passing because the discovery returned nothing.
    expect(launchersThatExecIntoBun().length).toBeGreaterThanOrEqual(10);
  });

  test("every launcher exports the resolved location, not just assigns it", () => {
    const offenders: string[] = [];
    for (const rel of launchersThatExecIntoBun()) {
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      const exportsIt =
        /\bebrain_export_home\b/.test(src) ||
        /\bexport\s+EBRAIN_HOME\b/.test(src) ||
        /\bexport\s+-p?\s*EBRAIN_HOME\b/.test(src);
      if (!exportsIt) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  test("ebrain-up hands the real checkout to its child, from an arbitrary path under a foreign HOME", () => {
    const { stdout } = runLauncher("scripts/ebrain-up", ["--help"]);
    expect(stdout).toContain(`INHERITED_EBRAIN_HOME=${checkout}`);
    // The exec argument must point into the same checkout — a right argv with a wrong environment is
    // exactly the half-correct state F-S1 described.
    expect(stdout).toContain(`ARGV=`);
    expect(stdout).toContain(join(checkout, "cli"));
    expect(stdout).not.toContain(join(sandboxHome, "eBrain"));
  });

  test("the MCP bridge launcher — the one every agent spawns — does the same", () => {
    const { stdout } = runLauncher("scripts/ebrain-mcp-bridge");
    expect(stdout).toContain(`INHERITED_EBRAIN_HOME=${checkout}`);
    expect(stdout).not.toContain(join(sandboxHome, "eBrain"));
  });

  test("a launcher symlinked onto PATH still finds its own checkout (F-S3)", () => {
    // The resolver's doc comment promised symlink resolution, but the SOURCING line ran first and
    // used the symlink's own directory — so `../harness/core/ebrain-home.sh` did not exist and the
    // launcher died before the resolver could resolve anything. Symlinking a launcher onto PATH is
    // the obvious thing a user does after cloning, so this failed for exactly the person the
    // quickstart is written for.
    const binDir = join(checkout, "..", "..", "user-bin");
    mkdirSync(binDir, { recursive: true });
    const link = join(binDir, "ebrain-up");
    rmSync(link, { force: true });
    symlinkSync(join(checkout, "scripts", "ebrain-up"), link);

    const res = spawnSync(link, ["--help"], {
      encoding: "utf8",
      cwd: "/",
      env: { PATH: `${fakeBinDir}:/usr/bin:/bin`, HOME: sandboxHome, LC_ALL: "C", BUN_BIN: join(fakeBinDir, "bun") },
    });
    expect(res.stderr).not.toContain("No such file or directory");
    expect(res.stdout ?? "").toContain(`INHERITED_EBRAIN_HOME=${checkout}`);
  });

  test("a system without `readlink -f` degrades gracefully instead of aborting", () => {
    // The symlink fix must not become a hard dependency: under `set -e`, a failed `&&` chain would
    // abort the launcher outright on any system whose readlink lacks -f (notably older BSD/macOS).
    const noReadlink = join(checkout, "..", "..", "no-readlink-bin");
    mkdirSync(noReadlink, { recursive: true });
    // A readlink that always fails, shadowing the real one.
    writeFileSync(join(noReadlink, "readlink"), "#!/usr/bin/env bash\nexit 1\n", { mode: 0o755 });
    chmodSync(join(noReadlink, "readlink"), 0o755);

    const res = spawnSync(join(checkout, "scripts", "ebrain-up"), ["--help"], {
      encoding: "utf8",
      cwd: checkout,
      env: {
        PATH: `${noReadlink}:${fakeBinDir}:/usr/bin:/bin`,
        HOME: sandboxHome,
        LC_ALL: "C",
        BUN_BIN: join(fakeBinDir, "bun"),
      },
    });
    expect(res.status).toBe(0);
    expect(res.stdout ?? "").toContain(`INHERITED_EBRAIN_HOME=${checkout}`);
  });

  test("an explicit EBRAIN_HOME still wins over the physical location", () => {
    const override = join(checkout, "..", "override-root");
    const res = spawnSync(join(checkout, "scripts", "ebrain-up"), ["--help"], {
      encoding: "utf8",
      cwd: checkout,
      env: {
        PATH: `${fakeBinDir}:/usr/bin:/bin`,
        HOME: sandboxHome,
        LC_ALL: "C",
        BUN_BIN: join(fakeBinDir, "bun"),
        EBRAIN_HOME: override,
      },
    });
    expect(res.stdout ?? "").toContain(`INHERITED_EBRAIN_HOME=${override}`);
  });
});

describe("I1 — TypeScript answers the location question without help from the shell", () => {
  test("resolveEbrainHome finds the checkout it physically lives in, with a foreign HOME and no EBRAIN_HOME", () => {
    // Runs the SHIPPED cli/ebrain-home.ts inside the extracted checkout. No shell layer involved:
    // this is the path taken when a .ts entrypoint is invoked directly by bun.
    const realBun = process.execPath;
    const res = spawnSync(
      realBun,
      ["-e", `import { resolveEbrainHome } from ${JSON.stringify(join(checkout, "cli", "ebrain-home.ts"))}; console.log(resolveEbrainHome());`],
      {
        encoding: "utf8",
        cwd: "/",
        env: { PATH: "/usr/bin:/bin", HOME: sandboxHome, LC_ALL: "C" },
      },
    );
    expect(res.stderr).toBe("");
    expect((res.stdout ?? "").trim()).toBe(checkout);
  });

  test("a stale location record does not beat a real checkout on disk", () => {
    // F-S7's failure mode, asserted on the canonical resolver: a record pointing at a deleted
    // directory must fall through, not win.
    const record = join(sandboxHome, ".config", "ebrain", "home");
    mkdirSync(dirname(record), { recursive: true });
    writeFileSync(record, `${join(sandboxHome, "deleted-checkout")}\r\n`);
    const res = spawnSync(
      process.execPath,
      ["-e", `import { resolveEbrainHome } from ${JSON.stringify(join(checkout, "cli", "ebrain-home.ts"))}; console.log(resolveEbrainHome());`],
      { encoding: "utf8", cwd: "/", env: { PATH: "/usr/bin:/bin", HOME: sandboxHome, LC_ALL: "C" } },
    );
    expect((res.stdout ?? "").trim()).toBe(checkout);
    rmSync(record, { force: true });
  });

  test("bridgeCommandPath registers the resolved checkout's bridge, not the home-dir fallback (F-T10)", () => {
    // The actual string F-S1 is about — what `ebrain up` writes into every agent's MCP config. Pass
    // 6 (F-T10) noted no test asserted this: it lived in mcp-bridge.ts behind the MCP SDK import, so
    // on an unprovisioned checkout the tests that touch it could not even load. bridgeCommandPath now
    // lives in the SDK-free cli/bridge-path.ts, so it runs here, from the extracted checkout, with a
    // foreign HOME and no EBRAIN_HOME — the exact condition under which it used to guess $HOME/eBrain.
    const res = spawnSync(
      process.execPath,
      ["-e", `import { bridgeCommandPath } from ${JSON.stringify(join(checkout, "cli", "bridge-path.ts"))}; console.log(bridgeCommandPath());`],
      { encoding: "utf8", cwd: "/", env: { PATH: "/usr/bin:/bin", HOME: sandboxHome, LC_ALL: "C" } },
    );
    expect(res.stderr).toBe("");
    expect((res.stdout ?? "").trim()).toBe(join(checkout, "scripts", "ebrain-mcp-bridge"));
    expect(res.stdout ?? "").not.toContain(join(sandboxHome, "eBrain"));
  });
});
