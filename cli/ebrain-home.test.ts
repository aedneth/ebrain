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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dir, "..");

function tracked(): string[] {
  const proc = Bun.spawnSync(["git", "-C", ROOT, "ls-files"], { stdout: "pipe" });
  return proc.stdout.toString().split("\n").filter(Boolean);
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

describe("F-Q1 — the eBrain location is resolved in one place", () => {
  test("no tracked file hardcodes $HOME/eBrain outside the documented exemptions", () => {
    const offenders: string[] = [];
    for (const rel of tracked()) {
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
        if (line.includes("$HOME/eBrain") || line.includes("${HOME}/eBrain")) {
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
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
    const needsIt = tracked().filter(
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
      if (!text.includes("ebrain-home.sh")) missing.push(rel);
    }
    expect(missing).toEqual([]);
  });
});
