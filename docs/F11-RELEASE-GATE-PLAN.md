---
type: implementation-plan
project: ebrain
phase: F11 -- gates and release discipline
status: maker-prepared -- independent checker and owner approval pending
created: 2026-07-18
owner: Codex-maker
related: [ULTRAPLAN-WORKSPACES-MEMORY-OSS.md, F10.0-PUBLIC-CLAIM-AUDIT.md, F10.3-WEBSITE-MAKER-REPORT.md]
---

# F11 Release Gate Plan

## Purpose

Turn the completed local F8-F10 maker work into a reproducible, bounded review candidate. F11 does
not publish eBrain, create a Vercel project, modify remote state, declare a release pass, or replace
independent review. Its implementation is the evidence contract and handoff that lets a checker
reproduce the candidate without guessing which claims, boundaries, or commands matter.

## Candidate boundary

The independent review range begins at the first F8 implementation commit and ends at the F11 maker
preparation commit:

```text
6ab8023^..4d7bbe7
```

The automatic local checkpoints inside that range preserve work but do not constitute phase approval.
The checker evaluates the final tree and this range, not a single checkpoint message.

## Required gates

1. **Runtime and persistence:** reproduce the CLI/TUI suites; inspect the F8 prompt editor and
   workspace boundaries, F8.3 proposed-shell non-implementation, and F9 context/episodes/procedures
   privacy and confirmation contracts.
2. **Public surface:** rebuild the static docs from a clean checkout; verify route/source parity,
   local links, local assets, search, desktop/mobile layout, accessibility landmarks, and absence of
   deployment adapter/runtime configuration.
3. **Privacy and claims:** inspect only through source/contracts, never credentials or local data.
   Confirm public navigation excludes historical artifacts, no rendered output contains local paths
   or secret-shaped strings, the claim matrix classifies the site as locally buildable only, and no
   universal model or subscription-usage claim appears.
4. **Distribution:** verify AGPL-3.0-only root metadata and third-party notices; confirm the
   generated Astro cache/output remain untracked.
5. **Release discipline:** checker records a verdict in its own report. Only a passing independent
   review moves the candidate to owner approval; it never authorizes push, visibility, tag/release,
   deployment, or Devpost submission.

## Maker implementation

- `cli/release-readiness.test.ts` keeps the readiness documents, build boundary, ignored generated
  output, and no-deploy configuration explicit.
- `docs/F11-REVIEW-PACKET.md` supplies a clean-checkout command sequence and exact audit questions
  for Opus, with a second Fable/GPT review optional but not substituting for Opus.
- The F10.0 matrix says the Astro website is locally buildable, not publicly available.

## Stop conditions

Stop the release path if any checker discovers a privacy leak, unsupported public claim, non-static
website dependency, history/public-tree issue, weak isolation boundary, license uncertainty, or
failed contract. Fixes restart the relevant maker phase and require a fresh independent review.

## Completion definition

F11 is **not complete** until an independent checker records its own evidence and verdict and Eduardo
explicitly authorizes the specific external actions. The maker can complete only this preparation
slice.

## Maker completion record

The maker preparation slice is complete. The static readiness contract and independent-review packet
exist, and the F10.0 matrix now describes the website accurately as a local build. This does not
advance F11 to a pass: the independent checker and owner-controlled external-action gate are still
pending.
