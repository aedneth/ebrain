---
type: maker-report
project: ebrain
spec: docs/SPEC-PORTABILITY-HARDENING.md
addresses: /tmp/AUDIT-F7-F12-PASS6.md (F-T1 … F-T15)
created: 2026-07-21
author: Opus (remediation maker — NOT the checker; this tree has not been independently audited)
---

# Maker report — pass-6 remediation

Pass 6 returned `[AUDIT_FAIL]` with two blocking findings and four HIGH. Its headline was fair and is
worth repeating: **the engineering was real this time; the verification was not.** F-S1 was confirmed
genuinely closed. The branch then failed on the same meta-defect it exists to remove — a guard that
passed over nothing, and published numbers that were false.

This report records what was fixed and the **measured** evidence for each. Every number here was
produced by a command run at the time of writing, not recalled — that discipline is itself the fix
for F-T2.

No verdict is claimed. The branch must not merge until an independent checker returns `[AUDIT_PASS]`.

## Measured state (commands run for this report)

- `bun test ./cli/` on `origin/main`: **330 pass, 0 fail**.
- `bun test ./cli/` on this branch: **383 pass, 0 fail** — identical under `LC_ALL=C LANG=C` with
  `EBRAIN_HOME` unset. Net **+53** tests over main.
- `bun test ./tui/test/`: **442 pass, 0 fail**.
- `bun run --cwd website check`: 0 errors / 0 warnings / 0 hints. `website:build`: **40 pages, 38
  documentation routes**.
- All touched shell entrypoints pass `bash -n`.
- New CLI test files on this branch vs main: `citations`, `ebrain-home`, `harness-wrapper`,
  `launcher-env`, `locale-portability`, `overlay-resolver` (6 files).

## Blocking

### F-T1 — the hardcoded-path guard was vacuous outside a git checkout

`cli/ebrain-home.test.ts` read `git ls-files`; outside a git checkout that returns nothing and every
assertion passed over an empty list. eBrain ships as a tarball / `git archive` / Docker `COPY` — none
of them git — so invariant I3 had zero enforcement in every environment a user installs from.

**Fix:** the guard now walks the working tree filesystem (skipping deps/vendor/build dirs), not the
git index. Two new tests: a non-emptiness canary (`sourceFiles().length > 50`, plus named files that
must be present), and an on-disk canary that plants an offending file and asserts it is caught.

**Verified**, in a real non-git tarball:
```
=== not a git repo? === fatal: not a git repository
=== clean tarball: guard PASSES === 8 pass / 0 fail
=== plant tilde + shell violation === catches both:
  "scripts/planted.sh:1 [tilde ~]: X=..."
  "scripts/planted2.sh:2 [shell $HOME]: BRIDGE=..."
  1 fail
```
Before the fix, the same planted tarball reported 6 pass / 0 fail.

### F-T2 — the published verification numbers were false and self-contradictory

Maker report said 364; CHANGELOG and PR said 370; the real count on the author's machine was 369/1,
failing on `citations.test.ts` itself. The baseline "335" was really 330; "29 new tests" was ~40.

Two root causes, both fixed: the false count came from `citations.test.ts` asserting on gitignored
`vendor/gstack` (F-T7, below), and the numbers were **recalled, not measured**. Every figure in this
report and the CHANGELOG entry was produced by a command run at write time. The lesson is procedural
and is now a standing rule: measure, paste the output, never narrate a count from memory.

## HIGH

### F-T3 — the secret-guard "no longer silent" fix reached 1 of 6 agents

Pass 5 fixed the Codex overlay copy. The wrappers **generated** by `harness/core/install.sh` for
Claude/Gemini/Cursor/OpenCode/generic still failed open with exit 0 and empty stderr. Claude Code —
the orchestrator here — got the silent version.

**Fix:** the generated-wrapper template now warns to stderr when the canonical core is missing, and
`EBRAIN_GUARD_STRICT=1` turns a missing **secret** guard into a denial (exit 2) while non-security
hooks stay fail-open. **Verified against the real generated artifact** (ran the installer, broke the
baked home): default → warns + exit 0; strict → exit 2; `inject-context` under strict → exit 0.
Regression: `cli/harness-wrapper.test.ts` (runs the installer, exercises the generated file).

### F-T4 — CI set EBRAIN_HOME, so it never exercised the fix

`.github/workflows/ci.yml` ran the CLI suite with `EBRAIN_HOME: ${{ github.workspace }}`, short-
circuiting the resolver — then that green was cited as portability evidence. **Fix:** the CLI suite
now runs without `EBRAIN_HOME`, and a second time under `LC_ALL=C`, so CI is the portability proof
(F-S1 + the tmux/locale defect) rather than a claim about one.

### F-T5 — `ebrain doctor`, the quickstart's second command, failed on every fresh install

`doctor` demanded seven launchers in `$HOME/.config/ebrain/` that nothing in the repo creates — only
a manual `scripts/README.md` procedure did, which `install.sh` never runs. A correct fresh install
reported 9–10 FAIL / exit 1. Compounding it, `ebrain route` dispatched to a `$CFG/ebrain-route` that
did not exist in the repo at all.

**Fix:** created the missing `scripts/ebrain-route` launcher (versioned sibling of the others);
`doctor` now resolves launchers from `$EBRAIN_HOME/scripts/` with a `$CFG` legacy fallback; and
absent user config (routing.yaml, the config dotenv) is a WARN with a "run ebrain up" hint rather
than a FAIL, distinguishing "not configured yet" from "broken". **Verified** on a fresh sandboxed
HOME: `ebrain doctor: OK · 10 warn`, exit 0 (was `9 FAIL · 10 warn`, exit 1).

### F-T6 — a checkout path containing a space broke session management

Five CLI + two TUI tests failed solely because of a space, reproduced with two clones differing only
by a space in a parent directory. Root cause: the tests interpolated the fake-agent path into a raw
`launchCmd` string, which tmux hands to `sh -c` and splits. The real production launch resolves the
agent binary from the adapter manifest and does not embed the checkout path, so this was a test-layer
defect — but the spec's "arbitrary path" includes spaces, and a contributor in `~/My Projects/ebrain`
hit seven failures. **Fix:** the fixtures use `launchArgv` (which quotes each token), and a new
regression creates the cwd **and** the launched script under a spaced path. **Verified:** the spaced
clone went from 4 fail to `37 pass / 0 fail`.

## MEDIUM / LOW

- **F-T7** — `citations.test.ts` asserted on gitignored `vendor/gstack`. `vendor/` is now excluded
  from citation scanning and the stale `KNOWN_BROKEN` entry removed. This was the direct cause of the
  false count in F-T2.
- **F-T8** — the tmux-format static guard read the git index (empty outside git, stale for unstaged
  edits). It reads the working-tree file now, with a canary asserting the format strings are found.
- **F-T9** — the dispatch detector was blind to multi-line template literals. It now skips template
  interiors, verified empirically to still report the full real dispatch sets for all three CLIs
  (including past the backtick-bearing regex literal in `workflows.ts` — the F-S6 trap did not recur).
- **F-T10** — `bridgeCommandPath` lived behind the MCP SDK import, so the two tests covering the F-S1
  string were inert on an unprovisioned checkout. It moved to the SDK-free `cli/bridge-path.ts`;
  `up.test.ts` now loads and passes without the engine (verified: 7/7 with no `vendor/gbrain`), and
  `launcher-env.test.ts` now asserts the actual registered bridge path.
- **F-T11** — the quickstart's first command (`git clone`) fails for non-owners because the repo is
  private. Explicitly out of scope per the spec (§visibility); recorded for sequencing with the
  friction work. No code change.
- **F-T12** — launcher count stated as "eleven" and "12" in two places. Measured: **13** scripts
  source the resolver and export — 12 launchers (now including `ebrain-route`) plus
  `scripts/install-dream-timer.sh` (an installer). Wording corrected.
- **F-T13** — the Codex hook leaked `No such file or directory` on every call when no record file
  existed. Guarded with `[ -r ]` before the redirect (both overlay hooks). Verified: 0 leaks.
- **F-T14** — the `~/eBrain` tilde spelling was uncovered. The two live occurrences were display
  strings (now using the resolved path / a neutral fixture path); the guard now covers the tilde too.
- **F-T15** — the tracked root `.npmrc` (author-written, blocked from my own reading by the secret
  guard) contains only `save-exact`, `ignore-scripts`, and `min-release-age` directives plus a
  comment forbidding tokens; it is intentionally tracked as supply-chain hardening. **Eduardo should
  confirm its contents directly** — I cannot read it and will not.

## Decisions a reviewer should weigh

1. The secret guard still fails open (now loud + strict-switchable). Posture choice, made explicit.
2. Two resolvers in two languages — deliberate redundancy across the process boundary that failed.
3. `doctor` downgrades absent user-config to WARN. A stricter operator may want FAIL after `ebrain up`;
   the launchers (which the repo ships) stay hard FAILs.
