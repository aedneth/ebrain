# Episodes

Episodes are private immutable, scrubbed local records for bounded recall. They capture a useful summary with safe provenance; they are not a silent copy of chat history or terminal output.

## Retrieval boundaries

```bash
ebrain episodes list --json
ebrain episodes recall <query> --json
ebrain episodes get <episode-id> --json
```

List and recall are summary/bounded surfaces. An episode body needs an explicit get and remains character-bounded. Public JSON contracts reject filesystem paths, raw bodies on passive surfaces, and unrelated private metadata.

## Recording and mirroring

An approved `ebrain remember` learning can mirror to bounded local episode recall on a best-effort basis after its durable learning write. If mirroring fails, the durable learning stays valid; a secondary recall feature never rolls back a successfully written decision.

Explicit episode record actions validate generated workspace identity, size, safe provenance, private permissions, and secret/denied-source boundaries. Episode files are immutable in practice: a record creates a new opaque identifier rather than editing old content.

## What episodes do not claim

- They do not preserve every message from a session.
- They do not automatically train or change an agent.
- They do not write to a federated source without its existing approved path.
- They do not provide a public import of personal historical data.

The only legacy recovery proof is fixture-only and synthetic. See [migration concepts](../guides/migration.md).
