---
name: remember
description: Persist a durable, high-signal learning to permanent agentic memory (ebrain agent-memory source) so ANY agent — Claude, Codex, Gemini — can recall it in future sessions. Use when you discover something worth keeping across sessions: a fix, a gotcha, a decision, a project fact, a preference, a non-obvious constraint. This is the write side of ebrain's cross-agent memory; the read side is the ebrain query/search MCP tools. Do NOT use it for secrets, for trivia, or inside client repos (it refuses those).
trigger: "remember"
source: harness
---

# remember — write to permanent agentic memory

You (the agent) have a permanent, cross-agent memory served by ebrain. `remember` is how you write to it. What you save becomes searchable by every agent in every future session — this is how the harness beats cross-session amnesia without re-doing archaeology per provider.

> One learning per call. Write the fact, not the whole session (the session log is automatic). High signal only.

## When to call it

Call `remember` the moment you learn something that a future session would waste time re-discovering:

- a **fix** or **gotcha** (root cause + the workaround), a **decision** and its *why*, a **project fact** or constraint not obvious from the code, a **user preference** you were corrected on, a **reference** (URL, path, ticket) worth pinning.

Do **not** call it for: secrets/keys/tokens (it refuses them), one-off trivia, anything already in the repo/CHANGELOG, or work inside a client repo (anything named in your deny policy — it refuses those by trust-policy).

## How to call it

```bash
ebrain remember "<the learning, in one self-contained sentence or short paragraph>"
# optional flags:
ebrain remember --project korvex --tags routing,openrouter "<learning>"
```

- Runs from any directory. It stamps `agent:` (from `$AGENT_NAME`) and `project:` (from the current git repo, or `--project`).
- Write a **self-contained** statement — future-you has no conversation context. Include the *why*, not just the *what*.
- Keep the original language (Spanish or English) — do not translate.
- It writes a typed `agent-learning` page to `~/eBrain/memory/learnings/<project>/`, commits, and syncs to gbrain so it is immediately queryable via the ebrain MCP.

## Guarantees (so you can call it freely)

- **Fail-closed on safety:** refuses in client/deny-policy repos and refuses any text containing an obvious secret. It will never embed a key.
- **Idempotent-ish:** each call is a new page (dedup/curation happens later in the dream cycle). Don't re-save the same fact repeatedly in one session.
- **Human-gated promotion:** learnings live in `agent-memory` (quarantined source). Promotion into the Second Brain / Company Brain vault stays a human decision (weekly review / monthly consolidation) — you never write to the vault directly.
