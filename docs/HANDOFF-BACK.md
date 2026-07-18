---
type: handoff-back
project: ebrain
from: Codex-maker
to: Opus-independent-checker and optional Fable/GPT second checker
created: 2026-07-18
status: F10.3 maker-complete; F11 maker-prepared; independent verdict and owner approval pending
branch: main
review-candidate: 6ab8023^..4d7bbe7
external-actions: prohibited pending explicit owner approval
---

# eBrain Handoff Back -- F10.3 Website and F11 Release Gate

## Current state

All maker work planned through F10.3 is complete locally. The public documentation website is a
static Astro package derived from the allowlisted Markdown tree; it is not deployed. F11 now has a
reproducible independent-review packet and static readiness contract, but F11 itself cannot pass
until Opus writes an independent audit verdict. No push, repository-visibility change, tag/release,
website deploy, Vercel project, or Devpost submission occurred.

The exact review candidate is `6ab8023^..4d7bbe7`. Start with
[`F11-REVIEW-PACKET.md`](F11-REVIEW-PACKET.md); it is the authoritative checker procedure.

## What was built

### F10.3 static documentation website

- Added an isolated private `website/` package using Astro static output. It reads only the public
  Markdown allowlist directly; it does not copy docs into a second source tree.
- Built a documentation-first home, four workflow paths, desktop sidebar/article/on-page-index
  reading flow, mobile disclosure navigation, previous/next links, static local search, local
  icons, and supplied GitHub/X/LinkedIn destinations.
- Expanded public documentation for onboarding, manual/guided launch, sessions, context packs,
  episodes, procedures/workflows, task signals, profiles/targets, TUI, diagnostics, memory,
  workspace/session, and routing/cost commands.
- Added route/source parity, public-link, local-asset, static-only, output-safety, and no-deploy
  contracts. Generated `website/.astro/` and `website/dist/` are ignored; previously tracked Astro
  cache files were removed from the candidate.
- Fixed a mobile SVG regression: `.terminal-figure img` now uses `height: auto`, preserving the
  renderer-derived TUI image aspect ratio at narrow widths.

Primary records: [`F10.3-WEBSITE-PLAN.md`](F10.3-WEBSITE-PLAN.md) and
[`F10.3-WEBSITE-MAKER-REPORT.md`](F10.3-WEBSITE-MAKER-REPORT.md).

### F11 release-gate preparation

- Added [`F11-RELEASE-GATE-PLAN.md`](F11-RELEASE-GATE-PLAN.md),
  [`F11-REVIEW-PACKET.md`](F11-REVIEW-PACKET.md), and
  [`F11-RELEASE-GATE-MAKER-REPORT.md`](F11-RELEASE-GATE-MAKER-REPORT.md).
- Added `cli/release-readiness.test.ts`, which asserts independent review/owner approval language,
  static docs configuration, ignored generated state, absent Vercel configuration, and the accurate
  “locally buildable, not deployed” public claim.
- Corrected the F10.0 claim matrix: the site is verified as locally buildable only. It must not be
  described as a live public website.

## Decisions and rationale

- **Markdown is canonical:** docs source stays in the existing public allowlist; the website adds
  navigation and presentation only. This prevents README/site/docs drift and excludes historical
  operator records from public navigation.
- **Static, no deployment configuration:** Astro builds static output with no adapter, service,
  analytics, external font, or runtime. This makes local verification possible without turning a
  build into an external action.
- **Herdr reference boundary:** only developer-doc interaction patterns were studied. No competitor
  copy, identity, screenshots, claims, or installation instructions were reused.
- **Release authority remains human:** a clean build and maker tests never authorize external
  operations. Opus is the required checker; Fable/GPT can add evidence but cannot replace that role.

## Commits

- `457ceb4` and `86888b2`: automatic local checkpoints that captured F10.3 source work. They are
  provenance only, not phase verdicts.
- `235412b docs: complete static documentation website`: explicit F10.3 phase closure. It is empty
  because the automatic checkpoint had already captured the final staged files.
- `4d7bbe7 docs: prepare independent release gate`: F11 maker preparation.

No commits were pushed.

## Verification evidence

Final F10.3 verification:

- `bun test cli/public-docs.test.ts cli/website.test.ts`: `7/0`, 755 assertions.
- `bun run --cwd website check`: 0 errors, 0 warnings, 0 hints.
- `bun run website:build`: 40 static pages, output verifier passed 38 documentation routes.
- `bun test ./cli/`: `280/0`, 1,563 assertions.
- `bun test ./tui/test/`: `442/0`, 2,710 assertions.
- Local production browser QA at `1440x900` and `393x852`: home, docs hub, detailed guide,
  navigation, local search button, `Ctrl+K`, `Esc`, mobile disclosure, tooltips, focus, assets, and
  page-width checks passed with no browser console/page errors. Preview and browser were stopped.

Final F11 maker-preparation verification:

- `bun test cli/release-readiness.test.ts`: `3/0`, 21 assertions.
- `bun run --cwd website check`: 0 errors, 0 warnings, 0 hints.
- `bun run website:build`: 40 static pages, verifier passed 38 documentation routes.
- `bun test ./cli/`: `283/0`, 1,581 assertions.
- `bun test ./tui/test/`: `442/0`, 2,710 assertions.
- `git diff --check` and staged diff checks passed before the F11 commit. New-line secret/path scans
  found no token-shaped values, private paths, or historical-navigation patterns.

## Durable learnings and environment notes

- Recorded the responsive SVG rule and the release-authority rule with `ebrain remember`.
- Both writes created local learnings and episode mirrors, but the command emitted the known MCP
  write-through warning. Do not claim those new learnings are immediately cross-agent searchable
  until the daemon path is independently verified.
- Current Bun invocation form is `bun run --cwd website <script>`; do not use the incompatible
  `bun --cwd website run <script>` order in this environment.
- Immediately after changing Markdown, Astro can emit a transient glob-loader duplicate-ID warning
  from stale generated content. A subsequent `bun run --cwd website check` followed by a rebuild
  produced a clean final check/build. Treat a recurrence from a clean checkout as a checker finding,
  not as an accepted warning.
- Git commit hooks warned that `.npmrc` is absent. Do not create or inspect credential configuration
  as part of this documentation/release-gate work.

## Required Opus audit

Follow [`F11-REVIEW-PACKET.md`](F11-REVIEW-PACKET.md) exactly. At minimum, independently reproduce:

```bash
bun test ./cli/
bun test ./tui/test/
bun run --cwd website check
bun run website:build
git diff --check 6ab8023^ 4d7bbe7
```

Audit F8 prompt/workspace boundaries; F8.3’s deliberate non-implementation; F9 context, episode,
procedure, and fixture-only migration boundaries; F10 licensing/public docs/privacy; the static
site’s route/source parity and responsive behavior; and F11’s no-deploy/owner-approval contract.
Write a separate report with findings first and record `[AUDIT_PASS]` only after independent
reproduction. Fable/GPT may then provide a second independent gate report.

## Remaining blockers and next action

1. Independent Opus audit for `6ab8023^..4d7bbe7`.
2. Optional Fable/GPT second review after Opus, not instead of it.
3. Resolve the F10.0 public-release blockers: portable source-isolation policy and an
   owner-approved history/public-tree remediation strategy.
4. Only after a genuine independent pass, ask Eduardo for explicit, separately named approval for
   any push, visibility change, tag/release, website deployment, or Devpost submission.

F11 remains pending. There is no maker audit pass.
