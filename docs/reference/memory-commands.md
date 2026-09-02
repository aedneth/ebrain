# Memory Commands Reference

Memory commands have distinct sources and retrieval boundaries. A search result is not automatically
promoted into durable operating context, and a stored learning is not a raw transcript archive.

## Store and retrieve a learning

```bash
ebrain remember "Run verification after structural changes."
ebrain q "what should happen after structural changes?"
```

`remember` writes one bounded durable learning through the approved local path. `q` searches the
configured knowledge sources. Retrieval depends on the sources the user has explicitly configured;
it is not a promise that every past agent message is indexed.

## Inspect recent summaries

```bash
ebrain memory recent --json
ebrain episodes list --json
ebrain episodes recall "verification" --json
```

Recent memory and episode commands return bounded summaries or recall excerpts. They are suitable
for the TUI and local automation, not an interface for dumping private files or full terminal panes.

## Govern context deliberately

```bash
ebrain context --help
ebrain procedures --help
ebrain workflows --help
```

Context packs, procedures, and workflows have independent review and lifecycle rules. Read the
subcommand help before a mutation. A workflow record does not execute arbitrary shell text, and a
procedure use record does not assert that the underlying work succeeded.

Next: [memory layers](../concepts/memory.md), [context packs](../memory/context-packs.md), and
[procedures and workflows](../memory/procedures-and-workflows.md).
