## Problem and outcome

Describe the developer-facing problem and the smallest change that resolves it.

## Boundaries

- [ ] No credentials, private paths, customer material, runtime stores, or generated artifacts are included.
- [ ] The change does not claim a universally best model, capture raw transcripts, or bypass a confirmation boundary.
- [ ] Documentation and CHANGELOG are updated when the behavior or public contract changed.

## Verification

- [ ] Focused tests added or updated.
- [ ] `bun test ./cli/` passed when shared CLI behavior changed.
- [ ] `bun test ./tui/test/` and zero-hex checks passed when TUI behavior changed.
- [ ] `bun run website:build` passed when public documentation changed.

## Review

- [ ] This PR does not require independent review, or an independent checker has reviewed the high-risk change.
