---
title: Per-prompt context command
---

# The context command

eBrain's promise is that relevant memory reaches the agent on every prompt, because agents almost never ask for it. The
agent's own prompt hook does the delivery; the retrieval itself is a command you configure. This page is the contract
between the two.

## How an agent reaches it

| Agent | Hook | Delivered as |
| --- | --- | --- |
| Codex | `UserPromptSubmit` in `~/.codex/hooks.json` | `hookSpecificOutput.additionalContext` |
| Antigravity | `PreInvocation` in `~/.gemini/config/hooks.json`, first model call of each request only | `injectSteps[].ephemeralMessage` |
| Hermes | memory provider `ebrain`, `prefetch()` before each turn | plain text |

`ebrain harness install <agent>` writes these. All three call `harness/core/prompt-context.sh`, which calls
`cli/agent-hooks.ts context <agent>`.

## Configuring the command

The command is `EBRAIN_CONTEXT_CMD`, or the first non-comment line of `$XDG_CONFIG_HOME/ebrain/context-command`. It runs with
`sh -c`, so it may be a path with arguments. With nothing configured, the hook prints nothing and the prompt goes
through unchanged.

## The contract

- **Input (stdin):** one JSON object, `{"prompt": "<the user's text>", "cwd": "<the agent's working directory>"}`.
- **Environment:** `EBRAIN_PROMPT_CWD`, `EBRAIN_PROMPT_AGENT` (`codex`, `antigravity`, `hermes`).
- **Output (stdout):** the text to hand the agent, or nothing. Exit `0`. Any other exit code, a timeout (15 s by default,
  `EBRAIN_CONTEXT_TIMEOUT_MS`) or an error is treated as no output. The command must never block a prompt.
- **Budget:** keep it small. A measured setup caps the total at 9,500 characters and answers inside 3 seconds.
- **Off switch:** if `$XDG_CONFIG_HOME/ebrain/sin-memoria-en-prompt` exists, the hook does not run the command at all. A
  command that is also called some other way should honour the same file.
- **Presentation:** frame retrieved text as reference data with its source path, not as instructions.
- **What must never be in the output:** anything from a source you have excluded (archives, retired documents, denied
  repositories). The command, not the hook, enforces this; the reference implementation projects the indexed corpus into
  an allowlist (`ebrain memoria`, `.rutas.json`) and drops any result that is not on it.

## What eBrain ships and what it does not

eBrain ships the hooks, the guard, the projection and index maintenance (`ebrain memoria`), the daemon, and the regression
(`cli/eval/hook.ts`) that measures what a command really injects. It does not ship a retrieval command for your brain:
the one measured so far lives with that brain, combines the daemon's hybrid search with a keyword index of the same
projected corpus, and is coupled to its skill router. Moving the memory half into eBrain is possible and is the next step;
it was not done because it needs the 44-case regression and the canary re-run against the moved code, and a rewrite of the
parts that assume one brain's layout.
