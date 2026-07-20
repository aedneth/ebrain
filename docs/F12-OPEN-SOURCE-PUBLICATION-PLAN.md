# F12 Open-Source Publication Plan

## Objective

Turn the verified local F8--F11 product surface into a maintainable public release candidate:
an outcome-first README, complete static documentation, community metadata, an independently
audited pull request, and an owner-authorized static documentation deployment.

## Inputs and authority

- The owner authorized a GitHub pull request, push, squash merge to `main`, and a new Vercel
  project/deployment connected to this repository.
- `origin/main` and the local F8--F11 line diverged after `f9812f6`. The release branch merges
  the remote F7 dialog change before documentation work. Conflicting implementation files retain
  the later local implementation; the full TUI suite is the behavioral check.
- GitHub repository visibility is intentionally unchanged by this phase. Changing visibility is a
  distinct irreversible action and is not required to deploy the documentation site.

## Deliverables

1. A README that starts with a runnable source proof, explains outcomes and boundaries, and links
   developers to the canonical public documentation tree.
2. Repository community files: Code of Conduct discoverability, issue forms, a pull-request
   template, and CI coverage for documentation-site checks.
3. A static Vercel project rooted at `website/`, with no server adapter, analytics, provider
   calls, or runtime credentials.
4. Updated public claims, release-readiness contracts, CHANGELOG, maker report, and handoff that
   state the deployment truthfully.
5. A draft GitHub PR for reproducible remote CI, independent Opus review of the final branch, an
   authorized squash merge only when both are green, then a production static deployment.

## Non-goals

- No repository visibility change, package publication, version tag, provider credential setup,
  or Devpost form submission.
- No claim that eBrain chooses the best model, reports subscription spend, captures every
  transcript, or embeds a general-purpose shell.
- No deployment before the source-tree, secret-safety, CLI, TUI, and independent-review gates.

## Verification matrix

| Area | Evidence |
| --- | --- |
| Divergent TUI lines | `bun test ./tui/test/` after the merge commit |
| Public docs links and claims | `bun test cli/public-docs.test.ts cli/website.test.ts` |
| Static site | `bun run --cwd website check` and `bun run website:build` |
| Whole product | `bun test ./cli/`, `bun test ./tui/test/`, shell syntax, zero-hex, secret scan |
| Independent gate | Separate Opus report with findings first and an explicit verdict |
| External gate | Green GitHub Actions PR run and a post-deploy production HTTP/build check |

## Release sequence

```text
merge remote line -> documentation/community implementation -> local verification
-> draft PR + CI -> Opus independent audit -> squash merge -> Vercel static deployment
-> post-merge verification -> changelog and handoff
```

The deployment and GitHub actions are authorized, but each is still conditional on the preceding
verification. A passing maker suite never substitutes for the independent checker.
