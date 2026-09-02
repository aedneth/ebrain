# Model Providers

The routing lane makes exactly one kind of outbound call: an OpenAI-compatible chat completion. Which
endpoint receives it is configuration, not a compiled-in fact. A provider is selected by id in
`routing.yaml`, and an endpoint the built-in registry has never heard of works too, as long as your
config supplies its base URL and the name of the environment variable holding its key.

```bash
ebrain providers list          # every known provider, and whether its key is present
ebrain providers show openai   # one provider's endpoint, key names, and metering
```

`providers list` reports **presence, never value**: a key is shown as `set` or `not set`. eBrain does
not print, log, or transmit credential values, and a provider key is referenced everywhere by its
environment-variable **name**.

## Selecting a provider

`routing.yaml` lives in your config directory (`$XDG_CONFIG_HOME/ebrain/routing.yaml`, defaulting to
`$HOME/.config/ebrain/routing.yaml`). `ebrain up` materializes it from `config/routing.default.yaml` the
first time and never touches it again — once it is yours, it is yours.

```yaml
provider:
  id: openrouter                              # selects a registry descriptor
  base_url: https://openrouter.ai/api/v1      # override, or supply for an unknown id
  key_env: OPENROUTER_API_KEY                 # an env var NAME; the value is read at call time
```

Changing providers is changing `id`. A config written before provider ids existed is matched back to
its descriptor through `base_url`, so upgrading requires no edit.

## What a descriptor carries

| Field | Why it matters |
| --- | --- |
| `base_url`, `chat_path` | Where the completion request goes. |
| `key_env` | The environment variable **names** that may hold the key, in order of preference. |
| `metering` | Whether usage is `reported` by the provider, `estimated` locally, or `local` (no cost). |
| `cost_path` | Where in the response body the reported cost is found, when there is one. |
| `server_side_failover` | Whether the provider accepts a model list and fails over itself. |
| `extra_body_keys` | Provider-specific request fields it is known to understand. |

Two of those change behavior in ways worth knowing about.

**Failover.** Some providers accept an array of models and pick the first that is available. Most
expect a single `model` and reject an array. eBrain uses the provider's own failover where it exists
and walks the capability chain locally where it does not, so a fallback chain means the same thing on
every endpoint rather than being an empty promise on most of them.

**Request extras.** `provider.provider_routing` is merged into the request body, and those fields are
provider-specific by nature. When the selected provider is known not to understand them, they are
left out and the omission is reported on stderr — a config copied between providers neither fails
with an opaque `400` nor loses a privacy preference in silence. For an id the registry does not know,
your config is the only authority on that endpoint, so its extras are sent as written.

## Spend attribution

Every routed call is recorded with the provider that served it, and the monthly cap is measured
against that lane. Switching providers therefore does not silently measure new spend against an old
provider's total.

```bash
ebrain spend --json     # routed spend against the local cap
ebrain cost --json      # factual token and usage attribution, grouped by provider
```

The cap is enforced **before** the call when `budget.hard_stop` is true. The config is validated on
read: a malformed `monthly_usd` is an error naming the line, not a silently disabled cap.

## Boundaries

- eBrain does not create a provider account, choose a payment method, or rank models. The capability
  chains in `routing.yaml` are your choices, and model availability and pricing change constantly —
  check what your provider currently offers and edit the file.
- Cost figures are telemetry about work that ran. They are not a price quote, and subscription
  charges are never merged into token usage.
- Escalation to a frontier model never happens automatically in the routing lane, which is used for
  programmatic and batch work where an unattended loop can run for a long time.

See [routing](../guides/routing.md) for the task-signal flow, [profiles and targets](../routing/profiles-and-targets.md)
for launch-time selection, and [token telemetry](../concepts/costs.md) for what the cost view reports.
