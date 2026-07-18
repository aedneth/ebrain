---
type: maker-report
project: ebrain
phase: F11 -- gates and release discipline
status: maker-prepared -- independent checker and owner approval pending
created: 2026-07-18
owner: Codex-maker
related: [F11-RELEASE-GATE-PLAN.md, F11-REVIEW-PACKET.md, F10.0-PUBLIC-CLAIM-AUDIT.md]
---

# F11 Release Gate -- Maker Preparation Report

## What the maker completed

- Prepared a reproducible independent-review candidate for the full F8-F11 maker range
  `6ab8023^..4d7bbe7`.
- Added a focused release-readiness contract that keeps generated website state untracked, requires
  static Astro output, rejects a Vercel adapter/configuration, and proves the public claim is only
  local buildability.
- Updated the F10.0 claim matrix so it no longer describes F10.3 as planned. It now distinguishes a
  locally buildable static site from a live public service.
- Wrote the Opus review packet with mandatory runtime, memory, public-docs, distribution, and visual
  checks. It names Fable/GPT as optional second evidence, never a substitute for maker/checker
  separation.
- Preserved the four unresolved release gates: portable isolation policy, history/public-tree
  remediation, independent review, and explicit owner approval for every external action.

## What the maker did not do

No independent audit verdict, push, repository visibility change, tag/release, Vercel project,
deployment, Devpost submission, credential inspection, or public publication occurred. This report
does not convert local tests into `[AUDIT_PASS]`.

## Verification performed by maker

| Check | Result |
| --- | --- |
| `bun test cli/release-readiness.test.ts` | `3/0`, 21 assertions |
| `bun run --cwd website check` | 0 errors, 0 warnings, 0 hints |
| `bun run website:build` | 40 static pages; verifier passed 38 documentation routes |
| `bun test ./cli/` | `283/0`, 1,581 assertions |
| `bun test ./tui/test/` | `442/0`, 2,710 assertions |

The F10.3 report also records local browser evidence at desktop and mobile sizes. These maker
results are reproducibility inputs for the checker, not independent approval.

## Required next action

Opus must independently reproduce the packet and write a separate report. A pass then requires
Eduardo's explicit, action-by-action approval before any external operation. A finding returns work
to the relevant maker phase and requires a new review.
