# Diagnostics Reference

Diagnostics answer whether the local control plane is ready. They inspect state; they do not create
a provider account, select a model, or repair a configuration silently.

## Start with the health snapshot

```bash
ebrain status --json
ebrain doctor
ebrain fleet --json
```

`status` is the compact current-state view. `doctor` checks the daemon, supported adapters, source
isolation, and local contracts. `fleet` summarizes detected adapter health and resource class. Use
the human-readable `doctor` result first when setting up a machine, then use JSON only for local
automation or the TUI.

## Check daemon ownership

```bash
ebrain daemon status
ebrain up
```

The daemon is the single local writer and authenticated loopback MCP owner. `daemon status` reports
whether that owner is available. `up` is idempotent: it prepares the daemon and onboards detected
supported adapters. It does not ask a user to paste credentials into the terminal.

## Read failures before changing state

When a check is not healthy, preserve its message and inspect the named boundary before restarting
anything. A restart can interrupt active sessions. Adapter detection only reports what is installed
and locally configurable; it never installs a provider CLI or changes an account.

Next: [troubleshooting](../guides/troubleshooting.md) for symptom-oriented recovery, or
[daemon and federation](../architecture/daemon-federation.md) for the ownership model.
