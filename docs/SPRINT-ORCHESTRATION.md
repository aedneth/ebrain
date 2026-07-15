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
2. identificar las capacidades de la tarea y elegir de forma explicita su target/perfil;
3. ver costo/cap/modelos antes de ejecutar;
4. lanzar el trabajo o correrlo por OpenRouter;
5. convertir procesos repetidos en workflows/skills accionables;
6. ver gasto por proveedor/agente/modelo/sesión/workflow.

Regla de arquitectura: la TUI no lee YAML/JSONL ni secretos directo. Toda superficie nueva nace como CLI `--json` contract-tested y la TUI consume ese contrato. ADR-005 prohíbe presentar un modelo como "mejor" por reglas o benchmarks cambiantes: el usuario gobierna perfiles y la UI muestra evidencia fechada, no veredictos.

## F6.6A — OpenRouter stack visible y operable `[x]`

- [x] `ebrain routing --json`: contrato read-only para capacidades OpenRouter, chains winner/fallback/floor, pricing verificado cuando existe, gasto MTD por capability y comando operable.
- [x] Routing tab consume el contrato nuevo y muestra cadenas reales; se elimina la nota “pending routing --json contract”.
- [x] Tests: `cli/routing.test.ts`, `cli/contract.test.ts`, `tui/test/knowledge/contracts.test.ts`, `tui/test/knowledge/panels.test.ts`.
- Verify vivo: `ebrain routing --json` muestra 7 capabilities (`coding`, `agentic`, `web_design`, `reasoning`, `long_context`, `terminal`, `general`) con slugs reales del stack chino.

## F6.6B — Launch task router `[x]` (supersedido por ADR-005)

- [x] Launch conserva el grid manual de agentes.
- [x] `t` abre composer de tarea; Enter pide `ebrain advise --json`.
- [x] La vista muestra task, capability, lane, agent, model, costo estimado y razón.
- [x] Enter con advice `one_shot_route` abre confirm explícito antes de gastar y ejecuta `ebrain route --json --cap <cap>`.
- [x] Enter con advice de sesión lanza el agente recomendado y envía el prompt inicial a la sesión tmux.
- [x] Frontier sigue confirm-only.
- Tests: `tui/test/launch.test.ts`.

> Registro historico: F6.6B hizo visible el routing y el costo, pero el advisor determinista no es
> un contrato OSS valido. F6.6.1-6.6.4 lo sustituye por Task Profile + perfiles gobernados por el
> usuario; no se agregan reglas de "mejor modelo" sobre esta base.

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

## F6.6.1 — Task Profile, no advisor `[x]`

- [x] ADR-005: retirar la semantica de recomendacion, creditos y suscripciones del advisor.
- [x] Nuevo contrato `ebrain task-profile --json`: senales explicables/editables y modos compatibles; `ebrain advise` queda alias de compatibilidad sin afirmar ranking.
- [x] La TUI reemplaza advice por Task Profile: Enter conserva el agente seleccionado manualmente y no dispara route/sesion desde una clasificacion.
- **Verify:** `cli/advise.test.ts`, `cli/contract.test.ts`, `tui/test/{launch,knowledge/contracts}.test.ts`; CLI 161/0, TUI 371/0; smokes `task-profile` + alias verdes. Ninguna salida incluye creditos, suscripciones, ranking ni USD de sesion.

## F6.6.2 — Perfiles de ejecucion y catalogo de evidencia `[x]`

- [x] Nuevo contrato `ebrain profiles {list,show,validate,init,catalog-add,create} --json` y store local sin secretos, con permisos privados.
- [x] Perfil = modelos/orden/fallback elegidos por el usuario; catalogo = metadata con fuente y `as_of`, sin auto-seleccion. `catalog-add` exige procedencia/fecha antes de que `create` acepte un modelo.
- [x] Migracion conservadora: `profiles init --yes` materializa el stack chino existente como `legacy-openrouter`, no como default universal; `EXECUTION-PROFILES.md` documenta el setup plug-and-play.
- **Verify:** `cli/profiles.test.ts` + `cli/contract.test.ts`; smoke temporal `init -> catalog-add -> create -> validate`, permisos store/dir 600/700 y modelos no catalogados rechazados antes de guardar.

## F6.6.3 — Targets agenciales reales `[x]`

- [x] Extender manifests con capacidad declarativa de selector de modelo, provider y argv estructurado.
- [x] Primer target: sesion OpenCode/OpenRouter con `--model provider/model`; otros adapters solo se habilitan despues de comprobar su CLI.
- [x] `targets launch` registra un evento `untracked` con agente/sesion/modelo/capability; no inventa tokens/USD ni scrapea cuotas.
- **Verify:** `cli/targets.test.ts`, `cli/sessions.test.ts`; argv exacto, control characters/targets no declarados/capabilities ausentes fallan antes de tmux; `ebrain targets list --json` detecta solo `opencode-openrouter`.

## F6.6.4 — Launch Wizard gobernado por usuario `[ ]`

- [ ] Flujo: tarea -> capability editable -> target -> perfil/modelo -> cwd/proyecto seguro -> preview -> confirmacion.
- [ ] Preview muestra norms, MCP daemon, memoria, workflow, RAM, argv efectivo y estado de costo verificable.
- [ ] Frontier/permisos altos/USD estimado nunca son default y exigen confirmacion separada.
- **Verify:** reducer/snapshots + E2E contra fake-agent; deny-list por symlink, preview y confirmaciones cubiertos.

## F6.6.5 — Prompt composer y evidencia operativa `[ ]`

- [ ] Composer multiline -> sesion target -> preview de pane -> confirmacion -> `sessions send` exacto.
- [ ] Historial local factual de lanzamientos, sin prompt ni secretos; no aprende ni cambia perfiles automaticamente.
- [ ] Esquema opcional de benchmark/evidencia con fuente, fecha, version y tarea; solo informativo.
- **Verify:** fake-agent recibe bytes exactos; schema rechaza evidencia sin procedencia/fecha y el historial no contiene prompts.

## Gates

- Opus audita F6.6.1-6.6.5 antes de merge: compatibilidad de argv, no afirmaciones de recomendacion, secretos, deny-list y telemetria.
- Fable 5 audita el gate final cuando F6.6C-E + F6.6.1-6.6.5 + F6.7 estén listos.

## Diferido post-ship — evidencia de benchmarks

`docs/BENCHMARK-EVIDENCE-PLAN.md` fija la integracion futura de OpenCompass, LiveBench,
LMArena, SWE-bench y Terminal-Bench: importable, fechada, opt-in y sin auto-routing. No bloquea
F6.6/F6.7 ni agrega una dependencia pesada al Celeron.
