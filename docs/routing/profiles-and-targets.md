# Profiles and Targets

Profiles and targets turn an explicit developer choice into a reviewable launch plan. They do not hide a provider recommendation behind a task classifier.

## Execution profiles

```bash
ebrain profiles list --json
ebrain profiles show <profile-id> --json
ebrain profiles validate --json
```

A profile is a local, user-selected provider/model map organized by capability. Its model entries must have catalog provenance, so an unknown or hand-edited model reference fails rather than silently becoming a default. Legacy routing chains are represented as migrated user profiles, never as a universal recommendation.

Use installed help before profile initialization, catalog changes, or creation:

```bash
ebrain profiles --help
```

## Declared targets

```bash
ebrain targets list --json
ebrain targets plan --help
```

A target is an adapter declaration with a safe model selector. A plan combines target, profile, capability, workspace, optional workflow attribution, and reviewed task before it launches. If a target cannot represent the selected capability/model safely, planning fails.

## What profiles and targets do not do

- They do not sign up for a provider or reveal a credential.
- They do not update themselves from live benchmarks.
- They do not claim a selected model is always best or cheapest.
- They do not apply a routed spend cap to unrelated provider usage.

Use [guided launch](../launch/guided-launch.md) for the TUI workflow and [token telemetry](../concepts/costs.md) for factual measurement.
