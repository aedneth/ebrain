# F6 Success Criteria

This document accumulates evidence for the TUI program. The final GPT-5.6-sol audit decides
whether all criteria are accepted; entries below are maker evidence, not self-approval.

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 1 | TUI boots under 1.5 s and stays below 100 MiB RSS on the Celeron | Cold boot from F6.3: 0.08-0.10 s, 43 MiB RSS. F6.7.2 local tmux probe: 47 MiB RSS peak in Sessions with a fake agent, idle CPU ~0.6% of one core, 1 Hz peek ~1.8% of one core (5 s `/proc/<pid>/stat` samples; `CLK_TCK=100`). | maker evidence complete |
| 2 | Every panel is backed by an `ebrain ... --json` contract, with no orphan logic | `knowledge/run.ts` only spawns the dispatcher; contract and panel suites cover status, memory, spend/routing, fleet, doctor, workflows, profiles and targets. | maker evidence complete |
| 3 | A TUI session gets the full harness and leaves a write-back trace | `cli/sessions.test.ts` E2E covers manifest launch/new/list/peek/send/kill. Full Claude write-back remains a human acceptance step because it must use a real adapter. | automated evidence + human check |
| 4 | Two tmux sessions can be observed and the RAM governor requires explicit override | Session panel/throttle tests, real tmux fake-agent E2E, and governor tests cover the second-heavy `y` gate. | maker evidence complete |
| 5 | Ten canonical tasks expose signals, capabilities and compatible modes without a winner | `cli/task-profile.fixtures.test.ts`: 10/10 fixtures across six capabilities; rejects agent/model/rank/cost fields under ADR-005. | maker evidence complete |
| 6 | A TUI learning/workflow remains deliberate and reaches shared memory | `runRemember` uses the primitive, Memory refreshes after write, workflows materialize before attach; live cross-agent round-trip is a human acceptance step. | automated evidence + human check |
| 7 | No secrets are rendered in a stream | `scrubSecrets` security tests cover assignments, token prefixes and PEM blocks; every `peekSession` path scrubs before rendering. | maker evidence complete |
| 8 | Palette, glyphs and spacing come from the design system with no hardcoded colors | `design-sync-tui` generates `theme.ts`; theme tests and zero-hex scan outside `theme.ts` are clean. | maker evidence complete |

## F6.7.2 Distribution Decision

Do not add `bun build --compile` for this release. The interpreted TUI already starts more than
an order of magnitude below the 1.5 s target and remains below half of the 100 MiB RSS budget in
the active peek scenario. A compiled artifact would add release targets and update burden without
a measured user-facing benefit on this Celeron. Revisit only if a future cold-boot benchmark
regresses past the target or a supported distribution requires a standalone binary.
