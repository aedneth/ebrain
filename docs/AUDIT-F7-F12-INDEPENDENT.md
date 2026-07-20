---
type: independent-audit
project: ebrain
range: origin/main...7385e94 (F7 merge, F8, F9, F10, F11, F12)
branch: release/open-source-publication
checker: Fable (Claude, independent — maker was Codex)
created: 2026-07-19
imminent-actions-audited: squash-merge of PR #1 + public Vercel deploy of website/ (repo stays private)
---

# Independent Audit — F7–F12 Publication Candidate

**VERDICT: [AUDIT_FAIL] — one blocking and one high finding on the public documentation surface must be corrected in place before merge + website deploy. Both are small, surgical wording/path fixes; neither requires reverting the README, the AGPL relicense, or the branch. The privacy boundary of the built site itself is clean: no private-tree document, client identifier, personal path, or secret reaches the deployed pages or the search index (verified against the actual `dist/` output).**

## Summary of findings

| ID | Severity | Gate it blocks | One-line summary |
| --- | --- | --- | --- |
| F-A1 | BLOCKER | merge + deploy | The "Five-minute proof" install sequence in `README.md` and published `docs/getting-started/install.md` fails as written (reproduced, exit 1) |
| F-A2 | HIGH (deploy) | deploy | Published privacy/security copy claims a "configurable" deny-list / "configure local exclusions" — no such configuration exists; the deny-list is hardcoded |
| F-A3 | MEDIUM | deploy (owner decision) | Every page of the public site links to the still-private GitHub repo (404 for all visitors), including the footer AGPL license link |
| F-B1 | BLOCKER (visibility only) | repo public visibility | Seed A confirmed: operator-specific client identifiers remain hardcoded in shipping source, tests, harness, and prose (40+ tracked files). Honestly reported as an open gate everywhere; never falsely claimed resolved. Does NOT reach the website |
| F-B2 | BLOCKER (visibility only) | repo public visibility | Seed B confirmed: 26 operator documents tracked at HEAD plus personal absolute paths in tests/config prose. Does NOT reach the website. Git history retains all of it regardless of working-tree deletion |
| F-C1 | MEDIUM (durability) | none now | CI `if rg …` guards treat an rg runtime error (exit 2/127) as "no findings" — secret scan and zero-hex silently pass if rg is absent or a glob is wrong |
| F-C2 | MEDIUM (durability) | none now | CI secret scan excludes all `*.test.ts` files and covers only three token shapes — a real credential pasted into a test would pass CI |
| F-C3 | MEDIUM | merge (fix with F-A1) | `ebrain remember` hardcodes `$HOME/eBrain` internally — broken for any `EBRAIN_HOME` other than `~/eBrain`, and `remember` is step 3 of the advertised five-minute proof |
| F-C4 | LOW (durability) | none | Runtime host-boot wiring of `assertNoClientSources` is documented as pending in source while SECURITY.md asserts the isolation outcome unconditionally |
| F-C5 | LOW | none | `CONTRIBUTING.md` dev setup runs `ebrain doctor` before any step that puts `ebrain` on PATH |
| F-C6 | LOW (deploy advisory) | none | Vercel deploy must use a flow in which `../docs`/`../assets` are reachable and the package `build` script (which embeds the privacy verifier) is the build command; a naive `vercel` from `website/` fails closed rather than leaking |
| F-C7 | NIT | none | Two additional red CI runs (`29667610408`, `29667623783`) on in-range commits are not cited in the handoff's evidence narrative; final HEAD run `29667836664` is green |

━━━

## Part 1 — Blocking for the current action (squash-merge PR #1 + deploy website/)

### F-A1 · BLOCKER · Published install sequence fails as written

**Where:** `README.md:36-41` ("Five-minute proof") and `docs/getting-started/install.md:12-17` (published at `/docs/getting-started/install/` — in the site navigation and search index).

**What is wrong:** Both documents instruct:

```
git clone https://github.com/aedneth/ebrain.git ebrain
cd ebrain
bun install
./scripts/install.sh --from-source
```

but `scripts/install.sh:15` defaults `EBRAIN_HOME` to `$HOME/eBrain` and `scripts/install.sh:63-64` makes `--from-source` die unless a checkout already exists **at `$EBRAIN_HOME`**. The documented sequence clones into `./ebrain` relative to wherever the user is standing, so the checkout is never at `$HOME/eBrain` (even a clone executed inside `$HOME` produces `~/ebrain` ≠ `~/eBrain` on a case-sensitive filesystem).

**Concrete failure scenario (reproduced):** a clean environment following the four documented lines terminates at step 4 with

```
install.sh: --from-source expects an existing checkout at /home/<user>/eBrain
```

exit 1 (reproduction log, item 12). Every single user who follows the site's or README's primary call-to-action hits this. The F10.0 claim matrix classifies "Clean source installation is supported" as **Verified**; the shipped instructions contradict that class. The evidence tests (`cli/install.test.ts`) pass only because they set `EBRAIN_HOME` explicitly — they never exercise the documented sequence.

**Directive to the maker (correction in place — do not re-scope the README):** pick one and apply it consistently to `README.md`, `docs/getting-started/install.md`, and `CONTRIBUTING.md`:
1. Change the documented sequence to `git clone … ~/eBrain && cd ~/eBrain && bun install && ./scripts/install.sh --from-source`, or prefix step 4 with `EBRAIN_HOME="$PWD"`; **or**
2. Make `install.sh --from-source` resolve the checkout from the script's own location (e.g. the parent of the script's directory) when `EBRAIN_HOME` is unset, keeping the env override authoritative.
Then add a focused test that executes the *documented* sequence verbatim (fixture clone, `EBRAIN_SKIP_GBRAIN=1 EBRAIN_SKIP_UP=1`) so the public quickstart cannot silently rot again. Option 2 also has to fix F-C3 or the "proof" still breaks at `ebrain remember`.

### F-A2 · HIGH (blocks deploy unless fixed with it) · Privacy/security copy claims configuration that does not exist

**Where:**
- `docs/guides/privacy.md:12` — "Configure local exclusions for repositories and directories that must never enter federation, workflows, workspaces, or memory." Published at `/docs/guides/privacy/`.
- `SECURITY.md:23` — "A **configurable** deny-list keeps designated repositories out of memory and federation entirely". Linked from the site footer and shipped in main. Both files are new in this range (commit `a44297e`).

**What is wrong:** there is no user-facing exclusion configuration anywhere. The deny-list is a hardcoded constant (`cli/sessions.ts:41`), duplicated as regex literals (`cli/context.ts:118`, `cli/episodes.ts:149`) and a shell literal (`harness/core/trust.sh:17`), with no env var, config file, or CLI to extend it. Building that configuration is precisely the still-open F10.0 remediation item 1.

**Concrete failure scenario:** a source user with their own confidential client repo reads the deployed privacy guide before connecting sources, tries to "configure local exclusions" for it, finds no command, no config key, and no reference-documentation entry (`docs/reference/configuration.md` documents none), and either gives up or — worse — assumes an exclusion exists that does not, then federates a directory they believed was excludable. A privacy guide is the single worst place on the site to overclaim.

**Directive:** correction in place, two options — (a) reword both sentences to the truth: exclusions are currently a fixed maintainer-defined deny policy applied fail-closed at session, workspace, memory, and federation boundaries, and user-owned exclusion configuration is planned (this also stops SECURITY.md over-promising); or (b) implement the user-owned deny configuration now (which simultaneously discharges F-B1's code half). **Do not weaken or remove the existing fail-closed checks in either option.**

### F-A3 · MEDIUM · Site-before-repo sequencing leaves every repository link dead

**Where:** `website/src/lib/navigation.ts:12` (`REPOSITORY_URL`), `SiteHeader.astro:22`, `Base.astro:47-49` (footer "AGPL-3.0-only" → `blob/main/LICENSE`, "Security" → `blob/main/SECURITY.md`), plus `remark-public-links.mjs:30` rewriting root-file links to `blob/main/…`. Enumerated from the built `dist/`: the only external URLs on the site are five `github.com/aedneth/ebrain*` links, X, and LinkedIn (reproduction log, item 9).

**What is wrong / scenario:** the owner's stated sequence deploys the site while the repository stays private. Every visitor clicking "GitHub", the footer license link, the security link, or attempting the documented `git clone` gets a 404 / "repository not found". The site's core claims (source-first proof, AGPL license text one click away, private vulnerability reporting via GitHub advisories) are unverifiable and unactionable for its entire public audience during the interim.

**Directive:** this is an owner sequencing decision, not a maker defect — but it must be a *decided* consequence, not an accident. Either (a) accept the interim state explicitly (optionally add a short "source access is opening shortly" note on the homepage so dead links read as intentional), or (b) deploy immediately before/with the visibility flip. No code change required for (a). Note the security contact is unreachable for outsiders until the repo is public — if the site is up for more than a short interim, add a fallback contact.

━━━

## Part 2 — Blocking only for public repository visibility (NOT for merge or website deploy)

These are the two seed findings. Both were independently confirmed, both are honestly tracked as open gates by the candidate's own documents (`docs/release/open-source-readiness.md` gates 1–2, F10.0 §Required remediation — **no document claims them resolved**, verified by grep across F11/F12/HANDOFF/CHANGELOG), and both are **provably absent from the deployed website surface**: zero matches in the allowlisted source docs, zero matches in the built `dist/`, and the search index contains exactly the 38 navigation routes (reproduction log, items 8–10).

### F-B1 · BLOCKER for visibility · Operator-specific isolation identities unremediated (Seed A)

**Confirmed locations (shipping source):** `cli/sessions.ts:41` (`CLIENT_DENYLIST` literal), `cli/context.ts:118` and `cli/episodes.ts:149` (inline regex literals), `cli/isolation.ts` (re-export + comments), `harness/core/trust.sh:17` (`TRUST_DENY` literal), `harness/core/remember.sh`, `harness/core/doctor.sh`, `harness/core/inject-context.sh`, `overlay/codex-harness/hooks/session-context.sh`. **Fixtures:** `cli/context.test.ts`, `cli/episodes.test.ts`, `cli/episode-migration.test.ts`, `cli/daemon-preflight.test.ts`, `cli/isolation.test.ts`, `cli/query.test.ts`, `cli/sessions.test.ts`, `cli/workflows.test.ts`, `cli/workspaces.test.ts`. **Prose:** `CHANGELOG.md` (many), `AGENTS.md:32`, `CLAUDE.md:11`, `docs/GUARDRAILS.md`, several ADRs, and the operator docs of F-B2. Full file list preserved in the reproduction log, item 7.

**Assessment:** the isolation itself is excellent — my adversarial tests (Part 4) confirm literal and symlinked denied paths are rejected at validate, add, session-create, episode-write, and context-write. The defect is purely that the *identities* are client-relationship disclosures and a non-portable OSS default. They would become public the moment visibility flips — including through git history, which retains every past version regardless of what is deleted from the tree now (gate 3's history strategy is the only real cure).

**Directive (per F10.0 remediation 1 — unchanged, do not weaken):** move the deny identities into user-owned local configuration (env/config file outside the tracked tree) with neutral synthetic fixtures in tests; preserve fail-closed behavior, dual literal+realpath resolution, and clean-install default safety (an empty user deny-list must not error). One additional wrinkle found: `website/scripts/verify-build.ts:10` (`FORBIDDEN`) cannot be extended with the client names without itself leaking them into the public tree — the site verifier must load the operator's deny patterns from the same untracked local configuration (present → scan, absent → skip that class only), so the remediation design should account for it.

### F-B2 · BLOCKER for visibility · Operator documents and personal paths tracked at HEAD (Seed B)

**Confirmed tracked at HEAD (26 files):** `docs/AUDIT-FABLE-F6-CORRECTIONS.md`, `docs/AUDIT-FABLE-FASE-D.md`, `docs/AUDIT-GPT-5.6-SOL-F6.md`, `docs/HANDOFF.md`, `docs/HANDOFF-BACK.md`, `docs/HANDOFF-CLAUDE-F6-CORRECTIONS.md`, `docs/KICK-OFF-PROMPT.md`, `docs/KICKOFF-PROMPT.md`, `docs/SPRINT.md`, `docs/SPRINT-DAEMON.md`, `docs/SPRINT-ORCHESTRATION.md`, `docs/SPRINT-TUI.md`, `docs/F6-RETRO.md`, `docs/human-checklist.md`, `docs/devpost-polish-plan.md`, `docs/devpost-submission.md`, `docs/session-log.md`, `docs/tier0-playbook.md`, `docs/ULTRAPLAN*.md` (4), `docs/prompts/CLAUDE-DESIGN-BRIEF.md`, plus `CHANGELOG.md` operator narrative. **Personal absolute paths** (`/home/<operator>/…`): `cli/sessions.test.ts` (8), `CLAUDE.md` (2), `docs/KICKOFF-PROMPT.md` (2), `docs/HANDOFF-CLAUDE-F6-CORRECTIONS.md` (2), `cli/contract.test.ts` (1).

**Real exposure if visibility flipped today:** client relationship names (the material harm — overlaps F-B1), internal model/vendor attributions and audit transcripts naming specific commercial models as maker/checker, personal filesystem paths and machine names, operational cost/benchmark narrative, and hackathon/submission strategy. The two files rendered on the website from `docs/release/` (`open-source-readiness.md`, `devpost-evidence.md`) were read in full: both are scrubbed, category-level, and safe to publish; the remaining 26 are not.

**Directive (per F10.0 remediation 2–3 — unchanged):** move/rewrite the operator set into an untracked private store before any visibility change, neutralize the personal paths in the two test files and `CLAUDE.md` (synthetic `/tmp`-style fixtures), and put the history decision (fresh public repo vs owner-approved rewrite) to the owner explicitly. Deleting files at HEAD is **not** sufficient — history retains them; the squash-merge of PR #1 condenses the branch but does nothing about `main`'s prior history. Note `.github/ISSUE_TEMPLATE/config.yml:7` points contributors at `tree/main/docs`, which currently routes straight into this material — harmless while private, worth remembering in the remediation.

━━━

## Part 3 — Durability and other findings (file even at LOW; inherited by everything built next)

### F-C1 · MEDIUM (durability) · CI scan guards swallow rg runtime errors

**Where:** `.github/workflows/ci.yml:55-58` (zero-hex) and `:60-65` (secret scan), pattern `if rg …; then exit 1; fi`.

**Scenario:** `if` only distinguishes "matched" from "everything else". rg exit 2 (bad glob, unreadable path) and exit 127 (binary absent — the step depends on ripgrep being preinstalled on the runner image, which GitHub can change) are indistinguishable from "no findings": the step goes green having scanned nothing. That is a false-green on the two security-relevant steps, and this workflow is the release gate for all future work on this branch's lineage.

**Directive:** capture the exit code explicitly: run rg, then branch three ways — 0 (match) → fail with the findings; 1 (clean) → pass; anything else → fail the step as "scanner did not run". A one-line `command -v rg` assertion at the top of each scan step is an acceptable minimum.

### F-C2 · MEDIUM (durability) · Secret scan excludes all test files and covers three shapes

**Where:** `.github/workflows/ci.yml:62-63` — `--glob '!**/*.test.ts'`, patterns limited to `sk-…`, `gbrain_…`, `AKIA…`.

**Scenario:** a contributor pastes a real provider key into a test fixture ("it's just a test") — CI passes, the key lands in main and, post-visibility, in public history. GitHub PAT shapes (`ghp_`, `github_pat_`), private-key headers, and generic assignment shapes are also invisible to the scan in *all* files.

**Directive:** scan test files too, allowlisting the specific synthetic fixtures that intentionally look secret-shaped (they exist in the episode/context suites); broaden patterns at least to GitHub token prefixes and `-----BEGIN … PRIVATE KEY-----`. Keep the scan diff-scoped if runtime is a concern.

### F-C3 · MEDIUM · `ebrain remember` is not EBRAIN_HOME-portable (fix alongside F-A1)

**Where:** `harness/core/remember.sh:16` (`MEM="$HOME/eBrain/memory"`), `:19` (sources `$HOME/eBrain/harness/core/trust.sh` — a literal, not `$EBRAIN_HOME`), `:117` (defaults `EBRAIN_HOME` correctly, but lines 16/19 have already used the literal).

**Scenario:** any checkout at a path other than `~/eBrain` (which F-A1's option 1 would forbid but option 2 would allow, and which the installer's own `EBRAIN_HOME` override explicitly supports): `ebrain remember "…"` — step 3 of the README five-minute proof — fails with an unbound `TRUST_DENY` error because the trust policy failed to source (`set -u`), or writes into a surprise `$HOME/eBrain/memory` tree it just created. Fail-closed by accident, but the flagship command is broken for a supported configuration.

**Directive:** derive both the trust-policy source path and the memory root from `$EBRAIN_HOME` (resolved once, near the top, with the same default), not from the `$HOME/eBrain` literal. Note the memory root is also an operator-layout assumption worth folding into the F-B1 configuration work.

### F-C4 · LOW (durability) · Federation isolation asserted publicly, wired by convention

**Where:** `cli/isolation.ts:59-64` — the source itself records that runtime host-boot enforcement of `assertNoClientSources` is pending (task D.5.4) and live isolation rests on default-deny federation plus doctor checks plus the CI test. `SECURITY.md:20-24` asserts the outcome ("keeps designated repositories out of memory and federation entirely") without that qualifier.

**Directive:** either wire the boot-time assertion (small: call `assertNoClientSources` on the federated source set before exposing MCP) or qualify the SECURITY.md sentence. Flagging as durability: a future refactor of source discovery could silently drop the convention layer and no runtime check would notice.

### F-C5 · LOW · CONTRIBUTING dev setup references `ebrain` before it exists

**Where:** `CONTRIBUTING.md:13` — `ebrain doctor` in a setup block whose prior steps never install the launcher. **Directive:** use `bun cli/ebrain doctor` there, or insert the install step.

### F-C6 · LOW (deploy advisory) · Vercel flow constraints — verified properties

For the imminent deploy, verified against the tree: static output only (`astro.config.mjs` `output: "static"`), no adapter, no `vercel.json`, no `@astrojs/vercel` anywhere, `.vercel/` + `website/dist/` + `website/.astro/` gitignored and untracked, **no environment variable or secret read at build or runtime** (only `import.meta.url` file resolution; the single runtime fetch is same-origin `/search-index.json`), no external fonts/analytics/CDN/remote images in `dist/`. Two constraints for the CLI deploy: (1) the build reads `../docs` and `../assets` (outside `website/`), so deploy either Git-connected/CLI-from-repo-root with root directory `website/` and files-outside-root enabled, or prebuild locally and deploy `website/dist` as prebuilt output — a naive `vercel` upload of `website/` alone fails closed (`verify-build.ts` errors on missing pages) rather than deploying a stripped site; (2) ensure Vercel uses the package `build` script (`assets:sync && astro build && verify-build.ts`) — it is the privacy scanner's only execution point in a deploy, and bypassing it with a bare `astro build` build-command override would deploy without the forbidden-pattern check.

### F-C7 · NIT · Evidence narrative omits two red runs

`gh run list` for the branch shows failures `29667610408` (on `bba19f1`) and `29667623783` (on `1d883ea`) between the handoff's cited runs; the handoff names only `29667303912`/`29667418822` as the failures. The underlying defect (stale F11 readiness assertion) *is* disclosed and fixed by `cb04044`, and HEAD `7385e94` has its own green run `29667836664` — so this is a completeness nit in the narrative, not a truthfulness violation. Directive: none required; cite complete run sets in future evidence sections.

━━━

## Part 4 — What was independently verified and held (no finding)

- **F7/F8 merge `c02f7c4` — no remote work lost.** Topology: the only remote-exclusive commit is auto-backup `0dfb230`, whose parent `f9812f6` is also the ancestor of the local F7 line (`4d8a416`, `4e96c37`, `a8beb66`, `c05437b` are all ancestors of the *local* parent). The merge result is tree-identical to the local parent; every file the backup touched was also modified locally (11/11 genuine conflicts, no silently dropped non-conflicting change); result `help.ts` and `confirm.ts` are byte-identical to the backup's versions and result `responsive.ts` is the backup's version plus an additive `input` block. The backup was a stale snapshot of the same WIP the local line committed properly and evolved. The maker's resolution description is accurate in effect.
- **Website privacy boundary.** Render set = `ORDERED_DOCS` ∩ collection (38 routes); non-navigation collection entries are not rendered and not indexed (`[...slug].astro:9`, `search-index.json.ts:15-17`). Built `dist/` scanned: zero hits for client identifiers, `/home/…`, operator names, HANDOFF/SPRINT/AUDIT/KICKOFF references, and token shapes. All 41 unique internal hrefs resolve (no dead `/docs/<private>/` links from the remark rewriter). The allowlist is triple-declared (content glob, navigation, `PUBLIC_FILES`) but cross-tied by tests: `cli/website.test.ts:20-22` forces every navigation id into `docs/PUBLIC-DOCUMENTATION.md`, and `cli/public-docs.test.ts:74-84` forces every local link of every public file into the allowlist. `verify-build.ts` re-scans every built page for forbidden patterns and broken links on every build — a real structural guard, not a convention.
- **F9 episodes/context — adversarial hands-on (isolated `EBRAIN_CONFIG_DIR`, real dispatcher modules):** secret-shaped text rejected (exit 1), denied-client text rejected (exit 1), `legacy-import` rejected on the public grammar (exit 2), store created `0700`/records `0600`, `list` summary-only (no text/path/hash), `get` character-bounded (`--max-chars 10` → 10 chars), widened store dir (755) → fail closed, symlinked store → fail closed, injected malformed record → fail closed, unregistered `--workspace-id` → rejected. `recall` returns bounded excerpt with explainable score only on explicit query. `episode-migration.ts` has no importer outside its own test and no dispatcher/TUI route. `procedures` "use" events cannot carry lifecycle state (`cli/procedures.ts:138` throws), metadata store is strict-`hasOnly`.
- **`ebrain remember` mirror authority.** By code reading (`remember.sh:125-136`): the mirror runs after the durable write has succeeded, failure prints a WARN, and the script exits 0 unconditionally afterward — a failed mirror cannot fail the committed learning, and the mirror result cannot alter the daemon write-through outcome.
- **F8 workspace/session boundary — hands-on with decoy directories** (a scratchpad directory *named* like a denied client, plus a symlink to it; no real client repository was accessed): `workspaces validate --cwd` rejects the literal ("client repository paths are not allowed as workspaces") and the symlink ("workspace resolves into a client repository"); `workspaces add` rejects the symlink; the innocent control directory passes. `newSession` (`cli/sessions.ts:169-191`) revalidates literal + `realpathSync` inside the same call that creates tmux — the residual TOCTOU window requires a same-user local attacker and is out of threat model. Composer: no fs/persistence call of any kind in `tui/src/kit/composer.ts`. Workspace store is strict-parsed with unknown-field rejection; rename is label-only.
- **Truthfulness of README/website claims.** Every README command exists in the dispatcher (including `q|query`, `spend`, `task-profile`, `onboard`, `fleet`, `daemon`, `ui`). No "best model", benchmark-verdict, subscription-cost-as-usage, named-competitor, or live-site claim anywhere in the public set — all "benchmark"/"best" matches are explicit negations of exactly those claims. Supported-agent list identical between `README.md` and `docs/guides/agents.md`. The sanitized TUI SVG on the site contains no path/name/token strings. gbrain attribution verified against ground truth: `vendor/gbrain` origin is `https://github.com/garrytan/gbrain`, checked-out commit equals the CI pin `a25209b…`, upstream `package.json` license is MIT as THIRD_PARTY_NOTICES states. `LICENSE` is the canonical 661-line AGPL-3.0 text; root `package.json` says `AGPL-3.0-only`; `website/` is `"private": true`. No `trustedDependencies` in any package.json (Bun keeps dependency lifecycle scripts off), and CI additionally passes `--ignore-scripts` for the engine install.
- **Release-gate honesty.** The four gates in `docs/release/open-source-readiness.md` are intact and none was flipped; no document in the range self-declares `[AUDIT_PASS]` (all matches are instructions or pre-range F6/FASE-D audits); the handoff and F12 report explicitly state green CI is not a verdict. PR #1 confirmed OPEN and draft via `gh` at audit time. Community templates affirmatively instruct against credentials, private paths, and customer material; blank issues disabled; security routed to private advisories.
- **Note for the merge mechanics:** `cli/release-readiness.test.ts:27-33` pins `docs/HANDOFF-BACK.md` to "Keep the PR as draft"/"Do not merge, deploy". When the owner proceeds on this audit, the handoff and that contract must be updated together (this is the contract doing its job, not a defect). The maker's stated squash strategy is also what keeps the branch's `ckis-backup: auto …` operator commit messages out of main's history — do not fast-forward/no-squash this branch.

━━━

## Reproduction log (all commands run by the checker on this machine)

1. `git rev-parse HEAD` → `7385e94b47962762a1dc8ae4d0fc96ef12d02807`; branch `release/open-source-publication`; `git status --porcelain` → empty (clean; re-verified clean again after all audit activity).
2. `EBRAIN_HOME="$PWD" bun test ./cli/` → **284 pass, 0 fail**, 1675 expect() calls, 33 files. (Maker claimed 1,672 assertions — count drift only, pass/fail identical.)
3. `bun test ./cli/` *without* the override → **284 pass, 0 fail**, 1675 asserts on this machine (the override matters for clean CI checkouts, not here — matches the maker's account of CI defect #1/#2).
4. `bun test ./tui/test/` → **442 pass, 0 fail**, 2710 expect() calls, 36 files. Matches claim.
5. `bun run --cwd website check` → 0 errors, 0 warnings, 0 hints (16 files). Matches claim.
6. `bun run website:build` → **40 pages built**, "website verification passed for 38 documentation pages". Matches claim.
7. `git diff --check origin/main...HEAD` → clean. `rg '#[0-9A-Fa-f]{3,8}' tui/src --glob '!theme.ts'` → no matches (exit 1). `bash -n cli/ebrain` → OK. Client-identifier sweep (`rg -il` across the tree) → 40+ files, none in the publishable set (README/CONTRIBUTING/SECURITY/THIRD_PARTY_NOTICES + all nine allowlisted docs directories → exit 1, zero matches).
8. Personal-path sweep → `cli/sessions.test.ts` (8), `docs/KICKOFF-PROMPT.md` (2), `docs/HANDOFF-CLAUDE-F6-CORRECTIONS.md` (2), `CLAUDE.md` (2), `cli/contract.test.ts` (1); zero in the publishable set.
9. Built-site leak scan: `rg -il '<client-ids>|/home/<operator>|<operator-emails>|HANDOFF|KICKOFF|SPRINT-|AUDIT-|Korvex|sk-ant|ghp_|xoxb|AKIA' website/dist` → exit 1 (zero matches). External URL enumeration of `dist/` → exactly: the repo URL, four `blob/main/*` repo links, X, LinkedIn. No fonts/CDN/analytics hosts.
10. `search-index.json` → 38 entries, hrefs exactly equal to the 38 navigation routes. Internal-href audit → 41 unique internal targets, all resolve to files in `dist/`.
11. `bun install --cwd vendor/gbrain --frozen-lockfile --ignore-scripts` → "Checked 285 installs across 277 packages (no changes)". Matches claim.
12. **F-A1 reproduction:** `env -i HOME=<empty-sandbox> PATH=<bun+system> sh scripts/install.sh --from-source` → `install.sh: --from-source expects an existing checkout at <sandbox>/eBrain`, exit 1.
13. F9 adversarial battery (isolated `EBRAIN_CONFIG_DIR` sandbox) — outcomes as listed in Part 4: secret/client/legacy-import rejections exits 1/1/2; perms 0700/0600; bounded get; widened-dir, symlink-store, malformed-record all fail closed exit 1; unregistered workspace rejected exit 1.
14. F8 decoy battery (scratchpad decoy dir + symlink; real client repos never accessed): literal deny, symlink deny at validate and add; innocent control `ok: true`.
15. Merge forensics: `git log -1 --format=%P c02f7c4`; `git log c02f7c4^1..c02f7c4^2` → only `0dfb230` (auto-backup); `git diff c02f7c4^1 c02f7c4` → **empty**; per-file conflict confirmation and byte-identity diffs as described in Part 4.
16. Remote evidence (read-only `gh`): PR #1 `OPEN`/draft. Runs on the branch: `29667836664` success on `7385e94` (HEAD), `29667750588` success on `cb04044`, `29667623783` failure on `1d883ea`, `29667610408` failure on `bba19f1`, `29667492937` success on `f4e6fe0`.
17. `git -C vendor/gbrain remote get-url origin` → `https://github.com/garrytan/gbrain`; `git -C vendor/gbrain log -1` → `a25209b… v0.42.58.0`; upstream license field `MIT`.

## Maker claims NOT verified (and why)

1. **Interactive tmux smokes** (F8 composer smoke at `80x24`, F8.2 registry smoke, F9.1 context smoke): not reproduced — they require an interactive terminal session; the rendering suites (which I did run) cover the same frames, but the live-tmux keystroke paths rest on maker evidence only.
2. **Daemon write-through behavior of `ebrain remember` under a live daemon** (and the truthful-unavailable warning): not tested — would have required operating against the real daemon and real memory store, which this audit deliberately did not touch. Verified by code reading only (Part 4).
3. **F10.3 browser evidence** (desktop/mobile visual checks of the website): not reproduced; I audited the emitted HTML/CSS/JS content, not rendered visuals.
4. **Failure modes of CI runs `29667303912`/`29667418822`**: conclusions taken from the maker's account; logs not fetched.
5. **F9.3 "the private agent-memory repository remains unread"**: a negative that cannot be proven from the tree; what I verified is that the migration adapter accepts only in-memory synthetic fixtures, has no path/URL/command input surface, and is unreachable from any public command.
6. **Maker-reported intermediate suite counts** for historical phases (F8: 229/425/433; F9.x: 242/264/270/436/441): not re-run at those commits; only the HEAD counts above are mine.

━━━

**Final verdict: the F7–F12 range is structurally sound, honestly gated, and its website surface is leak-free — but the public copy fails its own truthfulness contract in two places (F-A1 broken flagship install sequence, F-A2 nonexistent "configurable" exclusions in the privacy/security docs), and those ship with the imminent merge + deploy. Fix F-A1 and F-A2 in place (plus decide F-A3 deliberately), re-run the doc contracts, and this becomes a pass without re-auditing the runtime work. F-B1/F-B2 remain hard blockers for the separate, later repository-visibility decision, exactly as the candidate's own gates state.**

[AUDIT_FAIL]
