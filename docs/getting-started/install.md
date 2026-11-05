# Install eBrain

## Prerequisites

- Linux (the only platform claimed; macOS and WSL are untested)
- git and curl
- At least one supported local agent CLI to wire (Codex, Antigravity, Hermes, Claude Code)

Bun is installed for you if it is missing, and so is a private Bun 1.4.4 for eBrain's own processes if the one on your `PATH`
is older than the pinned engine needs. tmux is not required.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/aedneth/ebrain/main/scripts/install.sh | sh
```

or, to read the script first, from a clone:

```bash
git clone https://github.com/aedneth/ebrain.git
cd ebrain
./scripts/install.sh --from-source
```

The installer links `ebrain` into `~/.local/bin`, obtains the pinned upstream knowledge engine separately, and runs
`ebrain up`. It never reads a dotenv, never prints a secret, and does not install agent CLIs or call a provider. Re-running
it is how you update.

## Verify

```bash
ebrain doctor
ebrain status --json
```

`ebrain doctor` reports missing local prerequisites and isolation failures. Warnings on a fresh machine (no provider key,
agents not wired yet, keyword-only recall) are decisions to take, not failures.

## Next step

Follow the [quick start](quickstart.md) to wire an agent, and read [the memory model](../concepts/memory.md).
