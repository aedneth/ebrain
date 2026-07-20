# Quick Start

This path verifies the local control plane without asking you to configure a token, OAuth flow, or
database lock by hand. It assumes eBrain is installed from source and at least one supported local
agent CLI is available.

## 1. Boot the shared service

```bash
ebrain up
ebrain doctor
ebrain status --json
```

`ebrain up` is idempotent. It mints and stores the local MCP credential before the daemon binds,
starts the loopback-only daemon, registers detected supported adapters, and runs its bounded smoke
path. `doctor` explains missing local prerequisites rather than silently continuing.

## 2. Verify agent onboarding

```bash
ebrain onboard --all
ebrain fleet --json
```

Onboarding registers the command-only bridge with compatible local agent CLIs. It never asks you
to paste a credential into a prompt. A missing CLI is reported as unavailable; eBrain does not
pretend it is connected.

## 3. Save one durable decision

```bash
ebrain remember --project demo "Review a database migration before merge."
ebrain q "what must happen before a database migration merges?"
```

`remember` writes a concise learning through the approved local path. `q` searches configured,
approved federated sources; it is not a guarantee that every local file or past terminal pane is
searchable. Read [memory layers](../concepts/memory.md) before adding broad source material.

## 4. Open the control plane

```bash
ebrain
```

The TUI opens only in a real interactive terminal. Start with [first workspace and session](workspace-session.md),
then use [manual launch](../launch/manual-launch.md) when you are ready to run an agent.

## What this path does not do

- It does not install an agent CLI or create a provider account.
- It does not make hosted embeddings or provider routing mandatory.
- It does not expose a daemon outside loopback.
- It does not make every transcript durable memory.

Continue with [boot and onboarding](onboarding.md) for the service lifecycle and adapter boundary.
