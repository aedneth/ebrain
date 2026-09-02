// cli/locale-portability.test.ts — the acceptance environment of
// docs/SPEC-PORTABILITY-HARDENING.md includes the `C` locale, because that is the default in
// containers, in systemd units with no locale configured, and on minimal servers.
//
// This file exists because running the suite that way for the first time immediately found a live
// defect that five audit passes and a green suite had missed: tmux sanitizes non-printable
// characters in `-F` format output according to the locale, and under `C` it replaces TAB with `_`.
//
//   LC_ALL=C            → ebr-test-probe-1784664292738_1784664292_0_/tmp
//   LC_ALL=en_US.UTF-8  → ebr-test-probe-1784664292738<TAB>1784664292<TAB>0<TAB>/tmp
//
// `listSessions` split on TAB, so under `C` every row collapsed into a single field: mangled name,
// empty cwd, creation date of 1970. Everything that resolves a session by name was silently wrong.

import { describe, expect, test, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SESSION = `ebr-test-locale-${Date.now()}`;

function tmuxAvailable(): boolean {
  return spawnSync("tmux", ["-V"], { encoding: "utf8" }).status === 0;
}

afterAll(() => {
  spawnSync("tmux", ["kill-session", "-t", SESSION], { encoding: "utf8" });
});

describe("session listing survives a machine with no locale configured", () => {
  test.skipIf(!tmuxAvailable())("listSessions finds a real session under LC_ALL=C", () => {
    // A real tmux session, listed by the real CLI code, in a real `C`-locale process. Nothing here
    // is a fixture: a paraphrase of the parsing logic would have passed before the fix too.
    const created = spawnSync("tmux", ["new-session", "-d", "-s", SESSION, "sleep 60"], { encoding: "utf8" });
    expect(created.status).toBe(0);

    const probe = `
      import { listSessions } from ${JSON.stringify(join(ROOT, "cli", "sessions.ts"))};
      const r = await listSessions();
      const row = r.ok ? r.sessions.find((s) => s.name === ${JSON.stringify(SESSION)}) : null;
      console.log(JSON.stringify(row ?? null));
    `;
    const res = spawnSync(process.execPath, ["-e", probe], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
    });

    const row = JSON.parse((res.stdout ?? "null").trim() || "null");
    expect(row).not.toBeNull();
    // The name must come back intact — the pre-fix failure mode was a name with the other fields
    // glued onto it by the `_` substitution.
    expect(row.name).toBe(SESSION);
    expect(row.name).not.toContain("_1");
    // And the fields that vanished into the mangled name must be present.
    expect(row.cwd.length).toBeGreaterThan(0);
    expect(row.created).not.toBe("1970-01-01T00:00:00.000Z");
  });

  test("the tmux format string does not use a character tmux may sanitize", () => {
    // Static guard: the defect returns the moment someone reaches for a tab or another control
    // character as a delimiter, and the E2E test above only runs where tmux is installed.
    //
    // Pass 6 (F-T8): this read `git show :cli/sessions.ts` — the git INDEX — which is empty outside a
    // git checkout (tarball, archive, Docker COPY) AND stale for any unstaged edit to the working
    // tree. Both make the guard vacuous exactly when it matters. Read the working-tree file instead:
    // that is the byte that ships and the byte a developer is editing.
    const src = readFileSync(join(ROOT, "cli", "sessions.ts"), "utf8");
    const formats = [...src.matchAll(/"#\{[^"]*\}"/g)].map((m) => m[0]);
    // Canary: if the pattern ever stops matching the real format strings, this test must fail loudly
    // rather than iterate over an empty list — the F-T1 emptiness-passes disease in miniature.
    expect(formats.length).toBeGreaterThan(0);
    for (const fmt of formats) {
      // eslint-disable-next-line no-control-regex
      expect(`${fmt} contains control char: ${/[\x00-\x1f]/.test(fmt)}`).toBe(`${fmt} contains control char: false`);
    }
  });
});
