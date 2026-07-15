---
type: sprint-plan
project: ebrain
program: F6.6+ — Orchestration UX, workflows, unified cost ledger
created: 2026-07-15
status: in-progress
tags: [ebrain, tui, orchestration, openrouter, workflows, costs]
related: [SPRINT-TUI.md, SPRINT-DAEMON.md, ROUTING.md, model-registry.md]
---

# SPRINT — Orchestration UX + Workflows + Cost Ledger

Objetivo: que ebrain sea un cockpit diario, no una colección de comandos. El usuario debe poder:

1. describir una tarea;
2. ver qué carril conviene (`route`, Codex, Cursor, OpenCode, Gemini, Claude audit);
3. ver costo/cap/modelos antes de ejecutar;
4. lanzar el trabajo o correrlo por OpenRouter;
5. convertir procesos repetidos en workflows/skills accionables;
6. ver gasto por proveedor/agente/modelo/sesión/workflow.

Regla de arquitectura: la TUI no lee YAML/JSONL ni secretos directo. Toda superficie nueva nace como CLI `--json` contract-tested y la TUI consume ese contrato.

## F6.6A — OpenRouter stack visible y operable `[x]`

- [x] `ebrain routing --json`: contrato read-only para capacidades OpenRouter, chains winner/fallback/floor, pricing verificado cuando existe, gasto MTD por capability y comando operable.
- [x] Routing tab consume el contrato nuevo y muestra cadenas reales; se elimina la nota “pending routing --json contract”.
- [x] Tests: `cli/routing.test.ts`, `cli/contract.test.ts`, `tui/test/knowledge/contracts.test.ts`, `tui/test/knowledge/panels.test.ts`.
- Verify vivo: `ebrain routing --json` muestra 7 capabilities (`coding`, `agentic`, `web_design`, `reasoning`, `long_context`, `terminal`, `general`) con slugs reales del stack chino.

## F6.6B — Launch task router `[x]`

- [x] Launch conserva el grid manual de agentes.
- [x] `t` abre composer de tarea; Enter pide `ebrain advise --json`.
- [x] La vista muestra task, capability, lane, agent, model, costo estimado y razón.
- [x] Enter con advice `one_shot_route` abre confirm explícito antes de gastar y ejecuta `ebrain route --json --cap <cap>`.
- [x] Enter con advice de sesión lanza el agente recomendado y envía el prompt inicial a la sesión tmux.
- [x] Frontier sigue confirm-only.
- Tests: `tui/test/launch.test.ts`.

## F6.6C — Workflow/Skill memory `[x]`

- [x] Contrato `ebrain workflows list/search/show/run --json`.
- [x] Ingesta inicial de SOPs/workflows de Second Brain + Company Brain como workflows versionados.
- [x] `ebrain workflows capture`: extraer candidatos desde session logs + memories.
- [x] `ebrain workflows skillify`: generar skill local (`SKILL.md`) con aprobación humana explícita (`--yes`). Assets/scripts permanecen curados manualmente.
- [x] TUI Memory/Workflow panel: browse, materialize prompt, attach-to-launch.

## F6.6D — Hermes-inspired learning loop `[x]`

- [x] Documentar adaptación ebrain del patrón Hermes: conversación → learning → workflow → skill (`WORKFLOW-LEARNING-LOOP.md`).
- [x] Proponer workflows repetidos, nunca escribir skills sin confirmación.
- [x] Integrar con skills federadas existentes (`list_skills`/`get_skill`) y `ebrain remember`.

## F6.6E — Unified cost ledger v2 `[x]`

- [x] `ebrain cost --json`: ledger unificado por provider/agent/model/session/workflow.
- [x] OpenRouter: costo real desde `usage.cost` + tokens; fallback queda marcado `estimated`.
- [x] OpenAI/Gemini: adapter sidecar de tokens/costo explícito; sin precio queda `token-only`, nunca USD inventado.
- [x] Claude/Cursor/OpenCode: `untracked` hasta que un adapter exponga tokens/costo verificables. No se calcula gasto de suscripción.
- [x] TUI Cost view dentro de Routing (`5`, `c`): provider, tokens, USD conocido, cap OpenRouter, sesión y workflow.
- [x] Documento operativo: `COST-LEDGER.md`.

## Gates

- Opus audita F6.6A/B antes de merge.
- Fable 5 audita el gate final cuando F6.6C-E + F6.7 estén listos.
