# Public Architecture Decisions

eBrain's public behavior follows these durable decisions:

| Decision | Public consequence |
| --- | --- |
| One local daemon owns the writer | Agents do not contend for an embedded database lock. |
| Agent adapters use a command-only bridge | Adapters connect through authenticated loopback MCP rather than embedding credentials. |
| Model choice belongs to the user | Signals describe work; profiles retain the user's provider and model choices. |
| Workspaces are validated identities | Sessions use registered directories instead of arbitrary shell configuration. |
| tmux owns persistent sessions | The TUI controls and observes sessions; it is not an embedded terminal. |
| Memory is governed by layer | Context, episodes, federation, and procedures use explicit retrieval and review boundaries. |

Detailed ADRs can contain historical implementation context. They remain maintainer evidence until
the release-privacy gate explicitly approves them for public visibility. The supported behavior is
described by this public documentation tree and the command contracts.
