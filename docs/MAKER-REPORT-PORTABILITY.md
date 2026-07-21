---
type: maker-report
project: ebrain
spec: docs/SPEC-PORTABILITY-HARDENING.md
addresses: docs/AUDIT-F7-F12-PASS5.md (F-S1 … F-S9)
created: 2026-07-21
author: Opus (remediation maker — NOT the checker; this tree has not been independently audited)
---

# Maker report — portability hardening

This closes the pass-5 findings. It is a maker report: **no verdict is claimed here.** The branch is
not merged and must not be until an independent checker returns `[AUDIT_PASS]` against
`docs/SPEC-PORTABILITY-HARDENING.md`.

## What was actually wrong, in one sentence

The location fix from pass 4 was applied to the shell layer, and the defect lived in the TypeScript
layer — so eleven launchers found the right checkout and then `exec`ed into a `bun` process that
never received the answer and guessed `$HOME/eBrain`.

## Evidence that each test fails against the pre-fix code

Spec invariant I6 requires this, because three of the five audit rounds were caused by tests that
could not fail. Each block is real output, not a description of expected output.

### F-S1 — the resolved location never crossed the process boundary

`cli/launcher-env.test.ts` run against the pre-fix branch (`345e7a3`), spawning the launcher
extracted from the git index into a checkout at an arbitrary path, sandboxed `HOME`, no
`EBRAIN_HOME` anywhere in the ancestry:

```
Expected to contain: "INHERITED_EBRAIN_HOME=/tmp/ebrain-launcher-bjwezZ/some/where/else/project-checkout"
Received: "INHERITED_EBRAIN_HOME=<unset>\nARGV=run /tmp/.../cli/up.ts --help\n"
Expected to contain: "INHERITED_EBRAIN_HOME=/tmp/ebrain-launcher-bjwezZ/..."
Received: "INHERITED_EBRAIN_HOME=<unset>\nARGV=run /tmp/.../cli/mcp-bridge.ts\n"

 2 pass
 5 fail
```

`INHERITED_EBRAIN_HOME=<unset>` next to a correct `ARGV` is the defect stated exactly: the right file
ran, with the wrong environment. `cli/mcp-bridge.ts` is the process that writes the MCP command
string into every agent's config.

### F-S6 — the dispatch check counted things that are not dispatch

The three evasions from the pass-5 report, fed to the pre-fix detector, all registered as
implemented: a commented-out `if`, a name inside a template literal, and a `case "review":` inside
`switch (state)`. Now asserted empty in `cli/documented-help.test.ts`.

**And the first fix for it was wrong, which is recorded here rather than quietly discarded.** The
initial rewrite stripped comments and string literals with regexes. `cli/workflows.ts` contains a
regex literal — ``/[`"“']([^`"”']{4,80})[`"”']/`` — whose backtick opened a phantom template literal
that swallowed 130 lines, so the file reported **zero** dispatched subcommands and the
"names-only-real-subcommands" check went vacuous instead of failing:

```
context [ "list", "proposals", "init", "get", "update", "propose", "review" ]
procedures [ "list", "show", "use", "review" ]
workflows []
```

Hand-rolling a JavaScript tokenizer to check a JavaScript file was the same over-reach that produced
the bug being fixed. The shipped version matches statement shape instead, and a test now asserts all
three files report a non-empty set — the specific failure above cannot recur silently.

### F-S3 — the `set -e` trap introduced while fixing it

The symlink fix was first written as `EBRAIN_REAL="$(readlink -f ...)" && [ -n ... ] && ...`. Under
`set -euo pipefail` a trailing failed `&&` **aborts the script**, so on any system whose `readlink`
lacks `-f` the graceful degradation would have been a hard failure. Caught before commit, fixed to an
explicit `if`, and `cli/launcher-env.test.ts` now runs a launcher with a `readlink` that always fails
and asserts exit 0.

### Citation integrity

`cli/citations.test.ts`, on first run, found **twenty** broken repository citations, including the
`docs/AUDIT-F7-F12-PASS4.md` that pass 5 flagged. That file has never existed; the pass-4 report was
never written to disk, and the CHANGELOG and PR body cited it without checking — in the same commit
that corrected the previous false claim. Both are now corrected in place, and the check is a test.

Fourteen pre-existing broken citations in planning documents are a frozen baseline that can only
shrink; a second test fails if an entry stops being broken and is left on the list.

## Changes

| Finding | Change |
| --- | --- |
| F-S1 | `cli/ebrain-home.ts` (new): TypeScript resolves the checkout from `import.meta.dir`, independent of any env var. All 8 hardcoded `.ts` sites now call it. `ebrain_export_home` added to the shell resolver; all 12 launchers use it. Two redundant mechanisms — either alone is sufficient. |
| F-S2 | systemd units are now `.service.in` / `.timer.in` templates with `@EBRAIN_HOME@`, installed by `scripts/install-dream-timer.sh`, which resolves the real checkout and aborts if substitution fails. Docs no longer teach `cp`. |
| F-S3 | Launchers resolve their own symlink **before** sourcing the resolver; degrades gracefully where `readlink -f` is absent. |
| F-S4 | `cli/help-flag.ts` (new): `--help` is help only in a flag position. `--content --help` sets the content to `--help`. |
| F-S5 | The guard covers shell (incl. split quoting), systemd `%h`, and the TypeScript `join(homedir(), "eBrain")` forms, with a test that each pattern actually matches. |
| F-S6 | Dispatch detection matches statement shape, not text; the three demonstrated evasions are asserted excluded. |
| F-S7 | Overlay hook copies validate the recorded path and tolerate CRLF, proven equal to the canonical resolver on four inputs. The secret guard no longer fails **silently**: it warns, and `EBRAIN_GUARD_STRICT=1` makes it deny. |
| F-S8/F-S9 | Accepted as stated (test-boundary limitations, not defects). No change. |

## Decisions a reviewer should weigh, not assume

1. **The secret guard still fails open.** Blocking every tool call because eBrain moved is worse than
   the risk, and the agent's own instructions also forbid reading secrets — but this is a security
   posture choice, now explicit and switchable, not an accident.
2. **Two resolvers exist, in two languages.** That is duplication. It is deliberate: a single source
   of truth that has to be *handed across* a process boundary is exactly what failed.
3. **The citation baseline forgives fourteen pre-existing breaks.** They are real debt, listed by
   name, and outside this spec's scope.

## Verification

- `bun test ./cli/` — 364 pass, 0 fail (was 335 before this work; 29 new tests).
- All shell entrypoints pass `bash -n`.
- Not yet run in this report: TUI suite, Astro check/build, and a clean-checkout CI run. Those are
  recorded in the PR, not here.
