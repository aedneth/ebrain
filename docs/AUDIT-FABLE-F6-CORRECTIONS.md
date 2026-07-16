# Fable 5 Audit — F6 Corrections (interim slice)

Date: 2026-07-16
Checker: Fable 5 (independent; no product edits)
Maker under review: Claude Code (Opus)
Commits reviewed: `c15c637` (F1), `37dbdcc` (F5), `5f49c76` (F7/F6-CLI), `e90b6b0` (R1 docs), `ee84bf4` (R1 installer/CI/package), on top of baseline `6fac279`.
Scope: **interim** — G56-F1, G56-F5, G56-F7, G56-F6 (CLI-partial: workflows.ts + profiles.ts), G56-R1. This is NOT the final gate.

Verdict: **`[FABLE_AUDIT_PASS]`** for the in-scope slice.
Explicitly **not yet implemented** (pending maker work, not failures of this slice): G56-F2 (Launch intent delivery), G56-F3 (memory search selection), G56-F4 (scrub in TUI `parseSearch`), G56-F8 (static pricing), remaining G56-F6 TUI-visible strings (`cli/task-profile.ts`, `cli/sessions.ts:220`, `cli/targets.ts`, `tui/src/knowledge/run.ts`, `cli/ebrain`), G56-R2 (doc reconciliation + human acceptance).

━━━

## Per-item verdicts (independent evidence)

### G56-F1 — workflow symlink isolation — PASS

Code inspection (`cli/workflows.ts`):
- Textual root deny before FS touch: `discoverMarkdown` line 260; canonical root deny fail-closed: lines 263–264 (`canonicalPath` = `realpathSync`, lines 213–220).
- Symlinked directories are never traversed; a symlinked entry is accepted only as a resolved real FILE that stays inside the canonical root and passes the allow-list: lines 281–287. Regular files are re-canonicalized and containment-checked: lines 292–297 (`isInsideRoot`, lines 223–227).
- `ingestWorkflows` canonicalizes each root and skips denied textual/canonical roots: lines 391–397.
- Canonical `source_path` persisted: line 324. Store-load and skillify re-validate via `sourcePathDenied` (textual OR realpath denied, lines 234–238): `loadWorkflows` line 358, `findWorkflow` line 442, `skillifyWorkflow` line 547.

Reproduction (my own throwaway fixtures under `mktemp -d`; a harmless dir NAMED `brisas-del-golfo`; no real client repo touched):
- Safe root containing (a) a file symlink resolving into the denied dir, (b) a directory symlink into it, (c) a symlink escaping the root to an innocent outside file → ingest returned `ingested:1`, only the legit in-root file (`local-probe-legit`). All three symlinks rejected.
- Root that is itself a symlink into the denied dir → `ingested:0`; `discoverMarkdown` → 0.
- Hand-crafted store record whose innocent textual `source_path` realpath-resolves into the denied dir → `skillify --yes` returned `ok:false` (`not-found`) and **no SKILL.md was written**. Same for a direct textual client path.

Tests: `bun test ./cli/workflows.test.ts` → **13 pass / 0 fail**, including 4 named F1 symlink regressions (`cli/workflows.test.ts:194,211,231,252`).

### G56-F5 — typed `ebrain q` adapter + id/name/path isolation — PASS

Code inspection (`cli/query.ts`):
- Consumes structured MCP `sources_list` then `query` with `source_id` per source (`DEFAULT_DEPS`, lines 99–107); no shell/awk/jq parsing remains. `scripts/ebrain-q` is now a thin `exec bun run cli/query.ts` entrypoint (`bash -n` clean).
- Reads `local_path` (the real gbrain field) and carries it as `path` for the deny filter: lines 55–61. Every source filtered through `isClientSourceRecord` (id + name + path, case-insensitive; `cli/isolation.ts`), plus `default` excluded and `federated===true` required: lines 51–61.
- Contract `{schema_version:1, query, results, partial, failures}` with loud all-failure throw (lines 133–135), never a silent empty result; failure messages pass `redactSecrets`; slugs/snippets pass `scrubSecrets` (lines 79–80).

Engine cross-check against the pinned gbrain (`a25209b`, matches vendored HEAD):
- `vendor/gbrain/src/core/sources-ops.ts` exposes `local_path` + `federated` on source rows (lines 88, 112–124) — the maker's `local_path` fix is correct; the WIP's `path` read would have silently disabled path-based deny.
- `vendor/gbrain/src/core/operations.ts` `query` accepts `source_id` (~line 1535).
- Result row fields `slug`/`score`/`chunk_text` match the engine (e.g. `vendor/gbrain/src/core/search/hybrid.ts:1830`).

Isolation probe (mine): payload with `BRISAS-DEL-GOLFO` (uppercase id), name `"Dekko Site"`, innocent id with `local_path` under `.../brisas-del-golfo/...`, `default`, and a non-federated source → `parseFederatedSources` kept only `["good"]`. The original audit's uppercase-survivor reproduction is closed.

Tests: `bun test ./cli/query.test.ts ./cli/isolation.test.ts ./cli/contract.test.ts` → **80 pass / 0 fail**. Coverage includes: positive merge/score-order/dedup, empty-eligible throw, malformed `sources_list`, malformed rows, partial failure metadata, all-failure loud throw, case/name/path deny, snippet scrub, hermetic executable wrapper smoke, and the `q --json` zod schema in the contract suite (`cli/contract.test.ts:361–398`).

### G56-F7 — profile provenance parser invariants — PASS

Code inspection (`cli/profiles.ts`): invariants live in `parseProfileStore` itself, not only in mutation helpers — trimmed non-empty `evidence.source` (`parseEvidence`, lines 63–66), trimmed non-empty catalog `source` + strict ISO-8601 UTC `as_of` (`ISO_UTC` regex, trailing `Z` only, + `Date.parse` finite; lines 55–57, 101–107), duplicate catalog ids rejected (lines 109–112), profile models must exist in catalog (line 121).

Reproduction (mine, via `parseProfileStore` directly):
- The audit's combined fixture (empty profile provenance + empty catalog provenance + duplicate catalog id) → rejected.
- Duplicate-catalog-only → rejected (`duplicate catalog id: m1`). Offset timestamp `+00:00` → rejected (strict UTC `Z`). Whitespace-only source → rejected. A well-formed store → accepted.

Tests: `bun test ./cli/profiles.test.ts` → **9 pass / 0 fail**.

### G56-F6 (partial) — English CLI strings in workflows.ts + profiles.ts — PASS (for these two files)

Scanned every `die()`/`throw new Error()`/`console.error|log` site in `cli/workflows.ts` and `cli/profiles.ts`: all user-visible messages are English; no Spanish user-visible string found (internal Spanish comments remain, which is allowed). The other F6 surfaces cited by GPT-5.6-sol are still Spanish (e.g. `cli/sessions.ts:220` deny-client message) — expected, declared pending.

### G56-R1 — installer, CI, package metadata, public README/docs — PASS (with observations)

`scripts/install.sh` (123 lines): `bash -n` + `sh -n` both clean.
- Idempotent by construction: re-run updates the checkout, re-pins gbrain, always rewrites the launcher.
- No secret values printed; no foreign dotenv sourced; no agent-CLI installs; no provider calls. Bun bootstrap (`curl bun.sh/install`) only when missing, per spec.
- gbrain pin `a25209bbb2bacf1b88e06fd5282b27f1bf4a3e7a` matches the vendored checkout HEAD (verified with `git -C vendor/gbrain rev-parse HEAD`) and the documented pin (`docs/SPRINT.md:26`, v0.42.58.0).
- Test overrides documented and opt-in: `EBRAIN_HOME/REPO/REF`, `GBRAIN_REPO/REF`, `EBRAIN_BIN_DIR`, `EBRAIN_SKIP_GBRAIN=1`, `EBRAIN_SKIP_UP=1`; production default still runs `ebrain up` (line 111–116).
- `bun test ./cli/install.test.ts` → **2 pass / 0 fail** (hermetic isolated-HOME double-install; but see F-CF-1).

`.github/workflows/ci.yml`: no credentials, no provider calls (comment at line 9 is accurate); pins the same gbrain SHA (line 24); runs CLI + TUI suites, shell syntax loop over `scripts/install.sh ebrain-q ebrain-up ebrain-daemon cli/ebrain` (all five exist), zero-hex rule, and a secret scan (`sk-`/`gbrain_`/`AKIA` shapes, vendor + tests excluded).

`package.json`: `name:ebrain`, `version:0.1.0`, MIT, `type:module`, `bin.ebrain → cli/ebrain`, `engines.bun >=1.3.0`, focused `test`/`test:cli`/`test:tui`/`doctor` scripts, `zod ^4.4.3` preserved. `bun install --frozen-lockfile` → **"no changes"**.

`README.md` as a public landing page: English, outcome-first (problem → what it does → quickstart). **No competitor is named** (scanned for the usual multi-agent-terminal names: none). It explicitly disclaims a universal "best model" (line 36: "eBrain never invents a 'best model' for you") and disclaims subscription measurement (line 112: "never an invented number and never a subscription estimate"). Documents install (`curl | sh`), `ebrain up`, quickstart commands, security/privacy section, supported agents, license. Every internal link target exists and is git-tracked: `LICENSE` (MIT © 2026 Eduardo Borjas), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `AGENTS.md` (canonical `ebrain-norms` rendered block), `docs/ROADMAP.md`, `docs/GUARDRAILS.md`. `docs/devpost-submission.md` also clean on competitor/best-model/subscription scan.

Maker commit hygiene: all five commits are surgical (verified `git show --stat`); no `.brain/`, `.claude/`, backups or secrets committed; `git diff --check 6fac279..HEAD` clean; worktree clean at audit time.

━━━

## Full suites and scans (this machine, 2026-07-16)

- `bun test ./cli/` → **205 pass / 0 fail** (572 expect, 22 files). Note: CHANGELOG's "203" predates `ee84bf4`, which added the 2 installer tests.
- `bun test ./tui/test/` → **381 pass / 0 fail** (1579 expect, 34 files).
- Zero-hex: `rg -n '#[0-9A-Fa-f]{3,8}' tui/src --glob '!theme.ts'` → no matches; same for `tui/test --glob '!theme.test.ts'` → no matches.
- `git diff --check 6fac279..HEAD` → clean.

## Non-paid smokes

- `ebrain daemon status` → **DOWN** at audit time, so no live `ebrain q` smoke was run (also a known state: OpenAI embedding credits exhausted → QMD-only fallback; a hang/empty semantic result would not be a new failure).
- `ebrain doctor --json` → rc 0, **27 ok / 4 warn / 0 fail**. The 2 warns beyond the audited baseline (`daemon:status`, `sources:isolation`) trace to the daemon being down right now, not to maker changes; `adapter:gemini` and `spend:gbrain-gap` are the pre-existing baseline warns.

━━━

## New findings

### F-CF-1 — LOW — installer test can flake at the default timeout on cold cache

`cli/install.test.ts:48` declares no per-test timeout. On my first (cold-cache) run on this Celeron, the double-install test timed out at the default 5000ms (`5011.67ms`, **1 pass / 1 fail**); an immediate warm rerun passed in 738ms, and the full `bun test ./cli/` run also passed. The test shells out to git (init/clone/fetch) and the installer twice; on a slow or cold CI runner the same flake can surface. Concrete scenario: first CI run on a cold runner marks the release pipeline red with no product defect. Suggested (maker, not applied by checker): pass an explicit generous timeout to the `test(...)` declaration.

### F-CF-2 — LOW — README internally inconsistent after the installer landed (belongs to pending R2)

`README.md:162` still shows the roadmap item "[ ] One-command installer + CI release pipeline" unchecked, while the same file's Quickstart (line 50) advertises the `curl | sh` installer that commit `ee84bf4` shipped along with CI. Also `CHANGELOG.md`'s 2026-07-16 entry claims CLI "203 pass" where the post-`ee84bf4` reality is 205. Doc drift only — reconcile under the already-pending G56-R2 pass.

### Observations (not failures)

- `README.md:123` claims secrets are "redacted before any snippet is stored or rendered". Formally, G56-F4 (scrub inside TUI `parseSearch`, `tui/src/knowledge/contracts.ts:40`) is still open. The claim holds at runtime today only because the TUI's memory search consumes `ebrain q --json` (`tui/src/knowledge/run.ts:132`) and the new adapter scrubs slugs/snippets at the CLI boundary (`cli/query.ts:79-80`). Closing F4 makes the claim robust rather than incidentally true.
- `AGENTS.md` is the canonical Spanish `ebrain-norms` rendered block and references the owner's personal setup (client repo names, 4 GB RAM norm). The maker followed the handoff spec exactly (`ebrain norms render`, no manual edits), and the client repo names were already public in `cli/sessions.ts`'s `CLIENT_DENYLIST`, so there is no new exposure — but an English public-contributor rendering is worth considering during R2.

━━━

## Gate posture

This report accepts only the interim slice (F1, F5, F7, F6-CLI-partial, R1). F2/F3/F4/F8, the remaining F6 TUI surfaces, and R2 reconciliation + human acceptance remain open; F6.6.7 / F6.7.6 stay at pending/re-audit. Final acceptance still requires the GPT-5.6-sol re-audit after the maker closes the remaining findings. Checker made no product edits; the only file written is this report.
