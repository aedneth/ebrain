---
type: independent-audit
project: ebrain
scope: "F-R remediation delta (0204f63..HEAD) — targets 1-8; plus an additive scope extension covering the published docs as a public contract (target 9), evaluated against current HEAD regardless of diff boundary"
verdict: "[AUDIT_FAIL]"
date: 2026-07-20
branch: release/open-source-publication
audited-range: "0204f63..50c7360 (delta); full tree at 50c7360 for target 9"
checker: independent read-only checker, pass 3 (maker of this delta was an orchestrating model, not Codex; prior checks were pass 1 docs/AUDIT-F7-F12-INDEPENDENT.md and pass 2 docs/AUDIT-F7-F12-REAUDIT.md, both [AUDIT_FAIL])
---

# Pass 3 — F-R Remediation Delta + Published-Docs Public-Contract Audit

**VERDICT: [AUDIT_FAIL].** The F-R delta itself (targets 1-8, scoped to `0204f63..HEAD`) is a genuine,
well-tested fix for the regression pass 2 found — the shell/TS grammars are close, `TRUST_POLICY_ERROR`
propagation is centralized and correctly closes off the class of consumer-side fail-open pass 2 warned
about, `EBRAIN_MEMORY_HOME` symmetry is real, and the new 24-test suite is non-vacuous (verified by
replaying it against the pre-fix `trust.sh`, where 7 of the 24 correctly fail). Two MEDIUM parity gaps
remain in the grammar itself (never fail-open — see F-P1/F-P2). None of that is blocking on its own.

The block comes from the additive scope extension (target 9: the published documentation as a public
contract, mandated by the coordinator mid-task, addressed after targets 1-8). The repository is on a
branch titled `release/open-source-publication`, with a website that will render `docs/**` publicly.
Running the literal, four-line published quickstart from `README.md` and `docs/getting-started/install.md`
— fresh clone, fresh `HOME`, no pre-existing state — fails at the *second* documented command with
`Permission denied` (F-P3), and even bypassing that, fails at the *next* one with a missing native
dependency (F-P4). Both are invisible to the existing regression test for this exact failure class
because that test rewrites the file it copies with a forced `chmod 755` and explicitly sets
`EBRAIN_SKIP_GBRAIN=1`, skipping the two code paths where these bugs live. This is the same failure
class and the same user-facing severity as the original F-A1 blocker this whole audit chain exists to
prevent, and it reproduces on the exact commit under audit (`50c7360`).

---

## Findings

### F-P3 — BLOCKING — the published quickstart is broken again: `scripts/install.sh` is not executable in the git tree

**File:** `scripts/install.sh` (git-tracked file mode, not its content — unchanged content, wrong mode)

**Reproduction** (from any machine with `git` and `bun`; no special setup):
```bash
cd /tmp && rm -rf ebrain && git clone <this-repo-url> ebrain && cd ebrain
bun install
./scripts/install.sh --from-source
# bash: ./scripts/install.sh: Permission denied
```
Confirmed directly against the tracked git object, independent of any local umask or filesystem
artifact:
```bash
git ls-files -s scripts/install.sh
# 100644 <blob> 0  scripts/install.sh      <- NOT executable
git ls-files -s cli/ebrain harness/core/doctor.sh harness/core/install.sh
# 100755 ...                              <- everything else meant to run directly IS
```
I additionally reproduced this end-to-end with a real `git clone --local` of the audited HEAD into a
sandboxed `HOME`/checkout path outside `$HOME/eBrain` (so this is not the F-A1 path-resolution bug
recurring — that fix works correctly, see "Verified as closed" below) and got the exact
`Permission denied` a real user would see.

**Failure mode:** `README.md`'s "Five-minute proof" (the first thing a GitHub visitor sees) and
`docs/getting-started/install.md` both instruct the reader to run `./scripts/install.sh --from-source`
immediately after `git clone` + `bun install`. On any fresh clone this exits non-zero before the
installer's own logic ever runs. This is functionally identical in severity and user impact to F-A1
(closed in round 1) — a published call-to-action that dies for every reader who follows it literally —
just from a different mechanism (file mode vs. path assumption).

**Why the existing regression test misses it:** `cli/install.test.ts`'s "published quickstart sequence"
test (unchanged in this delta, so not part of `0204f63..HEAD`, but live at HEAD) reads the real
installer's *content* via `readFileSync(INSTALL_SH, "utf8")` but then writes its own fixture copy with
`writeFileSync(..., { mode: 0o755 })` followed by an explicit `chmodSync(..., 0o755)`
(`cli/install.test.ts:152-153`). It never inspects the real tracked mode of `scripts/install.sh`, so a
mode regression on the actual file is structurally invisible to the test written to catch this exact
class of published-quickstart failure.

**Remediation direction:** `chmod +x scripts/install.sh && git update-index --chmod=+x scripts/install.sh`
(or the git-native equivalent), then add a mode assertion to the quickstart test — e.g. read the real
file's mode via `statSync` and assert `0o111` bits are set — so a future `git add` from a
non-executable-preserving tool (or an editor that resets permissions) fails CI instead of silently
regressing this again.

---

### F-P4 — BLOCKING — even past F-P3, `ebrain up` fails on a truly fresh install: `vendor/gbrain` dependencies are never installed

**Files:** `scripts/install.sh` (step 4, "Installing dependencies"); `cli/mcp-bridge.ts` (the consumer
that fails)

**Reproduction** (continuing directly from the F-P3 sandbox, this time bypassing the permission bit to
isolate this second, independent defect):
```bash
cd /tmp/ebrain-fresh-clone
HOME=/tmp/sandbox-home XDG_CONFIG_HOME=/tmp/sandbox-xdg sh scripts/install.sh --from-source
# ==> Using existing checkout at /tmp/ebrain-fresh-clone      (F-A1 fix confirmed working)
# ==> Cloning gbrain engine (pinned)                          (succeeds, network reachable)
# ==> Installing dependencies                                 (bun install — but only in the OUTER checkout)
# ==> Bringing the shared brain up
# error: Cannot find module '../vendor/gbrain/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'
#        from '.../cli/mcp-bridge.ts'
# install.sh: 'ebrain up' failed; run 'ebrain doctor' to diagnose
```
Root cause, read directly from `scripts/install.sh`: step 3 clones/pins `vendor/gbrain` (its own
separate package, with its own `package.json`/`bun.lock`, confirmed present in the clone); step 4 runs
`bun install --frozen-lockfile` only in `$EBRAIN_HOME` (the outer checkout) — there is no workspaces
declaration in the outer `package.json` (`grep -n workspaces package.json` — none) and no step anywhere
that runs `bun install` inside `vendor/gbrain`. `vendor/gbrain/node_modules` never gets created by any
documented or scripted path.

**Why this goes unnoticed on the maintainer's own machine:** on the actual development checkout,
`vendor/gbrain/node_modules` already exists (verified: `ls vendor/gbrain/node_modules` succeeds there),
almost certainly from an earlier one-off manual step, not from the installer. Every verification the
maker report lists ran on that machine.

**Why the existing test misses it:** `cli/install.test.ts`'s "published quickstart sequence" test sets
`EBRAIN_SKIP_GBRAIN: "1"` in its own environment (`cli/install.test.ts:164`), which skips exactly the
code path (step 3 + the missing step-4-equivalent for gbrain) where this bug lives. The test that is
cited as proof the published quickstart works is constructed in a way that cannot see this failure.

**Failure mode:** the first command in `docs/getting-started/quickstart.md` (`ebrain up`) and the
installer's own auto-invocation of the same command both fail on a genuinely fresh machine, immediately
after a successful `git clone` + `bun install` + (once F-P3 is fixed) `./scripts/install.sh --from-source`.

**Remediation direction:** add a `( cd "$GBRAIN_DIR" && bun install --frozen-lockfile )` (or equivalent)
step after pinning gbrain in `scripts/install.sh`, and change the "published quickstart sequence" test
to exercise the real gbrain path (even a fixture gbrain package with a trivial `package.json` would
catch a missing install step) rather than skipping it.

---

### F-P5 — MEDIUM — `docs/reference/configuration.md` overclaims exact TS/shell parity that F-P1/F-P2 contradict

**File:** `docs/reference/configuration.md:45-49` (new prose in this delta)

The published text states, without qualification: *"The policy fails closed, identically in the CLI and
in the shell harness... Entries match literally (a `.` is a dot, not a wildcard) and CRLF line endings
are tolerated, **so the same file always means the same thing on both paths.**"*

This is the exact claim target 1 was designed to attack, and it is not true in general — see F-P1 and
F-P2 below, both reproduced on a stock `en_US.UTF-8` locale (the default on most Linux/macOS installs,
not a contrived setup). Per the task's own instruction ("if the docs and the implementation disagree,
the docs are the finding"), this is reported here as the docs-level consequence of F-P1/F-P2.

**Remediation direction:** either close the two grammar gaps (see below) so the claim becomes true, or
soften "always means the same thing" to name the two known exception classes.

---

### F-P1 — MEDIUM — grammar parity gap: locale-dependent acceptance of non-ASCII alphabetic entries

**Files:** `cli/deny-policy.ts:29` (`SAFE_ENTRY`) vs. `harness/core/trust.sh:40` (`trust__load`'s
validation `grep -Eq`)

**Reproduction** (isolated from confounds — see note below):
```bash
# File-based config, one entry: "café"
printf 'café\n' > /tmp/denied-repos

EBRAIN_DENY_CONFIG=/tmp/denied-repos bun -e '
  const m = await import("/path/to/cli/deny-policy.ts");
  try { console.log("TS:", JSON.stringify(m.deniedRepos())); }
  catch (e) { console.log("TS threw:", e.message); }'
# TS threw: .../denied-repos: invalid deny entry on line 1 — expected a bare directory or
#           source name (letters, digits, '.', '_', '-')

env -i HOME="$HOME" PATH=/usr/bin:/bin EBRAIN_DENY_CONFIG=/tmp/denied-repos \
  bash -c '. harness/core/trust.sh; echo "SH: TRUST_POLICY_ERROR=$TRUST_POLICY_ERROR TRUST_DENY=[$TRUST_DENY]"'
# SH: TRUST_POLICY_ERROR=0 TRUST_DENY=[café]      <- accepted as a valid entry
```
Control tests to rule out environment noise: forcing `LC_ALL=C` makes the shell reject "café" too
(matching TS); an `env -i` clean-environment invocation (no inherited locale at all) also rejects it.
The divergence is specifically triggered by `LANG=en_US.UTF-8` (or any UTF-8 locale) being active, which
is the common default — not a contrived setting. Also confirmed: this does **not** reopen the ERE-injection
class F-R1 fixed — combinations of an accent with a genuine metacharacter (`café(evil)`, `café|pwned`,
`café$(rm)`) are still correctly rejected on both sides. The gap is confined to accepting a wider
"letters" alphabet on the shell side (also true of `ñ`, `ünïcode`) under glibc's locale-aware bracket-
expression collation — a well-known category of grep/POSIX behavior, not a bug specific to this script.

**Note on methodology:** an early pass of this same reproduction was contaminated by a `grep` shell
function this audit sandbox's own tooling injects into interactive sessions (unrelated to eBrain,
confirmed via `env -i` and absolute-path control tests) — that confound is fully excluded from this
finding; the result above is real-`grep`, real-locale, and reproducible from a plain terminal.

**Failure mode:** an operator whose deny policy contains a non-ASCII-alphabetic entry (plausible for any
foreign-language client/project name) gets asymmetric enforcement: `remember.sh`, `sessions-federate`,
and `doctor`'s shell-side isolation check work and correctly deny; every TS-based command that consults
the same policy (`sessions new --cwd`, `context`, `episodes`, and `doctor`'s daemon-based isolation
check) throws an uncaught exception and aborts entirely as long as that entry is present. This is a
reliability/availability defect, not a security bypass — neither side is ever more permissive than
intended in the deny direction.

**Remediation direction:** either normalize with `LC_ALL=C` (or `LC_COLLATE=C`) explicitly around the
shell-side validation grep so it matches the byte-range TS intends, or widen `SAFE_ENTRY` to a documented
Unicode-aware definition on both sides. Pin a non-ASCII fixture in `cli/deny-policy.test.ts`'s parity
suite either way.

---

### F-P2 — MEDIUM — grammar parity gap: separator character classes diverge (`\s` vs. `tr ', \t'`)

**Files:** `cli/deny-policy.ts:44` (`stripped.split(/[\s,]+/)`) vs. `harness/core/trust.sh:35`
(`tr ', \t' '\n\n\n'`)

**Reproduction:**
```bash
printf 'foo\vbar\n' > /tmp/denied-repos          # vertical tab between two otherwise-valid entries
# also reproduces with \f (form feed) and U+00A0 (non-breaking space, 0xC2 0xA0 in UTF-8)
```
TS's `\s` (ECMAScript whitespace class) treats `\v`, `\f`, and Unicode space separators as entry
delimiters, correctly splitting this into two valid entries `["foo","bar"]`. Shell's `tr ', \t' ...`
only recognizes comma/space/tab; the vertical tab survives inside the token, which then fails
`trust__load`'s `[a-z0-9._-]` validation as a single malformed token — setting `TRUST_POLICY_ERROR=1`
(deny **every** repository) rather than parsing the intended two-entry policy.

**Failure mode:** the opposite direction from pass 2's bug — the shell side over-blocks (denies
everything, including unrelated repos) rather than under-blocking. Still not fail-open, but a real
"one file, two meanings" split: TS reports a narrow two-entry policy while shell reports total denial.
Plausible real-world trigger: a non-breaking space is a common invisible artifact of copy-pasting a
directory/client name from a web page, Slack, or a word processor into a plaintext config file.

**Remediation direction:** normalize the separator set identically on both sides — either restrict TS's
split to the same three literal separators shell uses, or make shell's separator handling Unicode/`\s`-
aware (e.g., via a `sed`/`tr` pass keyed off the same character class, or delegate tokenizing to `awk`
with a locale-aware `FS`).

---

### F-P6 — HIGH — three documented `--help` invocations don't do what the docs say

**File:** `docs/reference/memory-commands.md:31-33`

The doc literally lists:
```
ebrain context --help
ebrain procedures --help
ebrain workflows --help
```
None of the three underlying scripts implement a `--help`/`-h` flag (confirmed: no `--help` handling
anywhere in `cli/context.ts`, `cli/procedures.ts`, `cli/workflows.ts`). Reproduced by running them
directly:
```bash
EBRAIN_HOME="$PWD" bun run cli/context.ts --help
# error: usage: ebrain context <list|proposals|init|get|update|propose|review> [--json]
# exit=2

EBRAIN_HOME="$PWD" bun run cli/procedures.ts --help
# error: usage: ebrain procedures <list|show|use|review> [--json]
# exit=2

EBRAIN_HOME="$PWD" bun run cli/workflows.ts --help
# (no output at all)
# exit=0
```
`context` and `procedures` at least surface a usage line, but via the **error** path (exit 2,
`error:`-prefixed) rather than a clean help response — a reader trying the documented command sees a
failure, not help. `workflows` is worse: `cli/workflows.ts:561` defaults an unrecognized/flag-shaped
first argument to the `list` subcommand (`const sub = args[0] && !args[0].startsWith("--") ? args[0] :
"list"`), so `--help` silently becomes `workflows list --help`; that handler produces no output and
exits 0 — looks successful, tells the reader nothing.

**Remediation direction:** either implement a real `--help` in these three scripts (cheapest: print the
same usage line `context`/`procedures` already emit on error, but via the success path with exit 0), or
change the docs to the subcommand form that already works (e.g. `ebrain context list --json`).

---

### F-P7 — LOW — the i18n guard's `COMMENT_LINE` regex has a live blind spot on shell `case` default arms

**File:** `cli/surface-i18n.test.ts:59` (`const COMMENT_LINE = /^\s*(?:#|\/\/|\*|\/\*)/;`)

This line's purpose (stated in the same file) is to implement "comments may stay Spanish" so the scanner
skips non-output lines. But a shell `case` statement's default arm is conventionally written `*) ... ;;`,
and `cli/ebrain` — one of the guard's own declared `SURFACES` — has exactly this shape **four times**,
each with an inline `echo` that is a genuine SINK line:
```
cli/ebrain:148:      *) echo "ebrain harness: use 'install <agent>|--all', 'doctor [agent|--all]' or 'status'." >&2; exit 2 ;;
cli/ebrain:154:      *) echo "ebrain norms: use 'render <file>'." >&2; exit 2 ;;
cli/ebrain:161:      *) echo "ebrain federate: use 'sessions' or 'skills'." >&2; exit 2 ;;
cli/ebrain:164:  *) echo "ebrain: unknown subcommand '$cmd'." >&2; usage; exit 2 ;;
```
Proven with the real regexes lifted verbatim from the test file, against two synthetic variants of
these exact lines with Spanish injected (one carrying a diacritic the DIACRITIC-only check alone would
otherwise have caught):
```
line: '      *) echo "ebrain harness: uso invalido, no se pudo encontrar el subcomando" >&2; exit 2 ;;'
  isComment=true  isSink=true  wouldBeScanned=false

line: '  *) echo "ebrain: subcomando desconocido '\''$cmd'\'', consulte la documentación" >&2; usage; exit 2 ;;'
  isComment=true  isSink=true  hasSpanish(diacritic)=true  wouldBeScanned=false
```
Both lines are genuine output-emitting code (`isSink=true`) but get classified as comments purely
because the line, after leading whitespace, starts with `*` — the case-arm token `*)` collides with the
"line starts with `*`" comment heuristic (meant for `/* */`-style block comments, not shell glob
patterns). `scanText()` skips them before the Spanish check ever runs.

**Impact:** not an active leak today — the four real lines are English. But the guard provides **zero**
protection for this exact, currently-live code shape in its own primary dispatcher, contrary to what
"verified non-vacuous" implies for that surface. A future edit that reintroduces Spanish into any
`*) echo ...` arm (the most natural place to add a new usage/error message in this file) would pass
silently.

**Remediation direction:** exclude the `*` alternative from `COMMENT_LINE` (block comments in this
codebase are TS/JS `/* ... */` and don't need a bare-`*` continuation match in shell files), or make the
comment check language-aware (only treat leading `*` as a comment inside `.ts`/`.tsx` files).

---

### F-P8 — LOW — one `SPANISH_STRONG` entry is a real English word

**File:** `cli/surface-i18n.test.ts:44`

The `SPANISH_STRONG` list's design contract is "content words that are not words in English at all; one
match is conclusive." `leer` is in the list — and is also a genuine, if uncommon, English verb ("to
look in a sexually suggestive or predatory manner"). No current occurrence in the guarded surfaces
triggers this, so there is no live false positive today, but the design invariant the comment states
("one is conclusive" because these are "not words in English at all") does not hold for this entry, and
per the task's own framing, a guard that can fire on legitimate English is a guard someone eventually
disables.

**Remediation direction:** drop `leer` from `SPANISH_STRONG` (it's covered anyway by `SPANISH_FUNCTION_WORDS`
density plus `SPANISH_DIACRITIC` in real Spanish sentences using it) or gate it behind a second signal.

---

### F-P9 — LOW / informational — a latent, pre-existing machine-dependence gap adjacent to F-A1's class

**File:** `cli/sessions.test.ts` (unchanged in this delta; not part of `0204f63..HEAD`)

The maker report's verification table and this pass's own reproduction of `bun test ./cli/` (no
`EBRAIN_HOME`) and `EBRAIN_HOME="$PWD" bun test ./cli/` both give exactly the claimed **314 pass / 0
fail** — confirmed on this machine, ambient and sandboxed HOME/XDG alike, as long as `EBRAIN_HOME` is
either set or the real checkout happens to sit at `$HOME/eBrain`. Under a stricter sandbox than the
maker's own verification used — `HOME` pointed at an empty temp dir **and no `EBRAIN_HOME` set** (i.e.
simulating a contributor whose checkout is not at the conventional path, without being told to set the
variable) — 2 of 314 fail:
```
(fail) resolveLaunch: adapter real (claude) declara launch+env; adapter inexistente → null
  expect(claude?.cmd).toBeTruthy()   Received: undefined
```
Root cause: `cli/sessions.ts`'s `EBRAIN_ADAPTERS_DIR` resolves via `EBRAIN_HOME` defaulting to
`join(HOME, "eBrain")`; with `HOME` sandboxed and no `EBRAIN_HOME`, no adapter manifest is found. This
is the same root-cause category as F-A1 (an assumption that the checkout sits at `$HOME/eBrain`), not
introduced by this delta, and not part of the literal reproduce block given for this pass (which only
called for `EBRAIN_HOME="$PWD"` alongside a HOME/XDG sandbox, and passes cleanly under that exact
combination). Reported for completeness since it is the same failure shape as F-P3/F-P4, in a different
file, and because target 4 asked explicitly whether anything "passes only because the operator's own
[machine state] happens to exist" — here the passing state is the checkout's own conventional location,
not a deny-policy file.

---

## What I verified as genuinely closed

- **Target 2 — `TRUST_POLICY_ERROR` propagation.** Read every consumer found via `rg -l 'trust\.sh'`:
  `scripts/sessions-federate`, `harness/core/remember.sh`, `harness/core/doctor.sh`. None calls
  `trust_denied`/`trust_federate_ok` in a way that bypasses the error state — `trust_denied()` itself
  checks `TRUST_POLICY_ERROR` first and returns "denied" unconditionally
  (`harness/core/trust.sh:72-76`), so every caller inherits the fail-closed behavior automatically,
  without needing its own check. `doctor.sh`'s new explicit checks are for *reporting* accuracy (so a
  green isolation line is never shown under an unreadable/invalid policy), not enforcement — enforcement
  was already centralized. On the TS side, read every call site of `deniedRepos()` /
  `isDeniedPath`/`isDeniedSourceName`/`referencesDeniedRepo` in `cli/sessions.ts`, `cli/context.ts`,
  `cli/episodes.ts`, `cli/isolation.ts`: none wraps the call in a `try/catch` that would turn a thrown
  "invalid policy" into a silent "not denied" — the exception always propagates to the top-level
  `main().catch(...)` handler and aborts the command. Confirmed no live fail-open across either
  language. (This is also the reason F-P1's locale gap is a reliability bug, not a security one — TS's
  failure mode there is "the command crashes," never "the command proceeds unchecked.")

- **Target 3 — non-vacuity of `cli/deny-policy.test.ts`.** Extracted `harness/core/trust.sh` at
  `0204f63` (the commit this delta fixes, i.e. the version with the F-R1 regression pass 2 found) into
  a disposable worktree, replacing only that one file, and ran the current 24-test suite against it:
  **17 pass, 7 fail** — exactly the 7 tests in the "shell half fails CLOSED (F-R1 regression)" describe
  block, which is precisely the bug class this delta claims to have fixed. The suite genuinely bites.
  (`cli/install.test.ts`'s "published quickstart sequence" is unchanged in this delta and therefore out
  of this pass's file-diff scope for non-vacuity — but see F-P3/F-P4, discovered under target 9, for why
  that specific test's own construction leaves two real gaps open regardless.)

- **Target 4 — machine dependence, as literally specified.** Reproduced every command in the given
  block and the numbers match the maker report exactly: `bun test ./cli/` → 314/0; `EBRAIN_HOME="$PWD"
  bun test ./cli/` → 314/0 (and stays 314/0 even with `HOME`/`XDG_CONFIG_HOME` additionally sandboxed to
  empty temp dirs); `bun test ./tui/test/` → 442/0; `bun run --cwd website check` → 0 errors/0
  warnings/0 hints; `bun run website:build` → 40 pages, 38 documentation routes; `git diff --check
  0204f63..HEAD` → clean; `rg '#[0-9A-Fa-f]{3,8}' tui/src --glob '!theme.ts'` → no matches. The `bash -n`
  loop over `git ls-files '*.sh' 'scripts/*' 'cli/ebrain'` reported syntax errors, but all of them are on
  non-shell files the glob incidentally matches (`scripts/README.md`, `scripts/generate-doc-assets.ts` and
  `scripts/design-sync-tui`, both `#!/usr/bin/env bun`, and two `systemd` unit files) — every genuine
  shell entrypoint parses clean.

- **Target 6 — identifier leakage.** Scanned every added line across `CHANGELOG.md`,
  `docs/MAKER-REPORT-AUDIT-REMEDIATION.md`, `docs/HANDOFF-BACK.md`, `docs/reference/configuration.md`,
  `cli/deny-policy.test.ts`, `cli/surface-i18n.test.ts`: no token-shaped strings, no real absolute
  personal paths (the only `/home/...` hits are the synthetic fixture placeholder `/home/u/...`), no new
  occurrence of the operator's known handle. Built the website (`bun run website:build`) and confirmed
  none of `docs/AUDIT-*.md`, `docs/MAKER-REPORT-AUDIT-REMEDIATION.md`, or `docs/HANDOFF-BACK.md` reach
  `website/dist/` or `website/dist/search-index.json`; confirmed the new public deny-policy section of
  `configuration.md` *does* ship, as intended.

- **Target 7 — `EBRAIN_MEMORY_HOME` symmetry.** Grepped every reader/writer of the memory directory in
  both languages. Writer: `harness/core/remember.sh:20`. Readers: `cli/memory.ts:28`,
  `harness/core/status.sh:62,110`. All three now resolve identically
  (`${EBRAIN_MEMORY_HOME:-$EBRAIN_HOME/memory}` / the TS equivalent). No other site references the
  memory tree by a hardcoded `$EBRAIN_HOME/memory` path (checked `cli/episodes.test.ts`'s use is
  test-only fixture wiring, not a production reader).

- **Target 8 — `cli/ebrain`'s `EBRAIN_HOME` export and the deleted `daemon-preflight.ts` branch.** The
  deleted branch in `cli/daemon-preflight.ts` (`sourceIsolationGuards(sources).filter(isClientSource)`)
  computed the exact same `leaked` list `assertCleanSources` already throws on for any non-empty result
  — confirmed genuinely dead code, not a behavior change. The new `export EBRAIN_HOME=...` in `cli/ebrain`
  is not exercised by the test suite at all (`cli/install.test.ts` only asserts the launcher script's
  *text* mentions `cli/ebrain`; nothing spawns the real dispatcher as a subprocess), so no test
  contamination risk from the export; architecturally it correctly makes child-script path resolution
  consistent for non-default checkout locations.

## What I could not verify, and why

- **`cli/install.test.ts`'s literal pass/fail status against `HEAD`** — not re-run as part of this pass,
  since it is unchanged in `0204f63..HEAD` and pass 2 already established it passes; it is included in
  the 314/0 CLI total reproduced above (still passing, which is expected — F-P3/F-P4 are gaps in what it
  *covers*, not defects that would make it fail).
- **The remote/`curl | sh` one-line install path** (`docs/devpost-submission.md:131`) — not exercised;
  piping to `sh` sidesteps F-P3's permission-bit issue for that specific entrypoint (though F-P4's
  missing gbrain-dependency step would still apply once that path reaches `ebrain up`). Out of this
  pass's time budget to fully trace.
- **Full command-by-command execution of every page in `docs/guides/` and the remainder of
  `docs/reference/`** (`troubleshooting.md`, `migration.md`, `routing.md`'s live routing claims,
  `mcp.md`, `json-contracts.md`, `tui.md`) — spot-checked flags for `workspaces`, `episodes`, `memory`,
  `sessions` against their real argument parsers (all consistent with the docs) and read `privacy.md`
  in full (consistent with the code — the deny-policy cross-reference is accurate), but did not execute
  every remaining documented sequence literally given the volume added by the scope extension mid-task.
  Treat these pages as unverified rather than clean.
- **Whether `LC_ALL`/locale is pinned anywhere in CI** (which would make F-P1 invisible in that specific
  environment even though it reproduces on a default developer machine) — not checked; `.github/workflows/`
  was not inspected in this pass.

## Target-by-target disposition

| # | Target | Checked | Result |
| --- | --- | --- | --- |
| 1 | Grammar parity, TS vs. shell | Yes — 20 adversarial fixtures run through both real parsers | 2 genuine MEDIUM divergences (F-P1, F-P2), both fail-safe in direction, both contradicting the docs' explicit parity claim (F-P5) |
| 2 | `TRUST_POLICY_ERROR` propagation | Yes — every consumer read | No live fail-open found; centralized correctly |
| 3 | Non-vacuity of new tests | Yes — replayed 24 tests against pre-fix `trust.sh` | 7/24 fail as expected; suite bites. `install.test.ts` non-vacuity is pass 2's finding, unchanged here, but see F-P3/F-P4 for what it still can't see |
| 4 | Machine dependence of the suite | Yes — literal reproduce block plus extra sandboxing | Numbers match maker report exactly; found a latent, pre-existing, out-of-delta gap under stricter sandboxing (F-P9) |
| 5 | i18n guard's own defects | Yes | One live blind spot on a real, current code shape (F-P7); one theoretical false-positive word (F-P8); no `g`-flag regression remains |
| 6 | Identifier leakage in new artifacts | Yes | Clean; confirmed absent from built site; confirmed intended public content does ship |
| 7 | `EBRAIN_MEMORY_HOME` symmetry | Yes | All readers/writers agree; no missed site found |
| 8 | Everything else in the delta | Yes | Dead-branch deletion confirmed safe; `EBRAIN_HOME` export confirmed benign and untested-but-harmless |
| 9 | Published docs as a public contract (scope extension) | Yes, prioritized within budget | Two BLOCKING findings (F-P3, F-P4) reproducing the F-A1 failure class on current HEAD; one HIGH (F-P6); one MEDIUM cross-reference to target 1 (F-P5) |

## Adversarial inputs that did **not** break anything

For the record, per the instruction to document a credible attack surface even where nothing broke:
CRLF-only files, comment-only files, whitespace-only files, empty files, 5000-character entries, `.`
(lone dot), `-` (lone dash, leading and trailing), every ERE metacharacter as a standalone entry
(`(`, `)`, `|`, `*`, `[`, `$`, `^`), duplicate entries, mixed comma/tab/space separation, a hash mid-token,
old-Mac-style bare-CR line endings, and accent+metacharacter combinations (`café(evil)`, `café|pwned`,
`café$(rm)`) — all agree between TS and shell, or fail closed identically, or fail closed on the shell
side only (never open) when they diverge at all.

---

**[AUDIT_FAIL]**

Two BLOCKING findings remain (F-P3, F-P4): the published quickstart, run literally from a fresh clone,
fails before a new user ever reaches a working `ebrain up`. This branch should not be merged, deployed,
or have its visibility changed until both are closed and the regression tests that were supposed to
catch this class of defect are corrected to actually exercise the real file mode and the real gbrain
dependency-install step. The F-R delta itself (targets 1-8) is otherwise sound engineering — the
remaining MEDIUM/LOW findings (F-P1, F-P2, F-P5, F-P6, F-P7, F-P8) are real but do not block on their
own.
