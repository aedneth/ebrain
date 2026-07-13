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
> **Limitación de esta corrida (original):** las tools `WebFetch`/`WebSearch` agotaron su cuota de sesión (reset ~22:10 America/El_Salvador, ~3h después del momento de research) tras 3 fetches completos + 2 searches. Quedaron sin confirmar: catálogo exhaustivo de slash-commands, theming, render stack, y exit codes — cada uno se marca explícitamente abajo como **no confirmado**, no como inferencia disfrazada de hecho.
>
> **Follow-up (2026-07-12, mismo día, task 6.0.6 gap-fill):** corrida adicional con cuota de `WebFetch`/`WebSearch` disponible, dirigida exclusivamente a los 4 gaps. Resultado: (c) slash-commands y (d) theming quedaron **resueltos con fuente oficial/comunitaria concreta**; (f) render stack se **reconfirmó como genuinamente no divulgado** (búsqueda dirigida adicional, cero resultado); (g/exit codes bajo `-p`) quedó **parcialmente resuelto** — sin tabla oficial de exit codes, pero con evidencia operacional concreta de foros (bug histórico de proceso que no terminaba, luego arreglado). Detalle en cada sección y fuentes nuevas abajo.

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

**Intentado y fallido por rate-limit en la corrida original** (no se debe asumir que estas URLs fueron leídas en esa corrida): `cursor.com/docs/cli/reference/parameters`, un fetch a `cursor.com/blog/cli`, y un WebSearch de theming.

**Follow-up (task 6.0.6 gap-fill) — fetched completas:**
- [cursor.com/docs/cli/reference/parameters](https://cursor.com/docs/cli/reference/parameters) — catálogo de flags (output-format, sandbox, force/yolo, trust, worktree, list-models, resume/continue)
- [cursor.com/docs/cli/reference/slash-commands](https://cursor.com/docs/cli/reference/slash-commands) — catálogo oficial completo de slash-commands
- [cursor.com/docs/cli/reference/configuration](https://cursor.com/docs/cli/reference/configuration) — opciones de config (`editor.vimMode`, `display.*`, hints, notifications) — confirma ausencia de opciones de color/tema
- [cursor.com/docs/cli/headless](https://cursor.com/docs/cli/headless) (re-fetch dirigido a exit codes y schema de `--output-format json`/`stream-json`)
- [cursor.com/docs/cli/github-actions](https://cursor.com/docs/cli/github-actions) — confirma que la doc oficial tampoco documenta exit codes ahí
- [forum.cursor.com — "Cursor CLI headless mode does not release the terminal"](https://forum.cursor.com/t/cursor-cli-headless-mode-does-not-release-the-terminal/133624) — bug histórico de proceso `-p` que no terminaba, resuelto en build `2025.09.18-7ae6800`
- [forum.cursor.com — "Cursor-agent --print doesn't exit after completing"](https://forum.cursor.com/t/cursor-agent-print-doesnt-exit-after-completing/150296) — recurrencia del mismo bug, confirmado arreglado por Cursor team ~mayo 2026
- [forum.cursor.com — "Cursor-agent CLI input cursor invisible on light-theme terminals"](https://forum.cursor.com/t/cursor-agent-cli-input-cursor-invisible-on-light-theme-terminals-please-expose-theme-cursor-color-in-cli-config-json/160845/7) — evidencia directa sobre ausencia de theming + workaround `TERM_THEME=light`

**Follow-up — solo snippet de WebSearch, NO fetched:**
- [explainx.ai — Cursor CLI Slash Commands: Complete Reference](https://explainx.ai/blog/cursor-cli-slash-commands-complete-reference-guide-2026)
- [toolsbase.dev — Cursor Cheat Sheet](https://toolsbase.dev/en/reference/cursor-commands)
- [forum.cursor.com — "Cursor-agent in Github Action timeout"](https://forum.cursor.com/t/cursor-agent-in-github-action-timeout/135433) (solo snippet, citado como corroboración secundaria del patrón de hang, no como fuente primaria)

**Fetched pero descartada como fuera de alcance:** [forum.cursor.com — "Colors not working on Agent Terminal"](https://forum.cursor.com/t/colors-not-working-on-agent-terminal/153088) — es sobre el panel "Agent Terminal" del **editor** Cursor (Composer), un producto distinto del `cursor-agent` CLI standalone que es el sujeto de este reporte. Se descarta explícitamente para no conflar los dos productos; no se usa como evidencia de theming del CLI.

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

**RESUELTO (follow-up 6.0.6)** — catálogo oficial completo vía [cursor.com/docs/cli/reference/slash-commands](https://cursor.com/docs/cli/reference/slash-commands):

**Cambio de modo:**
- `/plan` — entra a Plan mode, muestra el plan actual, o somete un prompt en Plan mode
- `/ask` — toggle Ask mode (preguntas read-only)
- `/debug` — toggle Debug mode o somete un prompt en Debug mode (modo no cubierto por la doc de `--mode`/`using` original — dato nuevo, no era parte de los 3 modos Agent/Plan/Ask ya documentados en §(b); aparece solo como slash-command)
- `/shell` (alias `/sh`, `/run`) — entra a modo ejecución de shell directa
- `/vim` — toggle Vim keybindings

**Gestión de sesión:**
- `/clear` (alias `/new`, `/new-chat`, `/newchat`) — arranca un chat nuevo
- `/resume` — abre chats recientes y resume uno
- `/fork` — bifurca el chat actual en una sesión nueva
- `/rename` — renombra la sesión activa

**Modelo / configuración:**
- `/model` — selecciona modelo (`Tab` para editar)
- `/max-mode` — toggle max mode sobre el modelo seleccionado
- `/run-everything` — controla el comportamiento de auto-ejecución
- `/config` — ajusta settings del CLI interactivamente

**Contexto / display:**
- `/summarize` (alias `/compress`) — comprime la conversación para liberar context window
- `/rewind` — navega hacia atrás a mensajes anteriores
- `/line-numbers` — toggle de numeración de líneas en code blocks renderizados
- `/show-thinking` — toggle de visibilidad de thinking blocks
- `/status-indicators` — toggle de indicadores de estado en el título de la terminal

**Utilidad:**
- `/logs` — acceso a información de debug logs
- `/about` — muestra versión y detalles de cuenta
- `/help` — documentación de comandos
- `/update` — instala la última versión del agente
- `/logout` — cierra sesión de Cursor
- `/quit`, `/exit` — cierra la aplicación
- `/copy-request-id`, `/copy-conversation-id` — copia identificadores
- `/feedback`, `/mcp`, `/plugin`, `/sandbox`, `/bedrock` — herramientas/integraciones adicionales

La doc además confirma que "a slash-command menu exposes the models you can switch to, your skills, the built-in commands and any MCP" — palette autocompletable (tipear `/` → lista filtrable), mismo género que Claude Code / OpenCode.

**Nota:** no hay `/theme` en el catálogo oficial — consistente con el hallazgo de §(d): no existe theming vía slash-command ni de ningún otro tipo documentado.

## (d) Theming

**RESUELTO en lo esencial (follow-up 6.0.6): no existe un sistema de theming en `cursor-agent`.** Confirmado por dos vías independientes:

1. **Página oficial de configuración** ([cursor.com/docs/cli/reference/configuration](https://cursor.com/docs/cli/reference/configuration)) documenta explícitamente las opciones de config disponibles — `editor.vimMode`, `display.showLineNumbers`, `display.showThinkingBlocks`, `display.showStatusIndicators`, `display.showStatusLineRunningTime`, `hints`, `notifications` — y **ninguna es de color/tema/apariencia**. Son toggles funcionales (mostrar/ocultar), no un color scheme.
2. **Foro oficial de Cursor** ([hilo "input cursor invisible on light-theme terminals"](https://forum.cursor.com/t/cursor-agent-cli-input-cursor-invisible-on-light-theme-terminals-please-expose-theme-cursor-color-in-cli-config-json/160845/7)) — bug reportado por la comunidad: el cursor de input es invisible en terminales con theme claro (probablemente texto oscuro sobre fondo oscuro, asumiendo un tema fijo). Un Cursor team member lo reconoce explícitamente como **"a known bug"** y califica la propuesta de la comunidad (exponer color/tema en un `cli-config.json`) como **"a great suggestion"** que están evaluando por interés — es decir, **`cli-config.json` NO existe hoy**, es un feature request abierto, no una feature shippeada.

**Workaround documentado por la comunidad (no oficial, no un flag/config real del CLI):** exportar `TERM_THEME=light` en el shell profile (`~/.zshrc`/`~/.bashrc`) mitiga el problema de contraste. Esto es evidencia indirecta de que el renderer sí lee ALGUNA variable de entorno relacionada a tema — pero es un workaround reportado por un usuario, **no confirmado por la doc oficial ni por un ingeniero de Cursor en ese hilo** como parte formal de la API. Tratarlo como pista operacional, no como contrato estable.

**No hay evidencia de:** `--theme`/`/theme` (no aparece en el catálogo oficial de flags ni de slash-commands, ver §c), soporte de `NO_COLOR`/`FORCE_COLOR` (búsqueda dirigida sin resultado específico a `cursor-agent` — solo resultados genéricos sobre el estándar `NO_COLOR`), ni auto-detección de light/dark del terminal.

**Distinción importante:** un hilo separado del foro ("Colors not working on Agent Terminal") describe un problema de ANSI-color/`TERM=dumb` en el panel **"Agent Terminal" del editor Cursor** (Composer) — un producto distinto del `cursor-agent` CLI standalone. Se excluye deliberadamente como evidencia de theming del CLI para no conflar los dos productos (ver nota en Fuentes).

**Conclusión para ADR-003:** no asumir ningún color/tema propio de `cursor-agent` al diseñar la paridad visual de la TUI de ebrain — el CLI real de Cursor hoy no tiene un sistema de theming shippeado, solo un workaround de env var reportado por comunidad y un feature request abierto sin ETA.

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

**PARCIALMENTE RESUELTO (follow-up 6.0.6) — exit codes del proceso `agent` en modo `-p`:**

- **Sigue sin existir una tabla oficial de exit codes.** Ni `cursor.com/docs/cli/headless` ni `cursor.com/docs/cli/github-actions` (re-fetched dirigido específicamente a esto) enumeran códigos — la única referencia en la doc oficial es un snippet de ejemplo `if [ $? -eq 0 ]; then ...`, que confirma que SÍ hay una convención binaria éxito(0)/fallo(≠0) implícita, pero sin enumerar qué códigos de error específicos existen (p. ej. no hay un "exit 2 = auth error" documentado).
- **Evidencia operacional de foro (no oficial, pero concreta y reproducible por otros usuarios):** hubo un bug histórico bien documentado donde `cursor-agent -p "<prompt>"` **completaba la tarea y emitía output correctamente, pero el proceso nunca terminaba** (no devolvía el shell, requería `Ctrl+C` o un wrapper `timeout` para no colgar un pipeline de CI/CD) — [reportado en foro](https://forum.cursor.com/t/cursor-cli-headless-mode-does-not-release-the-terminal/133624), confirmado resuelto por el reportante tras actualizar al build `2025.09.18-7ae6800`. El mismo patrón **reapareció** en una entrada posterior del foro ([enero–mayo 2026](https://forum.cursor.com/t/cursor-agent-print-doesnt-exit-after-completing/150296)), con Cursor team pidiendo re-test tras un fix; el reportante confirmó en mayo 2026 que "it exits now" (aunque con latencia de 30-55s incluso para queries triviales).
- **Implicación directa para ebrain:** el contrato de "exit code confiable" para el adapter cursor **no se puede asumir ciegamente** — el historial reciente (ago 2025–may 2026) muestra al menos dos rondas de bugs de "proceso headless que no libera la terminal". La recomendación operacional (ya reflejada en §Evitar más abajo) es envolver toda invocación `-p` de ebrain en un `timeout` explícito del lado de ebrain, y no depender solo del exit code — usar además el campo de éxito/error del propio `--output-format json` (o el evento `type: "result"` de `stream-json`, ver abajo) como señal primaria de finalización.
- **Schema observado (no formalmente documentado, pero consistente en ejemplos de doc oficial) para `stream-json`:** eventos con forma `{"type": "system"|"assistant"|"tool_call"|"result", "subtype": "init"|"started"|"completed", ...}`; eventos de tipo `tool_call` incluyen `tool_call.<writeToolCall|readToolCall>.args.path` y `tool_call.<...>.result.success` (con metadata como `linesCreated`, `fileSize`, `totalLines`); eventos con `--stream-partial-output` traen `timestamp_ms` y omiten `model_call_id` (que sí aparece en flushes bufferizados). **No hay un schema JSON formal publicado** (sin JSON Schema / OpenAPI) — esto es reconstrucción a partir de los ejemplos de código de la doc, no una garantía de estabilidad de formato entre versiones.
- Dato adicional operacional (de la doc de GitHub Actions): la GitHub Action oficial de Cursor **reintenta automáticamente con `-p --output-format text`** si detecta output vacío o un posible mismatch de versión del CLI — un patrón de recuperación que vale la pena copiar en el adapter de ebrain (fallback a modo texto simple si `json`/`stream-json` devuelve vacío).

## (f) Render stack

**RECONFIRMADO como genuinamente no divulgado (follow-up 6.0.6) — no es un gap por falta de búsqueda, es ausencia real de fuente pública.** cursor-agent es closed-source (a diferencia de opencode/codex/gemini-cli, que ebrain ya tiene clonados en `vendor/` y cuyo stack de render se puede leer directamente del código — ver `discovery/00-environment.md` §F6).

Búsquedas dirigidas adicionales en esta corrida (`cursor-agent CLI built with Ink React terminal renderer`, `"written in" Rust Go Node`, `cursor-agent cli "terminal UI" framework implementation blog announcement technical details`) no devolvieron ninguna fuente oficial ni de terceros que confirme el framework/runtime de render:
- El blog de lanzamiento ([cursor.com/blog/cli](https://cursor.com/blog/cli)) describe features de producto (sesiones conversacionales, ediciones inline, confirmaciones, ejecución paralela en background) pero **cero mención de stack técnico**.
- El único paquete npm público llamado `cursor-agent` (visto en resultados de búsqueda) es un proyecto de terceros no relacionado ("task sequence creator", último release hace un año) — **no es el binario real de Cursor**, que se distribuye vía `curl https://cursor.com/install -fsS | bash`, no vía npm registry. Se descarta explícitamente como pista falsa — no usar este paquete como evidencia de nada sobre el `cursor-agent` real.
- No hay indicación pública de si usa Ink/React (como Claude Code y gemini-cli), un renderer ANSI a medida, o algo más.

**Marcar explícitamente como desconocido — sin fecha de resolución posible sin decompilación, que está fuera de alcance por mandato del método.** Cualquier conjetura ("probablemente Node/TS dado el linaje VS Code de Cursor") es especulación circunstancial sin cita — se documenta acá solo para que quede registrado como hipótesis no verificada, NO como insumo válido para ADR-003. Este es el único de los 4 gaps que sigue genuinamente abierto tras el follow-up — no por límite de cuota, sino porque Cursor no lo publica.

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
3. **Theming: confirmado que no existe un sistema real (follow-up 6.0.6, ver §d).** No hay que hardcodear en ADR-003 ni en el design system ninguna suposición sobre los colores de cursor-agent heredados o configurables — no hay `--theme`/`/theme`, no hay `cli-config.json` (es un feature request abierto, no shippeado), y hay un bug reconocido de contraste en terminales claras. Si Eduardo quiere paridad visual real con cursor-agent en algún momento, no hay nada público que copiar — habría que observarlo corriendo (comportamiento, no doc).
4. **Render stack: confirmado que sigue siendo desconocido (follow-up 6.0.6, ver §f) — no por falta de búsqueda sino por ausencia real de fuente pública.** No construir ADR-003 asumiendo Ink/React ni ningún otro framework para cursor-agent.
5. **Exit codes: parcialmente resuelto (follow-up 6.0.6, ver §e).** No hay tabla oficial de exit codes, pero SÍ hay evidencia operacional de foro de al menos dos rondas de bugs de "proceso `-p` que no libera la terminal" (ago 2025 → mayo 2026, el segundo aparentemente ya arreglado). No construir la detección de éxito/fallo de un run headless de cursor-agent únicamente sobre el exit code; envolver siempre la invocación en un `timeout` explícito del lado de ebrain, y preferir parsear el campo de éxito/error de `--output-format json` o el evento `type: "result"` de `stream-json` (schema observado en ejemplos de doc, no formalmente publicado) como señal primaria de finalización.

━━━

## Top takeaways para ebrain (foco tmux launch/observe)

1. **Sí se puede correr headless dentro de un panel tmux**: `agent -p --force --output-format stream-json "<prompt>"` (con `CURSOR_API_KEY` exportada antes) es el comando base para el adapter cursor de ebrain — sin aprobaciones, sin UI, output parseable.
2. Para observación pasiva (peek humano vía `capture-pane`), usar `--output-format text`; para observación programática/streaming, usar `stream-json` + `--stream-partial-output`.
3. `--force`/`--yolo` es la línea divisoria dura entre "propone" y "escribe de verdad" — el harness de ebrain debe tratarlo como el flag de riesgo explícito, análogo al full-auto de Codex y al skip-permissions de Claude Code.
4. Si se necesita interactividad real (no headless) dentro de tmux, el newline seguro es `Ctrl+J`/`Alt+Enter`, NO `Shift+Enter` (documentado como dependiente del emulador, no garantizado bajo tmux).
5. El atajo `&` de cloud/background agent es una trampa de observabilidad: saca el trabajo del panel local sin aviso — el adapter debe inhibirlo o detectarlo explícitamente, no tratarlo como "sesión colgada."
6. **Gaps abiertos — estado tras follow-up 6.0.6:**
   - **Slash-commands (§c): RESUELTO** — catálogo oficial completo de 25+ comandos vía `cursor.com/docs/cli/reference/slash-commands`.
   - **Theming (§d): RESUELTO en lo esencial** — confirmado que no existe (no `--theme`/`/theme`, no `cli-config.json` real, bug reconocido de contraste, workaround comunitario no-oficial `TERM_THEME=light`).
   - **Render stack (§f): SIGUE ABIERTO — genuinamente indocumentado**, reconfirmado tras búsqueda dirigida adicional. No es un gap de cuota, es ausencia real de fuente pública; solo se resolvería observando el binario en ejecución o esperando una divulgación de Cursor.
   - **Exit codes / `-p` (§e): PARCIALMENTE RESUELTO** — sin tabla oficial, pero con evidencia operacional de foro (bug histórico de proceso colgado, corregido en dos rondas ago-2025→may-2026) que informa una recomendación concreta: envolver `-p` en `timeout` y no confiar solo en el exit code.
   - Ninguno de los 4 se rellenó con inferencia sin marcar — cada hallazgo nuevo está citado a una URL específica (oficial o de foro), y lo que sigue sin fuente (render stack) permanece marcado como desconocido en vez de completarse con una conjetura.
