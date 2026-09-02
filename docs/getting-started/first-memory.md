# First Durable Memory

eBrain memory is not a raw chat or terminal transcript. Write a concise decision, constraint, or
learning that a future agent can use safely.

```bash
ebrain remember --project demo "Database migrations require an independent review before merge."
ebrain q "what must happen before database migrations merge?"
```

`remember` validates and stores the learning locally, then mirrors it to bounded local episode
recall on a best-effort basis. When the shared daemon is available, existing write-through paths may
make approved material searchable across configured sources. A local durable write remains truthful
even when the daemon is unavailable.

Use the cockpit's Memory panel for summaries and provenance. Explicit bounded retrieval is required
for episode bodies; the TUI does not load raw episode text into passive state.

Read [memory layers](../concepts/memory.md) for the data model and [privacy](../guides/privacy.md)
for content that must never be stored.
