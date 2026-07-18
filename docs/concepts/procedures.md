# Procedures and Skills

Procedures are reusable workflows with a reviewable lifecycle. Existing workflow records remain the
content source of truth; eBrain adds lightweight private metadata for intentional use and explicit
review state.

```text
active -> stale -> archived
           ^          |
           +----------+ explicit review only
```

`ebrain procedures use` records intentional use. It does not claim the result was successful.
`ebrain procedures review` is the only state transition. A procedure can return to active through
explicit review. Workflow materialization creates a prompt/checklist; it does not run a shell,
select a provider, or create a skill automatically.

Use [workflow commands](../reference/cli.md#workflows-and-procedures) for the supported interface.
