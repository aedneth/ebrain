# F6 Success Criteria

This document accumulates evidence for the TUI program. The final GPT-5.6-sol audit decides
whether all criteria are accepted; entries below are maker evidence, not self-approval.

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 1 | TUI boots under 1.5 s and stays below 100 MiB RSS on the Celeron | Cold boot from F6.3: 0.08-0.10 s, 43 MiB RSS. F6.7.2 local tmux probe: 47 MiB RSS peak in Sessions with a fake agent, idle CPU ~0.6% of one core, 1 Hz peek ~1.8% of one core (5 s `/proc/<pid>/stat` samples; `CLK_TCK=100`). | maker evidence complete |
| 2 | Panels use CLI contracts with no orphan data logic | F6.5 gate evidence; final audit pending | pending audit |
| 3 | Sessions preserve harness/write-back behavior | F6.4 E2E and final human checklist | pending audit |
| 4 | Launch is governed, deny-list aware and model selection is user-owned | ADR-005, profiles/targets/wizard tests | pending audit |
| 5 | Token/USD telemetry is factual, without subscription allocation | `docs/COST-LEDGER.md`, cost contracts | pending audit |
| 6 | Memory/workflow loop stays deliberate and privacy-safe | workflow contracts and prompt privacy tests | pending audit |
| 7 | Edge cases degrade visibly and terminal restores | `docs/TUI-EDGE-CASES.md`, final TTY checklist | pending audit |
| 8 | Design-system adherence and docs are shippable | theme/zero-hex checks, docs tasks 6.7.3-6.7.7 | pending audit |

## F6.7.2 Distribution Decision

Do not add `bun build --compile` for this release. The interpreted TUI already starts more than
an order of magnitude below the 1.5 s target and remains below half of the 100 MiB RSS budget in
the active peek scenario. A compiled artifact would add release targets and update burden without
a measured user-facing benefit on this Celeron. Revisit only if a future cold-boot benchmark
regresses past the target or a supported distribution requires a standalone binary.
