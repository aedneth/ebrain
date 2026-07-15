# Canonical Task Fixtures

The ten fixtures in `cli/task-profile.fixtures.ts` are regression coverage for Task Profile.
They exercise the six capabilities using ordinary developer tasks: coding, agentic work, web
design, long context, terminal work, and a general request.

Each fixture asserts only:

1. The explainable capability signals detected from the current local rules.
2. The resulting capability, including the deliberately neutral `general` case.
3. The compatible execution modes.

They do not name a provider, model, benchmark score, cost, agent, ranking, or winner. A change to
these fixtures or `config/task-profile-rules.yaml` must preserve that boundary and be reviewed as
an ADR-005 behavior change rather than a benchmark-based routing update.
