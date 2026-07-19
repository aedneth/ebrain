# F12 Open-Source Publication Maker Report

## Scope

This report records the maker implementation phase for the owner-authorized publication program.
The branch is published as draft PR #1 for remote CI and future independent review. This is not an
audit verdict, Vercel deployment, squash merge, or repository-visibility change.

## Implemented

- Created `release/open-source-publication` and merged the remote F7 dialog line before making
  release-surface changes. Code conflicts were assessed as an older parallel dialog implementation
  versus the later F8 implementation. The later local implementation was retained because it adds
  the multiline editor, complete responsive input display, explicit workspace selection, and the
  corrected guided-launch affordances; remote non-conflicting changes were merged normally.
- Rewrote the README as a developer-first product document. It starts with a runnable source proof
  and explains the shared daemon, agent adapters, governed memory layers, CKIS relationship,
  workspace/session control plane, user-owned routing, factual token telemetry, security limits,
  documentation navigation, contributing workflow, and roadmap direction.
- Added a README contract to public-doc tests. It guards the outcome-first sections, CI badge,
  CKIS attribution, no-universal-model claim, and token-only telemetry boundary.
- Added GitHub bug and feature forms, a security/documentation contact configuration, and a PR
  template that preserves source, privacy, verification, and independent-review expectations.
- Added a Vercel local-state ignore rule. It prevents project identifiers and local linkage state
  from becoming repository content.
- Expanded CI with the private static-site dependency install, Astro type check, and static build.
  The site remains adapter-free and does not use provider calls or runtime credentials.
- Corrected task-profile rule discovery after the draft CI reproduced a clean-checkout failure:
  source execution now resolves the bundled `config/task-profile-rules.yaml` beside the CLI source
  when no installed `EBRAIN_HOME` override exists. This makes CI and a nonstandard source checkout
  exercise the same versioned rules.
- Restored the README's exact AGPL short-form wording after the full CLI distribution contract
  caught the otherwise cosmetic phrasing drift.
- Added the F12 plan and release trace in `CHANGELOG.md`.

## Verification

| Check | Result |
| --- | --- |
| Merge integration | `bun test ./tui/test/`: 442 pass, 0 fail, 2,710 assertions |
| Public docs/site/release contracts | `bun test cli/public-docs.test.ts cli/website.test.ts cli/release-readiness.test.ts`: 11 pass, 0 fail, 864 assertions |
| Static site types | `bun run --cwd website check`: 0 errors, 0 warnings, 0 hints |
| Static site build | `bun run website:build`: 40 pages, 38 documentation routes verified |
| Markdown and whitespace | `git diff --check`: clean |
| Website lock reproducibility | `bun install --cwd website --frozen-lockfile`: no changes |

## Draft CI follow-up

The first draft CI run failed in the CLI suite before the TUI or website stages. The concrete
failure was that `task-profile.ts` used a home-directory checkout assumption and could not find the
already versioned rules in a GitHub workspace. The source-root fallback above resolves that issue.
The full suite then exposed a separate exact-license-copy assertion in the rewritten README; the
canonical short-form AGPL wording was restored. A second fresh-run report confirmed those fixes,
then exposed the next missing CI prerequisites: the pinned gbrain clone had no installed modules
for MCP bridge imports and the CLI suite had no checkout-root `EBRAIN_HOME` for adapter fixtures.
CI now installs gbrain's frozen lockfile with scripts disabled and supplies the workspace override.
Final local reproduction after the fixes:

- `bun test ./cli/`: 284 pass, 0 fail, 1,672 assertions;
- `bun test ./tui/test/`: 442 pass, 0 fail, 2,710 assertions;
- `bun run --cwd website check`: 0 errors, 0 warnings, 0 hints; and
- `bun run website:build`: 40 pages and 38 documentation routes verified.

## Deliberate boundaries

- The README describes an installable source checkout and a locally buildable static site. It does
  not invent a public URL before a verified deployment.
- The GitHub repository remains private in this maker phase. Changing visibility is not a side
  effect of the draft PR or static-site work.
- No Vercel configuration or adapter is needed for Astro static output. A project link will create
  ignored local state only; deployment must happen after independent review.
- No installation, source policy, model/provider, or memory semantics changed in this phase.

## Required checker focus

An independent checker must inspect the final branch, not only the old F11 range:

1. Validate every README command/claim against the dispatcher and public docs.
2. Confirm the README has no private paths, secret examples, raw prompt data, or unsupported
   universal-model/subscription-cost claims.
3. Confirm issue/PR templates do not invite sensitive material and the CI website steps are
   reproducible from a clean checkout.
4. Reproduce CLI and TUI suites, Astro check/build, public documentation contracts, shell syntax,
   zero-hex, and secret scan.
5. Examine the merge of `origin/main` for regressions in the responsive-dialog or guided-launch
   behavior. The TUI suite is evidence but not the audit verdict.

The checker must write a separate findings-first report. Only an explicit independent pass can
allow the authorized Vercel/GitHub steps.
