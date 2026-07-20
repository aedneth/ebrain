---
type: maker-report
project: ebrain
phase: independent-audit remediation (F7-F12 range)
status: maker-complete after three audit passes -- see "What this verification does and does not establish"
created: 2026-07-19
maker: Opus (orchestrator acting as maker)
checker: independent read-only checker, two passes
branch: release/open-source-publication
related: [AUDIT-F7-F12-INDEPENDENT.md, AUDIT-F7-F12-REAUDIT.md, HANDOFF-BACK.md]
---

# Maker Report — Independent Audit Remediation

**Read this before touching the branch.** It is the current state of the F7-F12 release candidate
after two independent audit passes, and it tells you what is closed, what is deliberately open, and
what must not be changed.

## How we got here

The F7-F12 range (F7 dialogs, F8 composer/workspaces, F9 governed memory, F10 claims/license/docs/
website, F11 release gate, F12 publication surface) was built by Codex and had **never received an
independent audit** — three earlier attempts produced no verdict. Two audits then ran:

| Pass | Report | Verdict | Outcome |
| --- | --- | --- | --- |
| 1 — full range | `docs/AUDIT-F7-F12-INDEPENDENT.md` | `[AUDIT_FAIL]` | 2 blocking truthfulness defects + 1 owner decision + durability findings |
| 2 — remediation delta | `docs/AUDIT-F7-F12-REAUDIT.md` | `[AUDIT_FAIL]` | originals all closed, but the fix introduced 1 new fail-open regression |

This report covers the maker work for both. A third pass is required: **the F-R fixes below have not
been independently checked.**

## Round 1 — the original blocking findings

### F-A1 (BLOCKER) — the published quickstart did not work

`scripts/install.sh` defaulted `EBRAIN_HOME` to `$HOME/eBrain` and `--from-source` died unless the
checkout was exactly there, while `README.md` and `docs/getting-started/install.md` tell the reader
to clone into a directory of their choosing. Every reader following the primary call-to-action hit
`exit 1`. The existing suite missed it because every test sets `EBRAIN_HOME` explicitly — which is
precisely what a real reader does not do.

**Fix:** `--from-source` resolves the checkout from the installer's own location; an explicit
`EBRAIN_HOME` still wins. New test `cli/install.test.ts` → "published quickstart sequence" runs the
four documented lines verbatim with no `EBRAIN_HOME`. **Verified non-vacuous**: the same sequence
against `git show 7385e94:scripts/install.sh` gives `exit 1` with the exact original error.

### F-A2 (HIGH) — published copy promised configuration that did not exist

`SECURITY.md` claimed a "configurable deny-list" and `docs/guides/privacy.md` told users to
"configure local exclusions". Neither existed: the list was a hardcoded constant duplicated across
four sites. A privacy guide is the worst place to overclaim.

**Fix — implemented rather than reworded**, which also discharged the code half of release blocker
F-B1. New `cli/deny-policy.ts` is the single source of truth:

- Resolution: `EBRAIN_DENIED_REPOS` → `EBRAIN_DENY_CONFIG` → `$XDG_CONFIG_HOME/ebrain/denied-repos`
  → empty. Set-but-empty means "deny nothing", not "fall through".
- Fails closed: unreadable or malformed policy aborts rather than continuing with a silently
  smaller one. Errors report a **line number, never the token** (a malformed entry can contain a
  real name).
- Matching: whole path **segment** for paths (after the caller resolves symlinks), **substring** for
  source identities and memory text, always case-insensitive, dots literal.
- Consumers rewired: `sessions`, `isolation`, `context`, `episodes` (two sites incl. the recall
  query), `trust.sh`, `doctor.sh`. `doctor.sh` had drifted into its own inlined copy of the list.

Documented at `docs/reference/configuration.md#repository-deny-policy`, referenced from
`SECURITY.md` and the privacy guide, with an upgrade note.

### F-D1 — Spanish deny message leaking client names (found by the orchestrator, missed by both maker and checker)

`cli/sessions.ts` returned a message interpolating the denied repository names into user-visible
output, in Spanish. Any public user tripping the guard saw the operator's client names.

**Fix:** English, name-free. `assertNoClientSources` and `doctor` report a **count**. The i18n guard
that should have caught it was itself the defect — a curated word list with no entry matching that
sentence and no diacritic. See "the guard" below.

### F-C3/F-C4/F-C5

`EBRAIN_HOME` is exported once by `cli/ebrain` (derived from its own location) and inherited by
children; `remember.sh`, `ebrain-q`, `ebrain-brain` no longer use `$HOME/eBrain` literals. The
`assertNoClientSources` "PENDING" comment was **stale** — it has been wired at daemon boot via
`cli/daemon-preflight.ts` since D.5.4. `CONTRIBUTING.md` no longer calls `ebrain` before installing.

## Round 2 — what the re-audit found in my own fix

The checker confirmed every round-1 finding genuinely closed and every isolation guarantee intact
under its own adversarial fixtures — then found that **the fix introduced a fail-open regression in
the shell half of the very policy it created.** This is the most important section of this report.

### F-R1 (HIGH, was blocking) — `trust.sh` failed OPEN on CRLF and malformed entries

The TS half validated entries; the shell half spliced them straight into `grep -E`. Three
reproduced failure modes:

1. **CRLF config → silent fail-open.** A `denied-repos` saved with CRLF: TS strips `\r` and denies
   correctly; the shell kept a literal CR and matched nothing. Same file, two different policies,
   no error anywhere. A denied repo would have passed `remember`'s hard-deny into permanent memory.
2. **One malformed entry disabled the WHOLE shell policy.** `foo(` makes the combined pattern an
   invalid ERE → `grep` exits 2 → reads as "no match" → **allow**, including for every valid entry.
   A leading dash is parsed as a grep option, same result.
3. **Dot semantics diverged.** TS matched `a.b` literally; the shell treated `.` as a wildcard.

**Fix:** `trust__load` in `harness/core/trust.sh` now parses **and validates** with the identical
grammar as `SAFE_ENTRY` in `cli/deny-policy.ts`, strips CR, escapes dots, and on any invalid entry
sets `TRUST_POLICY_ERROR=1` (deny everything) while reporting the line number.

> **Lesson worth carrying:** a deny-list expressed as a shell regex alternation has an inverted
> failure mode. `grep -E ""` on an empty pattern matches *everything*, and an invalid pattern
> matches *nothing*. Making such a list user-configurable converts both into silent security
> changes. Always route matching through a function that short-circuits on empty, and validate
> every entry before it reaches the regex.

### F-R2 (MEDIUM) — `doctor` could report isolation OK under a policy it could not read

`TRUST_POLICY_ERROR` was never consulted, so an unreadable policy produced a green isolation line.
**Fix:** both branches check it first; new `sources:deny-policy` check reports the policy state
(entries loaded / none configured / unreadable) as the surfacing point for this whole class.

### F-R3 (MEDIUM) — `EBRAIN_MEMORY_HOME` was writer-only

`remember.sh` honored it; `cli/memory.ts` and `status.sh` did not → silent split brain.
**Fix:** readers honor it too.

### F-R4 (LOW) — i18n guard false negatives on a guarded surface

Three Spanish lines still shipped in `remember.sh` and passed the strengthened guard.
**Fix:** translated, and the detector was restructured into two tiers — **STRONG** (content words
that are not English words at all; one is conclusive) and **FUNCTION** (grammatical glue; two on one
line). Two further guard defects were found while doing this:

- `SPANISH_STRONG` initially carried a `g` flag while being used with `.test()`. A global regex
  keeps `lastIndex` across calls, so it alternated true/false on identical input — it would have
  missed every other Spanish line. **No shared global regex may be used with `.test()`.**
- The guard's stated contract ("comments may stay Spanish") was not implemented: a commented
  `# echo "…"` in a usage block was scanned as a sink. Comment lines are now skipped.

The pinned regression now runs through `scanText()` — the real detector — not the helper.

### F-R5 (LOW) — dead name-echo site in daemon preflight

`cli/daemon-preflight.ts` recomputed the leaked list after `assertCleanSources` already threw, and
interpolated denied identifiers into daemon boot output. Unreachable, but exactly the pattern F-D1
removed. **Fix:** deleted. `deny-policy.ts` invalid-entry errors also reduced to the line number.

## Round 3 — the code was right and the delivery was broken

Pass 3 (`docs/AUDIT-F7-F12-PASS3.md`) confirmed the F-R delta sound: `TRUST_POLICY_ERROR` cannot be
bypassed because the check lives inside `trust_denied()` itself, the 24 new tests are non-vacuous
(7 fail when replayed against the pre-fix `trust.sh`), `EBRAIN_MEMORY_HOME` symmetry holds, and no
identifier leaked into the tree or the built site. Both **blocking** findings came from a scope
extension — auditing the published documentation as a public contract — and neither was in the code
the previous passes had been staring at.

### F-P3 (BLOCKING) — the quickstart was broken again, one layer down

`scripts/install.sh` was tracked at mode `100644`. Every other entrypoint under `scripts/` is
`100755`. The docs say `./scripts/install.sh --from-source`, so a fresh clone answered
`Permission denied` on the first command a reader runs.

This is F-A1's class, surviving F-A1's fix, because the round-1 test verified the installer's
*logic* against a copy of its *contents*: the fixture wrote its own `install.sh` with a forced
`chmod 755`, and invoked it as `sh ["./scripts/install.sh"]` — naming the interpreter bypasses the
executable bit the reader depends on. The test could not have failed.

**Fix:** `git update-index --chmod=+x`, plus two tests that take the artifact instead of a copy —
one asserting that every `./…sh` command appearing in published docs is tracked `100755` (the list
is *derived from the docs*, so documenting a new one brings it under the guarantee automatically),
and one materializing the tracked tree with `git checkout-index` and executing it with no `chmod`
and no interpreter named. Deliberately the index rather than `HEAD`, so a mode fix is verifiable
before it is committed.

### F-P4 (BLOCKING) — cloning the engine is not installing it

`install.sh` ran `bun install` only in `$EBRAIN_HOME`. The pinned engine at `vendor/gbrain` is a
separate package with its own lockfile, and the CLI's MCP bridge imports its modules directly, so
`ebrain up` — the first documented command — died with `Cannot find module
'@modelcontextprotocol/sdk'`. Confirmed engine-local: that module is not in the root `node_modules`
at all.

It was invisible from three directions at once. Every existing test set `EBRAIN_SKIP_GBRAIN=1`, so
the engine branch had no coverage. The maintainer's machine had the modules from an earlier manual
install. And **CI passed because CI performs the install in a step of its own that the installer
never performed** — green CI was reproducing a sequence no user runs.

**Fix:** the installer installs the engine's lockfile, with `--ignore-scripts` (a pinned commit is
only a supply-chain guarantee if postinstall hooks never run). New test drives the real installer
against a local stand-in engine repo with a fake `bun` that records the directory each install ran
in, and asserts both directories appear.

### F-P1/F-P2/F-P5 — parity made true instead of reworded

Two grammar gaps, both failing toward *more* restriction, never fail-open — but both contradicting
what the configuration reference promises users:

- Under a UTF-8 locale glibc's `[a-z]` is collation-aware, so the shell validator accepted `café`
  while the TS half rejected it. Confirmed with real `grep`: `LC_ALL=en_US.UTF-8` accepts,
  `C` and `C.UTF-8` reject. Effect was an availability split — shell commands enforced, every TS
  command aborted, on the same file.
- Separators diverged: JS `\s` counts vertical tab, form feed and U+00A0; `tr ', \t'` did not.

**Fix:** `LC_ALL=C` around the shell validation and matching greps, an explicit shared ASCII
separator set on both sides, and `String.trim()` replaced by that same set (it is Unicode-aware and
was silently trimming U+00A0 on one half only). The documentation now states the grammar instead of
claiming parity in the abstract.

Both parity cases were **vacuous when first written** and had to be repaired before they meant
anything: the shell harness passed no locale, so the child ran under C where the divergence cannot
occur; and `trust_denied` answers DENIED both for "this entry matched" and for "the policy failed
to parse, so everything is denied" — so the separator cases agreed by accident. The suite now pins a
UTF-8 locale and asserts the *loaded entry count* against the TS list, not just the verdict.

### F-P6/F-P7/F-P8

Three documented `--help` invocations did not exist; `ebrain workflows --help` printed **nothing**
and exited 0, indistinguishable from success, because its parser treats a flag-shaped first argument
as an absent subcommand and falls back to `list`. All three now answer on stdout with exit 0. New
`cli/documented-help.test.ts` extracts the commands *from the documentation* and also asserts the
usage string names only subcommands that exist — which immediately caught three invented names in
the first `workflows` usage line I wrote.

The i18n guard's `COMMENT_LINE` treated a leading `*` as a comment in every language, but in shell
that is a `case` glob arm: `cli/ebrain` has four live `*) echo "…" >&2` lines the guard was skipping
entirely. Leading `*` now counts as a comment only in `.ts`/`.tsx`. And `leer` left the "not English
at all" tier — it is a real English verb, and a guard that can fire on valid English gets disabled.

### F-P9's class, closed at the two remaining sites

Running the suite under a sandboxed `HOME` with an empty `XDG_CONFIG_HOME` surfaced two failures
that had nothing to do with the deny policy: `cli/fleet.ts` and `cli/sessions.ts` still defaulted
`EBRAIN_HOME` to `$HOME/eBrain`, so a source user who cloned anywhere else got no adapters at all.
`cli/task-profile.ts` had already been fixed this way during F12; these were the last two sites.
Both now fall back to their own checkout via `import.meta.dir`. The suite is machine-independent:
identical results with a real `HOME`, with a sandboxed one, and with or without `EBRAIN_HOME`.

## New coverage

`cli/deny-policy.test.ts` (new, 24 tests) — the config-FILE path had **zero** coverage before, and
the shell half had none at all. It drives **both halves from the same fixture files and asserts they
agree**, because a divergence means one config file has two meanings. Covers: resolution order and
precedence, set-but-empty, missing file, `denyConfigPath`, unreadable → throw, malformed → throw
without echoing the token, CRLF, comment-only, whitespace-only, dot-literal parity, segment matching,
no over-block, symlink resolution, and five malformed-entry classes that must fail closed on the
shell path.

## Verification

| Check | Result |
| --- | --- |
| `bun test ./cli/` (no `EBRAIN_HOME` — as CONTRIBUTING documents) | **330 pass / 0 fail** |
| `EBRAIN_HOME="$PWD" bun test ./cli/` | **330 pass / 0 fail** |
| `bun test ./cli/` under a sandboxed `HOME` + empty `XDG_CONFIG_HOME` | **330 pass / 0 fail** (machine-independent) |
| `bun test ./tui/test/` | **442 pass / 0 fail** |
| `bun run --cwd website check` | 0 errors / 0 warnings / 0 hints |
| `bun run website:build` | 40 pages, 38 documentation routes verified |
| shell syntax (8 entrypoints), zero-hex, `git diff --check` | clean |
| live policy check (operator's own config, names never printed) | denies by path, subpath, case, source name; no over-block; shell and TS agree |

## What this verification does and does not establish

Every round-3 fix was checked by the maker directly, and every one of them has a test that was
**proven to fail against the pre-fix code** before being accepted — the executable bit, the engine
install, the locale and separator parity, the three `--help` commands, the shell `case`-arm blind
spot. Two of those proofs are not opinions about the code but the user's own experience executed:
the tracked tree is materialized and the documented command is run against it with nothing forced.
For that class of defect this is the strongest available evidence, and a further reviewer would be
re-running the same commands.

What it cannot establish is the absence of a defect nobody thought to look for. That is worth
stating plainly, because it is the pattern of this whole engagement: pass 1 found broken delivery in
code that passed its tests, pass 2 found a fail-open inside pass 1's fix, pass 3 found broken
delivery inside pass 2's verified-green tree, and writing the round-3 fixes surfaced two more
vacuous tests plus three invented subcommand names — all in work its own author believed was
finished. Every pass found something in the previous maker's blind spot, and the maker was never the
one who found it.

So: these fixes are verified. Whether the *release* is ready is a different question, and answering
it yes on the maker's own word would be the one move this project's history most clearly argues
against.

## Open — NOT closed by this work

**Owner decision (blocks deploy sequencing, not code):**

- **F-A3** — with the site public and the repo private, every GitHub link on the site (header,
  footer AGPL/Security, documented `git clone`) is a 404 for visitors. Must be decided, not
  discovered in production.

**Blocking repository visibility only (unchanged):**

- **F-B1 prose half** — operator identity remains in `CHANGELOG.md`, `AGENTS.md`, `CLAUDE.md`, ADRs,
  and the ***allow*-lists** of `harness/core/trust.sh` (own-remote patterns, local-only slugs). The
  deny half is done; the allow half is untouched and still names the operator.
- **F-B2** — ~26 operator documents remain tracked (handoffs, audit transcripts, sprints, kickoff
  prompts, devpost material, `human-checklist`), plus personal paths in `cli/sessions.test.ts`,
  `CLAUDE.md`, `cli/contract.test.ts`. **Both audit reports are themselves now in this set.** Note
  git history retains all of it even if deleted — the history strategy gate is the only real cure.
- **F-C1/F-C2** — CI `if rg` guards swallow rg errors as "no findings"; the secret scan excludes all
  `*.test.ts` with only three patterns.

**Verified as not reaching the public site:** none of the above appears in the built `dist/` or the
search index — the checker confirmed this independently in both passes.

## Do not change

- The **AGPL-3.0-only relicense** and the **README rewrite** are owner-endorsed. Defects in them are
  corrections in place, never reverts.
- The **branch** `release/open-source-publication` is being kept. Do not restart from main.
- The **fail-closed direction** of every isolation check. If a change makes a guard more permissive,
  it needs its own audit.
- `docs/release/open-source-readiness.md` — its four gates must remain unresolved.

## Notes for the next maker

- The `ckis-backup` bot auto-commits and **pushes** roughly every 15 minutes. It swept work-in-
  progress into `6edad28`, `b2c90e0`, and `8ed72df` on this branch. Judge the tree, not the commit
  boundaries; the squash-merge collapses them. Do not force-push to rewrite them — PR #1 is open.
- Tests that touch the deny policy must declare their own fixture policy via `EBRAIN_DENIED_REPOS`
  at module top, so the suite never depends on the machine's configuration.
- `ebrain remember`'s MCP write-through warns when the daemon is unreachable. That warning is
  truthful and expected; the learning is still durable on disk.
