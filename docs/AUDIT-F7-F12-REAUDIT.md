---
type: independent-audit
project: ebrain
range: 7385e94..0204f63 (re-audit of the F7-F12 blocking-finding fixes)
branch: release/open-source-publication
checker: Fable (Claude, independent — same checker as docs/AUDIT-F7-F12-INDEPENDENT.md; maker of the fixes was a third agent)
created: 2026-07-19
prior-verdict: "[AUDIT_FAIL] (docs/AUDIT-F7-F12-INDEPENDENT.md)"
---

# Re-audit — F7-F12 Blocking-Finding Fixes

**VERDICT: [AUDIT_FAIL] — the fixes themselves are genuinely good: F-A1 is closed and provably non-vacuous, F-A2 was implemented rather than reworded, F-D1 is closed with the guard hardened, and every isolation guarantee I attacked (segment matching, symlink resolution, case-insensitivity, source-identity substring, session/workspace/episode/context/recall/memory boundaries, empty-policy short-circuit, name-free English messages) held under my own fixture policies. But the new user-owned deny policy introduced one regression that blocks merge + deploy: the SHELL half of the policy (`harness/core/trust.sh`) does not validate entries, so a CRLF-edited or metacharacter-bearing config file silently fails OPEN — including disabling valid entries — while the published configuration reference explicitly promises the opposite ("aborts the operation instead of continuing with a silently smaller policy"). That is a truthfulness defect on the deployed docs surface and a fail-open mode in security-critical isolation code that did not exist before this delta. It is a small, surgical fix in one file.**

## Severity table

| ID | Severity | Gate it blocks | One-line summary |
| --- | --- | --- | --- |
| F-R1 | HIGH | merge + deploy | `trust.sh` deny policy: no entry validation — CRLF config silently matches nothing (TS parses the same file fine); one regex-metachar/leading-dash entry silently fail-opens the ENTIRE shell policy while the TS path aborts; published docs claim abort-on-malformed |
| F-R2 | MEDIUM | none (fix with F-R1) | `doctor` daemon-branch can report isolation `ok` while the policy file is unreadable (`TRUST_POLICY_ERROR` ignored); doctor has no policy-state check at all |
| F-R3 | MEDIUM | none | `EBRAIN_MEMORY_HOME` is honored by the writer (`remember.sh`) but not by the readers (`cli/memory.ts`, `status.sh`) — split-brain when set; CHANGELOG overclaims the override as general |
| F-R4 | LOW | none | i18n guard false negatives: `remember.sh` (a guarded surface) still ships three Spanish user-visible error/output lines the strengthened heuristic does not catch |
| F-R5 | LOW | none | `daemon-preflight.ts:87` still interpolates denied identifiers into an error — unreachable today, but one refactor away from violating the F-D1 invariant in daemon boot output |

Original findings: F-A1 CLOSED · F-A2 CLOSED · F-A3 owner decision (pending, not a maker item) · F-B1 PARTIALLY CLOSED (code half done; prose half open, visibility gate) · F-B2 STILL OPEN (visibility gate, as expected) · F-C1/F-C2 STILL OPEN (not claimed; durability, non-blocking) · F-C3 CLOSED · F-C4 CLOSED · F-C5 CLOSED · F-C6/F-C7 N/A (no action required) · F-D1 (orchestrator's) CLOSED.

━━━

## Part 1 — Disposition of the original findings (each personally reproduced)

### F-A1 · BLOCKER · Published install sequence — **CLOSED**

The maker took option 2 of my directive exactly: `scripts/install.sh:66-76` resolves the checkout from the installer's own location when `EBRAIN_HOME` is unset (`EBRAIN_HOME_EXPLICIT` tracked at line 17; explicit env still authoritative, which I verified separately — an explicit `EBRAIN_HOME` pointing at a different checkout wins over the script location).

**Non-vacuity reproduced by me, not taken from the maker.** I ran the documented four-line quickstart (clone into an arbitrary directory, no `EBRAIN_HOME`, sandbox `HOME`, `env -i`) twice with identical fixtures:
- against `git show 7385e94:scripts/install.sh` (the exact pre-fix installer) → **exit 1**, `install.sh: --from-source expects an existing checkout at <sandbox>/eBrain` — the original failure, byte-for-byte the same class;
- against the current installer → **exit 0**, launcher written to `<sandbox>/.local/bin/ebrain` and pointing at the checkout the user actually made (`${EBRAIN_HOME:-<checkout>}/cli/ebrain`), not at `$HOME/eBrain`.

The new test (`cli/install.test.ts:135-185`, "published quickstart sequence") executes the same sequence with no `EBRAIN_HOME`, pins exit 0, pins the launcher path, and pins the absence of the old error string — it copies the *current* installer into its fixture, so restoring the pre-fix installer makes it fail. Non-vacuous. `docs/getting-started/install.md` and `README.md` are untouched (correct — the docs were right, the installer was wrong).

### F-A2 · HIGH · "Configurable" deny-list — **CLOSED** (implemented, option b; residual quality defect filed as new F-R1)

The configuration now exists and is what the copy says it is. `cli/deny-policy.ts` is the single source of truth; resolution order verified hands-on: `EBRAIN_DENIED_REPOS` (set-but-empty = deny nothing, does NOT fall through) → `EBRAIN_DENY_CONFIG` → `$XDG_CONFIG_HOME/ebrain/denied-repos` → empty. Documented at `docs/reference/configuration.md#repository-deny-policy` (anchor present in the built page; the boundary/matching table matches the code exactly on the TS side). `SECURITY.md:23-26` and `docs/guides/privacy.md:12-14` now point at that reference instead of overclaiming. Consumers rewired and verified: `cli/sessions.ts` (via `isDeniedPath`), `cli/isolation.ts`, `cli/context.ts:119`, `cli/episodes.ts:150` and the recall-query check at `cli/episodes.ts:371`, `harness/core/trust.sh`, `harness/core/doctor.sh:110` (sources `trust.sh` instead of its previously drifted inline copy).

My 36-case TS battery (own fixtures only; the operator's real policy file was never read): all pass — including unreadable-file throw (fail closed), ten malformed-entry classes all throwing `invalid deny entry`, CRLF parsing, comment/dedup/trailing-newline handling, segment vs substring semantics, no over-blocking of `<entry>-notes` lookalikes, and the empty-policy short-circuit in every predicate. The **shell** half is where the residual defect lives — see F-R1.

### F-A3 · MEDIUM · Site links to private repo — **owner decision, pending; not counted against the maker**

No change in the delta (correct — my directive said no code change is required for acceptance). The CHANGELOG records it as an owner sequencing decision. It remains undecided on the record: before deploy, the owner should explicitly accept the interim dead-link state (optionally with the "source access opening shortly" note) or sequence the visibility flip with the deploy.

### F-B1 · BLOCKER (visibility only) · Operator client identifiers — **PARTIALLY CLOSED (code half done)**

Reproduced: zero client identifiers remain in any tracked `.ts`, `.sh`, `cli/ebrain`, `scripts/*`, or `overlay/*` file (`rg -il` over those classes → only untracked `harness/.backups/*.bak` local files, confirmed untracked via `git ls-files`). Tests migrated to `denied-alpha`/`denied-beta` and each suite declares its own policy via `EBRAIN_DENIED_REPOS` at module top — hermetic against the machine's real config (highest-precedence override), which I confirmed both by code reading and by the suite passing identically with and without `EBRAIN_HOME` on a machine that has a real policy file.

Still open, honestly disclosed by the maker, all **visibility-gate only**: the identifiers remain in prose (`CHANGELOG.md`, ADRs, handoffs, `harness/core/NORMS.md`, `harness/skills/remember/SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `docs/GUARDRAILS.md`, sprint/audit docs); operator identity remains in the *allow*-lists of `harness/core/trust.sh:48-52`; and the website verifier wrinkle from my original report (`website/scripts/verify-build.ts` cannot carry the names) is untouched and still part of the remediation design for the gate.

### F-B2 · BLOCKER (visibility only) · Operator documents at HEAD — **STILL OPEN (expected; no claim made)**

No change, as disclosed. Note for the gate-2 inventory: this delta **added** `docs/AUDIT-F7-F12-INDEPENDENT.md` (my previous report — swept in by the backup bot), and this file adds another. Both name commercial models as maker/checker and belong to the same private-docs class; include them in the move/rewrite before any visibility change. Neither reaches the website (built `dist/` scan: zero `AUDIT-` matches; search index is exactly the 38 navigation routes).

### F-C1 / F-C2 · MEDIUM (durability) · CI scan guards — **STILL OPEN**

`.github/workflows/ci.yml` untouched in the delta; not claimed by the maker. Non-blocking now, unchanged directive.

### F-C3 · MEDIUM · `remember` not EBRAIN_HOME-portable — **CLOSED**

`harness/core/remember.sh:19-23` resolves `EBRAIN_HOME` once at the top and derives both the trust-policy source path and the memory root from it; `cli/ebrain:9` exports `EBRAIN_HOME` from its own location so every child sees the real checkout; the installer's launcher embeds the checkout path with an ambient-env escape hatch. E2E reproduced with a fixture policy and sandboxed `EBRAIN_MEMORY_HOME`: deny by `--project` → exit 3, deny by cwd repo slug → exit 3 (both English, name-free), clean repo → written into the sandboxed memory root only. `scripts/ebrain-q` and `scripts/ebrain-brain` likewise derive from script location (and `ebrain-brain` resolves BEFORE its `cd`, correctly). Residual reader-side gap filed as F-R3.

### F-C4 · LOW · Boot-time isolation assertion — **CLOSED**

The comment was indeed stale: `cli/daemon-preflight.ts` (pre-existing, untouched) calls `assertCleanSources` over the live source list, `scripts/ebrain-brain` runs it under `set -euo pipefail` before `exec … serve --http`, so a denied source aborts boot before the HTTP bind. `cli/isolation.ts:57-61` now documents the true state. SECURITY.md's added sentence ("the daemon refuses to bind if a denied source reached the federated set") is accurate.

### F-C5 · LOW · CONTRIBUTING order — **CLOSED**

`CONTRIBUTING.md:13` now reads `bun cli/ebrain doctor  # … (no install needed)`.

### F-C6 / F-C7 — **N/A** (advisory / nit; no action was required and none was taken; no Vercel config appeared in the delta).

### F-D1 (orchestrator's finding) · Spanish deny message interpolating denied names — **CLOSED**

Verified at every claimed point: `cli/sessions.ts:190` is English and name-free (also proven live in my decoy battery: the deny message for a denied cwd contains no identifier and no Spanish); `cli/isolation.ts` `assertNoClientSources` throws a count (`isolation broken: N denied source(s)…`), pinned by `cli/isolation.test.ts` including an explicit `not.toThrow(/<fixture-name>/)`; `doctor.sh` fail messages are name-free ("a denied source is registered in the brain (check 'sources list' locally)"). The i18n guard gained the function-word heuristic, the regression test pinned to the exact escaped string (which I confirmed the old curated list genuinely missed — the pinned assertions prove it), and `cli/isolation.ts` + `harness/core/remember.sh` as guarded surfaces. Residuals: F-R4 (heuristic misses that still exist in remember.sh) and F-R5 (dead name-echo site).

━━━

## Part 2 — NEW findings introduced by this delta

### F-R1 · HIGH · Shell deny-policy path fails OPEN on CRLF and malformed entries — **blocks merge + deploy**

**Where:** `harness/core/trust.sh:23-27` (entry ingestion: `tr ', \t' '\n\n\n' | grep -v '^$' | paste -sd'|'` — no validation, no CR stripping) and `harness/core/trust.sh:41-45` (`trust_denied` feeds the joined string to `grep -Eiq` as a regex). Contrast `cli/deny-policy.ts:29,46-49`, which validates every token against `^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$` and throws.

**Reproduced failure scenarios (own fixture files, 20-case shell battery):**
1. **CRLF config → silent fail-open, fully silent.** A `denied-repos` file saved with CRLF line endings (Windows/WSL editor): the TS path strips `\r` via `.trim()` and matches correctly (my battery: parses + denies), but the shell pattern retains a literal CR — `trust_denied "denied-alpha"` returned **allow** (rc=1). Same file, two different effective policies, no error anywhere. Concrete leak: an agent runs `ebrain remember` inside a repo the operator denied → `remember.sh:63/69` does not deny → the learning (captured client context, slug in frontmatter) enters permanent cross-agent memory. `remember` is hard-deny-only by design ("remember es intencional"), so no default-deny backstop exists on this path.
2. **One malformed entry disables the WHOLE shell policy.** File `denied-alpha` + `foo(` → combined pattern `denied-alpha|foo(` is an invalid ERE → grep exits 2 → `trust_denied` returns non-zero → **allow** even for the perfectly valid `denied-alpha` entry (reproduced, rc=2). A leading-dash first entry (`-foo|…`) is parsed as a grep option — same whole-policy fail-open. The TS path aborts loudly on the same file (daemon preflight refuses to bind, every policy-touching CLI command errors), so the operator eventually notices — but in the interim every shell consumer (`remember.sh`, `trust_federate_ok` in the federation sweep, `doctor`'s fallback branch) silently enforces nothing.
3. **Dot-entry semantics diverge.** TS matches `a.b` literally (my battery: `aXb` NOT denied); the shell treats `.` as a regex wildcard (`aXb` **denied**, reproduced). Over-blocking direction, but the same config behaves differently across the two halves, and dots are explicitly allowed by the validation grammar (think `client.com`).

**Why blocking:** the published `docs/reference/configuration.md#repository-deny-policy` — deployed with the website — states: "The policy fails closed. A policy file that exists but cannot be read, **or an entry that is not a bare name, aborts the operation instead of continuing with a silently smaller policy**." Scenario 2 is *exactly* a silently smaller (empty) policy, and scenario 1 is silently smaller with not even a malformed entry to blame. This is the same truthfulness class that failed the first audit (published copy vs implementation), now sitting in the security-critical isolation path, and it is a regression: the pre-fix hardcoded literal could never be an invalid or non-matching pattern. What held: the empty-policy trap the maker flagged IS correctly closed on both paths (set-but-empty, whitespace-only, comment-only, missing file all deny nothing — reproduced), and an unreadable file correctly denies everything on the shell path (loud stderr warning) / throws on the TS path.

**Directive to the maker (surgical, one file plus tests):** in `trust.sh`, after ingestion, validate every token with the same grammar as `SAFE_ENTRY` (POSIX: `printf '%s' "$tok" | grep -Eq '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$'` after lowercasing) and strip `\r` in the `tr` set (`tr ', \t\r' …`); on any invalid token set `TRUST_POLICY_ERROR=1` (deny everything, print which LINE is bad — not required to echo the token) instead of proceeding; keep escaping or accept that validated entries are regex-safe except `.` — for exact parity either escape dots (`sed 's/\./\\./g'`) or document the shell substring match as literal-with-dot-wildcard honestly. Add shell-path regression tests (spawn `bash -c '. trust.sh; trust_denied …'` with fixture `EBRAIN_DENY_CONFIG` files) covering: CRLF, metachar entry, leading-dash entry, unreadable, comment-only, empty — plus TS-side tests for the config-FILE resolution steps, which currently have **zero** repo-suite coverage (every suite pins `EBRAIN_DENIED_REPOS`; `denyConfigPath`/`EBRAIN_DENY_CONFIG` appear in no test).

### F-R2 · MEDIUM · `doctor` can mis-report isolation OK under an unreadable policy — fix together with F-R1

**Where:** `harness/core/doctor.sh:117` — the daemon-branch check is `[ -n "$TRUST_DENY" ] && jq -e --arg deny "$TRUST_DENY" …`. When the policy file exists but is unreadable, `trust.sh` sets `TRUST_POLICY_ERROR=1` and `TRUST_DENY=''` (reproduced: `err=1 empty=yes`), so the guard skips the deny check entirely and the following `elif` happily reports `c_ok "sources:isolation" "sources vía daemon MCP = propios/federados; cero cliente"` — a green isolation check under a policy doctor cannot know. The `[ -n "$TRUST_DENY" ]` guard itself is correct for the *empty*-policy case (it is what prevents the jq empty-regex match-everything trap, and the fallback branch's `trust_denied` correctly short-circuits — verified); the defect is only that `TRUST_POLICY_ERROR` is never consulted. The fallback (no-daemon) branch has the inverse cosmetic problem: it would `c_fail` with "a denied source is registered" when the truth is "policy unreadable". Enforcement is unaffected (shell consumers deny everything in that state; TS consumers throw), so this is diagnostics, not a leak.

**Directive:** in both doctor branches, check `TRUST_POLICY_ERROR` first and emit a dedicated `c_fail "sources:deny-policy" "deny policy exists but is unreadable/invalid"`; while there, add a one-line informational check reporting the policy state (N entries / none / error) — the natural surfacing point for every F-R1-class misconfiguration, and the reason this finding should land in the same commit as F-R1.

### F-R3 · MEDIUM · `EBRAIN_MEMORY_HOME` split is writer-only

**Where:** writer `harness/core/remember.sh:20` (`MEM="${EBRAIN_MEMORY_HOME:-$EBRAIN_HOME/memory}"`) vs readers `cli/memory.ts:25` (`LEARNINGS_DIR = join(EBRAIN_HOME, "memory", "learnings")` — `ebrain memory recent`) and `harness/core/status.sh:62,110` (`$EBRAIN_HOME/memory`).

**Scenario:** an operator sets `EBRAIN_MEMORY_HOME=/data/ebrain-memory` (the CHANGELOG advertises it as "memory root is separately overridable via `EBRAIN_MEMORY_HOME`, separating user data from the code checkout"); `ebrain remember` writes there (reproduced in my E2E), then `ebrain memory recent` and `ebrain status` read `$EBRAIN_HOME/memory` and report nothing — silent split-brain, learnings invisible to the surfaces that display them. Mitigation: the variable is not documented in any published doc (verified: absent from `docs/reference/configuration.md`), so today it is effectively a test-support knob; the episodes suite uses it exactly that way. Not blocking.

**Directive:** either honor `EBRAIN_MEMORY_HOME` in `cli/memory.ts` and `status.sh` (one shared derivation), or scope it explicitly as test-only in the `remember.sh` comment and soften the CHANGELOG sentence. Do not document it publicly until the readers agree with the writer.

### F-R4 · LOW · i18n guard false negatives on a guarded surface

**Where:** `harness/core/remember.sh:81` (`echo "remember: no pude crear $DEST"`), `:110` (`echo "remember: no pude escribir $OUT"`), `:145` (`echo "  MCP put_page agent-memory ✓ (buscable en ebrain)"`). All three are user-visible sink lines in a file the strengthened guard (`cli/surface-i18n.test.ts`) now explicitly covers — and all three pass it: no diacritic, no curated-list phrase ("no pude" ≠ "no se pudo"), and zero function-word matches (the list omits high-frequency "en"/"no"/"con" — the first two defensibly, since "no"/"con" are English words). The suite is green with these lines present (reproduced: 290/0). The heuristic is otherwise defensible — I found no realistic English false positive (two `\b`-bounded matches on one sink line is a high bar; the "each entry is a non-word in English" comment is slightly overstated for "sin"/"se", but the threshold covers it), and the pinned regression test genuinely proves the old escaped string is now caught. One test-quality nit: the pinned test exercises `spanishFunctionWords()` directly, not `scan()` — a refactor that drops the `>= 2` clause from `scan()` would keep the pinned test green while weakening the guard.

**Directive:** translate the three lines (remember.sh output is quickstart surface, per the maker's own comment in SURFACES); optionally extend the word list with unambiguous non-English forms (`pude`, `pudo`, `crear`, `escribir`, `buscable`); and route the pinned regression through `scan()` on a synthetic fixture so the integration, not just the helper, is pinned.

### F-R5 · LOW · Dead name-echo site survives in daemon preflight

**Where:** `cli/daemon-preflight.ts:86-87` — after `assertCleanSources(sources)` (which throws count-only), the next two lines recompute `leaked` with the identical predicate and `throw new Error(\`client sources detected: ${leaked.join(", ")}\`)` — interpolating denied identifiers into daemon boot output. Unreachable today (line 85 throws first on the same condition; only a policy-file mutation between the two `deniedRepos()` reads could sequence it), and pre-existing rather than introduced — but it is precisely the pattern F-D1 eliminated, in a file whose output the fix explicitly protects ("Count, never names: this can surface in daemon boot output"), and the F-D1 sweep should have caught it. A related, accepted-by-design note: `cli/deny-policy.ts:48` echoes an *invalid* entry token back in its error message — reasonable UX for a malformed token, but if the malformed entry contains a real denied name (`client/acme`), that name reaches stderr; the line number alone would suffice.

**Directive:** delete `cli/daemon-preflight.ts:86-87`. Optionally reduce the invalid-entry message to the line number.

━━━

## Blocking split

**Blocking for merge + website deploy:** F-R1 only. (F-R2 should ride in the same commit but does not independently block.)

**Blocking only for repository visibility (unchanged gates, no new movement expected from this delta):** F-B1 prose half (incl. `trust.sh` allow-list identities and the `verify-build.ts` wrinkle), F-B2 (now including `docs/AUDIT-F7-F12-INDEPENDENT.md` and this file), history strategy.

**Non-blocking:** F-R3, F-R4, F-R5, F-C1, F-C2, F-A3 (owner decision to record).

## What was attacked and held (no finding)

- **Empty-policy trap:** closed on BOTH paths. TS: `denied.length === 0` short-circuits in every predicate; env set-but-empty does not fall through to the file. Shell: `trust_denied` returns 1 on empty `TRUST_DENY` before any grep; set-but-empty env, whitespace-only, comment-only, and missing-file all deny nothing (reproduced). Doctor's daemon branch guards the jq regex the same way.
- **Isolation guarantees under the user-owned policy** (all with my own fixtures; no client directory on disk was ever touched): segment-not-substring path matching incl. backslash and repeated separators, no over-block of `<name>-notes`, case-insensitivity, symlink decoy denied at `newSession` and at workspace registration (literal decoy too, innocent control accepted), source-identity substring matching, episode write/recall-query/context-text smuggle all rejected, rejection messages name-free, `remember` denies by slug and by remote with exit 3. Federation default-deny is intact and genuinely makes the empty default safe: an unknown local slug without an owned remote is denied by `trust_federate_ok` regardless of the deny list (reproduced).
- **Default-empty as an upgrade judgment:** safe. The removed compiled-in list contained only the operator's two client names — no third-party install could have been meaningfully relying on it; for the operator, the real config file exists (verified by existence only — never read, per audit boundary) and the maker's CHANGELOG records a live check of it. A short upgrade note in the configuration reference would still be courteous; not a finding.
- **`EBRAIN_HOME` export blast radius:** children that previously defaulted to `$HOME/eBrain` (`remember.sh`, `doctor.sh`, `status.sh`, TS modules) now inherit the dispatcher's own checkout — strictly a correctness improvement for non-default checkouts, no behavior change on a default install. Remaining `$HOME/eBrain` literals (`mcp-wire.sh:12`, `harness/core/install.sh:13`, `render-norms.sh`, `inject-context.sh:36`, `overlay/*`) predate the delta, were not in the fix's claimed scope, and are non-security.
- **Test quality of the migration:** the neutral-fixture migration changed no covered semantics (same literal/subpath/case/symlink/decoy cases, entry-for-entry); the suites are hermetic against machine configuration because `EBRAIN_DENIED_REPOS` (highest precedence) is set at module top of every suite that touches the policy and is inherited by spawned shells (the `writeTrustStub` removal is therefore sound — the REAL trust.sh now runs in the episodes suite under the fixture policy, which is a coverage improvement, not a coupling). New tests are non-vacuous: quickstart pins exit/launcher/error-absence; empty-policy and malformed-entry tests pin the exact failure modes; count-not-name is pinned positively AND negatively.
- **Docs vs implementation:** `SECURITY.md`, `docs/guides/privacy.md`, and the configuration reference now describe the real system — with the single exception charged to F-R1 (shell abort-on-malformed). The F10.0 claim matrix changed exactly three things: the new "Verified" exclusion row (accurate, including its honest "shipped default is empty" caveat), finding 2 RESOLVED, remediation 1 DONE — and the DONE note itself discloses the remaining allow-list identities. Nothing else was flipped; remediations 2-3 and findings 1/3 stand open. `docs/release/open-source-readiness.md` untouched.
- **Website surface:** delta touched no `website/` source; build 40 pages / verifier passes for 38; search index = exactly 38 navigation routes; built `dist/` has zero hits for client identifiers, operator paths/emails, private-doc names, or token shapes; the configuration page's new content is neutral (`acme-client` examples, XDG path) and the `#repository-deny-policy` anchor resolves.
- **Preservation checks:** `README.md`, `LICENSE` (AGPL-3.0), `docs/getting-started/install.md`, `docs/release/`, `.github/` all byte-untouched in the delta; branch is `release/open-source-publication`; PR #1 still OPEN and draft (read-only `gh` check). Backup commits `6edad28`/`b2c90e0` swept subsets of the same 32-file tree (plus my prior report); judged at tree level per the squash intent — nothing outside the fix scope landed.

## Reproduction log (every command run by the checker; sandbox = the session scratchpad)

1. `git rev-parse HEAD` → `0204f6358917e12de6101d0d8e1628889ca054b7`; branch `release/open-source-publication`; `git status --porcelain` → empty (clean before, and re-verified clean after, all audit activity).
2. `git log 7385e94..HEAD` → 3 commits (`0204f63` descriptive + 2 backup-bot); `git diff --stat` → 32 files, +739/−143, matching the assignment.
3. `bun test ./cli/` (no `EBRAIN_HOME`) → **290 pass / 0 fail**, 1703 expect(), 33 files. Matches claim.
4. `EBRAIN_HOME="$PWD" bun test ./cli/` → **290 / 0**, 1703 expect(). Matches claim.
5. `bun test ./tui/test/` → **442 / 0**, 2710 expect(), 36 files. Matches claim.
6. `bun run --cwd website check` → 0 errors / 0 warnings / 0 hints.
7. `bun run website:build` → 40 pages, "website verification passed for 38 documentation pages".
8. `git diff --check 7385e94..HEAD` → clean. `rg '#[0-9A-Fa-f]{3,8}' tui/src --glob '!theme.ts'` → exit 1 (no matches). `bash -n` on `cli/ebrain`, `trust.sh`, `doctor.sh`, `remember.sh` → OK. `sh -n scripts/install.sh` → OK.
9. **F-A1 non-vacuity:** documented quickstart under `env -i` sandbox, fixture repo carrying the installer under test: pre-fix (`git show 7385e94:scripts/install.sh`) → exit 1, "--from-source expects an existing checkout at `<sandbox>/eBrain`", no launcher; current → exit 0, launcher embeds the actual checkout. Explicit-`EBRAIN_HOME` run → "Using existing checkout at `<explicit path>`" (env wins over script location).
10. **TS deny-policy battery** (36 cases, fixture configs only) → 36 pass / 0 fail (resolution order, empty/whitespace/comment/missing, CRLF parse+match, unreadable→throw, 10 malformed-entry classes→throw, dedup, long entry, dot-literal semantics, segment/substring/case matching, no over-block, empty-policy short-circuits).
11. **Shell trust.sh battery** (20 cases, fixture configs only) → 16 pass / **4 fail**: CRLF entries do not match (fail-open); `foo(` entry → rc=2 → whole policy allows (fail-open); leading-dash first entry → rc=2 → whole policy allows (fail-open); dot entry matches `aXb` (regex-dot divergence). Also verified: unreadable file → deny-everything + stderr warning, `err=1 empty=yes` state (doctor mis-report vector), `trust_federate_ok` denies a denied slug and default-denies an unknown local slug under an empty-deny fixture.
12. **remember.sh E2E** (fixture policy, sandbox `HOME` + `EBRAIN_MEMORY_HOME`): deny by `--project` → exit 3; deny by cwd slug → exit 3 (English, name-free); clean → exit 0, file written only under the sandboxed memory root, episode mirror under sandboxed `HOME`.
13. **Smuggle battery** (episodes/context public API, fixture policy, sandbox stores) → 8/8: denied text rejected on episode write (mixed and uppercase-path forms), recall query with denied name rejected at `episodes.ts:371`, clean write/recall/context pass, rejection messages never echo the identifier.
14. **Decoy battery** (sessions/workspaces, fixture policy) → 6/6: literal denied cwd and symlink decoy → `deny-client` before tmux; workspace literal + symlink decoy rejected, control accepted; deny message English and name-free.
15. Sweeps: client identifiers in tracked `.ts`/`.sh`/dispatcher/scripts → none (prose remainder as listed in F-B1); `EBRAIN_DENIED_REPOS` declared in all 9 policy-touching suites; `EBRAIN_DENY_CONFIG`/`denyConfigPath` referenced by **no test** (coverage gap → F-R1 directive); `$HOME/eBrain` literal inventory as in Part 2/held-list; `rg -il` over `website/dist` for identifiers/paths/private-doc names/token shapes → exit 1; search index = 38 routes incl. `/docs/reference/configuration/`; `#repository-deny-policy` anchor present in built HTML.
16. Preservation: `git diff --stat 7385e94..HEAD -- README.md LICENSE docs/release/ docs/getting-started/install.md .github/` → empty. `gh pr view 1` → OPEN, draft, correct head. Operator deny-config: existence check only (`test -e`) → exists; contents never read, never printed.

## Maker claims NOT verified (and why)

1. "Live check confirmed the operator's own policy still denies its real entries" — deliberately not reproduced: it would require reading the operator's policy, which this audit's boundary forbids. I verified the file exists and that the loader semantics are correct via fixtures; the maker's live claim rests on their word.
2. Daemon-boot preflight against a live daemon — code-reading plus `set -e` ordering only, as in the prior audit; no daemon was started or stopped.
3. CI behavior of the new suites on a GitHub runner — local runs only; no workflow was triggered.

━━━

**Final verdict: the maker did honest, high-quality work — every original blocking finding is genuinely closed, non-vacuity was real, the isolation surface survived a substantially harder adversarial pass than the original audit, and the honesty ledger (F10.0, CHANGELOG, gates) was updated exactly and no further. But the delta introduced one fail-open regression in the shell half of the very policy it created (F-R1), and the deployed configuration reference promises the fail-closed behavior that half does not deliver. Fix `trust.sh` entry validation + CR handling (with F-R2's doctor surfacing in the same commit), add the missing shell/file-path tests, and this becomes a clean pass for merge + deploy without re-auditing anything else.**

[AUDIT_FAIL]
