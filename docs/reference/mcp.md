# MCP Reference

eBrain uses a local authenticated HTTP MCP daemon and small command-only bridges for supported
agent CLIs. The daemon is the single owner of the knowledge engine writer lock.

## Connection model

```text
agent configuration -> ebrain MCP bridge -> loopback daemon -> approved local knowledge
```

`ebrain up` creates/stores the local credential before binding the daemon and registers the bridge
where an adapter supports it. Users should not copy the credential into configuration by hand.

## Tool boundary

MCP exposes the approved eBrain knowledge surface. It does not grant blanket filesystem access,
export raw terminal panes, choose a provider/model, or override source isolation. Tool output and
bridge diagnostics must remain scrubbed of credential material.

## Operational checks

Use `ebrain daemon status`, `ebrain fleet --json`, and `ebrain doctor` for local diagnostics. The
daemon listens on loopback by design; exposing it outside that boundary is unsupported configuration.
