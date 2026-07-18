<p align="center">
  <img src="assets/ebrain-wordmark.svg" alt="eBrain" width="255" height="50" />
</p>

<p align="center">Shared memory and workspace orchestration for local coding agents.</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg" alt="License: AGPL-3.0-only" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-black.svg" alt="Runtime: Bun" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/protocol-MCP-2dd4bf.svg" alt="Protocol: MCP" /></a>
</p>

![Sanitized eBrain TUI home frame generated from the production renderer](assets/ebrain-tui-demo.svg)

eBrain gives local coding agents one governed memory layer, persistent workspace sessions, and a
terminal control plane. It starts one loopback MCP daemon, onboards detected supported CLIs, keeps
durable local records bounded and scrubbed, and reports factual token/provider telemetry without
pretending to choose a universally best model.

## Five-minute proof

Requirements: Bun, git, tmux for persistent sessions, and at least one supported local agent CLI.
The source install fetches the pinned upstream knowledge engine separately; see
[third-party notices](THIRD_PARTY_NOTICES.md).

```bash
git clone https://github.com/aedneth/ebrain.git ebrain
cd ebrain
bun install
./scripts/install.sh --from-source

# Start the shared loopback daemon and onboard detected supported agents.
ebrain up
ebrain doctor

# Store and retrieve one durable, bounded learning.
ebrain remember "Use explicit verification after structural changes."
ebrain q "what should happen after structural changes?"

# Open the terminal cockpit in a real terminal.
ebrain
```

`ebrain up` owns token creation and local MCP registration. It does not ask users to paste a token,
manage a writer lock, or hand-configure an OAuth flow. A remote one-line installer is a release-gated
distribution path; use the source proof above until a public release is explicitly announced.

## What eBrain provides

- **One local MCP daemon.** The daemon owns the database writer and serves authenticated MCP on
  loopback. Agent CLIs connect through the bridge instead of competing for the same writer lock.
- **Governed memory, not transcript dumping.** Durable learnings, bounded episodes, explicit
  context packs, and reviewed procedures have separate sources of truth and retrieval boundaries.
- **Workspace-first sessions.** Register validated directories, select one in Launch, and run
  persistent tmux sessions that survive closing the TUI.
- **User-governed routing.** Task signals and execution profiles describe work and select a model
  map that the user controls. eBrain does not rank models or recommend a universal winner.
- **Factual cost telemetry.** Token counts and known provider usage are attributed by provider,
  agent, model, session, and workflow when available. Subscription prices are not reported as usage.
- **Local safety controls.** Loopback-only MCP, private local stores, secret scrubbing, confirmation
  gates, and source isolation reduce accidental exposure without claiming to replace a security
  review of third-party tools.

## How the pieces fit

```text
local agent CLIs -> authenticated loopback MCP -> eBrain daemon -> approved local knowledge
                         |                          |
                         |                          +-> bounded memory and procedures
                         +-> TUI / CLI control plane +-> workspace-backed tmux sessions
```

Federated knowledge is optional. A clean installation can operate with local memory alone; a user
may explicitly connect compatible sources later. [CKIS](docs/architecture/ckis.md) is the related
knowledge infrastructure project; eBrain is the runtime/control-plane layer built to work with or
without it.

## Documentation

Start with the [public documentation index](docs/PUBLIC-DOCUMENTATION.md):

- [Install and first memory](docs/getting-started/install.md)
- [Workspaces and sessions](docs/getting-started/workspace-session.md)
- [Memory model](docs/concepts/memory.md)
- [Routing and token telemetry](docs/guides/routing.md)
- [Privacy and source isolation](docs/guides/privacy.md)
- [CLI and MCP reference](docs/reference/cli.md)
- [Open-source readiness](docs/release/open-source-readiness.md)

The static documentation site is generated directly from that public Markdown tree:

```bash
bun run website:build
```

This creates local static output only. It does not deploy a website or alter repository visibility.

## Supported integrations

The onboarding layer recognizes supported local CLI adapters, including Claude Code, Codex, Gemini,
Cursor, and OpenCode where installed/configurable. Availability depends on the local CLI and its
configuration. `ebrain onboard --all` reports the detected set; [the agent guide](docs/guides/agents.md)
explains the boundary.

## Current boundaries

- Hosted embeddings and provider routing are optional user configuration. Keyword-based local
  fallback remains available when semantic embeddings are not configured.
- A native workspace shell is an architecture proposal, not an implemented embedded terminal.
- The documentation website builds locally from this public Markdown tree; no public deployment has
  been approved.
- The public-release privacy/history remediation tracked in
  [open-source readiness](docs/release/open-source-readiness.md) remains a gate before visibility.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the
[contributor workflow](docs/release/contributor-workflow.md). High-risk changes require independent
review: maker and checker are intentionally different roles.

## Acknowledgements

eBrain integrates the separately installed [gbrain](https://github.com/garrytan/gbrain) knowledge
engine and builds on lessons from [CKIS](https://github.com/aedneth/ckis). See
[third-party notices](THIRD_PARTY_NOTICES.md) for licensing boundaries.

## License

eBrain-authored source is licensed under the [GNU AGPL v3.0 only](LICENSE).
