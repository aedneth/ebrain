# Memory

eBrain does not ask the model to remember to look. A hook in each agent hands every prompt to a context command, and what
it returns arrives with the prompt. In the one setup measured so far, across 31 sessions in October 2026 the memory tools
were called 0 times, while context injected by a hook reached 20 of them. Registering a tool makes it available; it does
not make a model use it.

## What happens on a prompt

1. The agent's hook runs `harness/core/prompt-context.sh` with the prompt and the working directory.
2. That runs your [context command](../reference/prompt-context.md), within a deadline.
3. Its text is handed to the agent as reference data with source paths. Nothing configured, an error, a timeout or the
   off-switch means no output and an untouched prompt.

## What the index contains

`ebrain memoria` projects each registered source into a small local git repository by rules in a private config:
archives, retired documents, operational noise and denied material never reach it, and the real tree is never written to.
It keeps a keyword index of the same corpus and an allowlist (`.rutas.json`) so a hook can drop any result that is not
there. Embeddings have a per-run and a monthly spend cap; at the cap, keyword search keeps working.

## Writing

`ebrain remember "<learning>"` writes one scrubbed, self-contained learning to disk at once. On a clean install it is searchable at once. With `ebrain memoria`
configured it enters the index at the next sync (hourly), filtered and under the caps. It rejects secret-shaped input, and
a learning that names a denied repository stays on disk only.

## Boundaries

- A terminal pane is not memory; only what you or an agent saves is.
- The engine runs with no chat model: `think` and `synthesize` answer "no LLM available"; search is unaffected.
- `ebrain q` searches every federated source; on a clean install, where `default` is the only one, it searches `default`. Next to named sources `default` is left out, because it only duplicates them.
