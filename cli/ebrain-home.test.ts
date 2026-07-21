/**
 * cli/ebrain-home.test.ts — pass-4 finding F-Q1: one place decides where eBrain lives.
 *
 * Twenty-three sites across fifteen shell entrypoints each wrote their own `$HOME/eBrain`, several
 * with no override at all. The round-3 CHANGELOG claimed two TypeScript modules were "the last two
 * sites" — that claim was false, and it was false because nobody ran the search. So the search is
 * now a test: the assertion is not "these files are fixed", it is "no tracked file reintroduces the
 * literal", which is the only form that survives the next contributor.
 *
 * The worst instance was scripts/ebrain-mcp-bridge — the literal command every supported agent
 * spawns to reach eBrain over MCP. A user who cloned anywhere but $HOME/eBrain, exactly as the
 * README instructs, got an agent integration that failed silently.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { mkdtempSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dir, "..");

// Directories that are never eBrain source: dependencies, vendored upstreams, build output, VCS.
// A filesystem walk must skip these or it drowns in third-party matches — and, worse, would flag a
// dependency's own `$HOME/eBrain` as an eBrain defect.
const SKIP_DIRS = new Set([".git", "node_modules", "vendor", "dist", ".astro", ".vercel", "coverage"]);

/**
 * Every source file to scan. Pass 6 (F-T1) found the previous implementation — a bare `git ls-files`
 * whose stdout was `.split("\n")` — return `[]` whenever git is absent or fails. eBrain ships as a
 * tarball, a `git archive`, a Docker `COPY`, an `npm pack`: none of those is a git checkout, and in
 * every one of them the guard silently passed over an empty list. The invariant it exists to hold
 * (I3: no file reintroduces a hardcoded home) had zero enforcement in exactly the environments a
 * user installs from.
 *
 * So this no longer depends on git. It walks the working tree — the actual bytes that ship — and
 * falls back to git only never. If the walk itself yields nothing, that is a bug in the walk, not a
 * clean repo, and the canary test below fails loudly rather than passing vacuously.
 */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        // Skip local dot-directories (.claude, .brain, …) but keep .github for CI yaml.
        if (entry.name.startsWith(".") && entry.name !== ".github") continue;
        walk(abs);
      } else if (entry.isFile()) {
        out.push(relative(ROOT, abs));
      }
    }
  };
  walk(ROOT);
  return out;
}

// Each exemption is a place the literal is CORRECT, with the reason. A new entry here is a
// deliberate decision a reviewer can weigh, which is the point of an allowlist over a blanket skip.
const ALLOWED = new Map<string, string>([
  // The remote installer's clone TARGET. There is no checkout to walk up to yet — this is the
  // directory being created.
  ["scripts/install.sh", "the clone target of a fresh remote install"],
  // The single source of truth: it documents and implements the historical fallback.
  ["harness/core/ebrain-home.sh", "the resolver itself"],
  // Installed as copies outside any checkout; they read the recorded location and fall back last.
  ["overlay/codex-harness/hooks/session-context.sh", "installed copy, last-resort fallback"],
  ["overlay/codex-harness/hooks/block-secret-read.sh", "installed copy, last-resort fallback"],
  // Tests and prose describe the defect; they do not execute it.
  ["cli/ebrain-home.test.ts", "this file"],
  ["cli/install.test.ts", "prose describing the original defect"],
]);

// A comment mentioning the literal is documentation, not behavior.
const COMMENT = /^\s*(?:#|\/\/|\*)/;

/**
 * Pass-5 finding F-S5: the first version of this guard enumerated exactly two spellings, so it was
 * non-vacuous only against those two. Three ways past it existed in the repository at the time:
 * splitting the quote (`"$HOME"/eBrain`), systemd's own expansion (`%h/eBrain`, live in an
 * unfixed unit file), and the TypeScript form `join(homedir(), "eBrain")` — which eight modules used,
 * and which is where the blocking defect F-S1 actually lived.
 *
 * The guard now covers the repository's whole vocabulary for "the home directory", per language.
 * Adding a file type to eBrain means adding its spelling here; that is the maintenance cost of the
 * invariant, and it is cheaper than another pass finding the same bug in a new syntax.
 */
const HARDCODED_SPELLINGS: Array<{ label: string; pattern: RegExp }> = [
  // POSIX shell, including split and braced quoting: $HOME/eBrain, ${HOME}/eBrain, "$HOME"/eBrain.
  { label: "shell $HOME", pattern: /(?:"|')?\$(?:HOME|\{HOME\})(?:"|')?\/eBrain/ },
  // systemd unit specifier for the user's home.
  { label: "systemd %h", pattern: /%h\/eBrain/ },
  // Tilde spelling (pass 6, F-T14). The two live occurrences were display strings, now removed; this
  // keeps the spelling from creeping back into a resolution site. Matches `~/eBrain` as a path start.
  { label: "tilde ~", pattern: /(?:^|["'`\s(=:])~\/eBrain/ },
  // TypeScript/JavaScript path joins against the home directory.
  { label: "js join(home)", pattern: /join\(\s*(?:homedir\(\)|HOME|process\.env\.HOME)\s*,\s*["'`]eBrain["'`]\s*\)/ },
  // The same idea written with template or string concatenation.
  { label: "js concat(home)", pattern: /(?:homedir\(\)|\$\{HOME\})\s*\+?\s*["'`]\/eBrain/ },
];

/** Scan the source tree for hardcoded-home spellings, returning `path:line [label]: text` offenders. */
function scanForHardcodedHome(files: string[]): string[] {
  const offenders: string[] = [];
  for (const rel of files) {
    if (ALLOWED.has(rel)) continue;
    if (rel.endsWith(".md") || rel.startsWith("docs/")) continue; // prose
    let text: string;
    try {
      text = readFileSync(join(ROOT, rel), "utf8");
    } catch {
      continue; // binary or unreadable
    }
    text.split("\n").forEach((line, i) => {
      if (COMMENT.test(line)) return;
      for (const { label, pattern } of HARDCODED_SPELLINGS) {
        if (pattern.test(line)) {
          offenders.push(`${rel}:${i + 1} [${label}]: ${line.trim()}`);
          return;
        }
      }
    });
  }
  return offenders;
}

describe("F-Q1/F-S5 — the eBrain location is resolved in one place, in every language", () => {
  test("the file scan is not empty — the guard cannot pass over nothing (F-T1)", () => {
    // The previous version returned [] whenever git was absent, so every assertion below passed
    // vacuously in a tarball / git archive / Docker COPY — exactly what a user installs from. If
    // this list is ever empty, the walk is broken and the whole guard is meaningless; fail loudly.
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain("harness/core/ebrain-home.sh");
    expect(files).toContain("cli/up.ts");
  });

  test("the scanner actually catches a planted offender in a real file on disk (F-T1 canary)", () => {
    // Prove the scan reads bytes and flags them, in the SAME environment the real test runs in —
    // not against an in-memory string. Pass 6 planted three offending files in a non-git checkout
    // and got 6 pass / 0 fail; this is the guard that would have caught that.
    const base = mkdtempSync(join(tmpdir(), "ebr-canary-"));
    try {
      const mirror = join(base, "cli");
      Bun.spawnSync(["mkdir", "-p", mirror]);
      const planted = join(mirror, "planted-canary.ts");
      Bun.write(planted, 'export const H = join(homedir(), "eBrain");\n');
      // Scan the sandbox the same way sourceFiles scans ROOT.
      const files: string[] = [];
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const abs = join(d, e.name);
          if (e.isDirectory()) walk(abs);
          else files.push(relative(base, abs));
        }
      };
      walk(base);
      const offenders = files.flatMap((rel) => {
        const text = readFileSync(join(base, rel), "utf8");
        return HARDCODED_SPELLINGS.some((s) => s.pattern.test(text)) ? [rel] : [];
      });
      expect(offenders).toContain("cli/planted-canary.ts");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("no source file hardcodes the home directory, in any spelling, outside the exemptions", () => {
    expect(scanForHardcodedHome(sourceFiles())).toEqual([]);
  });

  test("the guard actually detects each spelling it claims to cover", () => {
    // Without this, a typo in any pattern above turns that whole class back into a blind spot and
    // nothing fails — the exact way the previous version of this guard was quietly incomplete.
    const samples: Array<[string, string]> = [
      ["shell $HOME", 'BRIDGE="$HOME/eBrain/scripts/ebrain-mcp-bridge"'],
      ["shell $HOME", 'BRIDGE="${HOME}/eBrain/scripts/x"'],
      ["shell $HOME", 'BRIDGE="$HOME"/eBrain/scripts/x'],
      ["systemd %h", "ExecStart=%h/eBrain/scripts/dream-cycle"],
      ["tilde ~", 'const p = "~/eBrain/harness/core/NORMS.md";'],
      ["js join(home)", 'const H = join(homedir(), "eBrain");'],
      ["js join(home)", 'const H = join(HOME, "eBrain");'],
      ["js concat(home)", 'const H = homedir() + "/eBrain";'],
    ];
    for (const [label, line] of samples) {
      const hit = HARDCODED_SPELLINGS.find((s) => s.pattern.test(line));
      expect(`${line} => ${hit?.label ?? "UNDETECTED"}`).toBe(`${line} => ${label}`);
    }
  });

  test("the guard does not fire on the sanctioned resolver call", () => {
    const clean = [
      "const EBRAIN_HOME = resolveEbrainHome();",
      'ebrain_export_home "${BASH_SOURCE[0]}"',
      "ExecStart=@EBRAIN_HOME@/scripts/dream-cycle",
    ];
    for (const line of clean) {
      expect(HARDCODED_SPELLINGS.some((s) => s.pattern.test(line))).toBe(false);
    }
  });

  test("the resolver finds a checkout at an arbitrary path with no EBRAIN_HOME", () => {
    // The real scenario: a reader clones wherever they like, as the README tells them to, and no
    // EBRAIN_HOME is ever set. Sandboxed HOME so $HOME/eBrain cannot accidentally satisfy it.
    const base = mkdtempSync(join(tmpdir(), "ebr-home-"));
    try {
      const checkout = join(base, "somewhere", "else", "my-ebrain");
      for (const dir of ["cli", "harness/core", "scripts"]) {
        Bun.spawnSync(["mkdir", "-p", join(checkout, dir)]);
      }
      Bun.write(join(checkout, "cli", "ebrain"), "#!/bin/sh\n");
      cpSync(join(ROOT, "harness", "core", "ebrain-home.sh"), join(checkout, "harness", "core", "ebrain-home.sh"));

      const probe = join(checkout, "scripts", "ebrain-mcp-bridge");
      const proc = Bun.spawnSync(
        ["bash", "-c", `. "$1/harness/core/ebrain-home.sh"; ebrain_resolve_home "$2"`, "bash", checkout, probe],
        { env: { PATH: process.env.PATH ?? "", HOME: base }, stdout: "pipe", stderr: "pipe" },
      );
      expect(proc.stdout.toString().trim()).toBe(checkout);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("an explicit EBRAIN_HOME always wins over the derived location", () => {
    const proc = Bun.spawnSync(
      ["bash", "-c", `. "${ROOT}/harness/core/ebrain-home.sh"; ebrain_resolve_home "$0"`],
      { env: { PATH: process.env.PATH ?? "", HOME: "/nonexistent", EBRAIN_HOME: "/explicit/choice" }, stdout: "pipe" },
    );
    expect(proc.stdout.toString().trim()).toBe("/explicit/choice");
  });

  test("every shell entrypoint that needs the location sources the one resolver", () => {
    // Sourcing it is what makes the policy shared. A script that computes its own root is how the
    // twenty-three copies happened in the first place.
    const needsIt = sourceFiles().filter(
      (rel) =>
        (rel.startsWith("scripts/") || rel.startsWith("harness/core/")) &&
        !ALLOWED.has(rel) &&
        !rel.endsWith(".md") &&
        !rel.endsWith(".ts"),
    );
    const missing: string[] = [];
    for (const rel of needsIt) {
      const text = readFileSync(join(ROOT, rel), "utf8");
      if (!text.includes("EBRAIN_HOME")) continue; // does not need the location at all
      // Non-shell artifacts cannot source anything. systemd units are templates whose placeholder is
      // substituted at install time by scripts/install-dream-timer.sh — which does source the
      // resolver, and which is covered by the entrypoint scan above. Assert the template shape
      // instead of the sourcing line, so this stays a real check rather than an exemption.
      if (!text.startsWith("#!") && !rel.endsWith(".sh")) {
        if (!text.includes("@EBRAIN_HOME@")) missing.push(`${rel} (no @EBRAIN_HOME@ placeholder)`);
        continue;
      }
      if (!text.includes("ebrain-home.sh")) missing.push(rel);
    }
    expect(missing).toEqual([]);
  });
});
