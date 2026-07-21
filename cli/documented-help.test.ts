/**
 * cli/documented-help.test.ts — pass-3 finding F-P6: `--help` is a published promise.
 *
 * docs/reference/memory-commands.md lists `ebrain context --help`, `ebrain procedures --help`, and
 * `ebrain workflows --help`. None of the three implemented a help flag. Two answered through the
 * unrecognized-subcommand path (`error:` on stderr, exit 2) and `workflows` was worse: its parser
 * treats a flag-shaped first argument as an absent subcommand and falls back to `list`, so the
 * documented command printed nothing at all and exited 0 — indistinguishable from success.
 *
 * The commands under test are leaves: none of them invokes doctor.sh, so spawning them here cannot
 * re-enter the doctor → contract-test → bun test cycle that keeps cli/contract.test.ts fixture-based.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DOC = join(ROOT, "docs", "reference", "memory-commands.md");

/** Every `ebrain <command> --help` the reference documentation tells a reader to run. */
function documentedHelpCommands(): string[] {
  const text = readFileSync(DOC, "utf8");
  const found = new Set<string>();
  for (const m of text.matchAll(/\bebrain\s+([a-z][a-z-]*)\s+--help\b/g)) found.add(m[1]!);
  return [...found].sort();
}

function run(command: string, args: string[]) {
  const proc = Bun.spawnSync(["bun", "run", join(ROOT, "cli", `${command}.ts`), ...args], {
    env: { ...(process.env as Record<string, string>), EBRAIN_HOME: ROOT },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

describe("documented --help actually answers", () => {
  const commands = documentedHelpCommands();

  test("the documentation still documents some --help commands", () => {
    // Without this, a docs rewrite that drops the examples would make every test below vacuous by
    // iterating an empty list.
    expect(commands.length).toBeGreaterThanOrEqual(3);
  });

  for (const command of commands) {
    test(`ebrain ${command} --help exits 0 with usage on stdout`, () => {
      for (const flag of ["--help", "-h"]) {
        const res = run(command, [flag]);
        expect(res.code).toBe(0);
        expect(res.stdout.trim()).toStartWith("usage:");
        expect(res.stderr).not.toContain("error:");
      }
    });

    // Caught a real defect while this was being written: the first `workflows` usage string listed
    // `promote|demote|skill`, none of which exist — the command's real subcommands are different.
    // Help that names commands the tool does not have is the same defect as docs that do.
    test(`ebrain ${command} --help names only subcommands that exist`, () => {
      const usage = run(command, ["--help"]).stdout;
      const listed = usage.match(/<([a-z|-]+)>/)?.[1]?.split("|") ?? [];
      expect(listed.length).toBeGreaterThan(0);

      // Pass-4 F-Q4: matching the name anywhere in the file was far too weak — a fake subcommand
      // passed as long as the string appeared for any unrelated reason (`accept` survived because
      // an action value happens to be spelled that way). Compare against the names the dispatcher
      // actually branches on instead.
      const source = readFileSync(join(ROOT, "cli", `${command}.ts`), "utf8");
      const implemented = new Set<string>();
      for (const m of source.matchAll(/\b(?:a|args)\.sub === "([a-z-]+)"/g)) implemented.add(m[1]!);
      for (const m of source.matchAll(/case "([a-z-]+)":/g)) implemented.add(m[1]!);
      expect(implemented.size).toBeGreaterThan(0);

      const missing = listed.filter((sub) => !implemented.has(sub));
      expect(missing).toEqual([]);
    });
  }

  test("`-h` in a value position is not treated as help (F-Q3)", () => {
    // `ebrain context get -h` used to print usage and exit 0 — the user asked for a real
    // operation and silently got nothing. It must reach the command's own validation.
    const res = run("context", ["get", "-h"]);
    expect(res.stdout).not.toStartWith("usage:");
    expect(res.code).not.toBe(0);
  });
});
