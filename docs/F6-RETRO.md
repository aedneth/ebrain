# F6 Retro

## What held up

- Contract-first panels prevented the TUI from opening PGLite, routing files, or credentials.
- The user-governed model pivot removed stale recommendations and separated signals, profiles,
  targets and factual telemetry.
- Pure reducers exposed navigation and prompt-flow regressions without a live terminal.
- Temporary tmux fake-agent probes gave useful performance and failure evidence without spend.

## What changed during delivery

- A launch-slice replacement dropped `task` and caused refresh crashes; slice updates now merge.
- The first OpenRouter wizard required a terminal command; profile initialization is now an
  explicit in-TUI confirmation.
- `ebrain q` returned formatted text only; the JSON boundary now supports Memory search.

## Reusable lessons

1. A daily workflow should not require a user to copy an internal setup command into a terminal.
2. A CLI capability becomes a TUI capability only after it exposes a stable, secret-safe contract.
3. Never label a model as objectively best from static rules; preserve user choice and provenance.
4. Temporary drafts and prompts are transient UI data, not memory or telemetry.

## Follow-up

The final GPT-5.6-sol audit must verify the high-risk launch/profile/search paths and the human
checklist must cover real adapter write-back, visual acceptance, and daily-driver friction.
