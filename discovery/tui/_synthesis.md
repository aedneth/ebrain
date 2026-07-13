---
type: discovery-synthesis
project: ebrain
program: F6 — TUI
subject: Síntesis del reverse engineering de las 5 TUIs de referencia + FlowClock
created: 2026-07-12
inputs: [opencode.md, codex.md, gemini-cli.md, claude-code.md, cursor.md]
tags: [ebrain, tui, reverse-engineering, sintesis, gate-6.0, adr-003]
related: ["../../docs/adr/ADR-003-tui-stack.md", "../../docs/SPRINT-TUI.md", "../../docs/ULTRAPLAN-TUI.md"]
---

# Síntesis F6.0 — RE de OpenCode · codex · gemini-cli · Claude Code · cursor-agent (+ FlowClock)

> Insumo del **GATE 6.0.8**. Consolida los 5 reportes de `discovery/tui/` + el inventario del tui-kit de FlowClock, produce la matriz rúbrica, el canon de keybindings propuesto, el gap-list del kit con costo por widget, y **plantea la bifurcación central de arquitectura (D vs E)** que el RE reveló y que ningún worker evaluó (los workers compararon D solo contra las opciones originales A/B/C del ADR).

━━━

## 1. Matriz rúbrica × TUI (stack de render y modelo, la dimensión que decide el gate)

| TUI | Stack de render | Layout/wordmark | Input + palette | Slash commands | Theming | Modelo de sesiones | Peso / apto 4GB |
|---|---|---|---|---|---|---|---|
| **OpenCode** | **`@opentui/core` (renderer nativo, binarios prebuilt) + `@opentui/solid` (SolidJS→terminal) + `@opentui/keymap`**, sobre Bun/TS | wordmark pixel-block bitmap en strings (`logo.ts`) render char-por-char con bevel `tint()`; prompt box **border-left de acento** color-codeado por agente; footer cwd:branch·MCP·versión; hint bar generada del keymap vivo | mode-stack + leader (`ctrl+x`); palette = `DialogSelect` alimentado por introspección del keymap; which-key overlay | proyección del command object (`slashName`) + comandos server-side; sin router propio, `startsWith("/")` en submit | JSON `defs`(step-scale)→`theme`(roles semánticos, dark/light); truecolor + **fallback ANSI generativo**; 32 themes | **sin tabs** — 1 route a la vez; sesiones = árbol padre/hijo; quick-switch `<leader>1..9`; switcher = modal | medio-alto: **binarios nativos por OS/arch/libc + tree-sitter WASM** |
| **codex** | **Rust + ratatui**, pero con `ratatui::Terminal` **forkeado** (`custom_terminal.rs`), trait `Renderable`+flex propio, viewport inline | banner ASCII animado (`ascii_animation.rs`); bottom pane (composer); status line | ratatui key capture; `FrameRequester` push-based con coalescing (1 repaint/tick, cap 120fps) | definición+dispatch propios | `color.rs`, truecolor/256 | conversación única + subagentes | el más liviano (nativo), pero **cero reuso en TS** |
| **gemini-cli** | **React 19 + Ink forkeado** (`@jrichman/ink`) + `react-reconciler` + `yoga-layout` | 3 logos ASCII por ancho + `ink-gradient`; footer responsive column-priority; StatusRow con `ResizeObserver` | `KeypressContext` (parser ANSI propio) + dispatch por prioridad (Low/Normal/High/Critical); enum `Command` (82 acciones) | contrato `SlashCommand` tipado (kind/completion/subCommands), ~60 archivos | 19 themes + `no-color`; tokens semánticos vía getter-proxy; `chalk` degrada 256/16 | **sin multi-sesión**; `SessionBrowser` = picker | **catastrófico 4GB: warn a 7 GB RSS**, 4 firefights de perf |
| **Claude Code** | Node/TS, **Ink/React** (observed/inferred); flicker/memoria documentados en sesiones largas | sin banner persistente; `claude agents` view (dashboard); input box con border por modo; statusline scriptable | `shift+tab` cicla modos; `/` palette (built-ins+skills+MCP prompts); `@` files, `!` bash | comandos = **fusionados con skills**; taxonomía 3-capas (hard-coded/prompt-skill/background-workflow) | 7 presets + custom JSON (tokens semánticos, `#hex`/`ansi256`/`ansi:name`); shimmer-pairs; 8 colores fijos de subagente | **sin tabs**; `claude agents` = dashboard peekable agrupado por estado, `Space`=peek/`Enter`=attach/`←`=detach, auto-resumen throttled ≤1/15s; sesiones = JSONL local | Ink (circunstancial: mismo costo que gemini) |
| **cursor-agent** | **no documentado públicamente** (confirmado ausente, no gap de cuota) | prompt/spinner; muestra tool calls/diffs | interactivo vs headless `-p`; newline seguro `Ctrl+J`/`Alt+Enter` (NO `Shift+Enter` bajo tmux) | catálogo oficial 25+ (`/plan /ask /debug /shell /vim /clear /resume /fork /rename /model /max-mode /config`…) | **no existe** (solo toggles funcionales; bug de contraste conocido) | threads con `/resume`,`/fork`; `&` = cloud/background (trampa de observabilidad) | n/a — se hospeda vía tmux |
| **FlowClock** (kit propio) | **bun + tui-kit zero-dep** (`screen`+`diffFrames`, `draw`, `layout`, `input`, `lineedit` ≈900 loc + `palette`/`confirm`/`app`/`views` ≈1.7K) | `panel`, `gauge`, `barH`, `sparkline`, `kv`; layout `splitV/splitH` | `input.ts` (parseKey/tokenize/paste bracketing); `palette.ts` (276) | `palette.ts` | — (se inyecta design-system→theme.ts) | app propio | **probado a diario en el Celeron 4GB de Eduardo** |

**Convergencias duras (independientes) que fijan decisiones:**
1. **Ningún referente resuelve "N sesiones vivas a la vez" con tabs embebidas.** OpenCode (routes, quick-switch) y Claude Code (`agent view`) coinciden: **1 sesión = pantalla completa, N sesiones = dashboard aparte + peek + full-attach.** → **tmux como data plane (ADR-003 D2) queda doblemente validado por los dos referentes estéticos.** La parte difícil (cockpit multi-sesión) la resuelve tmux, no el framework.
2. **Las partes caras de una TUI agéntica (streaming de tokens, diff-render) son application-level, no primitivas de framework** — codex las construyó a mano incluso sobre ratatui. **Y ebrain v1 NO las necesita** (delega en las TUIs de los agentes vía tmux; ULTRAPLAN "no es un chat con LLM"). → se desactiva el argumento más fuerte a favor de un framework pesado.
3. **Ink/React = descartado con evidencia de primera mano** (gemini: warn a 7GB RSS, Ink forkeado, doble reconciler, yoga, 4 firefights). Claude Code lo corrobora circunstancialmente. **No revisitar A sin datos nuevos.**
4. **Theming por tokens semánticos resueltos en un singleton (nunca hex en call-sites)** aparece en los 4 referentes con theming (opencode, gemini, claude-code, +FlowClock lo hará). → valida design-system→`theme.ts` y el check "cero hardcode" del GATE 6.3.7.

━━━

## 2. ⚠️ Bifurcación central del gate: D (extraer kit FlowClock) vs E (adoptar opentui)

El RE de OpenCode reveló que **el referente estético #1 de Eduardo NO corre en bubbletea/Go ni en Ink/React, sino en `@opentui/{core,solid,keymap}`** (Bun/TS). Esto **confirma el runtime de D1 (bun+TS)** pero abre una opción que ADR-003 no evaluó:

| | **D — extraer + extender el kit de FlowClock** (ADR-003 escrito) | **E — adoptar `@opentui/{core,solid,keymap}`** (como OpenCode) |
|---|---|---|
| Qué es | Copiar el tui-kit zero-dep de Eduardo (`screen`/`draw`/`layout`/`input`/`lineedit`) a `tui/src/kit/`, generalizar ~6 widgets | Depender de opentui: JSX terminal (`<box><text><scrollbox><textarea><spinner>`), mode-stack keymap, slots/plugins, fallback ANSI generativo — todo gratis |
| A favor | 0 deps · control total · **código propio ya battle-tested en el Celeron 4GB** · sin binarios nativos · sin supply-chain · alinea "usa lo tuyo" | batteries-included (menos código de app) · reactividad fina de Solid (sin VDOM, mucho más liviano que React) · perf de render nativa · slots/plugins gratis · **alinea con "no construir de cero"** en su lectura maximalista |
| En contra | construir ScrollList + Table + 4 widgets menores (acotado, ver §4) · reimplementar measured-layout si se necesita | **binarios nativos por OS/arch/libc (8 paquetes) + tree-sitter WASM** = superficie supply-chain/peso · atado al roadmap de opentui (proyecto joven de sst) · menos "propio" · el `targetFps:60` corre igual |
| ¿Ink-evidence de gemini aplica? | n/a | **NO** — Solid no usa react-reconciler/VDOM/yoga; los costos que documenta gemini no transfieren. El riesgo de E es distinto (binarios+WASM, no RAM de reconciler) |

**Por qué el scope de ebrain inclina a D:** las batteries de opentui brillan justo donde ebrain NO va a jugar (render de chat con streaming/markdown/code-highlight/diff — eso lo hacen los agentes hospedados). Lo que ebrain SÍ necesita (chrome, panel, table, scrolllist, gauge, palette, forms, peek-de-texto, wordmark) es exactamente el territorio que el kit zero-dep cubre con un build **acotado**, sin pagar el costo de binarios nativos + WASM en una laptop mono-plataforma (solo linux-x64) de 4GB. Y **"no construir de cero" se satisface con D**: reusamos el kit propio (2.6K líneas) + tmux — no construimos ni un renderer ni un multiplexor de terminal, que son las dos cosas genuinamente difíciles.

**Recomendación de la síntesis: RATIFICAR D.** Pero es una **decisión de arquitectura de alto riesgo** que fija todo F6 y su mantenimiento a largo plazo, y toca directamente el mandato "no construir de cero" de Eduardo → **no se auto-aprueba** (norma CKIS: ningún agente se auto-aprueba en arquitectura). Se eleva a Eduardo como fork explícito **antes de escribir código de app** (esto ES el punto de decisión que la cláusula de ratificación de ADR-003 exige).

━━━

## 3. Canon de keybindings propuesto para ebrain (síntesis de convenciones observadas)

Diseñado para **no colisionar con el prefix de tmux** (`ctrl+b`), ya que la TUI puede correr dentro de tmux.

| Tecla | Acción | Fuente/convención |
|---|---|---|
| `tab` / `shift+tab` | ciclar paneles (Overview·Sessions·Memory·Routing·Fleet·Doctor) | opencode `tab` (agent cycle) |
| `/` **y** `ctrl+p` | abrir command palette | opencode (ambos) + claude-code (`/`) |
| `?` | help overlay (autogenerado del registry de keybinds) | convención universal |
| `esc` | back / cerrar overlay / interrumpir | los 5 |
| `ctrl+c` ×2 / `ctrl+d` | salir (con restauración de terminal SIEMPRE) | claude-code |
| `ctrl+l` | forzar redibujo (recuperar de display corrupto) | claude-code |
| `ctrl+r` | reverse-search sobre historial | claude-code/gemini |
| leader = `ctrl+x` | prefijo para ops de sesión (evita `ctrl+b`=tmux) | opencode |
| en panel Sessions: `a` / `k` / `p` / `Space` | attach / kill(confirm) / prompt / **peek** | SPRINT 6.4.3 + `Space`=peek de claude-code |
| en Memory: `r` | form remember (lineedit multiline) | SPRINT 6.5.2 |

Regla dura heredada de claude-code: **el hint bar y el footer se generan del keymap vivo** (nunca texto hardcodeado) → rebind seguro.

━━━

## 4. Gap-list del tui-kit FlowClock (qué construir en 6.3.2, con costo)

**Ya provisto por el kit (reuso directo, 0 build):** motor de render con frame-diff (`Screen`+`diffFrames`), layout (`splitV/splitH`), input completo (`parseKey`/paste bracketing), `panel` (caja+título), `gauge`+`barH`, `sparkline`, `kv`, `displayWidth`/`truncate`/`padTo`, `lineedit` (1 línea), `palette.ts`, `confirm.ts`. **El kit resuelve lo caro.**

| Widget a construir | Costo | Necesario para | Forma de referencia (design-system + RE) |
|---|---|---|---|
| **ScrollList** (+ scrollbar de chars) | **M-H** | Sessions, Memory | `components/data/ScrollList.jsx` + picker de claude-code (`sessions §picker`) |
| **Table** | **M** | Routing ledger, Fleet | `components/data/Table.jsx` |
| **TabBar** (6 tabs) | L-M | shell | `components/chrome/TabBar.jsx` |
| **Toast** (ok/warn/error + expiry) | L-M | transversal | `components/core/Toast.jsx` |
| **lineedit multiline** (extender `lineedit.ts`) | L-M | form remember | — |
| **TerminalPeek** (frame + texto scrubbeado) | L-M | Sessions | `components/layout/TerminalPeek.jsx` |
| **Wordmark** (desde matriz Claude Design) | L | home | `components/brand/Wordmark.jsx` + técnica `logo.ts` de opencode |
| **SessionCard** / **Badge** / **Spinner** braille / **KeyHint**/**HintBar**/**Footer** | L c/u | varios | `components/{data,core,chrome}/*` |

**Solo ScrollList y Table tienen trabajo real.** Ningún widget del gap-list exige algo que el kit no pueda dar barato → **el gap es acotado y no fuerza cambiar de stack.**

**Patrones stack-agnósticos a portar (robar), convergentes en el RE:**
- **Command object único** (opencode): un objeto por comando alimenta palette + keybind + slash. Evita el bug "3 lugares que actualizar".
- **Contrato `SlashCommand` tipado** (gemini): `kind`(origen)/`completion()`/`subCommands` → para el `/` palette sobre los `ebrain … --json`.
- **Dispatch de teclas por prioridad** (gemini: Low/Normal/High/Critical, último-suscrito gana, `true` corta propagación) → para el stack modal (dialogs/attach/confirm).
- **Footer column-priority responsive** (gemini): candidatos con prioridad+ancho medido, drop del menos prioritario + `…` cuando aprieta.
- **Border-left de acento color-codeado** (opencode): identidad por-agente sin caja completa — directo para las SessionCard/peek del cockpit.
- **Wordmark bitmap-en-strings + bevel `tint()`** (opencode `logo.ts`/`logo.tsx`): técnica exacta para render de la matriz que produjo Claude Design.
- **`agent view` de Claude Code = blueprint del panel Sessions**: filas agrupadas por estado, `Space`=peek, `Enter`=attach, `←`=detach, **auto-resumen throttled ≤1/15s** → plantilla del throttle del `capture-pane` (poll ≤1Hz).
- **Fallback ANSI generativo** (opencode `generateSystem`): derivar theme usable de la paleta ANSI reportada, ~100 líneas — resuelve el "modo 256/sin-truecolor" del GATE 6.7.1.
- **Spinner-verbs themeable + shimmer** (claude-code): personalidad barata, 0 RAM.
- **Plan-approval como menú** (claude-code): el "go" del advisor/launch flow (6.6.1) = menú de próximos-modos concretos, no yes/no.

━━━

## 5. Insumos de refinamiento para el design brief (6.0.7 → posible update de `prompts/CLAUDE-DESIGN-BRIEF.md`)

El design-system que Eduardo ya exportó de Claude Design **cubre** wordmark-matrix, tokens, 7 mockups y los componentes del gap-list — no requiere re-generación. Ajustes menores que el RE sugiere (opcionales, para una segunda pasada si se quiere):
- **Border-left de acento** ya está en el brief (PromptBox borde teal grueso) ✓ — el RE confirma que además debe **color-codearse por agente** en SessionCard/peek (usar la paleta categórica de 8). Anotarlo como estado del componente.
- **Shimmer-pair** (color base + variante clara para animación de spinner/borde) — el brief no lo menciona; es barato y da vida. Candidato a agregar como convención de token.
- **Fallback `no-color`/ANSI puro** como theme explícito (no solo "degradar") — reforzar en el brief que el theme incluya un modo ANSI-only nombrado (gemini `no-color.ts`, opencode `generateSystem`).
- Todo lo demás del brief se sostiene contra el RE.

━━━

## 6. Veredicto para el GATE 6.0.8

1. **D2 (tmux data plane), D3 (CLI-first `--json`), rechazo de Ink (opción A):** RATIFICADOS por evidencia convergente de primera mano. Sin cambios.
2. **D1 (stack de render): RATIFICAR D (kit FlowClock), NO adoptar E (opentui)** — recomendado por scope (ebrain no necesita las batteries pesadas de opentui) + costo (E = binarios nativos+WASM sin beneficio para el scope) + "no construir de cero" satisfecho por reuso de kit propio + tmux. **PERO** es decisión de arquitectura de alto riesgo → **elevar a Eduardo como fork D-vs-E antes de escribir app** (no auto-aprobar). Si Eduardo elige E, se reabre el ADR ANTES de 6.3 (cláusula de ratificación).
3. **Gap-list acotado**, canon de keybindings fijado, patrones a robar identificados. Todo listo para 6.1 en cuanto se cierre la elección de stack.
