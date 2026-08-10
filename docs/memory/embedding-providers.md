# Embedding Providers

Semantic recall needs a way to turn text into vectors. eBrain does not hardcode one vendor for
that: the underlying engine's provider recipes are pluggable, and eBrain applies a small policy on
top to pick a sane default, fail over honestly, and never make recording depend on any of it.

## The out-of-the-box default

A fresh clone with `OPENROUTER_API_KEY` set (the same key eBrain already asks for to route agent
work) gets semantic recall for free: `openrouter:openai/text-embedding-3-small` at 1536 dimensions.
No separate OpenAI key is required, and 1536 dims match the existing vector store, so a fresh clone
needs no schema change to start embedding.

## The local, $0 option

Prefer nothing to leave the machine: point eBrain at a local Ollama server running
`nomic-embed-text` (768 dimensions). This keeps embedding entirely off any provider budget. It
depends on a local model server actually running, and semantic recall over it is comfortable once
the machine has 8 GB of RAM or more — below that, expect it to be slow or to strain the machine
under other load.

## No embedder available

If neither a hosted key nor a reachable local server is configured, eBrain does not fail — it
degrades to the engine's native keyword search for recall. This is a real, working fallback, not a
degraded error state: it's just literal-term matching instead of semantic similarity. Recording is
never affected either way — `ebrain remember` writes a durable, local learning through its
validated path regardless of whether an embedder is configured. See
[troubleshooting](../guides/troubleshooting.md) for the exact recall-degradation note.

## Provider identity and switching

Each embedding is tagged with the provider, model, and dimension count that produced it
(`provider:model:dims`). Recall only trusts vectors that match the currently configured signature.
Switching providers — or changing dimensions on the same provider — means the store re-embeds
existing content under the new signature; a dimension change also rebuilds the vector column itself,
since the column width is fixed to the dimension count. Neither operation touches recorded learnings
themselves, only their vector representation.

Read [memory layers](../concepts/memory.md) for how recall fits alongside episodes, context packs,
and procedures, and [routing](../guides/routing.md) for how eBrain treats OpenRouter as one
configurable provider among several.
