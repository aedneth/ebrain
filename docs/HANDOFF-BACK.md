---
type: handoff-back
project: ebrain
from: Codex (maker/constructor)
to: Opus (Claude Code, auditor) + Fable 5 (gate)
created: 2026-07-14
updated: 2026-07-15
status: ready-for-audit
scope: P1/P2 daemon + D.5.4/F-F1/F-D2 bridge closure + OpenRouter stack smoke
---

# HANDOFF-BACK — daemon work + audit-finding closure

## 1. Qué construí

- Cierre findings Fable/Opus (Codex maker, 2026-07-15):
  - `cli/daemon-preflight.ts`: preflight de boot antes de `serve --http`; lista sources locales con lock libre, corre `assertNoClientSources()` sobre id/name/path y prepara thin-client CLI.
  - `cli/mcp-remote.ts`: registra/guarda OAuth client local para ops CLI; secret en `~/.config/ebrain/remote-client.env` chmod 600; config thin en `~/.config/ebrain/gbrain-thin/.gbrain/config.json` sin secret.
  - `cli/remote-tools.ts`: helper MCP para scripts (`sources_list`, `put_page`, submit-cycle async).
  - `ebrain-run`: usa `GBRAIN_HOME` thin-client separado cuando existe; `EBRAIN_RUN_LOCAL=1` conserva escape hatch local para mantenimiento.
  - `ebrain-q`: sources por MCP, `--source-id`, fail-loud si no puede listar/query; no más vacío silencioso por lock.
  - `remember`/`sessions-federate`: write-through por MCP `put_page` a `agent-memory`; learnings CLI quedan buscables con daemon UP.
  - `doctor`: `sources:isolation` vía daemon MCP cuando el host está UP, no diferido permanente.
  - `onboard`: chmod 600 best-effort para configs conocidos de claude/codex/gemini/cursor/opencode sin leerlos.
- F-D2 hardening universal (Codex maker, 2026-07-15):
  - `cli/mcp-bridge.ts`: MCP stdio local para agentes; lee `EBRAIN_MCP_TOKEN` desde env o `~/.config/ebrain/mcp-token.env` chmod 600 en runtime y proxya cada `tools/list`/`tools/call` al daemon HTTP `127.0.0.1:8541`.
  - `scripts/ebrain-mcp-bridge`: wrapper estable para configs de agentes.
  - `ebrain onboard`: registra Claude/Codex/Gemini/Cursor/OpenCode contra el bridge command-only; ya no escribe bearer/header HTTP en configs de agentes.
  - Cursor queda como `mcpServers.ebrain.command=<bridge>, args=[]`; OpenCode queda como `mcp.ebrain={type:"local", command:[bridge]}` y normaliza `instructions` legacy string a array.
  - `harness/core/mcp-wire.sh` prefiere `ebrain-mcp-bridge` para futuras instalaciones.
- `ebrain up`
  - Asegura daemon HTTP-MCP en `127.0.0.1:8541`.
  - Asegura `EBRAIN_MCP_TOKEN` sin imprimirlo.
  - Corre smoke `tools/list`.
  - Ejecuta onboarding de agentes detectados.
- `ebrain onboard [--all|agent]`
  - Registra MCP de ebrain para `claude`, `codex`, `gemini`, `cursor`, `opencode` vía bridge stdio local hacia el daemon HTTP.
  - `generic` queda sin MCP nativo.
- Boot-token pre-bind:
  - `scripts/ebrain-brain` llama `cli/up.ts ensure-token --boot --quiet` antes de `gbrain serve --http`.
  - Store local: `~/.config/ebrain/mcp-token.env` chmod 600.
  - Fallback migratorio: si el host ya está UP y falta token local, `ebrain up` puede acuñar por admin HTTP local usando `GBRAIN_ADMIN_BOOTSTRAP_TOKEN` ya cargado por el wrapper, sin mostrar valores.
- Manifests:
  - `mcp.register` de claude/codex/gemini/cursor/opencode ahora delega a `ebrain onboard <agent>`.
  - Esto evita que `ebrain harness install --mcp` revierta el cutover a stdio.
- Sesiones tmux:
  - `ebrain sessions new` inyecta `EBRAIN_MCP_TOKEN` desde el store para agentes lanzados por TUI.
- Copias vivas:
  - Instalé `scripts/ebrain-brain`, `scripts/ebrain-daemon`, `scripts/ebrain-up` en `~/.config/ebrain/` con modo 700.
  - `ebrain-daemon start` usa `setsid` para que el host no quede en el process group del runner que invocó el control.
- P2 daemon/rewire:
  - Nuevos launchers `scripts/ebrain-run` y `scripts/ebrain-mcp`.
  - `scripts/gbrain-run` y `scripts/gbrain-mcp` quedan como compat wrappers; en `~/.config/ebrain/` son symlinks hacia los nuevos nombres.
  - `doctor.sh`, `status.sh`, `remember.sh`, `mcp-wire.sh`, `dream-cycle`, `ebrain-q` prefieren `ebrain-run`/`ebrain-mcp` y caen a compat.
  - `ebrain doctor --json` reporta `daemon:status` y `adapter:<agent>:mcp`.
  - `ebrain harness status` imprime el estado por adapter y modo MCP.

## 2. Decisiones y por qué

- **Thin-client separado, no `remote_mcp` en `~/.gbrain/config.json`:** el host necesita el config local real para poder correr `gbrain serve`; si `remote_mcp` vive en ese mismo config, upstream considera la instalación thin-client y rehúsa `serve`. Por eso ebrain separa el plano: host = `~/.gbrain`; ops CLI = `GBRAIN_HOME=~/.config/ebrain/gbrain-thin`.
- **OAuth client para ops CLI, bearer store para bridge de agentes:** upstream `callRemoteTool` usa OAuth client_credentials, no el bearer legacy de `EBRAIN_MCP_TOKEN`. Se registra un client local pre-bind para CLI/write-back y se guarda el secret en env file 600. Los agentes no reciben ese secret: hablan stdio con `ebrain-mcp-bridge`, y el bridge lee el bearer local desde el token store 600.
- **Write-back chico por `put_page`, no `gbrain sync`:** `sync` es localOnly/thin-refused; bajo daemon pelearía el lock. Para `remember` y sesiones nuevas, `put_page` da búsqueda inmediata sin abrir PGLite local.
- **Indirection universal por bridge, no por flags HTTP de cada CLI:** Codex soporta bearer env-var para HTTP, pero Claude/Gemini/OpenCode/Cursor no daban una superficie portable para bearer-env HTTP sin escribir headers. La solución pre-release es cambiar el plano adapter-facing a stdio command-only (`ebrain-mcp-bridge`) y mantener HTTP solo entre bridge y daemon local.
- **Wrapper propio ebrain en vez de `gbrain connect --install`:** upstream solo automatiza Claude/Codex y usa `GBRAIN_REMOTE_TOKEN`. ebrain necesita superficie `EBRAIN_MCP_TOKEN` y cubrir Gemini/Cursor/OpenCode.
- **Bearer legacy local en token store, no OAuth client credentials por agente:** el objetivo P1 es plug-and-play local loopback; bearer está soportado por `serve-http` y evita UI/OAuth para el usuario. El bearer no vive en configs de agentes, solo en `~/.config/ebrain/mcp-token.env` chmod 600.
- **Token file chmod 600 en `~/.config/ebrain/`:** no hay credential helper portable garantizado en esta laptop; el store local cumple "usuario no ve token" y evita poner secretos en configs donde Codex sí puede usar env var.
- **Cursor por merge JSON:** Cursor Agent expone `mcp list/login/enable`, pero no `mcp add`; se mantiene el patrón del harness actual de editar `~/.cursor/mcp.json`, ahora con bridge command-only y sin headers.
- **OpenCode por merge JSON con schema propio:** `opencode mcp add local -- <command>` escribe `mcp.<name>.type="local"` y `command` como array; el archivo real legacy tenía `instructions` string, pero el validador actual exige array o ausente. `mergeOpenCodeMcpConfig()` normaliza ambos.
- **STDIO fallback no se borra:** `scripts/gbrain-mcp` queda versionado para rollback o modo sin-daemon.
- **Rename solo de superficie:** no se toca `vendor/gbrain`, `GBRAIN_*` ni `~/.gbrain/`; los nombres nuevos son wrappers ebrain-owned sobre el motor interno.

## 3. Gotchas nuevos

- No escribir `remote_mcp` en el config host (`~/.gbrain/config.json`) en esta topología: rompe `gbrain serve`. Usar el `GBRAIN_HOME` thin-client separado.
- `gbrain query` thin-client necesita `--source-id`, no `--source`; el wrapper viejo etiquetaba resultados con el source iterado aunque la búsqueda no estuviera scoped.
- Con `set -o pipefail`, `sort | awk | head` puede terminar en rc 141 por SIGPIPE aunque haya resultados correctos. `ebrain-q` lo neutraliza al final del pipeline.
- El `remember` por CLI ahora prueba realmente el loop write→search: guardó un learning y `ebrain q "GBRAIN_HOME thin-client separado remote_mcp"` lo devolvió desde `agent-memory`.
- `tools/list` de MCP HTTP responde como SSE (`data: {...}`), no solo JSON plano. El primer smoke autenticaba pero contaba `0 tools`; corregido con parser SSE (`toolsCountFromMcpBody`).
- `ebrain-daemon` prefiere la copia viva `~/.config/ebrain/ebrain-brain`; cambiar solo el template en repo no basta. Instalé la copia viva actualizada.
- `opencode mcp add` espera header como `KEY=VALUE`; Claude/Gemini esperan `Authorization: Bearer ...`.
- `opencode mcp add local -- <command>` espera `mcp.<name>.type="local"` y `command` como array. Si `instructions` queda como string, `opencode mcp list` invalida toda la config; debe ser array o no existir.
- Un scan global de configs de Claude/Gemini puede marcar secretos de otros MCP existentes. Para auditar esta fase, validar la subconfig `ebrain` por paths/booleans, no hacer dump del archivo completo.
- `ebrain-mcp-bridge` no debe abrir PGLite ni usar `GBRAIN_HOME` thin-client: es solo un proxy MCP stdio→HTTP con token runtime. Esto preserva el invariant de un único `gbrain serve --http`.
- El stack chino de OpenRouter no depende del MCP de agentes: se valida por `ebrain-route`. En esta fase se revalidaron slugs y smokes live para `deepseek`, `moonshotai/kimi`, `minimax`, `qwen` y `z-ai/glm`; `terminal` probó fallback real a `qwen/qwen3.7-plus`.
- `nohup` no bastaba bajo el harness de ejecución: el host quedaba en el process group del runner y podía morir segundos después de cerrar la llamada. Fix: `setsid "$LAUNCHER" ... &`. Verificado con SID/PGID propios y health >55s tras terminar el comando invocador.
- El rename de launchers debe conservar compat porque varias rutas históricas (`runbook`, docs viejos, configs MCP de rollback) todavía mencionan `gbrain-run`/`gbrain-mcp`.

## 4. Tests y verificación

- `bash -n scripts/ebrain-run scripts/ebrain-brain scripts/ebrain-q scripts/dream-cycle scripts/sessions-federate harness/core/remember.sh harness/core/doctor.sh scripts/ebrain-up scripts/ebrain-daemon` → OK.
- `bun test ./cli/` → 147 pass / 0 fail.
- `bun test ./tui/test/` → 360 pass / 0 fail.
- `bash -n scripts/ebrain-mcp-bridge harness/core/mcp-wire.sh scripts/ebrain-up scripts/ebrain-brain` → OK.
- `ebrain daemon restart` → preflight corrió, daemon UP healthy (PID observado 153533).
- `ebrain up` → daemon UP, token ready, `tools/list` OK con 94 tools, 5 agentes registrados.
- `ebrain onboard --all` → claude/codex/gemini/cursor/opencode OK, todos por bridge.
- `bun run cli/mcp-bridge.ts --probe` → `tools/list` OK con 94 tools.
- `opencode mcp list` → `ebrain` connected por `/home/eduardo.borjas/eBrain/scripts/ebrain-mcp-bridge`.
- `ebrain q "korvex" 2` → resultados reales bajo daemon (control positivo; no cuelga).
- `ebrain q "GBRAIN_HOME thin-client separado remote_mcp" 3` → devuelve el learning nuevo desde `agent-memory`, rc=0.
- `ebrain doctor --json` → `daemon:status ok`, `sources:isolation ok` vía daemon MCP, adapters MCP=http-daemon, `brain:engine ok`.
- Permisos verificados sin leer contenido: `remote-client.env`, thin config, `.claude.json`, `.codex/config.toml`, `.gemini/settings.json`, `.cursor/mcp.json`, `.config/opencode/opencode.json` = 600.
- `ebrain up` repetido → idempotente, mismo resultado.
- `ebrain daemon restart` + `ebrain up` → restart con launcher nuevo y smoke OK.
- `ebrain daemon start` con `setsid` → health OK >55s tras terminar la llamada.
- `ebrain doctor --json` → `daemon:status ok`, launchers `ebrain-*` ok, compat `gbrain-*` ok, `adapter:<agent>:mcp` ok para 5 agentes; rc=0.
- `ebrain harness status` → imprime `mcp ✓ http-daemon` para los 5 agentes MCP; conserva rc de pendientes globales del harness.
- D.6 preflight local:
  - `ebrain status --json` → `brain.state=up`, `served_by=mcp:2302908`, flota 6/6, memoria local legible.
  - `ebrain doctor --json` → rc=0; `gemini` mantiene warning de harness doctor, pero `adapter:gemini:mcp` está ok/http-daemon.
  - `pgrep -af '... cli.ts serve ...'` → un solo `gbrain serve --http --port 8541 --bind 127.0.0.1`.
  - `ebrain q "ebrain daemon HTTP MCP" 3` → terminó sin colgarse; no devolvió resultados para ese término.
- Token store: verificado solo permiso/ruta, sin leer contenido: `600 ~/.config/ebrain/mcp-token.env`.
- Secret-safety F-D2 bridge:
  - `.claude.json`, `.codex/config.toml`, `.gemini/settings.json`, `.cursor/mcp.json`, `.config/opencode/opencode.json`, `~/.config/ebrain/mcp-token.env` = 600.
  - Cursor/OpenCode `ebrain` sin headers; OpenCode `type=local`, `command` array, `instructions` array.
  - Subconfigs `ebrain` de Claude/Gemini evaluadas por boolean: sin `Authorization`, `Bearer`, `gbrain_*`, `api_key` ni `x-api-key`.
- OpenRouter stack chino:
  - Dry-run de `~/.config/ebrain/ebrain-route --dry-run --json` confirmó cadenas para `coding`, `agentic`, `long_context`, `terminal`, `general`, `reasoning`, `web_design`.
  - Endpoint OpenRouter `/api/v1/models` confirmó presentes los slugs revisados: `deepseek/deepseek-v4-pro`, `moonshotai/kimi-k2.6`, `minimax/minimax-m3`, `qwen/qwen3.7-max`, `z-ai/glm-5.2`, `qwen/qwen3-coder:free`, `qwen/qwen3-next-80b-a3b-instruct:free`.
  - Smokes reales `ebrain-route --json` pasaron para `coding`, `agentic`, `long_context`, `terminal`, `general`, `web_design`, `reasoning`; `terminal` usó fallback a `qwen/qwen3.7-plus`.
  - Budget MTD después del smoke: aprox. USD 0.014 / 10.
- `ebrain remember` ejecutado x2:
  - Learning F-D2 bridge command-only + token runtime.
  - Learning smoke OpenRouter chino + fallback terminal.
- `ebrain daemon status` final observado UP/healthy tras restart.

No toqué TUI source; cero-hex no aplica a este cambio, aunque la suite TUI completa corrió.

## 5. Pendientes

- Auditoría Opus + Fable del cierre F-D2 bridge: revisar `cli/mcp-bridge.ts`, `cli/up.ts`, configs command-only y secreto fuera de repo.
- Installer `curl -fsSL ... | sh` todavía pendiente.
- P3/TUI 6.6 sigue pendiente: launch wizard, advisor v1, prompt composer.

## 6. Qué auditar

- D.5.4:
  - `scripts/ebrain-brain` corre `cli/daemon-preflight.ts` antes de bindear HTTP.
  - El preflight lista sources con el engine local mientras el lock está libre y hard-falla si detecta `brisas`/`dekko` en id/name/local_path.
  - `doctor.sh` valida `sources:isolation` vía daemon MCP cuando el host está UP.
- F-F1:
  - `ebrain-run` usa `GBRAIN_HOME=~/.config/ebrain/gbrain-thin` para ops CLI y no contiende el lock del host.
  - El config thin contiene `remote_mcp` pero no `oauth_client_secret`; el secret vive en `~/.config/ebrain/remote-client.env` chmod 600.
  - `ebrain q` usa sources vía MCP, `--source-id`, y falla ruidoso si el daemon no responde.
  - `remember` y `sessions-federate` escriben por MCP `put_page` a `agent-memory`; el learning nuevo es buscable con daemon UP.
  - `dream-cycle` es daemon-aware y no promete sweeps locales imposibles mientras el daemon posee el lock.
- F-D2 permisos:
  - `ebrain onboard` hardenea chmod 600 para configs conocidos de claude/codex/gemini/cursor/opencode sin leer contenido.
  - `ebrain onboard` no persiste bearer/header en configs: registra `scripts/ebrain-mcp-bridge` command-only.
  - `ebrain-mcp-bridge` lee `EBRAIN_MCP_TOKEN` desde token store 600 o env en runtime, redacciona errores y solo proxya MCP stdio→HTTP.
  - OpenCode valida con `type:"local"`, `command` array e `instructions` array/ausente.
- Secret-safety:
  - Que ningún token aparece en stdout/stderr, tests, docs o commit.
  - Que los errores de helpers remotos pasan por redacción.

━━━

## 7. Audit result + cierre findings

**FASE D está doble-gated:** Opus emitió `[AUDIT_PASS]` el 2026-07-14 y Fable 5 emitió `[FABLE_AUDIT_PASS]` el 2026-07-15. Este handoff agrega el cierre maker de los findings posteriores.

- **F-D1 / D.5.4 — CERRADO:** aislamiento de sources cableado al boot pre-bind y a `doctor.sh` daemon-aware.
- **F-F1 — CERRADO:** ops CLI y write-back ya pasan por daemon/thin-client; `ebrain q` no cuelga bajo lock y el learning nuevo queda buscable desde `agent-memory`.
- **F-D2 — CERRADO:** chmod 600 aplicado a configs conocidos; adapters MCP quedan command-only contra `ebrain-mcp-bridge`; bearer solo en token store 600 o env runtime, no en configs.
- **F-F2 — CERRADO documental:** probe vacuo retirado; la evidencia de aislamiento queda en federación default-deny + CI + preflight/doctor.

### Evidencia nueva del cierre maker

- `bun test ./cli/` = 147 pass / 0 fail.
- `bun test ./tui/test/` = 360 pass / 0 fail.
- `ebrain daemon restart` levantó healthy con preflight.
- `ebrain up` fue idempotente: daemon UP, smoke `tools/list`=94, onboard 5/5.
- `ebrain q "korvex" 2` devolvió resultados reales bajo daemon.
- `ebrain q "GBRAIN_HOME thin-client separado remote_mcp" 3` devolvió el learning nuevo desde `agent-memory`.
- `ebrain doctor --json` reportó `daemon:status ok`, `sources:isolation ok`, adapters MCP=http-daemon y `brain:engine ok`.
- Permisos verificados sin leer secretos: `remote-client.env`, thin config y configs de agentes conocidos = 600.
- `ebrain onboard --all` = 5 OK por bridge; `bun run cli/mcp-bridge.ts --probe` = 94 tools; `opencode mcp list` conectado.
- OpenRouter chino smoke live: 7/7 caps probadas; `terminal` ejerció fallback a `qwen/qwen3.7-plus`.

### Backlog abierto real

1. **Checker gate:** Opus + Fable deben auditar el cierre maker F-D2 bridge antes de merge.
2. **Installer P1:** `curl -fsSL ... | sh` para instalación open-source plug-and-play.
3. **P3/TUI 6.6:** launch wizard, advisor v1, prompt composer.
