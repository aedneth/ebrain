# Supported Agents

eBrain integrates with locally installed agent CLIs through small adapters and a command-only MCP
bridge. Start with:

```bash
ebrain up
ebrain onboard --all
ebrain fleet --json
```

The current integration surface includes Claude Code, Codex, Gemini, Cursor, and OpenCode where the
local CLI/configuration supports it. A generic adapter is available for a conservative local
shell-style launch. Detection is factual: an unavailable CLI remains unavailable rather than being
represented as connected.

The bridge configuration contains commands and stable arguments, not bearer material. Credentials
stay in local private stores or supported environment indirection. Do not copy tokens into adapter
configuration, prompts, issue reports, or documentation.

## An adapter is one manifest

Each supported agent is described by a single `harness/adapters/<agent>/manifest.yaml`. That file is
the only place an agent's integration is declared, and every consumer reads it: onboarding, MCP
registration, hook wiring, uninstall, and the fleet view. Adding an agent CLI is adding a manifest,
not editing the surfaces that use it.

```bash
ebrain adapters list              # every declared adapter and how it registers
ebrain adapters show codex        # one adapter's registration, config path, and hooks
ebrain adapters validate          # check every manifest against the schema
```

The manifest is validated against a strict schema, so an unknown or misspelled key is refused rather
than accepted into an adapter that then silently never launches. `validate` also checks the
cross-field cases a schema alone cannot: a directory name that disagrees with the declared agent, a
command-registered adapter with no binary, an onboardable adapter with nowhere to write, and a hook
wrapper bound to an event the agent does not expose.

Agents register in one of two ways, declared by the manifest: through the agent's own CLI, or by
merging an entry into its JSON config. Both are covered by `ebrain onboard` and reversed by
`ebrain uninstall`.

## Hooks

An adapter may declare hook wrappers — the secret guard among them. Installation **wires** them into
the agent's runtime configuration rather than writing them to disk and asking you to add an entry by
hand. Writing into a config file eBrain does not own follows explicit rules:

- **Additive.** Hooks that are not eBrain's are never touched, reordered, or removed.
- **Idempotent.** A wrapper already referenced is recognised by its path, in any spelling a shell
  accepts, so repeated installs do not accumulate duplicate invocations of the same hook.
- **Reversible.** One pre-eBrain backup is kept, the write is atomic, and a config that is a symlink
  into a dotfiles repository is written *through* rather than replaced.
- **Honest.** A config that cannot be parsed is reported, never rewritten.

Not every agent exposes runtime hook events. Where one does not, the guard is advisory and the
manifest says so — `ebrain harness doctor <agent>` reports which of the two you have, because a
guard that is installed but not firing protects nothing.

Use `ebrain harness doctor <agent>` for one adapter or `ebrain doctor` for the broader local health
view. See [MCP reference](../reference/mcp.md) for the boundary.
