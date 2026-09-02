# ebrain — UI kit (cockpit)

Recreación interactiva de la TUI de orquestación agéntica `ebrain`. 7 vistas navegables + overlays, todo en retícula monoespaciada 120×32 (JetBrains Mono).

## Ejecutar
Abrí `index.html`. Carga el bundle del design system (`../../_ds_bundle.js`) y compone las vistas con los componentes reales (Panel, Badge, Gauge, PromptBox, etc.).

## Navegación (teclado)
- `1`–`6`  saltar a home / sessions / launch / memory / routing / doctor
- `l` launch · `m` memory · `a` sessions
- `/`  abrir command palette (escribí para filtrar, `esc` cierra)
- en **sessions**: `k` abre el ConfirmDialog de kill
- en **doctor**: `r` re-ejecuta (spinner braille ~2s)
- toggles de overlay (palette / toast / banner / kill) arriba a la derecha, texto plano

## Vistas
- **home** — wordmark pixel-block, resumen del sistema (brain UP, spend gauge, ram, fleet), sesiones activas, últimas memorias.
- **sessions** — fleet de 6 sesiones tmux a la izquierda (badges categóricos), peek en vivo del output a la derecha (borde dim).
- **launch** — prompt de tarea, card del advisor (carril/modelo/costo/razón/alternativas), selección de 8 agentes, aviso ámbar frontier, contexto a inyectar.
- **memory** — búsqueda semántica (resultados con score violeta + source), session-logs, form remember.
- **routing** — gauges por cap, cadena ganador→fallback→floor, ledger reciente.
- **doctor** — checklist colorizado ok/warn/fail, estado de la fleet 6/6.

## Overlays (state sheet)
CommandPalette abierta · ConfirmDialog de kill (danger) · Toast de error · banner "brain locked by MCP".

## Archivos
- `index.html` — shell interactivo (estado, teclado, overlays).
- `shell.jsx` — TermFrame (grid 120×32 escalado) + Screen (chrome constante) + glue del namespace.
- `screens-a.jsx` — home, sessions, launch.
- `screens-b.jsx` — memory, routing, doctor.

## Fidelidad a la retícula
Cada vista mantiene StatusBar (fila 1) + TabBar (fila 2) + separador hairline + contenido + HintBar + Footer. Un solo momento teal fuerte por vista (panel enfocado / borde del prompt / marcador ▸). Sin emoji, sin sombras, sin gradientes.
