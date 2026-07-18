# Routing

Routing starts with a task signal and a user-owned execution profile. The signal can classify a task
into a capability, but it does not select an agent or declare one model better than another.

```bash
ebrain task-profile "Refactor a typed API client" --json
ebrain profiles list --json
ebrain routing --json
ebrain cost --json
```

Profiles are local choices with catalog provenance. A guided launch previews a declared target,
profile, capability, workspace, and reviewed task before it creates a session. Manual launch remains
available when a developer already knows which local agent to use.

OpenRouter and other providers are optional configuration. Provider availability, model behavior,
and pricing change over time; eBrain reports declared configuration and factual returned usage, not
live benchmark rankings or subscription estimates.
