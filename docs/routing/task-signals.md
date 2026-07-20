# Task Signals

Task signals help a developer orient an unfamiliar task without pretending that a heuristic knows the universally best agent or model.

```bash
ebrain task-profile "Design a responsive documentation site" --json
ebrain advise "Design a responsive documentation site" --json
```

`advise` is a compatibility alias. Both commands return explainable capability signals and compatible execution modes. They do not return ranked models, a forced agent, a benchmark verdict, price forecast, subscription estimate, or provider credential.

## Why signals are bounded

Tasks are open-ended and model capability changes. eBrain therefore treats classification as one input to a user-owned launch decision. A clear signal may help select a profile or review a target; it cannot prove the task, provider, model, budget, or result is optimal.

## Ambiguity is honest

When wording does not clearly identify a supported capability, or signals tie, the result is `general`. That avoids turning arbitrary keyword order into a false model recommendation.

## Next step

Choose an execution profile and declared target through [profiles and targets](profiles-and-targets.md), or bypass routing with [manual launch](../launch/manual-launch.md) when a local agent is already known.
