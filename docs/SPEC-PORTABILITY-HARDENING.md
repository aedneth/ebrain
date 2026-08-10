---
type: spec
project: ebrain
status: in progress
created: 2026-07-21
author: Opus (remediation maker)
supersedes: nothing — this is the acceptance contract for PR #4 and every pass after it
---

# Spec — eBrain must work on a machine that is not the author's

## Why this spec exists

Five independent audit passes have now returned `[AUDIT_FAIL]`, and the failures form one shape:

| Pass | What broke | What it had in common |
| --- | --- | --- |
| 1 | Published quickstart failed at step 4 | Logic correct, delivery broken |
| 2 | Fail-open regression inside pass 1's own fix | The fix was not tested against the pre-fix code |
| 3 | Installer tracked non-executable; engine cloned but never installed | Verified a copy of the artifact, not the artifact |
| 4 | 26 sites hardcoded `$HOME/eBrain` | The claim "the last two sites" was written without running the search |
| 5 | The resolved location is never exported; TypeScript never receives it | Fixed the layer being looked at, assumed the rest |

The through-line is not carelessness about logic. It is that **every check so far has been run in the
one environment where eBrain already works** — the author's machine, with the checkout at
`$HOME/eBrain`, with `EBRAIN_HOME` already exported by an ancestor process, with the engine's modules
already installed from a previous run, with `en_US.UTF-8` collation.

A developer who installs this gets none of those. This spec makes "not the author's machine" the
acceptance environment.

## The acceptance criterion

> Every user-reachable entrypoint must work from a checkout at an arbitrary path, under an arbitrary
> `$HOME`, with no `EBRAIN_HOME` anywhere in the process ancestry, with no pre-existing eBrain state,
> and under the `C` locale — **or fail loudly**. Silently doing the wrong thing is the defect class
> this whole document exists to close.

"User-reachable" means: anything with a shebang, anything documented, anything an agent spawns. Not
just the blessed `cli/ebrain` dispatcher.

## Invariants

Each is a testable statement, and each maps to a test file below.

**I1 — One answer about where eBrain lives, reachable from both languages.**
Shell resolves it via `harness/core/ebrain-home.sh`; TypeScript resolves it via `cli/ebrain-home.ts`.
Neither depends on the other having run. A launcher that forgets to export, or a `.ts` file invoked
directly by `bun`, both still land on the real checkout.

**I2 — The location crosses every process boundary it needs to.**
Where a shell entrypoint `exec`s into `bun`, the grandchild's `process.env.EBRAIN_HOME` is the
resolved checkout — asserted by spawning the real script, not by unit-testing the function.

**I3 — No file of any type reintroduces a hardcoded home path.**
The guard covers every spelling in the repository's actual vocabulary: POSIX shell (`$HOME/eBrain`,
`${HOME}/eBrain`, `"$HOME"/eBrain`), systemd (`%h/eBrain`), and TypeScript
(`join(homedir(), "eBrain")`, `join(HOME, "eBrain")`). A new spelling in a new file type is a gap in
this test, and adding the file type is part of adding the file.

**I4 — Copies that live outside the checkout behave like the canonical resolver.**
The overlay hooks cannot walk up. They must still validate the recorded path, tolerate CRLF, and
fall through when the record is stale — same decisions the resolver makes, proven against the same
inputs.

**I5 — A help flag never eats a real operation.**
`--help` and `-h` are help only in a flag position, never as the value of a value-taking flag.
Setting a context pack's content to the literal string `--help` performs the update.

**I6 — A test that cannot fail is a defect.**
Every test added here is proven to fail against the pre-fix code, and the proof is recorded in
`docs/MAKER-REPORT-PORTABILITY.md` with the observed failure output. A test asserting a property of a
fixture the test itself created does not satisfy this.

## Out of scope, deliberately

- Packaging (`npm` / `curl | sh` install) — the real friction reduction, specified separately. This
  spec makes the source install correct; it does not make it one command.
- The v2 provider/routing refactor.
- Repository visibility.

## Test map

| Invariant | Test file | Kind |
| --- | --- | --- |
| I1 | `cli/ebrain-home.test.ts` | unit + sandboxed HOME |
| I2 | `cli/launcher-env.test.ts` | **subprocess** — spawns real `scripts/*` |
| I3 | `cli/ebrain-home.test.ts` | repository-wide grep-as-test |
| I4 | `cli/overlay-resolver.test.ts` | shell parity against canonical |
| I5 | `cli/documented-help.test.ts` | CLI behavior |
| I6 | `docs/MAKER-REPORT-PORTABILITY.md` | recorded failure output |

## Definition of done

1. Every invariant above has a passing test, and every test has recorded pre-fix failure output.
2. `EBRAIN_HOME` unset + arbitrary checkout path + sandboxed `HOME` + `LC_ALL=C`: full CLI and TUI
   suites pass.
3. An independent checker, given only this spec and the branch, returns `[AUDIT_PASS]`.
4. No claim in `CHANGELOG.md`, the PR body, or any maker report cites a document without that
   document existing in the tree. Checked by test, because pass 4 and pass 5 both broke this rule.
