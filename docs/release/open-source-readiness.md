# Open-Source Readiness

This repository has a public documentation surface and AGPL-3.0-only root metadata, but public
visibility is still a gated operation.

## Completed local readiness work

- claim matrix distinguishing verified, configured, and planned behavior;
- source-first onboarding documentation and sanitized renderer-derived assets;
- a static local documentation website generated from the allowlisted public Markdown tree, with
  local search, responsive navigation, and no deployment adapter;
- root license metadata and third-party attribution boundary;
- CLI/TUI contracts and written review evidence for high-risk memory work.

## Remaining release gates

1. ~~Replace operator-specific source-isolation identities with a portable user configuration while
   preserving fail-closed behavior.~~ **Done** — the deny policy is a user-owned file with an empty
   default and identical fail-closed grammar in both the CLI and the shell harness.
2. Remove historical process artifacts from the public tree, and choose an owner-approved strategy
   for the existing commit history.
3. Run an independent review of the exact release candidate.
4. Obtain explicit approval for repository visibility, tag/release, and any website deploy.

No documentation update, local commit, or website build is permission to skip these gates.
