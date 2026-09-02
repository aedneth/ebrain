# Daemon and Federation

The shared daemon is the single local owner of the knowledge engine's writer lock. It binds MCP HTTP
to loopback and authenticates agent bridges with a locally minted credential. This removes the
failure mode where several agent-local servers compete for one embedded database writer.

```text
agent CLI -> command-only bridge -> authenticated loopback daemon -> approved local sources
```

## What the daemon owns

- local writer coordination;
- authenticated loopback MCP serving;
- approved source retrieval and write-through integration;
- boot preflight that rejects unsafe registered sources.

## What it does not own

- user model preference or a universal model ranking;
- raw terminal capture as memory;
- provider credentials in public output;
- a requirement that every clean local memory operation be online.

Federation is explicit. A developer can operate eBrain with local context, episodes, procedures, and
workspaces before adding compatible sources. Source isolation remains the authoritative boundary.
See [privacy](../guides/privacy.md) and
[public architecture decisions](adr-index.md).
