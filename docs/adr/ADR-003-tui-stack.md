---
type: adr
project: ebrain
id: ADR-003
created: 2026-07-12
status: accepted — ratificado en GATE F6.0 (2026-07-12) tras el reverse-engineering de las 5 TUIs; Opción D confirmada, Opción E (opentui) evaluada y rechazada
tags: [ebrain, tui, stack, tmux, bun, flowclock, orquestación]
related: [ADR-002-unified-harness.md, ULTRAPLAN-TUI.md, SPRINT-TUI.md, ../prompts/CLAUDE-DESIGN-BRIEF.md]
---

# ADR-003 — Stack de la TUI ebrain: bun + tui-kit de FlowClock, tmux como sustrato de sesiones, contrato CLI-first

## Contexto

F0–F5 dejaron ebrain **funcional pero plano**: motor (gbrain/PGLite), harness unificado (6 agentes), memoria agéntica permanente (L1→L3), routing capado (OpenRouter), CLI dispatcher (`ebrain`). El régimen operativo diario de Eduardo es **TUIs agénticas** (Claude Code, Codex, gemini-cli, OpenCode, cursor-agent) — cada una con su propia superficie, ninguna con visibilidad del conjunto. Falta la capa donde todo se **ve y se orquesta**: la TUI ebrain, análoga a lo que la TUI de FlowClock es sobre la CLI de FlowClock (patrón ya probado en casa).

Restricciones duras que gobiernan la decisión:

- **Hardware:** ProBook Celeron, 4 GB RAM (~150–350 MB libres con un agente vivo). La TUI convive con 1 agente pesado (norma: un interactivo a la vez).
- **No construir de cero** (mandato explícito de Eduardo): reusar lo que existe — propio o de terceros battle-tested.
- **Stack existente:** gbrain = TypeScript/bun; `route.ts` = TypeScript/bun; harness = bash; FlowClock = TypeScript con **tui-kit propio de CERO dependencias** (`src/lib/tui/`: screen/draw/layout/input/lineedit ≈ 900 líneas + app/views/palette ≈ 1.750 líneas, autoría de Eduardo, en producción diaria).
- **tmux 3.2a ya instalado** y es el estándar de multiplexación de PTYs.
- **Lock de PGLite:** un solo proceso puede sostener el brain → la TUI NO puede sostener una conexión gbrain persistente sin bloquear a los agentes (lección F5).

## Decisión (3 planos)

### 1. Lenguaje/runtime + framework de render: **TypeScript sobre bun, con el tui-kit extraído de FlowClock**

| Opción | A favor | En contra | Veredicto |
|---|---|---|---|
| **A. Ink/React** (lo que usan Claude Code y gemini-cli) | Ecosistema, componentes listos | Runtime React + reconciler = RAM/CPU que el Celeron no tiene; árbol de deps grande; no reusa nada propio | ✗ |
| **B. Go + bubbletea** (opencode v1, claude-squad, crush) | Binario liviano, ecosistema TUI maduro | Toolchain nuevo; CERO reuso de route.ts/kit/gbrain-client; todo cruce TS↔Go es shell-out | ✗ |
| **C. Rust + ratatui** (codex) | El más liviano | Iteración más lenta para equipo-de-uno; mismo problema de reuso que B | ✗ |
| **D. bun + tui-kit FlowClock (extraído)** ✅ | Cero deps de render; ~2.6K líneas propias ya probadas; misma lengua que gbrain/route.ts (import directo); bun ya es prerequisito; `bun build --compile` disponible si se quiere binario | El kit hay que extraerlo/generalizarlo (~2–3 tareas); no trae widgets exóticos | **ELEGIDA** |

FlowClock es AGPL pero de autoría de Eduardo → reuso en repo propio sin fricción. El kit se copia (no se symlinkea) a `tui/src/kit/` y diverge como librería de ebrain; si madura, se extrae a paquete compartido (fuera de alcance F6).

### 2. Sustrato de sesiones agénticas: **tmux como data plane; la TUI es control plane**

El requisito más caro es "ver y orquestar N terminales agénticas vivas". Opciones:

| Opción | A favor | En contra | Veredicto |
|---|---|---|---|
| **A. node-pty + emulador VT100 propio/xterm-headless** | Todo in-process | ES construir un multiplexor de terminal desde cero (meses); frágil; RAM extra por sesión; las sesiones mueren si la TUI muere | ✗ |
| **B. tmux (control por CLI: `new-session`/`capture-pane`/`send-keys`/`attach`)** ✅ | CERO código de emulación; **las sesiones sobreviven a la TUI** (crash-safe — el agente sigue trabajando); peek en vivo barato (`capture-pane -p`); attach = fidelidad total; scriptable y testeable; patrón probado por claude-squad | Dependencia de tmux (ya instalada); peek es snapshot-por-poll, no stream | **ELEGIDA** |
| **C. Zellij** | Moderno | Modelo de plugins WASM/Rust, menos scriptable por CLI, no instalado | ✗ |

Convención: sesiones tmux `ebr-<agente>-<slug>` (ej. `ebr-claude-korvex`, `ebr-route-batch1`). La TUI las crea **con el harness inyectado** (env + cwd + comando del adapter), las lista, las espía (`capture-pane`, poll ≤1 Hz solo del panel visible), les manda prompts (`send-keys`, con confirmación), y hace handoff a interacción plena (`attach`/`switch-client` — la TUI se suspende y se recupera al detach). Matar sesión = confirmación explícita.

### 3. Frontera de API: **contrato CLI-first con `--json`**

La TUI **no implementa lógica de negocio**: cada panel es el render de un subcomando `ebrain … --json` (o de un tool MCP). Lo que la TUI necesite y la CLI no tenga, **primero se agrega a la CLI** (con contract-test), después se renderiza. Esto mantiene la promesa agent-native (los mismos JSON los consumen agentes y scripts), hace la TUI testeable por snapshot, y deja la CLI como única superficie de verdad — el patrón FlowClock (`dashboard.ts`/`stats.ts` alimentan la TUI).

**Corolario del lock PGLite:** la TUI consume memoria/brain vía llamadas **cortas** y **lock-aware** (mismo patrón doctor/status de F5): si hay un `serve` vivo, degrada a caché/último-conocido con aviso, nunca se cuelga ni compite por el lock. La opción "daemon compartido HTTP-MCP propiedad de la TUI" (que resolvería el lock de raíz) se estudia como **ADR-004 en F6.4** — no se decide acá.

## Estética (insumo del design system, no decisión de stack)

Lenguaje visual = el canon de las TUIs agénticas que Eduardo usa a diario: **Claude Code + OpenCode** (fase 6.0 les hace reverse engineering formal, junto a codex/gemini-cli/cursor-agent). Elementos ya fijados por Eduardo: wordmark de título **estilo OpenCode** (pixel-block bicolor), prompt box con borde de acento, footer cwd:branch + versión, hint bar de atajos, paleta oscura disciplinada. El design system se genera en Claude Design (brief: `docs/prompts/CLAUDE-DESIGN-BRIEF.md`) y aterriza en `design-system/` → tokens mapeados a `tui/src/theme.ts`.

## Consecuencias

- La TUI queda en `~/eBrain/tui/` (package bun propio); entrypoint `ebrain ui`.
- Testing sin PTY real: el kit renderiza a buffer de string → snapshots (`bun test`); input simulado por secuencias de teclas; integración de sesiones contra un **fake-agent** (`scripts/fake-agent.sh`) dentro de tmux.
- El attach es un handoff de pantalla completa (la TUI se suspende) — no hay "terminal embebida" renderizada por nosotros en v1. El peek en vivo del panel Sessions cubre la visualización pasiva.
- RAM presupuestada: TUI (bun) ≤ 100 MB RSS; gobernador de RAM en el launch flow impide un segundo agente pesado sin override explícito (la norma "uno a la vez" se vuelve mecanismo).
- Riesgo aceptado: poll de `capture-pane` consume CPU en el Celeron → throttle y solo-panel-visible son requisitos de la fase 6.4, no optimizaciones futuras.

## Ratificación

Esta ADR se ratifica (o corrige) en el **GATE F6.0**, cuando el reverse engineering de las 5 TUIs confirme que el kit FlowClock + tmux cubren la anatomía observada (layout, input model, slash palette, theming). Si el RE revela un requisito que el kit no puede cubrir a costo razonable, se reabre la opción B (Go/bubbletea) ANTES de escribir código de app.

### Resolución — GATE F6.0 (2026-07-12) · `[AUDIT_PASS]`

El RE de las 5 TUIs (`discovery/tui/{opencode,codex,gemini-cli,claude-code,cursor}.md` + `_synthesis.md`) confirmó el ADR y **reveló una opción nueva que se evaluó y rechazó**:

- **D1 (stack de render) — Opción D RATIFICADA.** El RE reveló que OpenCode ya no corre en bubbletea/Go ni en Ink, sino en **`@opentui/{core,solid,keymap}`** (Bun/TS) — lo que **confirmó el runtime bun+TS** pero abrió una **Opción E: adoptar opentui** (no contemplada al escribir el ADR). Evaluada en `_synthesis.md §2` y **rechazada**: (a) las "batteries" de opentui (streaming/markdown/diff/code-highlight) brillan justo donde ebrain NO juega — ebrain **orquesta** las TUIs de los agentes vía tmux, no renderiza chat; (b) E paga binarios nativos por OS/arch/libc + tree-sitter WASM (supply-chain/peso) sin beneficio para el scope, en una laptop mono-plataforma (solo linux-x64) de 4GB; (c) "no construir de cero" se satisface con D (reuso del kit propio de 2.6K loc + tmux — no se construye ni renderer ni multiplexor). Gap-list acotado (`_synthesis.md §4`): solo **ScrollList y Table** con trabajo real.
- **Decisión de Eduardo (fork D-vs-E elevado, no auto-aprobado):** **D**. De OpenCode solo se quería el **estilo**, ya capturado en el `design-system/` legítimo de ebrain (export de Claude Design). **No se adopta opentui.**
- **D2 (tmux data plane), D3 (CLI-first `--json`), rechazo de Ink (opción A): RATIFICADOS por evidencia convergente de primera mano.** Dos referentes independientes (OpenCode y Claude Code) resuelven "N agentes vivos" con **dashboard + peek + full-attach, sin tabs embebidas** = exactamente el plano tmux. La evidencia de costo de Ink (gemini: warn a 7GB RSS, doble reconciler, yoga, 4 firefights) es de primera mano.
- **Steer de Eduardo para la construcción:** portar activamente UX de las TUIs de referencia, **especialmente el `agent view` de Claude Code** (cambiar entre ver qué hace cada agente; lanzar/observar múltiples agentes) → blueprint directo del **panel Sessions** (`_synthesis.md §4`: filas agrupadas por estado, `Space`=peek, `Enter`=attach, `←`=detach, auto-resumen throttled ≤1/15s → throttle del `capture-pane`). Los patrones stack-agnósticos a robar están listados en `_synthesis.md §4`.

**Conclusión:** ADR-003 aceptado tal cual (D+tmux+CLI-first). No se reabre bubbletea. Desbloquea **FASE 6.1** (CLI backend) ‖ **6.2.2** (el paso humano 6.2.1 ya está hecho: Eduardo exportó `design-system/`).
