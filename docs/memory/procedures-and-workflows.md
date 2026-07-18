# Procedures and Workflows

eBrain keeps reusable process content and its lifecycle evidence separate. A workflow is a normalized local record that can produce a prompt/checklist. A procedure adds explicit-use and human-review metadata without declaring that a run succeeded.

## Workflow operations

```bash
ebrain workflows list --json
ebrain workflows search "migration review" --json
ebrain workflows run <workflow-id> --json
```

Workflow materialization creates an actionable prompt or checklist. It does not execute a shell command, select a provider, start a session, or create a skill automatically. Ingestion and skillification have their own confirmation and source-isolation boundaries.

## Procedure lifecycle

```text
active -> stale -> archived
           ^          |
           +----------+ explicit review only
```

```bash
ebrain procedures list --json
ebrain procedures use <procedure-id> --json
ebrain procedures review <procedure-id> --help
```

`use` records intentional use only. It does not infer success, quality, cost, or a model result. `review` is the only transition path and can revive a stale or archived procedure through an explicit human decision. Existing workflow records remain the procedure content source of truth.

## Skills boundary

Skill presence derives from an actual local skill file, not a mutable UI flag. Creating one requires the supported approved path. Procedure metadata never stores arbitrary commands, workflow bodies, or hidden provider instructions.

Read [memory layers](../concepts/memory.md) for how this layer stays separate from context and episodes.
