---
type: independent-audit
project: ebrain
scope: "PR #4 (fix/ebrain-home-resolution), main (af5a0ee)..origin/fix/ebrain-home-resolution (345e7a3), full diff (34 files)"
verdict: "[AUDIT_FAIL]"
date: 2026-07-21
branch: fix/ebrain-home-resolution
audited-range: "main (6ae0fa8)..origin/fix/ebrain-home-resolution (345e7a3)"
checker: independent read-only checker, pass 5 (maker's account is the 2026-07-21 CHANGELOG entry and the PR body; prior checks were pass 1 docs/AUDIT-F7-F12-INDEPENDENT.md, pass 2 docs/AUDIT-F7-F12-REAUDIT.md, pass 3 docs/AUDIT-F7-F12-PASS3.md, and a cited pass 4 whose report file is not present in the repository on either main or this branch — see the methodology note below)
---

# Pass 5 — `fix/ebrain-home-resolution` (PR #4) Independent Audit

**VERDICT: [AUDIT_FAIL].** The centralizing idea (`harness/core/ebrain-home.sh`, walk-up-from-caller)
is sound and its core algorithm is correct: verified against nested checkouts, relative `$0` from an
unrelated cwd, paths containing spaces, sourced-vs-executed context, and true POSIX `sh` (`dash`), all
passing. The specific worst-case example the PR leads with — `scripts/ebrain-mcp-bridge` run directly
from an arbitrary checkout path, sandboxed `HOME`, no `EBRAIN_HOME` — is genuinely fixed and was
reproduced working. `bash -n` is clean on every tracked shell file, `dash -n` is clean on the resolver,
the `SAFE_ENTRY` length bound has exact JS/shell grammar parity at every boundary tested, and the test
counts are real: CLI 335/0 in three environments, TUI 442/0, Astro 0 errors/0 warnings/0 hints plus a
full production build, all reproduced directly.

It fails anyway, on evidence at least as concrete as what closed the last four passes:

1. **The registration path the PR's own narrative centers on is still broken one layer down
   (F-S1, BLOCKING).** `scripts/ebrain-up` resolves `EBRAIN_HOME` correctly but never exports it.
   `cli/up.ts` — the module that decides what absolute command gets written into every agent's MCP
   config — has its own, un-networked fallback (`process.env.EBRAIN_HOME || join(HOME, "eBrain")`),
   and when `scripts/ebrain-up` is invoked without a parent that already exported `EBRAIN_HOME` (i.e.
   any invocation that doesn't go through `cli/ebrain`'s dispatcher first), that fallback silently
   fires and registers the wrong bridge path. This is reproduced directly below, and the existing test
   suite cannot see it because `cli/up.test.ts` injects the bridge path as an explicit argument and
   never exercises the default.
2. **A concrete, currently-live instance of the exact bug class survives untouched (F-S2, HIGH.)**
   `scripts/systemd/ebrain-dream.service` hardcodes `ExecStart=%h/eBrain/scripts/dream-cycle`. `%h` is
   systemd's own home-directory specifier — a spelling the new regression test does not, and cannot,
   recognize.
3. **The regression test built to prevent recurrence is non-vacuous only against the two exact
   spellings it was written for (F-S5, MEDIUM-HIGH).** Splitting the quote (`"$HOME"/eBrain`) or
   writing the equivalent TypeScript (`join(homedir(), "eBrain")`, the idiom already used throughout
   `cli/*.ts` today for a different default) both evade it, demonstrated below against the actual
   detection logic, not a paraphrase of it.
4. **F-Q3's `-h` fix is incomplete (F-S4, HIGH).** The long form is not "unambiguous" as the comment
   claims: `ebrain context update <id> --content --help --yes` silently prints usage and exits 0
   instead of setting the content, reproduced directly with `bun run`.
5. Two further findings on the "copies can't walk up, so they read a record" design (F-S7, MEDIUM-HIGH)
   and the F-Q4 subcommand-existence check (F-S6, MEDIUM) are detailed below; both are demonstrated
   against the real code, not asserted.

None of this contradicts that real progress was made — most of the previous passes' findings do appear
closed, and I document the adversarial inputs that failed to break the resolver's core algorithm below,
as requested. But F-S1 reopens the load-bearing scenario this PR exists to close, and F-S2 is a tracked
file, today, on this branch, that still has the original defect in a spelling nobody thought to check
for. That is blocking.

---

## Findings

### F-S1 — BLOCKING — `ebrain up`/`ebrain onboard` registers the wrong bridge command when its own launcher script is exercised directly, because `EBRAIN_HOME` is resolved but never exported

**Files:** `scripts/ebrain-up:8` (and identically `scripts/ebrain-mcp-bridge:8`, `scripts/ebrain-run:7`,
`scripts/ebrain-q:6`, `scripts/ebrain-mcp:7`, `scripts/ebrain-brain:11`, `scripts/ebrain-daemon:10`,
`scripts/gbrain-mcp:6`, `scripts/gbrain-run:6`, `scripts/sessions-federate:9`, `scripts/skills-federate`
— every `scripts/*` entrypoint uses the identical pattern); consumed at `cli/up.ts:30,88,204,222`.

**The pattern, present in every `scripts/*` launcher:**
```sh
. "$(dirname -- "${BASH_SOURCE[0]}")/../harness/core/ebrain-home.sh"
EBRAIN_HOME="$(ebrain_resolve_home "${BASH_SOURCE[0]}")"   # plain assignment, never `export`ed
...
exec "$BUN_BIN" run "$EBRAIN_HOME/cli/up.ts" "$@"
```
`$EBRAIN_HOME` is correctly substituted into the exec **argument** (so the right file gets run), but a
plain shell assignment is not part of the process environment a child process inherits. `cli/up.ts:30`
reads it back with its own independent fallback:
```ts
const EBRAIN_HOME = process.env.EBRAIN_HOME || join(HOME, "eBrain");
```
and that constant is what gets threaded into `bridgeCommandPath(EBRAIN_HOME)` at lines 88, 204, and 222
— the exact function that computes the absolute command string written into Claude/Codex/Cursor/
OpenCode's MCP config during `ebrain up`/`ebrain onboard`.

**Why this doesn't show up in the "does the official install work" check:** `cli/ebrain`'s dispatcher
(`cli/ebrain:10`, unmodified by this PR) does `export EBRAIN_HOME=...` before invoking
`run "$SCRIPTS/ebrain-up" up "$@"` (`cli/ebrain:126`) — so when the chain starts at `cli/ebrain` (which
is what `scripts/install.sh`'s generated launcher always does), the already-exported value survives the
plain reassignment (bash keeps the export bit across `VAR=newvalue` once a variable is exported) and
`cli/up.ts` sees it correctly. The gap is specifically: **any invocation of `scripts/ebrain-up` (or any
sibling) that does not first pass through `cli/ebrain`.**

**Reproduction** (byte-for-byte what I ran):
```bash
# Arbitrary checkout, sandboxed HOME, no EBRAIN_HOME anywhere in the process ancestry.
cat > /tmp/arbitrary-checkout/scripts/probe-ebrain-up-direct <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
. "$(dirname -- "${BASH_SOURCE[0]}")/../harness/core/ebrain-home.sh"
EBRAIN_HOME="$(ebrain_resolve_home "${BASH_SOURCE[0]}")"
echo "[shell] resolved EBRAIN_HOME=$EBRAIN_HOME (exported? $(export -p | grep -q 'EBRAIN_HOME=' && echo yes || echo no))"
exec bun run "$EBRAIN_HOME/cli/probe-up-env.ts"   # mirrors cli/up.ts:30 exactly
EOF
env -i PATH="$PATH" HOME=/tmp/sandbox-home bash /tmp/arbitrary-checkout/scripts/probe-ebrain-up-direct
```
Output:
```
[shell] resolved EBRAIN_HOME=/tmp/arbitrary-checkout (exported? no)
process.env.EBRAIN_HOME (raw) = undefined
resolved EBRAIN_HOME used by up.ts's own logic = /tmp/sandbox-home/eBrain
```
The shell correctly found the real checkout (`/tmp/arbitrary-checkout`). The bun subprocess that
actually decides what to register never saw it, and silently fell back to `/tmp/sandbox-home/eBrain` —
a directory that does not exist. This is not a contrived probe: `probe-up-env.ts` is a direct copy of
`cli/up.ts:30`'s own line.

**Confirmed untested:** `cli/up.test.ts:12-37` never exercises this. Every test supplies
`BRIDGE = "/home/test/eBrain/scripts/ebrain-mcp-bridge"` as an explicit fourth argument to
`commandForAgent(agent, TOKEN, URL, BRIDGE)`, bypassing the `bridgeCommandPath(EBRAIN_HOME)` default
entirely. The 335/0 count includes zero coverage of the actual default-resolution path a real `ebrain
up` invocation takes.

**Plain-terms failure:** the shell layer now finds the right checkout; the TypeScript layer that
actually writes the agent configs still doesn't reliably receive that answer. Any invocation chain that
doesn't start at `cli/ebrain` — someone re-running `scripts/ebrain-up` by hand after finding it (its
own shebang and standalone design invite exactly that), a script or doc pointing at it directly,
anything that isn't the one blessed entrypoint — reintroduces the silent-wrong-registration defect this
PR's own narrative names as "the worst case."

**Remediation direction:** `export EBRAIN_HOME` in `ebrain_resolve_home`'s callers (or have the
function itself do the export, since every caller wants that), everywhere the resolved value crosses
into a `bun`/`exec` boundary. Then add a test that spawns `scripts/ebrain-up` (or `ebrain-mcp-bridge`)
as a real subprocess — not the TS unit — and asserts what the **grandchild** bun process's
`process.env.EBRAIN_HOME` actually is.

---

### F-S2 — HIGH — a live, tracked, currently-unfixed instance of the exact defect class, in a file type the new test cannot see

**File:** `scripts/systemd/ebrain-dream.service:9`

```
ExecStart=%h/eBrain/scripts/dream-cycle
```

`%h` is systemd's own specifier for the invoking user's home directory — functionally identical to
`$HOME` for this purpose, spelled differently. This unit hardcodes the checkout to `~/eBrain` with no
override: no `Environment=EBRAIN_HOME=...` line, and `scripts/dream-cycle` itself does not reference
`EBRAIN_HOME` or use `harness/core/ebrain-home.sh` at all (confirmed — no such reference in the file).

**Reproduction:**
```bash
grep -n 'ExecStart' scripts/systemd/ebrain-dream.service
# ExecStart=%h/eBrain/scripts/dream-cycle
```
Confirmed the new regression test cannot flag it — `cli/ebrain-home.test.ts`'s offender scan only
matches the literal substrings `$HOME/eBrain` and `${HOME}/eBrain` (`cli/ebrain-home.test.ts:60`);
`%h/eBrain` contains neither.

**Severity context:** this unit is opt-in (a nightly maintenance timer, not wired into
`scripts/install.sh` or `cli/ebrain`'s onboarding), which is why it is HIGH rather than BLOCKING — it
doesn't break the primary onboarding smoke path. But it is exactly the class of defect ("a user who
cloned anywhere but `$HOME/eBrain`... got [something] that failed silently") the PR's own opening
paragraph describes, present today, on this branch, in a tracked file, and it directly falsifies the
strength of the "twenty-six, and now the search is the test so it can't happen again" claim: the search
never covered this file's syntax.

**Remediation direction:** either add `Environment=EBRAIN_HOME=%h/eBrain` as an explicit,
documented override point (still a default, but a machine-readable one a user can override in a drop-in),
or generate this file (and the `.timer`) from `install.sh`/`ebrain harness install` the same way the
codex hook wrappers are generated, baking in the real resolved path. Either way, extend the F-Q1 test
(or write a sibling) to check `.service`/`.timer`/`.plist` files for `%h/eBrain` and any other
platform-specific home specifier, not just the two POSIX shell spellings.

---

### F-S3 — MEDIUM — the resolver's own doc comment claims a guarantee it does not implement: a symlink on PATH

**File:** `harness/core/ebrain-home.sh:56` (comment), `:57` (implementation); the same gap exists in
every caller's sourcing line, e.g. `scripts/ebrain-mcp-bridge:7`.

The comment reads: *"Resolve symlinks so a launcher symlinked onto PATH still finds its own checkout."*
The implementation:
```sh
_dir=$(CDPATH='' cd -- "$(dirname -- "$_caller")" 2>/dev/null && pwd -P) || _dir=''
```
resolves symlinks in the **directory** components of `$_caller`, but `dirname` strips the final path
component first — so if the symlink *is* the final component (the actual "launcher symlinked onto
PATH" case), its target is never consulted at all.

**Reproduction:**
```bash
mkdir -p /tmp/arbitrary-checkout-bin
ln -sf /tmp/arbitrary-checkout/scripts/ebrain-mcp-bridge /tmp/arbitrary-checkout-bin/ebrain-mcp-bridge
env -i PATH="/tmp/arbitrary-checkout-bin:$PATH" HOME=/tmp/sandbox-home ebrain-mcp-bridge --help
# /tmp/arbitrary-checkout-bin/ebrain-mcp-bridge: line 7: /tmp/arbitrary-checkout-bin/../harness/core/ebrain-home.sh: No such file or directory
# exit 1
```
The failure is actually one line earlier than `ebrain_resolve_home` — the **sourcing line itself**
(`. "$(dirname -- "${BASH_SOURCE[0]}")/../harness/core/ebrain-home.sh"`) computes a nonexistent path
relative to the symlink's directory and dies before the resolver ever runs. This is a hard, loud
failure (exit 1, clear-ish error), not a silent wrong-root — genuinely better than the "wrong root is
worse than no root" failure mode the brief warns about, which is the main reason I rate this MEDIUM and
not higher.

**Scope check — is this exploited today?** `grep -rn "ln -s"` across the tracked, non-test, non-vendor
tree returns nothing: the product itself never symlinks any of these 26 entrypoints anywhere (the
installed launcher at `~/.local/bin/ebrain` is a generated wrapper with a baked-in absolute path, not a
symlink — confirmed by reading `scripts/install.sh:122-127`; the codex hook wrappers are likewise
generated copies, not symlinks). So this is a latent gap for a user or third-party packaging step that
symlinks one of these scripts onto `PATH` manually (a completely standard Unix pattern), not an active
regression in the shipped install flow.

**Remediation direction:** either fix the resolution (`readlink -f "$_caller"` before taking `dirname`,
in both the sourcing line and `ebrain_resolve_home`), or narrow the comment to what's actually true
(resolves symlinked ancestor directories, not a symlinked file itself) so a future reader doesn't rely
on a guarantee that isn't there.

---

### F-S4 — HIGH — F-Q3's `-h` fix does not cover `--help` in a value position, and the maker's own justifying comment is falsified by code in the same file

**Files:** `cli/context.ts:490-493` (and identically `cli/procedures.ts`, `cli/workflows.ts`).

```ts
if (argv[0] === "--help" || argv[0] === "-h" || argv.includes("--help")) {
  console.log(USAGE);
  return;
}
```
The comment claims: *"The long form is unambiguous (no subcommand takes `--help` as a value) so it
still counts anywhere."* `cli/context.ts:520-524` (`update`) and `:527-534` (`propose`) both take
free-text `--content`/`--evidence` values via `VALUE_FLAGS` (`cli/context.ts:431`), with no restriction
on content.

**Reproduction:**
```bash
bun run cli/context.ts update some-pack-id --content --help --yes
# usage: ebrain context <list|proposals|init|get|update|propose|review> [--json]
# exit 0
```
compare to an actually-invalid subcommand, which correctly errors:
```bash
bun run cli/context.ts bogus-subcommand
# error: usage: ebrain context <list|proposals|init|get|update|propose|review> [--json]
# exit 2
```
The first case is a real, plausible operation (a user setting a context pack's content to literally
"--help" — e.g. documenting the flag itself) that silently no-ops with exit 0, indistinguishable from
success, instead of either performing the update or rejecting `--content` for missing a value. This is
the same failure category the F-Q3 fix was written to close for `-h` (a real operation silently
swallowed by a help check) — reopened for the long form the fix's own comment asserts is safe.

**Confirmed untested:** the one F-Q3 regression test added in this PR
(`cli/documented-help.test.ts:79-85`) only exercises `context get -h` — the short form, in a position
where the fix does work. There is no test for `--content --help` or any other value-position long-form
case.

**`workflows.ts` and `procedures.ts`:** `workflows.ts search "query"` has a similar exposure (a user
searching for the literal string `--help` gets help output instead of search results); `procedures.ts`'s
`--state`/`--limit` are enum/numeric-constrained, so the same defect there degrades to a confusing
usage-print rather than data loss — lower severity but the same root cause.

**Remediation direction:** don't scan `argv.includes("--help")` unconditionally; only treat `--help`
as a global help request in the same flag position discipline already applied to `-h` (position 0, or
after consuming a validated subcommand token but before any recognized value-flag). Add a test with
`--content` (or `--evidence`) literally equal to `--help`.

---

### F-S5 — MEDIUM-HIGH — the F-Q1 regression guard is non-vacuous only against the exact two spellings it enumerates

**File:** `cli/ebrain-home.test.ts:58-63`.

```ts
if (line.includes("$HOME/eBrain") || line.includes("${HOME}/eBrain")) {
  offenders.push(...);
}
```

**Reproduction** — standalone reimplementation of the exact check, fed plausible reintroductions a
future contributor could write without any adversarial intent:
```
CAUGHT   direct literal:            CANON="$HOME/eBrain/harness/core/x.sh"
CAUGHT   braced literal:            CANON="${HOME}/eBrain/harness/core/x.sh"
MISSED   quoted-var-only:           CANON="$HOME"/eBrain/harness/core/x.sh
MISSED   braced quoted-var-only:    CANON="${HOME}"/eBrain/harness/core/x.sh
MISSED   printf construction:       printf '%s/eBrain' "$HOME"     <- the resolver's OWN idiom, harness/core/ebrain-home.sh:74
MISSED   intermediate var:          H="$HOME"; CANON="$H/eBrain/harness/core/x.sh"
MISSED   TS path join:              const p = join(homedir(), "eBrain", "cli", "ebrain");
MISSED   TS template:               const p = `${process.env.HOME}/eBrain`;
```
This is not hypothetical: `join(homedir(), "eBrain")` / `join(HOME, "eBrain")` is the **exact, live
idiom already used today** in `cli/mcp-bridge.ts:37`, `cli/up.ts:30`, `cli/targets.ts:16`,
`cli/memory.ts:24`, `cli/workflows.ts:27`, `cli/daemon-preflight.ts:18`, `cli/mcp-token.ts:255`,
`cli/mcp-remote.ts:226` — eight files, all currently invisible to this test by construction, all
computing exactly `$HOME/eBrain`-shaped defaults (for `EBRAIN_HOME` specifically in several of them,
e.g. `up.ts`, `mcp-bridge.ts`, `targets.ts`, `memory.ts`, `workflows.ts`, `daemon-preflight.ts` — see
F-S1, which is this exact gap manifesting as a real defect in one of them).

**Plain-terms failure:** the test's own docstring says its point is that "the search is now the test,"
specifically because a human claim ("these are the last two sites") was wrong and nobody ran a real
search. The search that was written is narrower than the bug class it's meant to guard — it would not
have caught the round-3 regression if that regression had been spelled in TypeScript's native idiom
instead of the shell literal, and it does not catch the `.service` file in F-S2 today.

**Remediation direction:** this needs a semantic check, not a wider string list — at minimum, also flag
`join(` calls (or template literals) whose arguments resolve to `homedir()`/`HOME` followed by the
literal `"eBrain"`, and treat `.service`/`.timer`/`.plist` as scannable file types rather than silently
skipping everything outside `.sh`/`.ts`.

---

### F-S6 — MEDIUM — F-Q4's "real subcommands only" check is narrowed, not closed: dead code and unrelated `case` labels still register as "implemented"

**File:** `cli/documented-help.test.ts:69-71`.

```ts
for (const m of source.matchAll(/\b(?:a|args)\.sub === "([a-z-]+)"/g)) implemented.add(m[1]!);
for (const m of source.matchAll(/case "([a-z-]+)":/g)) implemented.add(m[1]!);
```

This is the fix for the exact failure the commit describes: *"a fake subcommand passed as long as the
string appeared for any unrelated reason (`accept` survived because an action value happens to be
spelled that way)."* The new version narrows the pattern space from "the name appears anywhere" to two
specific idioms — but it is still a **regex over raw source text**, with no awareness of comments, dead
code, or what a `case` is actually switching on.

**Reproduction** (same detection logic, fed adjacent code):
```
implemented=[review]   <- from:  // if (args.sub === "review") { doReview(); }   (commented out / dead)
implemented=[review]   <- from:  die(`try: args.sub === "review"`);              (a string literal, not dispatch)
implemented=[review]   <- from:  switch (state) { case "review": return markReviewed(); }   (switching on an unrelated variable named `state`, not a subcommand)
```
The last case is structurally identical to the `accept`-as-action-value bug the fix was written to
close — the maker traded "matches the bare name anywhere" for "matches `case "name":` anywhere," and a
`case` label on any unrelated field (a status, an action, a state) with the same spelling as a
documented subcommand still slips through.

**Also, in the other direction:** the pattern hardcodes the variable name as literally `a` or `args`
(`\b(?:a|args)\.sub`). A legitimate future refactor to a differently-named parsed-args variable (e.g.
`parsed.sub`, or a destructured `{ sub }`) makes a real, implemented subcommand register as
`implemented.size` unaffected but **that specific name missing**, failing the build for a change that
introduced no defect — a maintenance fragility, not a correctness gap, but worth knowing before someone
"fixes" the failing test by weakening it further under time pressure.

**Currently exploited?** No — `context.ts`, `procedures.ts`, and `workflows.ts` (the three files this
test parametrizes over) use only `if (args.sub === "x")`/`if (a.sub === "x")` chains today, no `case`
statements, confirmed by direct grep. So today's 335/0 is accurate for these three files specifically.
The gap is in the guarantee, not (yet) in a live false negative.

**Remediation direction:** parse with the TypeScript compiler API (or at minimum require the match sit
inside an `if`/`switch` whose discriminant is provably `args.sub`/`a.sub`, and exclude comment lines the
same way the F-Q1 test already does with its `COMMENT` regex — this file doesn't reuse that filter).

---

### F-S7 — MEDIUM-HIGH — the overlay hook copies duplicate the record-reading logic without the resolver's own hardening, and diverge from it in two demonstrated ways

**Files:** `overlay/codex-harness/hooks/block-secret-read.sh:5-6`,
`overlay/codex-harness/hooks/session-context.sh:7-8`, compared against
`harness/core/ebrain-home.sh:65-74`.

The canonical resolver's record-file fallback:
```sh
_recorded=$(cat "$_record" 2>/dev/null | tr -d '\r\n')
if [ -n "$_recorded" ] && ebrain__looks_like_root "$_recorded"; then
  printf '%s' "$_recorded"; return 0
fi
# falls through to $HOME/eBrain only if the record is empty or doesn't look like a checkout
```
The overlay copies:
```sh
EBRAIN_HOME="${EBRAIN_HOME:-$(cat "${XDG_CONFIG_HOME:-$HOME/.config}/ebrain/home" 2>/dev/null)}"
: "${EBRAIN_HOME:=$HOME/eBrain}"
```
No `tr -d '\r\n'`, and no `ebrain__looks_like_root` validation before trusting the record.

**Divergence 1 — CRLF is not sanitized in the copies.** Reproduced: a record file with a trailing `\r\n`
(plausible from any Windows/WSL-adjacent editing of the record) resolves cleanly via the canonical
resolver (`ebrain_resolve_home`'s own record-read path correctly locates the real checkout) but the
overlay copy's `EBRAIN_HOME` retains the stray `\r`, so `CANON="$EBRAIN_HOME/harness/core/
guard-secrets.sh"` never matches an existing file, and the guard silently fail-opens
(`block-secret-read.sh`'s design is explicitly fail-open on a missing canonical script) even though a
perfectly valid checkout exists.

**Divergence 2 — a stale record is trusted blindly, so the guard doesn't self-heal even when a valid
checkout exists at the documented default.** Reproduced directly:
```
# record file points at a deleted checkout; a VALID checkout also exists at the default $HOME/eBrain
resolver returned: [/tmp/stale-home2/eBrain]              <- self-heals: record invalid, falls through, finds it
overlay returned:  [/tmp/checkout-that-was-deleted]        <- trusts the stale record, never looks further
```
The canonical resolver validates the record with `ebrain__looks_like_root` before trusting it and falls
through past an invalid one to the last-resort default; the copies do not, so `block-secret-read.sh` —
**the Codex secret-read guard** — stays permanently disabled after any checkout move/reinstall that
leaves a stale record behind, even in the exact scenario (a valid checkout sitting at the conventional
default) the canonical resolver was specifically designed to recover from.

**Plain-terms failure:** the PR's own design note for these two files says "installed as copies... they
read the recorded location and fall back last" — implying the same policy as the canonical resolver,
just via a different mechanism (can't walk up). The two implementations of that policy disagree on
exactly the inputs that matter for a security guard: a malformed record and a stale one. Both failures
are silent (fail-open, no error to the user), which is the harness's own stated worst case
("silent-success is the enemy").

**Remediation direction:** don't duplicate the record-read logic a second and third time; have both
overlay hooks source a tiny shared snippet (or call a `read`-only helper function defined once in
`ebrain-home.sh`, since POSIX sh can absolutely export a validation function even for files that can't
walk up) so the sanitization and validation can't drift again.

---

## Lower-severity / informational

### F-S8 — LOW — F-Q5 (`--ignore-scripts` assertion) verifies the flag is passed, not that it's honored

**File:** `cli/install.test.ts:311-320`. The test asserts the mocked `bun`'s recorded `$*` contains the
substring `--ignore-scripts` for the `vendor/gbrain` install. Confirmed the flag is a real, separate
shell word in `scripts/install.sh`'s actual `bun install --frozen-lockfile --ignore-scripts` invocation
(not a decorative string, not embedded in a larger quoted arg), so the test is not vacuous about what
it claims. But a unit test against a mocked `bun` binary cannot and does not verify that the *real* bun
honors `--ignore-scripts` for every dependency shape in `vendor/gbrain` (e.g. a local `.npmrc` inside
the vendored tree with `ignore-scripts=false`, which some package managers let override CLI flags
depending on precedence rules). This is a reasonable, standard unit-test boundary, not a defect — flagged
as a suggested integration-level follow-up (confirm no postinstall artifact appears after a real,
non-mocked install of the pinned `gbrain` commit), not blocking.

### F-S9 — LOW — the pty test's blanket `\n` stripping is a broader fix than the problem needs

**File:** `cli/ebrain.test.ts:70-75`. `out.replace(/\n/g, "")` before the `toContain()` check correctly
fixes the reported problem (tmux hard-wrapping a long checkout path mid-string). But it also collapses
row boundaries for the *entire* captured pane, not just the wrapped line in question, where tmux's own
`capture-pane -J` flag ("join wrapped lines") exists specifically to join only soft-wrapped lines while
preserving real ones. In principle this makes accidental cross-line concatenation matches slightly more
likely; in practice the assertion string (`FAKE_BUN_TUI:run <specific absolute path>/tui/src/app.ts`) is
long and specific enough that the risk of a coincidental false-positive match is negligible. Noted as a
design smell (a more precise tool flag was available and not used), not a functional defect.

### Methodology note — the cited pass 4 report does not exist in the repository

The commit message, PR body, and CHANGELOG entry all cite `docs/AUDIT-F7-F12-PASS4.md` (verdict
`[AUDIT_FAIL]`) as the trigger for this remediation. That file is not present on `main` or on this
branch (`git show main:docs/AUDIT-F7-F12-PASS4.md` and the same against the branch tip both fail —
confirmed directly, not inferred). Pass 1 through 3's reports (`AUDIT-F7-F12-INDEPENDENT.md`,
`AUDIT-F7-F12-REAUDIT.md`, `AUDIT-F7-F12-PASS3.md`) are all present, so the absence is inconsistent with
the established pattern. This doesn't invalidate the technical claims in the CHANGELOG — I independently
reproduced the F-Q1 through F-Q5 findings against the actual code rather than relying on pass 4's
account — but the specific text of what pass 4 found and why is itself unverifiable from inside this
repository. Worth a maker follow-up: either commit the missing report or stop citing it as a
file-backed artifact.

---

## What I verified closed (with evidence)

- **The resolver's core walk-up algorithm.** Nested checkout (script physically inside an inner
  checkout nested under an outer one) resolves to the nearest/innermost enclosing checkout, both for a
  file at the checkout root and one nested at `scripts/` depth — correct in both cases, reproduced.
- **Relative `$0` from an unrelated cwd** — resolves correctly.
- **Paths containing spaces** (`/tmp/nest with spaces/...`) — resolves correctly, no quoting breakage.
- **Sourced-vs-executed context** — every real call site passes `"${BASH_SOURCE[0]}"` explicitly from
  its own top level (not from inside a function defined in the sourced file), so the POSIX
  "a sourced file can't know its own path" problem the design comment calls out is genuinely avoided in
  practice; verified this pattern holds identically across all 8 `harness/core/*.sh` and 11 `scripts/*`
  call sites (no site improvises its own variant).
- **True POSIX `sh` compatibility** — `dash -n harness/core/ebrain-home.sh` is clean, and a functional
  source-and-call under `dash` (not bash) resolves correctly.
- **`scripts/ebrain-mcp-bridge`, the PR's own headline example** — direct invocation, arbitrary checkout
  path, sandboxed `HOME`, no `EBRAIN_HOME`: the shell layer correctly resolves and execs the right file
  (`bash -x` trace confirms `EBRAIN_HOME=/tmp/arbitrary-checkout` and
  `exec bun run /tmp/arbitrary-checkout/cli/mcp-bridge.ts`). Further confirmed that `mcp-bridge.ts`'s
  own runtime logic (`main`/`startBridge`/`probe`) never reads `process.env.EBRAIN_HOME` at all, so the
  bridge's *own operation* is correct regardless of the F-S1 export gap — F-S1 is specifically about the
  *registration* step (`cli/up.ts`), not the bridge's runtime.
- **`scripts/install.sh` records the install location and the generated harness wrapper bakes in an
  absolute path at generation time** — read directly, not inferred from the comment: the record write
  (`printf '%s\n' "$EBRAIN_HOME" > "$EBRAIN_RECORD_DIR/home"`, `scripts/install.sh`) and the heredoc in
  `harness/core/install.sh` (`CANON="$EBRAIN_HOME/harness/core/$core"` inside an *unquoted* `<<EOF`, so
  `$EBRAIN_HOME` is expanded to its resolved absolute value at generation time, not deferred to runtime)
  both confirmed by reading the actual bytes emitted, not the surrounding prose.
- **F-Q2 (`SAFE_ENTRY` length bound) — exact JS/shell grammar parity.** Fuzzed both regexes
  (`cli/deny-policy.ts:29` vs `harness/core/trust.sh:45`) at lengths 0, 1, 2, 126, 127, 128, 129, 130,
  200: identical accept/reject at every boundary, max valid length 128 in both. No legitimate
  repository name is rejected (GitHub's own repo name cap is ~100 characters, well under 128).
- **`bash -n`** on all 25 tracked `*.sh` files, plus manual syntax checks on every extensionless
  `scripts/*` entrypoint and `cli/ebrain` — all clean.
- **Astro** — `bun run --cwd website check`: 16 files, 0 errors/0 warnings/0 hints. A full
  `bun run website:build` initially failed under my symlinked-`node_modules` test harness; confirmed
  this reproduces *identically on `main`* under the same clone setup (a Vite/Astro path-resolution
  artifact of symlinking `website/node_modules` across two different absolute checkout roots, not a
  branch regression), then re-verified with a real, non-symlinked `bun install` inside the isolated
  clone: clean build, 40 pages, `scripts/verify-build.ts` passed for 38 documentation pages.
- **Test counts, reproduced directly, not taken on faith:** `bun test ./cli/` → 335 pass/0 fail in the
  baseline, under `EBRAIN_HOME="$PWD"`, and under a fully sandboxed `HOME`+`XDG_CONFIG_HOME` — all three
  environments the maker claims, all three confirmed. `bun test ./tui/test/` → 442 pass/0 fail.

## What I could not verify, and why

- **`.npmrc` content.** Per the hard constraint on this audit (and my own operating rules), I did not
  read, cat, or grep the new root `.npmrc`. I confirmed only that `.gitignore` does not list `.npmrc`
  (so nothing structurally blocked committing one) and that the CHANGELOG/commit message describe its
  purpose as adopting `docs/COMPETITIVE-STUDY-PI.md`'s recommendations (exact pinning, lifecycle
  scripts disabled, a two-day minimum release age) — plausible and consistent with the deletion of that
  study doc in the same commit, but I did not evaluate the file's actual directives. This is scope creep
  relative to a "home resolution" fix bundled into the same commit; worth a maker note even if benign.
- **F-Q5's real effectiveness against the live `bun`/npm registry** — see F-S8; inherent to testing
  against a mocked binary, not something I could close without a live install.
- **The exact "twenty-six" count.** I counted roughly 21 direct `ebrain_resolve_home` call sites plus
  2 overlay copies plus 2 exempted files (the resolver itself and the remote installer's clone target);
  close to but not exactly reconciled against "26." Not blocking — F-S2 shows the true count of
  *remaining* hardcoded sites is at least 27, so the precise historical number matters less than the
  fact the search is demonstrably incomplete.
- **Whether `scripts/ebrain-up`/`ebrain-mcp-bridge` are invoked directly by anything beyond the systemd
  unit (F-S2) in real-world usage today.** I did not exhaustively audit every third-party consumer or
  documentation reference; F-S1 demonstrates the *mechanism* is broken whenever the dispatcher-export
  precondition doesn't hold, which stands regardless of how many current callers hit it.

## Disposition of the 9 targets

1. **Resolver correctness under adversarial callers** — mostly closed (nested checkout, relative `$0`,
   spaces, sourced context, dash/POSIX all verified correct); **open**: symlink-on-PATH crashes contrary
   to the resolver's own doc comment (F-S3, MEDIUM, not currently exploited by the product itself).
2. **The copies (install.sh record + generated wrapper)** — record-write and wrapper bake-in both
   verified correct by reading the actual bytes; **open**: the two overlay copies diverge from the
   canonical resolver's validation/sanitization in ways that silently fail-open a security guard
   (F-S7, MEDIUM-HIGH).
3. **Did anything break — exercised, not just tested** — the headline example
   (`ebrain-mcp-bridge`, direct invocation) works; **open**: `ebrain up`/`onboard`'s registration path
   breaks one layer down from the shell fix whenever invoked outside `cli/ebrain`'s dispatcher (F-S1,
   BLOCKING), and a currently-live untouched instance of the bug class exists in
   `scripts/systemd/ebrain-dream.service` (F-S2, HIGH).
4. **Non-vacuity of `cli/ebrain-home.test.ts`** — **confirmed vacuous** against real, plausible
   reintroductions: quote-splitting and the TypeScript `join(homedir(), "eBrain")` idiom already live in
   eight files today both evade it (F-S5); the ALLOWED map entries are all individually justified (one,
   `cli/install.test.ts`, is redundant with the comment-line filter but not wrong).
5. **F-Q2 length bound** — **verified closed**: exact parity at every boundary tested, no legitimate
   name rejected, DoS-motivated bound holds under both grammars.
6. **F-Q3 `-h` fix** — **confirmed incomplete**: the short form is genuinely fixed; the long form
   (`--help` as a value to `--content`/`--evidence`) is not, reproduced live against `cli/context.ts`
   (F-S4, HIGH), directly contradicting the fix's own justifying comment.
7. **F-Q4/F-Q5** — F-Q4 **narrowed, not closed**: dead code and unrelated `case` labels still register
   as "implemented," the same failure category the fix targets (F-S6, MEDIUM, not currently exploited in
   the 3 tested files). F-Q5 verifies the flag is passed, not that it's honored by real `bun` — a
   reasonable test-boundary limitation, not a defect (F-S8, LOW).
8. **The pty test's `\n` stripping** — weaker in principle than the purpose-built `tmux capture-pane -J`
   would have been, negligible in practice given the specificity of the string being matched (F-S9, LOW).
9. **The whole diff** — reviewed all 34 files, including the `.npmrc` addition and
   `docs/COMPETITIVE-STUDY-PI.md` deletion (both explained by the commit message as consumed/adopted;
   `.npmrc` content excluded from review per the hard secrets constraint), and the CHANGELOG correction
   (accurate against everything I independently reproduced). Also surfaced the missing pass-4 report
   (methodology note above).

**[AUDIT_FAIL]**
