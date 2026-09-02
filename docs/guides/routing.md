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

## Which provider receives the call

The routing lane makes one kind of outbound call, in OpenAI-compatible shape, and the endpoint is a
value in `routing.yaml` rather than something compiled in. Selecting a provider is setting
`provider.id`; an endpoint the built-in registry does not know works too, as long as the config
supplies its base URL and the **name** of the environment variable holding its key.

```bash
ebrain providers list
ebrain providers show openrouter
ebrain spend --json
```

Spend is recorded against the provider that actually served each call, so the monthly cap is
measured against the right lane after a provider change. The config is validated on read: a
malformed budget is an error naming the line, never a cap that silently stops applying.

Provider availability, model behavior, and pricing change over time; eBrain reports declared
configuration and factual returned usage, not live benchmark rankings or subscription estimates.
Providers are optional configuration — a developer can launch a local agent CLI manually and use
none of this.

See the [provider reference](../reference/providers.md) for descriptors, failover behavior, and how
provider-specific request fields are handled.
