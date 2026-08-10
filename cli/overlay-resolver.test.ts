// cli/overlay-resolver.test.ts — invariant I4 of docs/SPEC-PORTABILITY-HARDENING.md.
//
// The two Codex overlay hooks are installed as COPIES into ~/.codex/hooks, outside any checkout, so
// they cannot source harness/core/ebrain-home.sh and cannot walk up to anything. They necessarily
// duplicate the record-reading branch of the resolver — and pass 5 (F-S7) found the duplicate had
// drifted: it accepted any non-empty record, so a record pointing at a deleted checkout beat a
// perfectly good checkout at the default location, and a CRLF record produced a path with a trailing
// carriage return. For block-secret-read.sh that meant silently running with no secret guard.
//
// Duplication is unavoidable here. Silent divergence is not: these tests run the copies' own logic
// and the canonical resolver against the same inputs and require the same answer.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const ROOT = join(import.meta.dir, "..");
const HOOKS = ["overlay/codex-harness/hooks/block-secret-read.sh", "overlay/codex-harness/hooks/session-context.sh"];

let sandbox = "";

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ebrain-overlay-"));
});
afterEach(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

/** A directory that satisfies ebrain__looks_like_root: the dispatcher plus the harness core. */
function makeFakeCheckout(dir: string): string {
  mkdirSync(join(dir, "cli"), { recursive: true });
  mkdirSync(join(dir, "harness", "core"), { recursive: true });
  writeFileSync(join(dir, "cli", "ebrain"), "#!/usr/bin/env bash\n", { mode: 0o755 });
  return dir;
}

/**
 * Run only the location-resolution prologue of a hook: everything up to the first blank line after
 * the resolution block. Extracting it keeps the test from executing the hook's real side effects
 * while still running the hook's OWN bytes rather than a paraphrase of them.
 */
function hookResolutionAnswer(hookRel: string, home: string, recordValue: string | null): string {
  const src = readFileSync(join(ROOT, hookRel), "utf8");
  const start = src.indexOf("ebrain__looks_like_root()");
  expect(start).toBeGreaterThan(-1); // the block must still exist; a rename must fail this test
  const end = src.indexOf("\nfi\n", start);
  expect(end).toBeGreaterThan(start);
  const prologue = src.slice(start, end + 4);

  const cfg = join(home, ".config", "ebrain");
  mkdirSync(cfg, { recursive: true });
  if (recordValue !== null) writeFileSync(join(cfg, "home"), recordValue);

  const script = `set -uo pipefail\n${prologue}\nprintf '%s' "$EBRAIN_HOME"\n`;
  const res = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin", HOME: home, LC_ALL: "C" },
  });
  return (res.stdout ?? "").trim();
}

/** The canonical resolver's answer for a caller that cannot walk up to a checkout. */
function canonicalAnswer(home: string): string {
  const script = `. "${ROOT}/harness/core/ebrain-home.sh"; ebrain_resolve_home "/nonexistent/outside/any/checkout/hook.sh"`;
  const res = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin", HOME: home, LC_ALL: "C" },
  });
  return (res.stdout ?? "").trim();
}

describe("I4 — the overlay copies agree with the canonical resolver", () => {
  for (const hook of HOOKS) {
    const name = hook.split("/").pop();

    test(`${name}: a stale record loses to a real checkout at the default location`, () => {
      const home = join(sandbox, "home-stale");
      makeFakeCheckout(join(home, "eBrain"));
      const answer = hookResolutionAnswer(hook, home, `${join(home, "deleted-checkout")}\n`);
      expect(answer).toBe(join(home, "eBrain"));
      expect(answer).toBe(canonicalAnswer(home));
    });

    test(`${name}: a CRLF record resolves to the path without the carriage return`, () => {
      const home = join(sandbox, "home-crlf");
      mkdirSync(home, { recursive: true });
      const real = makeFakeCheckout(join(sandbox, "real-checkout-crlf"));
      const answer = hookResolutionAnswer(hook, home, `${real}\r\n`);
      expect(answer).toBe(real);
      expect(answer).not.toContain("\r");
      expect(answer).toBe(canonicalAnswer(home));
    });

    test(`${name}: a valid record is honored`, () => {
      const home = join(sandbox, "home-valid");
      mkdirSync(home, { recursive: true });
      const real = makeFakeCheckout(join(sandbox, "real-checkout-valid"));
      const answer = hookResolutionAnswer(hook, home, `${real}\n`);
      expect(answer).toBe(real);
      expect(answer).toBe(canonicalAnswer(home));
    });

    test(`${name}: no record at all falls back to the historical default`, () => {
      const home = join(sandbox, "home-none");
      mkdirSync(home, { recursive: true });
      const answer = hookResolutionAnswer(hook, home, null);
      expect(answer).toBe(join(home, "eBrain"));
      expect(answer).toBe(canonicalAnswer(home));
    });
  }

  test("the secret guard says so out loud when it cannot find the canonical guard", () => {
    // F-S7's real consequence: an unresolvable location silently disabled the guard, which is
    // indistinguishable from a guard that ran and allowed the call.
    const home = join(sandbox, "home-noguard");
    mkdirSync(join(home, ".config"), { recursive: true });
    const hook = join(sandbox, "block-secret-read.sh");
    cpSync(join(ROOT, HOOKS[0]!), hook);
    const res = spawnSync("bash", [hook], {
      encoding: "utf8",
      input: "{}",
      env: { PATH: "/usr/bin:/bin", HOME: home, LC_ALL: "C" },
    });
    expect(res.stderr).toContain("secret-read guard INACTIVE");
    expect(res.status).toBe(0); // still fail-open by design, but no longer silent
  });

  test("EBRAIN_GUARD_STRICT=1 turns the missing guard into a denial", () => {
    const home = join(sandbox, "home-strict");
    mkdirSync(join(home, ".config"), { recursive: true });
    const hook = join(sandbox, "block-secret-read-strict.sh");
    cpSync(join(ROOT, HOOKS[0]!), hook);
    const res = spawnSync("bash", [hook], {
      encoding: "utf8",
      input: "{}",
      env: { PATH: "/usr/bin:/bin", HOME: home, LC_ALL: "C", EBRAIN_GUARD_STRICT: "1" },
    });
    expect(res.status).toBe(2);
  });
});
