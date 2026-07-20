# Memory Layers

eBrain separates durable information by purpose instead of injecting every past interaction into
every prompt.

| Layer | Source of truth | How it changes | Retrieval boundary |
| --- | --- | --- | --- |
| Operating context | Private local context pack | Human edit or reviewed proposal | Explicit bounded lookup |
| Episodes | Private immutable scrubbed records | Explicit learning or approved summary | Summary, bounded recall, explicit get |
| Federated knowledge | Explicitly approved sources | Existing source registration/sync | Daemon search when configured |
| Procedures | Existing workflow/skill records plus review metadata | Explicit ingest/capture/review | Materialized prompt or skill lookup |

Important consequences:

- A terminal pane is not automatically memory.
- Context proposals do not become active without explicit review.
- Procedure use is not evidence of task success.
- Local stores remain usable when the daemon is down; daemon federation is additive.
- Secret-shaped and denied-source content is rejected at the relevant write boundary.

For command details, see [CLI reference](../reference/cli.md) and
[public architecture decisions](../architecture/adr-index.md).
