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

/**
 * The subcommand names the dispatcher actually branches on.
 *
 * This is deliberately NOT a lexer. The first attempt at closing F-S6 stripped comments and string
 * literals with regexes, and a regex literal in cli/workflows.ts — `/[`"“']([^`"”']{4,80})[`"”']/` —
 * contains a backtick, so the template-literal stripper swallowed 130 lines including every dispatch
 * branch, and the file silently reported zero subcommands. Hand-rolling a JavaScript tokenizer to
 * check a JavaScript file is the same over-reach that produced the bug being fixed.
 *
 * Instead: a name counts only when the line it appears on IS a dispatch statement — an `if` whose
 * condition tests a parsed-args `.sub`, or a `case` label inside a `switch` on that same field.
 * That is a property of statement shape, not of tokenization, so:
 *   - `// if (args.sub === "review")` is a comment, not a statement → excluded;
 *   - "die(`try: args.sub === \"review\"`)" is a call, not an `if` → excluded;
 *   - `switch (state) { case "review": ... }` switches on something that is not `.sub` → excluded.
 * All three are the evasions the pass-5 auditor demonstrated, and each is asserted below.
 */
export function dispatchedSubcommands(source: string): Set<string> {
  const found = new Set<string>();
  const lines = source.split("\n");

  let inBlockComment = false;
  // Are we inside a multi-line template literal at the start of this line? (pass 6, F-T9)
  let inTemplate = false;
  // Depth of the `switch (<x>.sub)` we are currently inside, or null when we are not in one.
  let switchDepth: number | null = null;
  let depth = 0;

  for (const raw of lines) {
    let line = raw;

    if (inBlockComment) {
      const end = line.indexOf("*/");
      if (end === -1) continue;
      line = line.slice(end + 2);
      inBlockComment = false;
    }
    const blockStart = line.indexOf("/*");
    if (blockStart !== -1 && !line.includes("*/", blockStart)) {
      inBlockComment = true;
      line = line.slice(0, blockStart);
    }

    const trimmed = line.trim();
    // A line-comment or a JSDoc continuation is prose about the code, not the code.
    const isComment = trimmed.startsWith("//") || trimmed.startsWith("*");

    // Whether the dispatch scan should look at this line: not a comment, and not sitting inside a
    // multi-line template literal (F-T9). The evasion was a dispatch-shaped example line inside a
    // `USAGE = \`...\`` string, which line-at-a-time detection counted as real. We do NOT strip
    // strings/regex to find this (that lexer path caused the F-S6 backtick bug); we only track
    // whether the line STARTS inside a template. A genuine dispatch statement never does.
    const openInThisLine = inTemplate;

    // Update template state for the NEXT line. Count backticks, but ignore any line that carries a
    // regex literal or a same-line balanced string — otherwise workflows.ts's `/[`"“']/` (3
    // backticks, odd) would wrongly flip us into template mode and hide every dispatch after it,
    // which is the exact F-S6 failure. A real multi-line template opener is a line ending in an
    // unclosed backtick with no `/` regex context; the simplest sound signal is: a line that is an
    // assignment/return/call ending with a lone backtick.
    const backtickCount = (trimmed.match(/`/g) ?? []).length;
    if (!isComment && backtickCount % 2 === 1 && !/[/]/.test(trimmed.replace(/`[^`]*`/g, ""))) {
      inTemplate = !inTemplate;
    }

    if (!isComment && !openInThisLine) {
      // `if (...)` / `} else if (...)` testing a parsed-args `.sub`. The binding name is not
      // hardcoded, so renaming `args` to `parsed` does not fail a defect-free change.
      if (/^(?:\}\s*)?(?:else\s+)?if\s*\(/.test(trimmed)) {
        for (const m of trimmed.matchAll(/\b[\w.]+\.sub\s*===\s*"([a-z][a-z-]*)"/g)) found.add(m[1]!);
      }

      if (/^switch\s*\(\s*[\w.]+\.sub\s*\)/.test(trimmed)) switchDepth = depth;

      // A case label counts only at the depth of the switch that opened it, so a nested switch on
      // an unrelated field cannot contribute labels.
      if (switchDepth !== null && depth === switchDepth + 1) {
        const m = trimmed.match(/^case\s+"([a-z][a-z-]*)"\s*:/);
        if (m) found.add(m[1]!);
      }

      for (const ch of trimmed) {
        if (ch === "{") depth += 1;
        else if (ch === "}") {
          depth -= 1;
          if (switchDepth !== null && depth <= switchDepth) switchDepth = null;
        }
      }
    }
  }

  return found;
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
      //
      // Pass-5 F-S6: that fix was narrowed, not closed. `case "x":` matched anywhere still counted,
      // including a `switch` on an unrelated field (a status, an action, a state) that happens to
      // share a spelling with a documented subcommand — structurally the same bug as `accept`.
      // Commented-out and dead code counted too, since the scan never stripped comments.
      const implemented = dispatchedSubcommands(readFileSync(join(ROOT, "cli", `${command}.ts`), "utf8"));
      expect(implemented.size).toBeGreaterThan(0);

      const missing = listed.filter((sub) => !implemented.has(sub));
      expect(missing).toEqual([]);
    });
  }

  describe("F-S6 — 'implemented' means dispatched on, not merely spelled", () => {
    // The three evasions the pass-5 auditor demonstrated against the previous version, verbatim.
    const evasions: Array<[string, string]> = [
      ["commented-out dispatch", `// if (args.sub === "review") { doReview(); }`],
      ["a name inside a string literal", 'die(`try: args.sub === "review"`);'],
      ["a case label on an unrelated field", ['switch (state) {', '  case "review":', "    return markReviewed();", "}"].join("\n")],
    ];
    for (const [label, snippet] of evasions) {
      test(`does not count ${label}`, () => {
        expect([...dispatchedSubcommands(snippet)]).toEqual([]);
      });
    }

    test("still counts the two real dispatch forms", () => {
      expect([...dispatchedSubcommands(`if (args.sub === "review") { go(); }`)]).toEqual(["review"]);
      expect([...dispatchedSubcommands(`if (a.sub === "get") { go(); }`)]).toEqual(["get"]);
      expect([...dispatchedSubcommands(['switch (args.sub) {', '  case "list":', "    return l();", "}"].join("\n"))]).toEqual(["list"]);
      // A differently-named parsed-args binding must keep working: the old pattern hardcoded
      // `a` or `args`, so a rename would have failed the build for a defect-free change.
      expect([...dispatchedSubcommands(`if (parsed.sub === "show") { go(); }`)]).toEqual(["show"]);
    });

    test("a nested switch on another field does not leak its labels", () => {
      const src = [
        "switch (args.sub) {",
        '  case "list": {',
        "    switch (state) {",
        '      case "bogus":',
        "        return x();",
        "    }",
        "  }",
        "}",
      ].join("\n");
      expect([...dispatchedSubcommands(src)].sort()).toEqual(["list"]);
    });

    test("the real CLI files each report a non-empty, plausible dispatch set", () => {
      // The regression that motivated rewriting this extractor: its first version returned an
      // EMPTY set for cli/workflows.ts — a stripper bug — which would have made the
      // names-only-subcommands-that-exist check vacuous for that command rather than failing it.
      for (const command of ["context", "procedures", "workflows"]) {
        const subs = dispatchedSubcommands(readFileSync(join(ROOT, "cli", `${command}.ts`), "utf8"));
        expect(`${command}:${subs.size > 0}`).toBe(`${command}:true`);
      }
    });

    test("a dispatch-shaped line inside a multi-line template literal is not counted (F-T9)", () => {
      // The pass-6 evasion: a usage/help string is a template literal, and an example line inside it
      // shaped like a real dispatch (`if (args.sub === "ghostcommand")`) was counted as an
      // implemented subcommand — so a --help text documenting a command it does NOT have would pass
      // the "names only real subcommands" check. Real dispatch after the literal must still count.
      const src = [
        "const USAGE = `",
        "  ebrain foo <bar>",
        '  if (args.sub === "ghostcommand") { ... }   // example shown in help',
        "`;",
        'if (args.sub === "real") { doReal(); }',
      ].join("\n");
      const subs = [...dispatchedSubcommands(src)];
      expect(subs).toContain("real");
      expect(subs).not.toContain("ghostcommand");
    });

    test("workflows.ts's regex literal with a backtick does not blind the detector (F-T9 trap)", () => {
      // The template-tracking must NOT reintroduce the F-S6 backtick bug: cli/workflows.ts contains a
      // regex literal `/[`"“']([^`"”']{4,80})[`"”']/` with an odd number of backticks, which a naive
      // parity counter would treat as opening a template and hide every dispatch after it. Assert the
      // full real set survives, not just non-emptiness.
      const subs = [...dispatchedSubcommands(readFileSync(join(ROOT, "cli", "workflows.ts"), "utf8"))].sort();
      expect(subs).toEqual(["capture", "ingest", "list", "run", "search", "show", "skillify"]);
    });
  });

  test("`-h` in a value position is not treated as help (F-Q3)", () => {
    // `ebrain context get -h` used to print usage and exit 0 — the user asked for a real
    // operation and silently got nothing. It must reach the command's own validation.
    const res = run("context", ["get", "-h"]);
    expect(res.stdout).not.toStartWith("usage:");
    expect(res.code).not.toBe(0);
  });

  test("`--help` as the VALUE of a value-taking flag is data, not help (F-S4)", () => {
    // The pass-4 fix left the long form scanning all of argv, justified by the claim that no
    // subcommand takes `--help` as a value. `--content` and `--evidence` take free text, so
    // setting a pack's content to the literal string "--help" printed usage and exited 0 —
    // a silent no-op indistinguishable from success. Verbatim from the pass-5 reproduction.
    const res = run("context", ["update", "some-pack-id", "--content", "--help", "--yes"]);
    expect(res.stdout).not.toStartWith("usage:");
    // It must reach the real operation: either it performs it or it rejects the pack id. Either
    // is correct; printing usage and claiming success is not.
    expect(res.code).not.toBe(0);
  });

  test("`--help` still works in a flag position, before and after a subcommand", () => {
    // The other direction: the F-P6 fix must survive. A reader following the documented
    // `ebrain context --help` gets help on stdout with exit 0, not an error on stderr.
    for (const argv of [["--help"], ["get", "--help"]]) {
      const res = run("context", argv);
      expect(res.stdout).toStartWith("usage:");
      expect(res.code).toBe(0);
    }
  });
});
