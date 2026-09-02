# Routing and Cost Commands Reference

Routing describes available user-owned configuration. It does not infer a universal best model, buy
credits, or silently escalate to a frontier model.

## Describe a task before choosing

```bash
ebrain task-profile "Review a focused TypeScript change" --json
ebrain profiles list --json
ebrain targets --help
```

`task-profile` exposes deterministic task signals that orient a capability discussion. Those signals
do not select an agent, provider, or model. Profiles and targets are explicit declarations the user
can inspect and change before a guided launch.

## Read routing and usage telemetry

```bash
ebrain routing --json
ebrain cost --json
ebrain spend --json
```

`routing` reports configured capability chains. `cost` reports observed token/provider attribution
when adapters provide it. `spend` reports tracked routed usage against the local cap. Token-only
records remain token-only when a provider does not return monetary usage; a subscription price is
not treated as token spend.

## Keep the decision with the user

Use [guided launch](../launch/guided-launch.md) to review target, profile, capability, and workspace
together. The launch preview is the confirmation point; task signals never override the selected
profile.

Next: [profiles and targets](../routing/profiles-and-targets.md), [routing guide](../guides/routing.md),
and [token telemetry](../concepts/costs.md).
