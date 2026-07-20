---
type: handoff-back
project: ebrain
from: Opus (audit remediation maker)
to: Codex-maker, and the next independent checker
created: 2026-07-18
updated: 2026-07-19
status: two independent audits done (both FAIL); all blocking findings remediated; third pass required
branch: release/open-source-publication
pull-request: https://github.com/aedneth/ebrain/pull/1
head: verify with git rev-parse HEAD before any work
external-actions-completed: branch push and draft PR only
external-actions-pending: third audit pass, squash merge, Vercel deployment, any visibility decision
---

# eBrain Handoff Back -- F12 Publication Candidate

> ## ⚠ STATE AS OF 2026-07-19 -- read this before anything below
>
> The F7-F12 range finally received its independent audit. It ran **twice**, and both passes
> returned `[AUDIT_FAIL]`. All blocking findings from both passes have been remediated by a maker
> other than Codex. **The remediation itself has not been independently checked.**
>
> | Artifact | What it is |
> | --- | --- |
> | `docs/AUDIT-F7-F12-INDEPENDENT.md` | Pass 1, full range. Found the published quickstart broken and privacy/security copy promising configuration that did not exist. |
> | `docs/AUDIT-F7-F12-REAUDIT.md` | Pass 2, remediation delta. Confirmed pass-1 findings closed; found a fail-open regression inside the new deny policy. |
> | `docs/MAKER-REPORT-AUDIT-REMEDIATION.md` | **Start here.** What was found, what was fixed, what is deliberately still open, and what must not be changed. |
>
> **Next required action:** a third independent pass over the F-R remediation delta. Do not merge,
> deploy, tag, or change repository visibility before it. The sections below describe the F12
> candidate as it stood *before* the audits and remain accurate for that scope only.
>
> **Two things a new maker gets wrong here:** (1) the deny policy is now user-owned local
> configuration with an **empty** shipped default -- never re-introduce a compiled-in list, and never
> make an isolation guard more permissive without its own audit; (2) the `ckis-backup` bot
> auto-commits *and pushes* every ~15 minutes, so several commits on this branch are checkpoints of
> work-in-progress -- judge the tree, not the commit boundaries, and never force-push to tidy them
> while PR #1 is open.

## Current state

The release candidate is published as draft PR #1 from `release/open-source-publication`. GitHub Actions run `29667750588` passed from a clean checkout after the F12 readiness-contract correction. The branch integrates the remote F7 dialog line with the local F8--F11 product work, completes F12 public documentation/community/CI work, and fixes the CI-only defects exposed by the draft.

The gate is not complete. An Opus audit attempt did not produce a report; later Opus and Fable attempts were rejected by the local account's weekly limit. There is no independent verdict. Keep the PR as draft. Do not merge, deploy, change repository visibility, tag, publish, or submit externally until a distinct checker completes the review.

## What changed

### Release integration

- Created `release/open-source-publication` from the local F8--F11 line and merged the parallel remote F7 dialog commit.
- Conflicting dialog files retained the later implementation: responsive input rendering, multiline composer, workspace picker, truthful singleton guided-launch fields, and compact-safe modal behavior. Non-conflicting remote work merged normally.
- The complete TUI suite passed after integration, including responsive dialog, launch, workspace, multiline composer, and real tmux fake-agent coverage.

### Public product documentation

- Rewrote `README.md` as an outcome-first developer guide: source proof, capability map, shared-daemon architecture, governed compound context, CKIS relationship, workspace/session flow, user-owned routing, factual token telemetry, security boundaries, documentation map, contribution workflow, roadmap, acknowledgements, and AGPL license.
- Kept the native wordmark and sanitized renderer-derived TUI SVG as visual evidence. Public documentation contracts continue to reject private paths, token-shaped examples, historical-operator navigation, terminal control sequences, and public language drift.
- Added a README regression contract for the core sections, CI badge, CKIS attribution, no-universal-model claim, and token-only usage boundary.

### Community and CI

- Added bug and feature issue forms, security/documentation contact links, and a PR template that requires privacy, boundary, test, documentation, and independent-review checks.
- Added `.vercel/` to ignored local state. No Vercel project, configuration, adapter, or deployment was created.
- CI now installs root, pinned engine, and website dependencies from frozen lockfiles; engine package scripts are disabled. It runs CLI with the repository checkout as `EBRAIN_HOME`, then TUI, Astro check/build, shell syntax, zero-hex, and secret scan.

### CI defects found and closed

1. Fresh CI could not load task-profile rules because source execution defaulted to a home-directory checkout. `cli/task-profile.ts` now resolves its bundled source root when no installed override is present.
2. The original CI cloned the pinned engine but did not install its modules, while CLI MCP bridge imports depend on them. CI now installs that lockfile with scripts disabled and passes checkout-root `EBRAIN_HOME` to the CLI suite.
3. The README rewrite drifted from the exact AGPL short form asserted by the root license contract. The canonical wording is restored.
4. The F11 readiness test incorrectly required its historical review-candidate identifier inside the live F12 handoff. The contract now verifies the live independent-audit and no-merge/no-deploy gates instead.

## Commits and remote state

- `c02f7c4 merge: integrate remote TUI dialog updates`
- `a040592 docs: prepare open-source publication surface`
- `68e4b12 ckis-backup: auto ...` automatic checkpoint that captured the task-profile source-root fix during verification; it belongs to the candidate and squash will condense it.
- `1b674c0 fix(ci): resolve source task-profile rules`
- `f4e6fe0 ci: provision pinned engine for CLI tests`

PR: `https://github.com/aedneth/ebrain/pull/1` (draft). The repository remains private. No merge, deletion, release, visibility change, Vercel project, deployment, or Devpost action occurred.

## Verification evidence

Latest local reproduction after CI fixes:

- `EBRAIN_HOME="$PWD" bun test ./cli/`: `284 pass`, `0 fail`, `1,672 assertions`.
- `bun test ./tui/test/`: `442 pass`, `0 fail`, `2,710 assertions`.
- `bun run --cwd website check`: `0 errors`, `0 warnings`, `0 hints`.
- `bun run website:build`: `40` static pages and `38` documentation routes verified.
- `bun install --cwd vendor/gbrain --frozen-lockfile --ignore-scripts`: clean.
- `git diff --check`, shell syntax, TUI zero-hex scan, and repository secret scan: clean.

Remote evidence:

- GitHub Actions run `29667492937`: success. It completed checkout, pinned engine clone/install, root and website dependency installs, CLI suite, TUI suite, Astro check/build, shell syntax, zero-hex, and secret scan.
- GitHub Actions run `29667750588`: success on `cb04044`. It repeated the full clean-checkout matrix after the live-handoff readiness-contract correction.
- Earlier runs `29667303912` and `29667418822` failed. Their concrete modes are documented above and in the F12 maker report; do not cite them as final status.

## Required checker audit

Audit the exact current branch against `origin/main`. Do not reuse maker counts as a verdict. Do not edit, push, deploy, inspect dotenv/credential files, or access customer repositories.

1. Read `docs/F12-OPEN-SOURCE-PUBLICATION-PLAN.md`, `docs/F12-OPEN-SOURCE-PUBLICATION-MAKER-REPORT.md`, `README.md`, public-doc contracts, CI workflow, and TUI dialog/launch merge surfaces.
2. Reproduce:

```bash
EBRAIN_HOME="$PWD" bun test ./cli/
bun test ./tui/test/
bun run --cwd website check
bun run website:build
git diff --check origin/main...HEAD
```

3. Confirm README commands/claims match `cli/ebrain` and public docs, especially CKIS separation, governed memory boundaries, workspace/session behavior, user-owned routing, token-only telemetry, AGPL attribution, and no deployment/visibility overclaim.
4. Inspect CI pinned-engine installation for reproducibility and confirm scripts remain disabled. Check issue and PR templates for privacy-safe contributor guidance.
5. Audit the F7/F8 merge for responsive dialog, guided launch, workspace, and multiline editor regressions beyond test coverage.
6. Write a standalone findings-first report. End `[AUDIT_PASS]` only if no blocking finding remains; otherwise end `[AUDIT_FAIL]`.

## Pending actions

1. Obtain an independent Opus or Fable audit after the account limit resets, or use a separate checker account.
2. If the audit passes and PR #1 remains green, mark it ready and squash merge with branch deletion.
3. After merge, configure a static Vercel project rooted at `website/`, connect it to the GitHub repository, deploy production from `main`, and verify live root/docs/search paths. Update public docs only with the verified URL.
4. Keep repository visibility unchanged unless Eduardo makes that separate irreversible decision after reviewing the public-history/privacy gate.

## Durable learnings

- Source-root defaults must not assume a developer home checkout; CI must exercise the same bundled configuration received by a source user.
- Cloning a pinned upstream engine is insufficient when direct test imports require its modules; frozen dependency installation belongs in CI and must disable package scripts.
- Green CI is reproducibility evidence, not a replacement for maker/checker separation.
- The F12 CI learning was recorded with `ebrain remember` and mirrored locally as a bounded episode. The command reported the known daemon write-through warning, so do not claim it is immediately searchable across agents until the daemon path is independently checked.
