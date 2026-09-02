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
ebrain daemon ensure
ebrain up
```

The daemon is the single local writer and authenticated loopback MCP owner. `daemon status` reports
whether that owner is available, identifying the process rather than trusting a recorded PID — a
stale pidfile must read as *down*, not as healthy. `ensure` starts it only if it is not already
running, and start-up is confirmed against the daemon's own health endpoint instead of assumed.
`up` is idempotent: it prepares the daemon, materializes missing configuration, and onboards
detected supported adapters. It does not ask a user to paste credentials into the terminal.

A daemon that is only ever started by hand will eventually be down without anyone noticing, and
every registered agent will be pointed at a host that is not there. `ebrain daemon install-service`
registers it with systemd or launchd so it comes back after a reboot.

It also performs the handover, which is the part that matters. Anyone running that command is on a
machine where the daemon is already running the way it always has: started by hand. Enabling the
unit without stopping that host first would start a second one against a port and a database lock
the first still owns, and the unit restarts on failure — so the result would be a crash loop
reported as a successful install. The manually started host is stopped first, and the command
confirms against the health endpoint that something is actually serving before it claims
supervision is in place.

## Check the adapters themselves

```bash
ebrain adapters validate
ebrain harness doctor <agent>
```

`adapters validate` checks every adapter manifest against its schema and reports the cross-field
problems a schema cannot see on its own. `harness doctor` reports one agent's real state — including
whether its hooks are wired into the agent's own configuration, rather than merely present on disk.

## Read failures before changing state

When a check is not healthy, preserve its message and inspect the named boundary before restarting
anything. A restart can interrupt active sessions. Adapter detection only reports what is installed
and locally configurable; it never installs a provider CLI or changes an account.

Next: [troubleshooting](../guides/troubleshooting.md) for symptom-oriented recovery, or
[daemon and federation](../architecture/daemon-federation.md) for the ownership model.
