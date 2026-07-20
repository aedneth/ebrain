/**
 * cli/deny-policy.test.ts — the user-owned repository deny policy, both halves.
 *
 * The re-audit (F-R1) found the CONFIG-FILE path had zero coverage: every other suite pins
 * `EBRAIN_DENIED_REPOS`, so the file reader, its precedence, and its failure modes were never
 * exercised — and the shell half had no tests at all, which is where the fail-open regression
 * lived. This suite drives both halves from the SAME fixture files and asserts they agree, because
 * a divergence between them means one config file has two different meanings.
 *
 * Hermetic: every case uses its own fixture under a temp dir via `EBRAIN_DENY_CONFIG`. The
 * operator's real policy is never read.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deniedRepos, denyConfigPath, isDeniedPath, isDeniedSourceName } from "./deny-policy.ts";

const TRUST_SH = join(import.meta.dir, "..", "harness", "core", "trust.sh");
const roots: string[] = [];

function fixture(contents: string, name = "denied-repos"): string {
  const dir = mkdtempSync(join(tmpdir(), "ebr-deny-"));
  roots.push(dir);
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

/** Run the TS half against a fixture policy, with the env override deliberately absent. */
function withConfig<T>(path: string | undefined, fn: () => T): T {
  const savedList = process.env.EBRAIN_DENIED_REPOS;
  const savedCfg = process.env.EBRAIN_DENY_CONFIG;
  delete process.env.EBRAIN_DENIED_REPOS;
  if (path === undefined) delete process.env.EBRAIN_DENY_CONFIG;
  else process.env.EBRAIN_DENY_CONFIG = path;
  try {
    return fn();
  } finally {
    if (savedList === undefined) delete process.env.EBRAIN_DENIED_REPOS;
    else process.env.EBRAIN_DENIED_REPOS = savedList;
    if (savedCfg === undefined) delete process.env.EBRAIN_DENY_CONFIG;
    else process.env.EBRAIN_DENY_CONFIG = savedCfg;
  }
}

/** Run the SHELL half against the same fixture: does `trust_denied <probe>` deny? */
function shellDenies(configPath: string, probe: string): { denied: boolean; stderr: string } {
  const proc = Bun.spawnSync(
    ["bash", "-c", `. "${TRUST_SH}"; trust_denied "$1" && echo DENIED || echo ALLOWED`, "bash", probe],
    {
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", EBRAIN_DENY_CONFIG: configPath },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  return { denied: proc.stdout.toString().includes("DENIED"), stderr: proc.stderr.toString() };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("deny policy — config file resolution", () => {
  test("reads entries from the config file, honoring comments and blank lines", () => {
    const path = fixture("# a comment\n\ndenied-alpha\n  denied-beta  \n");
    expect(withConfig(path, deniedRepos)).toEqual(["denied-alpha", "denied-beta"]);
  });

  test("EBRAIN_DENIED_REPOS wins over the file, and an empty value means deny nothing", () => {
    const path = fixture("denied-alpha\n");
    const saved = process.env.EBRAIN_DENIED_REPOS;
    process.env.EBRAIN_DENY_CONFIG = path;
    try {
      process.env.EBRAIN_DENIED_REPOS = "other-entry";
      expect(deniedRepos()).toEqual(["other-entry"]);
      // Set-but-empty must NOT fall through to the file: the operator said "deny nothing".
      process.env.EBRAIN_DENIED_REPOS = "";
      expect(deniedRepos()).toEqual([]);
    } finally {
      if (saved === undefined) delete process.env.EBRAIN_DENIED_REPOS;
      else process.env.EBRAIN_DENIED_REPOS = saved;
      delete process.env.EBRAIN_DENY_CONFIG;
    }
  });

  test("a missing config file denies nothing", () => {
    expect(withConfig(join(tmpdir(), "ebr-does-not-exist-000", "denied-repos"), deniedRepos)).toEqual([]);
  });

  test("denyConfigPath honors EBRAIN_DENY_CONFIG and otherwise lands under the XDG config home", () => {
    expect(withConfig("/custom/policy", denyConfigPath)).toBe("/custom/policy");
    const savedXdg = process.env.XDG_CONFIG_HOME;
    const savedCfg = process.env.EBRAIN_DENY_CONFIG;
    delete process.env.EBRAIN_DENY_CONFIG;
    process.env.XDG_CONFIG_HOME = "/xdg-root";
    try {
      expect(denyConfigPath()).toBe(join("/xdg-root", "ebrain", "denied-repos"));
    } finally {
      if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = savedXdg;
      if (savedCfg !== undefined) process.env.EBRAIN_DENY_CONFIG = savedCfg;
    }
  });

  test("an unreadable policy throws instead of continuing with an unknown policy", () => {
    const path = fixture("denied-alpha\n");
    chmodSync(path, 0o000);
    try {
      // Running as root defeats the permission bit; skip rather than assert a false guarantee.
      let readable = true;
      try {
        require("fs").readFileSync(path, "utf8");
      } catch {
        readable = false;
      }
      if (readable) return;
      expect(() => withConfig(path, deniedRepos)).toThrow(/could not be read/);
    } finally {
      chmodSync(path, 0o600);
    }
  });

  test("a malformed entry throws and does NOT echo the offending token", () => {
    const path = fixture("denied-alpha\nclient/acme\n");
    expect(() => withConfig(path, deniedRepos)).toThrow(/invalid deny entry on line 2/);
    try {
      withConfig(path, deniedRepos);
    } catch (e) {
      // A malformed entry can still contain a real name; only the position may be reported.
      expect(String(e)).not.toContain("client/acme");
      expect(String(e)).not.toContain("acme");
    }
  });
});

describe("deny policy — both halves agree on the same file", () => {
  const cases: Array<{ name: string; contents: string; probe: string; denied: boolean }> = [
    { name: "plain entry", contents: "denied-alpha\n", probe: "denied-alpha", denied: true },
    { name: "CRLF line endings", contents: "denied-alpha\r\ndenied-beta\r\n", probe: "denied-alpha", denied: true },
    { name: "case-insensitive", contents: "denied-alpha\n", probe: "DENIED-ALPHA", denied: true },
    { name: "substring of a source identity", contents: "denied-alpha\n", probe: "code-graph/denied-alpha", denied: true },
    { name: "unrelated name", contents: "denied-alpha\n", probe: "second-brain", denied: false },
    { name: "comment-only policy denies nothing", contents: "# nothing here\n", probe: "anything", denied: false },
    { name: "whitespace-only policy denies nothing", contents: "   \n\t\n", probe: "anything", denied: false },
    { name: "empty policy denies nothing", contents: "", probe: "anything", denied: false },
    // A dot is a literal in the TS matcher; the shell half must not treat it as a regex wildcard.
    { name: "dot is literal (no wildcard)", contents: "acme.com\n", probe: "acmeXcom", denied: false },
    { name: "dot matches itself", contents: "acme.com\n", probe: "repos/acme.com", denied: true },
  ];

  for (const c of cases) {
    test(`${c.name} — TS and shell agree (${c.denied ? "denied" : "allowed"})`, () => {
      const path = fixture(c.contents);
      const ts = withConfig(path, () => isDeniedSourceName(c.probe));
      const sh = shellDenies(path, c.probe);
      expect(ts).toBe(c.denied);
      expect(sh.denied).toBe(c.denied);
    });
  }
});

describe("deny policy — the shell half fails CLOSED (F-R1 regression)", () => {
  // Each of these silently failed OPEN before the fix: an invalid ERE makes grep exit 2, which
  // reads as "no match" — disabling the whole policy, including its valid entries.
  const malformed: Array<{ name: string; contents: string }> = [
    { name: "regex metacharacter", contents: "denied-alpha\nfoo(\n" },
    { name: "leading dash (parsed as a grep option)", contents: "-foo\ndenied-alpha\n" },
    { name: "path separator", contents: "denied-alpha\nclient/acme\n" },
    { name: "glob character", contents: "denied-*\n" },
    { name: "alternation character", contents: "a|b\n" },
  ];

  for (const c of malformed) {
    test(`${c.name}: denies everything and says so, instead of allowing everything`, () => {
      const path = fixture(c.contents);
      const valid = shellDenies(path, "denied-alpha");
      const unrelated = shellDenies(path, "totally-unrelated-name");
      expect(valid.denied).toBe(true);
      expect(unrelated.denied).toBe(true); // fail-closed: unknown policy ⇒ deny
      expect(valid.stderr).toMatch(/not a bare repository name/);
      expect(valid.stderr).not.toMatch(/foo\(|client\/acme/); // position, never the token
      // The TS half must reject the same file rather than diverge.
      expect(() => withConfig(path, deniedRepos)).toThrow(/invalid deny entry/);
    });
  }

  test("an unreadable policy denies everything on the shell path", () => {
    const path = fixture("denied-alpha\n");
    chmodSync(path, 0o000);
    try {
      let readable = true;
      try {
        require("fs").readFileSync(path, "utf8");
      } catch {
        readable = false;
      }
      if (!readable) {
        const res = shellDenies(path, "totally-unrelated-name");
        expect(res.denied).toBe(true);
        expect(res.stderr).toMatch(/unreadable/);
      }
    } finally {
      chmodSync(path, 0o600);
    }
  });
});

describe("deny policy — path matching is by segment", () => {
  test("segment equality, after the caller resolves symlinks; no substring over-block", () => {
    const path = fixture("denied-alpha\n");
    withConfig(path, () => {
      expect(isDeniedPath("/home/u/repos/denied-alpha")).toBe(true);
      expect(isDeniedPath("/home/u/repos/denied-alpha/src/api")).toBe(true);
      expect(isDeniedPath("/home/u/repos/DENIED-ALPHA")).toBe(true);
      expect(isDeniedPath("/home/u/repos/denied-alpha-notes")).toBe(false);
      expect(isDeniedPath("/home/u/second-brain")).toBe(false);
    });
  });

  test("a real denied directory is still refused end to end after symlink resolution", () => {
    const path = fixture("denied-alpha\n");
    const base = mkdtempSync(join(tmpdir(), "ebr-deny-link-"));
    roots.push(base);
    const target = join(base, "denied-alpha");
    mkdirSync(target);
    const link = join(base, "innocent-name");
    require("fs").symlinkSync(target, link);
    withConfig(path, () => {
      expect(isDeniedPath(link)).toBe(false); // the literal name hides it…
      expect(isDeniedPath(require("fs").realpathSync(link))).toBe(true); // …resolution exposes it
    });
  });
});
