# Context Packs

Context packs are small, versioned operating context written for deliberate retrieval. They prevent injecting every previous session, note, or terminal pane into every new prompt.

## Scopes

- **Operator context** holds stable local operating guidance.
- **Workspace context** belongs to one registered generated workspace identity.
- **Proposals** are suggested changes that remain pending until an explicit review.

The CLI exposes summary metadata by default. Pack bodies require an explicit bounded get action; the TUI does not load them as passive state or silently inject them into a launch prompt.

```bash
ebrain context list --json
ebrain context proposals --json
```

## Review model

Direct human updates are versioned. A proposal carries safe provenance and the base version it was prepared against. Review accepts or rejects it explicitly; an outdated proposal fails rather than overwriting a newer human update.

Use installed help before mutating context:

```bash
ebrain context review --help
```

Mutations use confirmation boundaries. Strict parsers reject unsupported fields, secret-shaped text, denied-source content, malformed metadata, widened private permissions, and stale bases.

## What a pack is not

- A hidden global system prompt.
- A raw transcript or filesystem dump.
- An autonomous preference-learning engine.
- Evidence that an agent suggestion was true or approved.

Continue with [episodes](episodes.md) for immutable scrubbed recall or [procedures and workflows](procedures-and-workflows.md) for reusable process metadata.
