---
type: independent-review-packet
project: ebrain
candidate: 6ab8023^..235412b
status: ready-for-independent-checker -- no verdict recorded
created: 2026-07-18
maker: Codex
required-checker: Opus
optional-second-checker: Fable-or-GPT
---

# F11 Independent Review Packet

## Checker role and boundary

You are the checker, not the maker. Review the final candidate independently and write your own
report. Do not accept the maker's counts or claims without reproducing them. Do not push, deploy,
change repository visibility, tag a release, create a Vercel project, submit Devpost material, or
edit credential files. Do not read dotenv, token, key, account, or customer-project data.

The candidate range is `6ab8023^..235412b`. Review the final tree in a clean checkout or isolated
worktree. Automatic checkpoint commits are provenance only; they are not audit verdicts.

## Reproduction sequence

Run one heavy process at a time:

```bash
bun test ./cli/
bun test ./tui/test/
bun run --cwd website check
bun run website:build
git diff --check 6ab8023^ 235412b
```

For browser QA, start a local static preview only after the build, inspect the home, docs hub, one
detailed guide, and one reference page at `1440x900` and `393x852`, then stop the preview. Verify
the search button, `Ctrl+K`, `Esc`, source navigation, mobile disclosure, visible focus, no page
overflow, local assets, and no console errors. Do not test through a public deployment.

## Required findings checklist

### F8 workspace/session boundary

- Prompt editor preserves exact multiline input until explicit literal send confirmation; no draft is
  persisted to memory, telemetry, or session history.
- Workspace records are validated directory identities, not a command/env/config channel. Existing
  session directories remain immutable.
- F8.3 is still a proposed native-shell boundary only. There is no embedded evaluator, arbitrary
  command channel, shell transcript capture, or memory injection.

### F9 agentic-memory boundary

- Context activation remains human-reviewed and version-safe.
- Episodes are immutable/scrubbed/bounded; passive outputs do not leak body/path/private metadata.
- Procedures and workflows do not execute arbitrary commands, infer success, or choose a provider.
- Fixture-only migration has no public import surface and fails closed on changed or unsafe input.

### F10 docs, claims, and distribution boundary

- Root license is AGPL-3.0-only and third-party notices preserve upstream terms.
- `docs/PUBLIC-DOCUMENTATION.md` remains the public navigation source; historical operator material
  is absent from the public tree and rendered site.
- The website reads allowlisted Markdown directly, has static output, no Vercel adapter/configuration,
  no analytics/external fonts, no copied competitor claims, and no live-site assertion.
- Search index, routes, assets, markdown link rewrite, social destinations, and responsive layout
  match the source contracts.
- Cost copy distinguishes token/provider telemetry from subscription pricing and never chooses a
  universal best model.

### Release gate

- Check that generated `website/.astro/` and `website/dist/` are ignored and untracked.
- Re-read `docs/release/open-source-readiness.md`; its four listed gates must remain unresolved.
- Treat any discrepancy as a finding. A clean local build is not approval for external action.

## Report format

Lead with findings by severity and exact file/line. For each reproduction, list command and result.
State `[AUDIT_PASS]` only if you independently reproduced the full candidate with no blocking
findings. Otherwise state the blocking condition and leave F11 pending. A second Fable/GPT review
may add independent evidence, but it cannot replace Opus as the required maker/checker boundary.

## Owner action after a genuine pass

After an independent pass, ask Eduardo for one explicit approval that names the exact intended
external actions: push, repository visibility, tag/release, website deployment, and/or Devpost
submission. Do not bundle an unrequested action into that approval.
