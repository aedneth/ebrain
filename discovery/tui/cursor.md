---
type: discovery
project: ebrain
program: F6 — TUI
subject: cursor-agent CLI reverse-engineering (behavioral — closed source)
created: 2026-07-12
vendor: closed-source (behavioral RE from public docs + observed behavior)
tags: [ebrain, tui, reverse-engineering, cursor, behavioral]
related: ["../../docs/adr/ADR-003-tui-stack.md", "../../docs/SPRINT-TUI.md"]
---

# cursor-agent CLI — RE conductual (SPRINT-TUI 6.0.6)

> **Método:** cursor-agent es closed-source → **NO hay vendor/cursor** (a diferencia de opencode/codex/gemini-cli, que sí están clonados en `vendor/` per `discovery/00-environment.md` §F6). Este reporte es 100% RE conductual: documentación pública oficial (`cursor.com/docs/cli/*`) + resúmenes de búsqueda de fuentes secundarias. Cero decompilación, cero inspección de binario.
>
> **Limitación de esta corrida:** las tools `WebFetch`/`WebSearch` agotaron su cuota de sesión (reset ~22:10 America/El_Salvador, ~3h después del momento de research) tras 3 fetches completos + 2 searches. Quedaron sin confirmar: catálogo exhaustivo de slash-commands, theming, render stack, y exit codes — cada uno se marca explícitamente abajo como **no confirmado**, no como inferencia disfrazada de hecho.

## Fuentes

**Primarias — fetched completas:**
- [cursor.com/docs/cli/overview](https://cursor.com/docs/cli/overview) — instalación, modos, sesiones, non-interactive, cloud handoff
- [cursor.com/docs/cli/using](https://cursor.com/docs/cli/using) — keybindings, modos, `@`-context, resume, MCP/rules
- [cursor.com/docs/cli/headless](https://cursor.com/docs/cli/headless) — `-p`/`--print`, output formats, `--force`/`--yolo`, `CURSOR_API_KEY`

**Secundarias — solo snippet de WebSearch, NO fetched (citadas con esa salvedad):**
- [cursor.com/blog/cli](https://cursor.com/blog/cli) — post de lanzamiento
- [learncursor.dev/guides/cursor-cli](https://www.learncursor.dev/guides/cursor-cli)
- [codegrid.app — how to use cursor-agent](https://www.codegrid.app/blog/how-to-use-the-cursor-cli-cursor-agent-from-your-terminal)
- [cheatsheets.zip/cursor-cli](https://cheatsheets.zip/cursor-cli)
- [docs.praison.ai/docs/code/cursor-cli](https://docs.praison.ai/docs/code/cursor-cli)

**Intentado y fallido por rate-limit** (no se debe asumir que estas URLs fueron leídas): `cursor.com/docs/cli/reference/parameters`, un fetch a `cursor.com/blog/cli`, y un WebSearch de theming.

━━━

## (a) Anatomía de layout

**Documentado:**
- Modo interactivo = interfaz conversacional en terminal: "interact with AI agents directly from your terminal to write, review, and modify code" — describís el objetivo, revisás cambios propuestos, aprobás comandos (cursor.com/docs/cli/overview).
- Arranque: `agent` (bare, entra a sesión interactiva vacía) o `agent "prompt inicial"` (interactiva, pre-cargada con un prompt).
- **Modo Review** (diff view) — es un sub-UI modal separado de la vista de conversación principal, se entra con `Ctrl+R`: navega hunks/archivos con flechas, permite instrucciones de seguimiento inline con `i` (cursor.com/docs/cli/using). Es el dato documentado más cercano a "cómo muestra ediciones/diffs": una revisión modal por archivo, no un stream de diffs inline en el scrollback principal.
- Selección de contexto: símbolo `@` para referenciar archivos/carpetas en la línea de input — misma UX que el `@`-mention del editor Cursor.
- Fuentes de contexto adicionales (no layout, pero relevante): MCP servers auto-detectados vía `mcp.json`; reglas de proyecto desde `.cursor/rules/` + `AGENTS.md`/`CLAUDE.md` de raíz.

**No confirmado:** no hubo captura de screenshot/diagrama ASCII del layout completo (header, status bar, spinner) en las páginas fetched antes del rate-limit — no hay cita pública verificada sobre "cómo se ve" más allá de lo anterior. No inventar barra de estado ni wordmark: tratar como desconocido.

## (b) Modelo de input

**Keybindings documentados** (cursor.com/docs/cli/using):

| Tecla | Efecto |
|---|---|
| `ArrowUp` | Cicla mensajes previos (como historial de shell) |
| `Shift+Tab` | Rota entre los 3 modos (Agent/Plan/Ask) |
| `Shift+Enter` | Newline — **solo funciona en iTerm2, Ghostty, Kitty, Warp, Zed** |
| `Ctrl+J` o `Alt/Option+Enter` | Newline universal — **la doc lo marca explícitamente como la alternativa para usuarios de tmux** |
| `Ctrl+D` | Salir del CLI (requiere doble pulsación) |
| `Ctrl+R` | Entrar a modo Review (diffs) |
| `i` (dentro de Review) | Agregar instrucción de seguimiento |
| `↑/↓` (dentro de Review) | Scroll por hunks del diff |
| `←/→` (dentro de Review) | Cambiar de archivo |

**Dato crítico para ebrain:** `Shift+Enter` es dependiente del emulador de terminal y la doc no lo lista como funcional bajo tmux — si ebrain necesita `send-keys` un prompt multilínea a una sesión **interactiva** de cursor-agent dentro de un panel tmux, debe enviar la secuencia de `Ctrl+J`/`Alt+Enter`, no `Shift+Enter`.

**Modos** (3, cambiables por slash-command, keybinding, o flag `--mode`):
- **Agent** — acceso completo a todas las tools, default.
- **Plan** — diseña approach primero, hace preguntas aclaratorias antes de ejecutar (`Shift+Tab`, `/plan`, `--plan`).
- **Ask** — exploración read-only, sin mutación de archivos/shell (`/ask`, `--mode=ask`).

**Pasar un prompt:** `agent "texto"` (interactivo, seedeado) o `agent -p "texto"` (headless, one-shot, ver §e).

## (c) Slash commands / commands

**Documentados explícitamente:**
- `/plan`, `/ask` — cambio de modo (también `--mode=ask`)
- `/summarize` (alias `/compress`) — comprime/libera espacio de context window
- `/resume` — resume de sesión (equivalente in-session a `agent resume`)
- `/sandbox` — mencionado, semántica exacta no detallada en las páginas fetched
- `/max-mode` — mencionado, semántica exacta no detallada

La doc afirma que "a slash-command menu exposes the models you can switch to, your skills, the built-in commands and any MCP" — esto implica un palette autocompletable (tipear `/` → lista filtrable), patrón familiar (mismo género que Claude Code / OpenCode).

**No confirmado:** catálogo exhaustivo de slash-commands (p. ej. `/model`, `/clear`, `/help`, `/theme` si existen) — la búsqueda dirigida a esto se cortó por rate-limit de WebSearch. Marcar como **incompleto**, no inventar entradas.

## (d) Theming

**No confirmado — sin fuente.** El fetch a `docs/cli/reference/parameters` y el WebSearch dirigido a "cursor-agent CLI colors theme dark light" fallaron por agotamiento de cuota de sesión antes de poder confirmar si existe `--theme`, `/theme`, o soporte de esquemas de color. **No hay evidencia pública recolectada de un sistema de theming para el CLI.** Cualquier suposición (p. ej. "hereda el theme del editor Cursor" o "respeta `$NO_COLOR`") sería especulación sin cita — se omite deliberadamente en vez de presentarla como hecho. **Follow-up abierto** para una corrida futura de research.

## (e) Sesiones

**Modelo de sesión/thread:** conversaciones identificadas ("chat-id" / "thread id"), persistidas entre invocaciones, listables.

- `agent ls` — lista conversaciones previas
- `agent resume` — continúa la más reciente
- `agent --continue` — persiste/continúa la sesión previa
- `agent --resume="<chat-id>"` (o `--resume [thread id]`) — resume un thread explícito por id
- `/resume` — mismo mecanismo, in-session

**Headless / no-interactivo — el dato más crítico para ebrain (¿corre sin cabeza dentro de un panel tmux y podemos capturar el output?): SÍ, documentado y es exactamente el contrato que necesitamos:**

- `-p, --print` — modo headless: "no interactive UI, just a prompt in and a result out." Sin aprobaciones, sin UI.
- `--output-format {text|json|stream-json}`:
  - `text` — "clean, final-answer-only responses" → ideal para un `capture-pane` simple, humano-legible.
  - `json` — resultado estructurado de una sola pasada → ideal para parseo programático post-hoc.
  - `stream-json` (+ `--stream-partial-output` para deltas incrementales) — progreso en tiempo real a nivel de mensaje → ideal si ebrain quiere *tail* el output mientras se produce, en vez de solo hacer poll de un buffer terminado.
- `--force` (alias `--yolo`) — **sin esto, el modo print solo propone cambios, nunca escribe a disco.** Con esto, el agente muta archivos sin confirmación. Es el flag que ebrain DEBE pasar para que un run headless sea genuinamente autónomo — y el equivalente de riesgo a `--dangerously-skip-permissions` (Claude Code) o el full-auto de Codex.
- `--model` — override de modelo, funciona interactivo y headless (ej. `--model "gpt-5"`).
- `--mode` — Agent/Plan/Ask, también usable headless (ej. `-p --mode=ask` para query read-only sin riesgo de escritura).
- **Auth headless:** `export CURSOR_API_KEY=...` — la doc es explícita: hay que exportar la key ANTES de invocar en modo headless. Esto es distinto del login interactivo. (Recordatorio de seguridad del harness: nunca imprimir el VALOR de `CURSOR_API_KEY`, solo verificar presencia con `test -n "${CURSOR_API_KEY:-}"`.)
- **Input de archivos/media:** sin mecanismo especial de upload — simplemente referenciar el path en el texto del prompt (ej. `agent -p "Analyze this image: ./screenshot.png"`), el agente resuelve vía su propia tool-call de lectura de archivo. Simplifica el trabajo de ebrain: no hace falta IPC especial, solo interpolar paths de string en el prompt.

**Handoff a cloud/background agent:** prefijar el mensaje con `&` (interactivo o en invocación) dispara un "Cloud Agent"/"Background Agent" que abre su propia branch y trabaja async, **desacoplado del terminal local**. Modelo de sesión completamente distinto al de tmux-local — ver riesgo en §g.

**No confirmado:** exit codes del proceso `agent` en modo `-p` — ninguna de las páginas fetched los documenta. Antes de que ebrain confíe en el exit code para detectar éxito/fallo en un wrapper de tmux/CI, hay que verificarlo empíricamente (ej. correr `agent -p "..." --output-format json; echo $?` y observar).

## (f) Render stack

**No publicado / no confirmado en ninguna fuente fetched.** cursor-agent es closed-source (a diferencia de opencode/codex/gemini-cli, que ebrain ya tiene clonados en `vendor/` y cuyo stack de render se puede leer directamente del código — ver `discovery/00-environment.md` §F6). No hay indicación pública de si usa Ink/React (como Claude Code y gemini-cli), un renderer ANSI a medida, o algo más. **Marcar explícitamente como desconocido.** Cualquier conjetura ("probablemente Node/TS dado el linaje VS Code de Cursor") es especulación circunstancial sin cita — se documenta acá solo para que quede registrado como hipótesis no verificada, NO como insumo válido para ADR-003.

## (g) Qué robar / qué evitar (foco: lanzar/observar dentro de tmux)

### Robar

1. **El trío `-p/--print` + `--output-format {text|json|stream-json}` es exactamente el contrato "headless en un panel tmux" que ebrain necesita.** Patrón directo a reusar en el adapter cursor: lanzar `agent -p --force --output-format stream-json "<prompt>"` cuando se quiere un log tailable por máquina, o `--output-format text` cuando un humano solo va a hacer `capture-pane` y leer.
2. **`--force`/`--yolo` como flag de peligro explícito y separado del flag de modo** es un patrón de UX limpio: "no-interactivo por default es seguro (propone, no escribe); un flag extra explícito lo vuelve real." Vale la pena que el contrato de adapters de ebrain documente esta misma distinción por proveedor (propose-only vs. write-enabled) en vez de asumir un único booleano "autónomo sí/no".
3. **La taxonomía de 3 modos (Agent=full-write, Plan=clarifica-antes, Ask=read-only)** es vocabulario reusable para que ebrain describa la capacidad de cada adapter — encaja con la distinción read/write lock-aware que gbrain ya usa para el lock de PGLite (lección F5).
4. **`agent ls` / `--resume=<id>` / `--continue`** da un modelo de datos listo para el panel de Sessions de la TUI: listar threads, marcar cuál es "el más reciente", dejar elegir cuál resumir — reusable como modelo conceptual independientemente del estado del panel tmux (esto es resumibilidad propia del agente, complementaria a la persistencia de tmux).
5. **Auth headless por variable de entorno (`CURSOR_API_KEY`)** es la historia más simple posible de "cómo invoco esto desde un orquestador" — sin login interactivo. El launcher de ebrain puede exportar la variable (por NOMBRE, nunca el valor) al shell del panel tmux antes de correr `agent -p`.
6. **`Ctrl+J`/`Alt+Enter` documentado explícitamente como "el newline que sobrevive a tmux"** es un dato puntual con carga operativa directa: si ebrain alguna vez necesita `send-keys` un prompt multilínea a una sesión *interactiva* de cursor-agent, no debe asumir `Shift+Enter` — debe enviar la secuencia de `Ctrl+J`/`Alt+Enter`.

### Evitar / riesgos

1. **El handoff `&` a cloud/background agent mueve el trabajo fuera del panel tmux local silenciosamente.** Si un `capture-pane` de una sesión ebrain-lanzada de golpe deja de mostrar actividad, no es necesariamente un colgado — puede ser un handoff a la nube. El adapter debería, por default, evitar/inhibir este atajo en sesiones lanzadas por ebrain (o al menos detectarlo y superficie-arlo explícitamente), para que un panel "silenciosamente vacío" no se trate como sesión muerta que hay que reiniciar.
2. **El modo Review interactivo (`Ctrl+R`) es un sub-UI modal con su propia gramática de navegación** (arriba/abajo = scroll de hunks, izquierda/derecha = cambio de archivo). Conducirlo a ciegas con `send-keys` (sin `capture-pane` de feedback para saber qué archivo/hunk tiene foco) es frágil. Preferencia: nunca entrar a Review desde una sesión orquestada por ebrain — quedarse en `-p` headless para todo lo scripteado, reservar el attach interactivo para cuando Eduardo está mirando el panel en persona.
3. **Theming y render stack quedaron sin confirmar en esta corrida** (rate-limit de WebFetch/WebSearch). No hay que hardcodear en ADR-003 ni en el design system ninguna suposición sobre los colores de cursor-agent o si usa Ink. Si la paridad visual específica con cursor-agent se vuelve un objetivo, hace falta una pasada de research de seguimiento (retomar con `cursor.com/docs/cli/reference/parameters` y una búsqueda dirigida a theming).
4. **Exit codes no confirmados.** No construir la detección de éxito/fallo de un run headless de cursor-agent únicamente sobre el exit code del proceso hasta verificarlo empíricamente; preferir parsear el propio campo de éxito/error de `--output-format json` (una vez confirmado su schema) o escanear `stream-json` en busca de un mensaje terminal de tipo "done".

━━━

## Top takeaways para ebrain (foco tmux launch/observe)

1. **Sí se puede correr headless dentro de un panel tmux**: `agent -p --force --output-format stream-json "<prompt>"` (con `CURSOR_API_KEY` exportada antes) es el comando base para el adapter cursor de ebrain — sin aprobaciones, sin UI, output parseable.
2. Para observación pasiva (peek humano vía `capture-pane`), usar `--output-format text`; para observación programática/streaming, usar `stream-json` + `--stream-partial-output`.
3. `--force`/`--yolo` es la línea divisoria dura entre "propone" y "escribe de verdad" — el harness de ebrain debe tratarlo como el flag de riesgo explícito, análogo al full-auto de Codex y al skip-permissions de Claude Code.
4. Si se necesita interactividad real (no headless) dentro de tmux, el newline seguro es `Ctrl+J`/`Alt+Enter`, NO `Shift+Enter` (documentado como dependiente del emulador, no garantizado bajo tmux).
5. El atajo `&` de cloud/background agent es una trampa de observabilidad: saca el trabajo del panel local sin aviso — el adapter debe inhibirlo o detectarlo explícitamente, no tratarlo como "sesión colgada."
6. Gaps abiertos que requieren una corrida de research de seguimiento (bloqueados por cuota de tool esta vez): catálogo exhaustivo de slash-commands, theming/colores, render stack, y exit codes del modo `-p`. No se rellenaron con inferencia — quedan marcados como desconocidos.
