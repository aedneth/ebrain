# Token and Provider Telemetry

eBrain records factual telemetry when a route or adapter supplies it. The Cost view can group token
counts and known usage by provider, agent, model, session, and workflow.

It intentionally does not:

- turn a subscription price into token usage;
- invent a zero cost when a provider omitted usage;
- promise a current market price or a universal cheapest model;
- apply an OpenRouter cap to unrelated provider usage.

The routing budget is a local governance boundary for routed work. Some engine/provider activity can
be separately tracked or unavailable, and the UI labels that distinction. See [routing](../guides/routing.md)
and the [JSON contract boundary](../reference/json-contracts.md).
