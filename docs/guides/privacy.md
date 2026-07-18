# Privacy and Source Isolation

eBrain is local-first, but local does not mean every local file should become agent context. Its
privacy model combines explicit source registration, local private permissions, secret scrubbing,
and deny-first isolation checks.

## Rules for users

- Keep credentials in supported local configuration or environment indirection, never in prompts or
  source documents intended for indexing.
- Register only sources that agents are allowed to search.
- Configure local exclusions for repositories and directories that must never enter federation,
  workflows, workspaces, or memory.
- Treat session panes as transient; eBrain does not automatically turn them into durable memory.
- Review context proposals and procedure lifecycle changes explicitly.

The daemon binds to loopback and eBrain avoids printing its MCP credential. Secret-shaped values are
scrubbed or rejected at relevant boundaries, but developers should still follow their own security
and incident-response requirements. See [SECURITY.md](../../SECURITY.md).
