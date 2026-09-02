# Install eBrain

## Prerequisites

- Bun 1.3 or newer
- git
- tmux for persistent sessions
- At least one supported local agent CLI for onboarding

## Source installation

```bash
git clone https://github.com/aedneth/ebrain.git ebrain
cd ebrain
bun install
./scripts/install.sh --from-source
```

The installer links `ebrain`, obtains the pinned upstream knowledge engine separately, and starts
the local setup unless an explicit test-only skip flag is used. It does not install agent CLIs or
make provider requests.

## Start and verify

```bash
ebrain up
ebrain doctor
ebrain status --json
```

`ebrain up` is idempotent. It starts the loopback daemon, creates/stores the local MCP credential
without printing it, and attempts onboarding for detected supported agents. `ebrain doctor` reports
missing local prerequisites and isolation failures clearly.

## Next step

Continue with [your first durable memory](first-memory.md). For local configuration and optional
providers, see the [configuration reference](../reference/configuration.md).
