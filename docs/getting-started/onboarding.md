# Boot and Onboarding

eBrain's shared daemon prevents several local agent processes from contending for the same embedded
knowledge writer. Boot is designed as one repeatable command rather than a sequence of credential,
lock, and registration steps.

## Normal path

```bash
ebrain up
ebrain doctor
ebrain fleet --json
```

At boot, eBrain creates or reuses its private local MCP credential, starts the authenticated daemon
on loopback, and attempts onboarding for detected adapters. The credential is not printed and users
do not need to add it to a prompt or adapter command.

## Adapter registration

```bash
ebrain onboard --all
ebrain onboard codex
ebrain harness doctor codex
```

Use `onboard --all` for the detected supported set, or a named adapter when repairing one local
integration. Adapter configuration contains a stable command bridge, not bearer material. The
adapter guide explains the supported boundary in [supported agents](../guides/agents.md).

## Service checks

```bash
ebrain daemon status
ebrain status --json
ebrain doctor --json
```

`daemon status` is the narrow service view. `status` is a compact product snapshot. `doctor` is the
diagnostic entry point when a daemon, launcher, adapter, source policy, or local contract is not
healthy. Do not bypass a named isolation or permission failure with a hand-edited store.

## Lifecycle boundary

Daemon restart or stop actions affect local MCP availability, not the contents of durable memory or
running tmux sessions. A clean local memory operation can continue within its local boundary while
federated daemon-backed search is unavailable. See [daemon and federation](../architecture/daemon-federation.md).

## Next step

Register a project through [workspaces and sessions](workspace-session.md), then choose
[manual launch](../launch/manual-launch.md) or [guided launch](../launch/guided-launch.md).
