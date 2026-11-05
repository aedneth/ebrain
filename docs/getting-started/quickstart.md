# Quick Start

This path takes a Linux machine with git and curl from nothing to a running daemon and a checked agent wiring. Every step
below was run from scratch in a throwaway `HOME` (the install took about two and a half minutes), and the places where it
stops short are listed at the end instead of hidden.

## 1. Install and boot

```bash
curl -fsSL https://raw.githubusercontent.com/aedneth/ebrain/main/scripts/install.sh | sh
ebrain doctor
```

The installer installs [Bun](https://bun.sh) if it is missing, and a private Bun 1.4.4 under `~/.local/share/ebrain/bun` if
the one on your `PATH` is older than the pinned engine needs. It pins the knowledge engine, links `ebrain` into
`~/.local/bin`, and runs `ebrain up`: private credential, loopback daemon, onboarding of the agent CLIs it finds. It never
reads a dotenv, never prints a secret and never installs an agent for you. To read it before running it, clone the
repository and run `./scripts/install.sh --from-source`.

`ebrain doctor` should end with `ebrain doctor: OK`. On a fresh machine it still lists warnings (no provider key, adapters
not wired yet, keyword-only recall): those are things to decide, not failures.

## 2. Wire an agent

```bash
ebrain harness install codex        # or: antigravity · hermes · claude · gemini
ebrain harness doctor codex
```

Installing writes the hooks into the file **that agent reads**, adds eBrain's entries without touching yours (a
`.ebrain-backup` of the file is kept the first time), and then the doctor checks the result, asking the agent itself where it
can:

- **Codex** reads `~/.codex/hooks.json` and runs a hook only after you approve it: open Codex and run `/hooks`. The doctor
  asks `codex features list` whether hooks are enabled.
- **Antigravity** reads `~/.gemini/config/hooks.json`; eBrain owns only the group named `ebrain`.
- **Hermes** gets a `pre_tool_call` hook in `~/.hermes/config.yaml` and a memory provider named `ebrain`; the doctor checks
  `hermes hooks list`.

Each install self-tests the guard with a read of a dotenv file in that agent's own payload shape, and the doctor fails if it
is not denied.

## 3. Give the prompt hook something to run

The hooks hand each prompt to a *context command* that you configure; with none configured they do nothing. See
[the context command](../reference/prompt-context.md).

```bash
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/ebrain"
echo '/path/to/your/context-command' > "${XDG_CONFIG_HOME:-$HOME/.config}/ebrain/context-command"
```

## 4. Save a decision

```bash
ebrain remember --project demo "Review a database migration before merge."
```

The learning is written to disk at once and a write-through to the daemon is attempted.

## What this path does not do

- **Searching what you just remembered does not work on a clean install.** `ebrain q` queries federated sources other than
  the engine's `default`, and a fresh install has none, so it answers `no eligible federated sources are available`.
  Register a source (see [configuration](../reference/configuration.md) and `ebrain memoria`) first.
- It does not make `think` or `synthesize` answer: the engine runs with no chat model on purpose (they report
  `no LLM available`; search is unaffected).
- It does not install an agent CLI or create a provider account, and it does not expose the daemon outside loopback.
- macOS and WSL are untested.

## Turn it off

- All agents, memory only, one file: `touch "${XDG_CONFIG_HOME:-$HOME/.config}/ebrain/sin-memoria-en-prompt"`.
- One agent: remove the `ebrain` entries from its hook file, or restore the `.ebrain-backup` next to it.
- The rest: `ebrain uninstall` prints what it would remove (MCP entries, launcher, service, config) and removes nothing;
  `ebrain uninstall --yes` applies it, and `--purge` also deletes the brain store. It does not edit the hook files above:
  remove those by hand, as in the previous line.
