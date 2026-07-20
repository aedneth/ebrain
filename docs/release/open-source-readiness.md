# Open-Source Readiness

This repository has a public documentation surface and AGPL-3.0-only root metadata, but public
visibility is still a gated operation.

## Completed local readiness work

- claim matrix distinguishing verified, configured, and planned behavior;
- source-first onboarding documentation and sanitized renderer-derived assets;
- a static local documentation website generated from the allowlisted public Markdown tree, with
  local search, responsive navigation, and no deployment adapter;
- root license metadata and third-party attribution boundary;
- CLI/TUI contracts and maker reports for high-risk memory work.

## Remaining release gates

1. Replace operator-specific source-isolation identities with a portable user configuration while
   preserving fail-closed behavior.
2. Remove or rewrite historical operator artifacts from the public candidate tree and choose an
   owner-approved strategy for existing history.
3. Run an independent review of F8/F9 persistence, F10 license/public docs, and the exact release
   candidate.
4. Obtain explicit approval for push, repository visibility, tag/release, and any website deploy.

No documentation update, local commit, or website build is permission to skip these gates.
