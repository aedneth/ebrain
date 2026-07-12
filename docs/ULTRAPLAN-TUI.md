---
type: ultraplan
project: ebrain
program: F6 — TUI (régimen operativo visual)
created: 2026-07-12
modified: 2026-07-12
status: proposed
tags: [ebrain, tui, orquestación, multi-agente, tmux, design-system, advisor]
related: [ULTRAPLAN.md, SPRINT-TUI.md, adr/ADR-003-tui-stack.md, prompts/CLAUDE-DESIGN-BRIEF.md, ROUTING.md, model-registry.md, human-checklist.md]
---

# ULTRAPLAN — ebrain TUI (F6): la capa de orquestación visual

> **Tesis:** F0–F5 construyeron el motor, el harness, la memoria y el routing. F6 construye la **superficie operativa diaria**: una TUI (al estilo Claude Code / OpenCode, patrón FlowClock CLI→TUI) que envuelve TODO ebrain — desde donde Eduardo inicia proyectos, carga contexto, lanza y observa terminales agénticas multi-proveedor (Claude Code, Codex, gemini-cli, OpenCode, cursor-agent, stack chino ruteado), consulta y alimenta la memoria agéntica permanente, y vigila gasto y salud. La TUI no agrega lógica: **la CLI es el backend; la TUI es el cockpit.** Esto es lo que hace a ebrain una evolución operativa por encima de gbrain: gbrain tiene motor; ebrain tiene motor + harness multi-proveedor + memoria cross-agente + **puente de mando**.

━━━

## 0. Por qué ahora

- F5 cerró con ebrain en "régimen operativo": todo funciona, pero se opera con comandos sueltos (`ebrain status`, `ebrain q`, `ebrain route`, tmux a mano). El costo de fricción diario es alto y la visibilidad del conjunto es nula.
- El hábito real de Eduardo es vivir dentro de TUIs agénticas. La conclusión natural: **su propia TUI que las orqueste a todas**, con el contexto de todas las capas CKIS detrás.
- El problema de fondo que ebrain resuelve — **contexto/memoria persistente entre sesiones, entre agentes, entre proveedores** — hoy es invisible. La TUI lo hace tangible: ver qué contexto se inyecta, qué aprendió cada sesión, qué recuerda el sistema.

## 1. Definición operativa

**ebrain TUI** (`ebrain ui`) = aplicación de terminal, estética Claude Code/OpenCode, que:

1. **Orquesta sesiones agénticas** multi-proveedor sobre tmux: crear (con harness inyectado), listar, espiar en vivo, promptear, attachear, matar.
2. **Renderiza el estado del sistema**: brain (UP/lock/sources), gasto MTD vs caps, flota harness (6 agentes), memoria (learnings/sesiones recientes), doctor.
3. **Opera la memoria**: `remember` desde la UI, búsqueda semántica (`q`/`think`) con citas, browse de session-logs cross-agente.
4. **Recomienda el carril correcto** (advisor): tarea → agente+modelo+costo estimado, respetando routing.yaml/model-registry y el candado nunca-auto-frontier.
5. **Slash command palette** (`/` o `ctrl+p`), help overlay, keybindings — las convenciones que Eduardo ya tiene en los dedos.

**Qué NO es (v1):** no es un emulador de terminal propio (attach = handoff a tmux); no es un chat con LLM (los agentes chatean; la TUI orquesta); no reemplaza a las TUIs de los proveedores (las hospeda y coordina); no ejecuta agentes en paralelo sin límite (gobernador RAM, norma 4 GB).

## 2. Arquitectura (3 planos — detalle en ADR-003)

```
┌───────────────────────── ebrain TUI (bun + tui-kit FlowClock) ─────────────────────────┐
│  wordmark pixel-block ·  tabs: Overview │ Sessions │ Memory │ Routing │ Fleet │ Doctor  │
│  command palette (/, ctrl+p) · help (?) · hint bar · footer cwd:branch · theme tokens  │
└──────────────┬─────────────────────────────────────────┬──────────────────────────────┘
               │ PLANO CONTRATO: ebrain CLI --json        │ PLANO DATA: tmux 3.2a
               │ (status/doctor/spend/memory/fleet/       │ sesiones ebr-<agente>-<slug>
               │  sessions/advise — contract-tested)      │ new-session (harness env) ·
               │                                          │ capture-pane (peek ≤1Hz) ·
        harness/core (bash) · route.ts · gbrain CLI       │ send-keys (confirm) · attach
        (lock-aware SIEMPRE) · MCP ebrain (llamadas       │ (handoff) · kill (confirm)
        cortas, jamás conexión persistente)               │
               │                                          │
        memoria L1 .brain → L1.5 agent-memory → L2 Dev Brain → L3 vault (sin cambios)
```

Principios no negociables heredados: markdown+git canónico; lock-awareness PGLite en TODA lectura de brain; secretos jamás renderizados (el theme incluye un scrubber de patrones en cualquier stream que se pinte); cliente-deny (brisas/dekko) también en la TUI — no aparecen como cwd sugeridos ni como sources.

## 3. Decisiones duras (resueltas y pendientes)

| # | Decisión | Estado |
|---|---|---|
| D1 | Stack: bun + tui-kit extraído de FlowClock (no Ink/React, no Go, no Rust) | **ADR-003 proposed** — ratificar en GATE 6.0 |
| D2 | Sesiones: tmux data plane, TUI control plane (sobreviven a la TUI) | **ADR-003 proposed** |
| D3 | Frontera: CLI-first con `--json`; la TUI no implementa lógica | **ADR-003 proposed** |
| D4 | Gobernador RAM: 1 agente pesado por defecto; 2º requiere override explícito con lectura real de `/proc/meminfo` | **fijada** (norma → mecanismo) |
| D5 | Candado frontier: el advisor puede RECOMENDAR frontier; lanzarlo exige confirmación interactiva de Eduardo. Cero auto-escala | **fijada** (hereda F4) |
| D6 | Daemon compartido HTTP-MCP (la TUI es dueña del serve; agentes se conectan a él → mata el lock PGLite de raíz) | **ADR-004 — se estudia en 6.4**, fallback = degradación lock-aware |
| D7 | Naming: comando `ebrain ui`; wordmark "ebrain" pixel-block bicolor estilo OpenCode | **fijada por Eduardo** (estética) |
| D8 | Distribución: `bun run` en dev; `bun build --compile` a binario solo si el arranque en frío del Celeron lo justifica | **medir en 6.7** |

## 4. Fases (resumen — tareas atómicas en SPRINT-TUI.md)

| Fase | Nombre | Entrega verificable | Gate |
|---|---|---|---|
| **6.0** | Reverse engineering de las 5 TUIs de referencia | `discovery/05–10`: anatomía de Claude Code, OpenCode, codex, gemini-cli, cursor-agent + matriz síntesis + requisitos del kit | ratifica ADR-003 |
| **6.1** | CLI robusta (backend contract) | `--json` en status/doctor/spend + subcomandos nuevos `sessions/fleet/memory/advise` con contract-tests | CLI = API completa |
| **6.2** | Design system | Brief → Claude Design (humano) → export a `design-system/` → `design-sync-tui` → `tui/src/theme.ts` | tokens en código, cero hardcode |
| **6.3** | tui-kit + app shell | Kit extraído y generalizado, shell con tabs/palette/help/theme/resize, `ebrain ui` bootea | snapshots verdes, RSS<100MB |
| **6.4** | Sustrato de sesiones | Módulo tmux + `ebrain sessions` real + panel Sessions (list/peek/attach/kill) + gobernador RAM + estudio ADR-004 | fake-agent E2E verde |
| **6.5** | Paneles de conocimiento | Overview, Memory (search/remember/browse), Routing/Spend, Fleet/Doctor | cada panel = un `--json` |
| **6.6** | Orquestación + advisor | Launch flow (agente+modelo+cwd+contexto preview), advisor v1, prompt-send | 10 tareas canónicas bien ruteadas |
| **6.7** | Hardening + ship | Edge cases (tmux caído, lock, sin red), perf Celeron, docs/runbook, retro, gates finales | criterios §7 = 8/8 |

Disciplina idéntica a F0–F5: una tarea = un worker = un resultado verificable; Opus audita cada gate `[AUDIT_PASS]`; commit por fase; maker ≠ checker (Fable solo para auditorías de alto riesgo); todo gasto declarado antes de correr.

## 5. Advisor (motor de recomendación de carril)

**Entrada:** descripción de la tarea (+ flags: proyecto, horizonte, presupuesto). **Salida:** carril recomendado + razón + costo estimado + alternativas.

- **v0 (6.1, determinista):** clasificador por reglas (keywords/regex → capacidad `coding|agentic|web_design|long_context|terminal|general`) sobre `routing.yaml` + `model-registry.md` (cadenas ganador/fallback/floor ya verificadas en vivo). Mapeo capacidad→carril: one-shot barato → `ebrain route --cap X`; sesión interactiva de construcción → Codex (crédito $2500) u OpenCode+stack; auditoría/arquitectura → Claude Code (Opus/Fable, **solo con confirmación**); multimodal/web → gemini.
- **v1 (6.6):** señales adicionales — memoria ebrain (¿qué carril funcionó antes en tareas similares? vía `ebrain q`), gasto MTD restante por cap, RAM disponible, e historial de sesiones. Clasificación LLM opcional vía floor `:free` (cero costo), NUNCA frontier.
- **Candado:** frontier siempre es recomendación, jamás default; el launch de frontier pinta advertencia de costo y exige confirmación. Registro: cada recomendación aceptada/rechazada se loggea (JSONL) → el advisor aprende de Eduardo con datos, no con vibes.

## 6. Pipeline del design system

1. **Brief** (`docs/prompts/CLAUDE-DESIGN-BRIEF.md`, ya escrito) → Eduardo lo pega en **Claude Design** (paso humano).
2. Iterar con el checklist §3 del brief → **export zip → `design-system/`** (vendored, read-only, commiteado).
3. `scripts/design-sync-tui` mapea tokens web → **tokens TUI** (`tui/src/theme.ts`): hex → truecolor + fallback 256-colores, spacing px → celdas, type scale → jerarquía bold/dim/reverse, componentes → specs de widgets del kit.
4. Los mockups del export son la **referencia de aceptación visual** en cada gate 6.3–6.7 (mismo rol que en busnet/dekko).

## 7. Criterios de éxito (medibles, estilo f5-success-criteria)

1. `ebrain ui` bootea **< 1.5 s** en el Celeron con RSS **< 100 MB**.
2. **Todo panel** está respaldado por un subcomando `ebrain … --json` con contract-test (cero lógica huérfana en la TUI).
3. Desde la TUI se lanza una sesión Claude Code **con harness completo inyectado**; al cerrarla existe rastro de write-back (session log en `.brain/` federable).
4. Peek en vivo de ≥2 sesiones tmux sin romper el gobernador RAM (2ª pesada = override explícito).
5. El advisor rutea correctamente **10 tareas canónicas** de fixture (asserts contra routing.yaml/model-registry).
6. `remember` desde la TUI aparece en la memoria de la siguiente sesión de CUALQUIER agente de la flota (round-trip L1.5 probado).
7. **Cero secretos renderizados**: scrubber activo en todo stream pintado (incl. capture-pane) + test de contrato con fixture de secretos falsos.
8. Paleta/glifos/spacing salen de `design-system/` vía theme.ts (**cero hardcode**, verificable por grep).

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Poll de `capture-pane` come CPU en el Celeron | Throttle ≤1 Hz, solo panel visible, pausa en blur; medir en 6.4 (no en 6.7) |
| TUI compite por el lock PGLite y bloquea agentes | Regla dura: llamadas cortas lock-aware; caché último-conocido; ADR-004 como fix de raíz |
| El kit FlowClock no cubre la anatomía observada en el RE | GATE 6.0 ratifica ADR-003 ANTES de escribir app; plan B = bubbletea |
| Claude Code / cursor-agent son cerrados (RE limitado) | RE conductual (anatomía observada, keybinds, screenshots/asciinema) — suficiente: copiamos patrones de UX, no código |
| send-keys manda un prompt al agente equivocado | Confirmación con preview del target (sesión+pane+últimas líneas) antes de enviar |
| Scope creep (chat embebido, emulador propio, N features) | §1 "Qué NO es" es contractual; cambios de alcance = nueva decisión de Eduardo |
| Auto-backup (15 min) pisa commits del programa | Ya mitigado: gitignore endurecido F5 + commit-por-tarea temprano (lección #7 de ebrain-build-lessons) |

## 9. Delegación y presupuesto

- **Opus (Claude Code) = orquestador/auditor**: gates, ADRs, spot-checks. **Workers Sonnet** (o Codex con su crédito): tareas atómicas del SPRINT — el RE de 6.0 es paralelizable en 5 workers como en F0. **Fable 5**: solo auditorías de alto riesgo (GATE 6.0, 6.4 y 6.7).
- Gasto API estimado del programa: RE + workers ≈ el patrón F0 (~$3–6 si es vía API; ~$0 si los workers corren en Codex/Claude suscripción). El design system = Claude Design (plan existente). Runtime nuevo: $0 (tmux/bun locales).
- Pasos humanos (se difieren a checklist, patrón F5): generar/iterar/exportar en Claude Design (6.2), aceptación visual en gates, ratificación de ADR-003/004.

━━━

**Norte:** cuando F6 cierre, el día de Eduardo empieza con `ebrain ui` — no con siete terminales sueltas. Desde ahí: estado del sistema de un vistazo, lanzar el agente correcto con el contexto correcto al costo correcto, ver todo lo que se está construyendo, y que cada sesión deje memoria permanente. Esa capa de mando es la diferencia entre "tener infraestructura" y **operar una fábrica**.
