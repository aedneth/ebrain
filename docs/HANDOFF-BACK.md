---
type: handoff-back
project: ebrain
from: Codex (maker/constructor)
to: Opus (Claude Code, auditor) + Fable 5 (gate)
created: 2026-07-14
updated: 2026-07-15
status: ready-for-audit
scope: P1/P2 daemon + D.5.4/F-F1/F-D2 bridge closure + F6.6A-E orchestration UX + workflow/cost loop
---

# HANDOFF-BACK — daemon work + audit-finding closure

## Actualizacion 2026-07-15 — ADR-005, pivot de orquestacion pendiente de implementacion

- **Decision aprobada, sin codigo aun:** el advisor determinista de F6.6B no se extiende como recomendador de “mejor modelo”. `docs/adr/ADR-005-user-governed-model-selection.md` fija el reemplazo: Task Profile explicable, perfiles locales elegidos por usuario, targets declarados por adapter y telemetria factual.
- **Motivo:** los benchmarks/proveedores cambian, los creditos de adapters eran personales y una etiqueta de modelo no equivale a una sesion real con ese modelo. No se usaran cuotas o suscripciones para inferir USD.
- **Siguiente implementacion:** contratos de Task Profile/perfiles, target OpenCode/OpenRouter con selector probado, y Launch Wizard con preview completo. F6.6.1 queda `[~]`; F6.6.2-6.6.6 y F6.7 siguen pendientes.
- **Que debe auditar Opus:** que la migracion no deje claims de “mejor modelo”, creditos/suscripciones, argv shell-inyectable, selector falso o bypass del deny-list. Fable verifica el gate F6.6 final junto al gate F6.7.

## Actualizacion 2026-07-15 — F6.6.1 Task Profile cerrado (pendiente auditoria de fase)

- **Construido:** `cli/task-profile.ts` y `config/task-profile-rules.yaml` sustituyen el advisor por tarea, senales, capability y modos compatibles. `cli/advise.ts` solo reexporta/ejecuta ese contrato para compatibilidad.
- **Retirado:** reglas de carril, modelo, agente, creditos, suscripciones, frontier y costo de sesion. El snapshot de pricing para el panel Routing se mueve a `cli/model-pricing.ts`; sigue siendo estimacion marcada, no billing.
- **TUI:** Launch guarda `profile`, muestra capability/senales/modos y nunca altera el agente seleccionado manualmente. Se eliminaron confirmaciones que hacian route/sesion por recomendacion.
- **Tests/verificacion:** `bun test ./cli/` = 161 pass / 0 fail; `bun test ./tui/test/` = 371 pass / 0 fail; `git diff --check` limpio, cero hex TUI fuera de `theme.ts`, `ebrain task-profile --json ...` y `ebrain advise --json ...` verdes. No hubo llamada pagada ni lectura de credenciales.
- **Benchmark plan:** `docs/BENCHMARK-EVIDENCE-PLAN.md` difiere una integracion de evidencia opt-in post-ship. El gate exige fuente/version/fecha, costo y reproducibilidad; nunca auto-routing.
- **Siguiente fase:** F6.6.2 perfiles locales y catalogo fechado; luego F6.6.3 target OpenCode/OpenRouter y F6.6.4 wizard.

## Actualizacion 2026-07-15 — F6.6.2 perfiles locales cerrado (pendiente auditoria de fase)

- **Construido:** `cli/profiles.ts` implementa `list`, `show`, `validate`, `init`, `catalog-add` y `create`; `docs/EXECUTION-PROFILES.md` describe el uso OSS.
- **Modelo de datos:** un perfil OpenRouter contiene solo IDs de modelo, orden por capability y evidencia (`source`, `as_of`). El parser permite un schema exacto; cualquier campo desconocido (incluido material de credenciales), provider invalido, modelo no catalogado o duplicado falla antes de escribir.
- **Migracion/eleccion:** `init --yes` migra el routing local como `legacy-openrouter`, sin usarlo como default. El usuario agrega su propia metadata al catalogo y crea perfiles con `--cap` en el orden que desea; cada mutacion exige `--yes`.
- **Verify:** `cli/profiles.test.ts` cubre migracion, schema, catalogo requerido, duplicados, store invalido y permisos. Smoke temporal `init -> catalog-add -> create -> validate` confirma perfiles=2 y store/dir `600/700`. No se modifico el store real ni se hizo llamada a proveedor.
- **Siguiente fase:** F6.6.3 declara targets reales y argv seguro por adapter; OpenCode/OpenRouter es el primer candidato verificado por `opencode --help` (`--model provider/model`).

## Actualizacion 2026-07-15 — F6.6.3 target OpenCode/OpenRouter cerrado (pendiente auditoria)

- **Construido:** `cli/targets.ts` expone `list`, `plan` y `launch`. Un target solo existe si un manifest declara provider, argv y selector de modelo validos; no se extrapola soporte entre CLIs.
- **Primer target:** `harness/adapters/opencode/manifest.yaml` declara `opencode-openrouter` con argv `[opencode,--auto]` y `--model openrouter/<model>`, basado en la ayuda de la CLI instalada.
- **Seguridad:** `sessions.shellCommandFromArgv()` recibe argv ya validado y serializa cada argumento con quoting literal para tmux; control chars, targets inexistentes y capabilities sin modelo fallan antes de crear sesion. `targets launch` exige `--yes`.
- **Costo:** el lanzamiento inicial escribe `untracked` por provider/agente/modelo/sesion/capability porque iniciar un proceso no consume ni reporta tokens. No hubo llamada OpenRouter real en esta validacion.
- **Verify pendiente de checker:** revisar quoting argv, prefijo `openrouter/`, deny-list que sigue en `newSession`, y que el event `untracked` no se presente como USD. Siguiente fase: F6.6.4 Launch Wizard.

## Actualizacion 2026-07-15 — F6.6.4 Launch Wizard cerrado (pendiente auditoria)

- **Construido:** Launch `w` obtiene perfiles y targets mediante los contratos CLI, permite escogerlos y ajustar capability/cwd, pide `targets plan` y presenta el contexto efectivo antes de launch.
- **Contexto y controles:** preview declara norms, daemon MCP, memory bus, workflow adjunto, RAM y `untracked`; confirma explicitamente el target y vuelve a confirmar si el gobernador RAM lo exige. El backend mantiene deny-list por `realpath`.
- **Fix manual reportado:** el grid hacia `launch: {selected}` y descartaba `task`; ahora preserva el slice completo. Regresion cubre flecha -> `r` sin crash.
- **Auditar:** flujo `w` sin profiles, cwd cliente literal/symlink, confirmaciones `y` exclusivas, y que la TUI no construya argv ni lea archivos de perfil.

## Actualizacion 2026-07-15 — F6.6.5 composer y evidencia cerrado (pendiente auditoria)

- **Fix del reporte visual:** `performLaunch()` referenciaba `initialPrompt` fuera de alcance al lanzar un agente manual despues de usar `t`; ahora toma el task desde `LaunchSlice`, por lo que el flujo no puede tirar `ReferenceError`. El task se entrega sin trim si existe, preservando el payload.
- **UX del wizard:** `w` sin store de perfiles explica que requiere `ebrain profiles init --yes` y que los agentes manuales siguen independientes; no crea configuracion de usuario sin confirmacion. Tab llega al selector profile (antes quedaba interceptado por el focus ring) y `c` abre un dialogo de cwd correctamente rotulado.
- **Prompt composer:** `p` en Sessions mantiene drafts solo en estado transitorio. Bracketed paste conserva saltos de linea y Alt+Enter inserta uno; Enter abre un preview y solo `y` emite `send` con el texto exacto. No hay historial ni evento de costo que contenga el prompt.
- **Evidencia de benchmarks:** `cli/benchmark-evidence.ts` es un parser estricto opcional: exige fuente, fecha ISO, version, task scope, modelo y metricas; prohíbe campos desconocidos, `winner`, secretos y politica de routing. No se conecta a la selección de modelos. `docs/BENCHMARK-EVIDENCE-SCHEMA.md` explica el formato.
- **Auditar:** exactitud del payload por `sendToSession`, cancelacion distinta de `y`, que ningún draft llegue a sesiones/costos/logs, y que el schema no permita campos desconocidos ni derive defaults/rankings.

## Actualizacion 2026-07-15 — F6.6.6 fixtures canónicos cerrado (pendiente auditoria final)

- **Construido:** `cli/task-profile.fixtures.ts` contiene diez tareas representativas que cubren las seis capabilities. `task-profile.fixtures.test.ts` verifica para cada una la capability, las señales detectadas y los dos modos compatibles; también fija que el contrato no adquiera campos de agent/model/winner/rank/cost.
- **Decisión:** los fixtures son regresión de reglas locales, no benchmarks ni ejemplos de modelos. No nombran provider, modelo, precio o ganador. `docs/CANONICAL-TASK-FIXTURES.md` describe ese límite para contribuidores OSS.
- **Gotchas:** el matching actual es literal por substring: `script` aparece dentro de `TypeScript`, por lo que esa señal debe ser esperada; `tools` no dispara el keyword exacto `tool-call`. No se cambió el clasificador durante esta tarea, solo se documentó y cubrió su conducta vigente.
- **Auditar con GPT-5.6-sol al cierre:** que los diez fixtures no introduzcan ranking implícito, que cubran todas las capabilities sin duplicar IDs, y que cambiar reglas rompa la expectativa explicable correspondiente.

## Actualizacion 2026-07-15 — F6.7.1 edge hardening cerrado (pendiente auditoria final)

- **Fix:** la muerte de tmux entre `listSessions()` y `peekSession()` ya no deja output antiguo marcado como live. `failSessionPeek()` limpia la captura y cambia Sessions a un error recuperable con mensaje; una regresión pura lo verifica.
- **Matriz:** `docs/TUI-EDGE-CASES.md` enlaza tmux ausente/muerto, cache/lock, timeout, terminal menor a 80x24, fallback 256/ASCII y el lifecycle de restore. No se afirma un E2E de crash: queda en el checklist humano/auditor porque depende de TTY/señales reales.
- **Residual conocido:** un bloque PEM partido por el límite de `capture-pane` puede exponer body base64 sin header/footer. No se implementó una redacción masiva que oculte output legítimo; el tradeoff debe ser evaluado por GPT-5.6-sol en el gate final.

## Actualizacion 2026-07-15 — F6.7.2 perf cerrado (pendiente auditoria final)

- **Medición:** se inició una TUI y fake-agent locales en tmux temporal, se navegó a Sessions y se midió `/proc/<pid>/stat` durante 5 s (`CLK_TCK=100`). RSS pico observado: 47 MiB; CPU idle: ~0.6% de un core; con `peek` a 1 Hz: ~1.8%. Las sesiones temporales fueron eliminadas al acabar. El boot 0.08-0.10 s/RSS 43 MiB de F6.3 sigue siendo la evidencia de cold boot.
- **Decisión D8:** no se compila con `bun build --compile` en esta release. El boot ya está muy por debajo de 1.5 s y el RSS bajo 100 MiB; un binario agregaría mantenimiento sin beneficio medido. Reconsiderar solo ante regresión o requisito de distribución standalone.
- **Rastro:** `docs/f6-success-criteria.md` inicia la matriz de 8 criterios con evidencia de maker; no es una aprobación del gate.

## Actualizacion 2026-07-15 — Wizard first-use + F6.7.3 docs cerrado (pendiente auditoria final)

- **UX:** `w` ya no manda al usuario a una terminal para `profiles init`. Si no existe store local, muestra un dialogo en inglés que explica la migración y solo `y` ejecuta `ebrain profiles init --yes --json`; tras éxito recarga y abre el wizard. No llama proveedores ni guarda credenciales.
- **Idioma:** los textos nuevos y la ruta visible del wizard están en inglés; el cwd rechazado también se presenta en inglés. Los errores textuales devueltos por subcomandos legacy siguen siendo su propia salida hasta una futura localización total del CLI.
- **Docs F6.7.3:** `tui/README.md` cubre navegación, composer, signals, profiles, wizard y ledger; `docs/runbook.md` incluye entrada TUI. `?` permanece autogenerado desde el registry y los controles contextuales se ven en la hint bar.
- **Auditar:** confirmar que `n`/Esc no escriben profiles, que `y` es el único camino de inicialización, que la salida CLI de error no se trate como éxito y que documentación/hints concuerden con reducer/registry.

## Actualizacion 2026-07-15 — F6.7.4 criterios cerrados (pendiente auditoria final)

- **Matriz:** `docs/f6-success-criteria.md` contiene los ocho criterios originales con evidencia concreta y estado de maker. Los criterios de write-back Claude y memoria visible desde otro agente se declaran explícitamente como checks humanos, no evidencia inventada.
- **ADR-005:** el criterio de tareas canónicas se corrigió a señales, capability y modos compatibles sin ranking; es incompatible afirmar routing o “ganador” bajo la arquitectura actual.
- **Auditar:** validar que cada enlace de evidencia soporta su criterio y completar los dos checks humanos antes de aceptar el gate.

## Actualizacion 2026-07-15 — q JSON + Memory search cerrado (pendiente auditoria final)

- **Construido:** `ebrain q --json` devuelve `{query,results:[score,source,slug,snippet]}` desde el fan-out daemon-backed. Memory usa `s` para abrir el composer, ejecuta exclusivamente ese contrato y presenta resultados estructurados; no lee PGLite, YAML ni filesystem de brains.
- **Cobertura:** `docs/TUI-CLI-COVERAGE.md` clasifica subcomandos integrados y administración explícita. El objetivo es integrar flujos diarios seguros, no convertir la TUI en shell con botones para `daemon`, `onboard`, harness o federación sin guardrails.
- **Auditar:** revisar el parsing de la salida upstream de query, el esquema JSON vacío/error, el timeout de 30 s y que una búsqueda no exponga secretos ni sources cliente.

## Actualizacion 2026-07-15 — F6 retro y paquete humano cerrados

- **Retro OSS:** `docs/F6-RETRO.md` captura decisiones y lecciones sin copiar contenido del vault privado. Los aprendizajes reutilizables ya se guardaron individualmente en el bus con `ebrain remember`.
- **Checklist:** `docs/human-checklist.md` tiene F6a-e: visual, write-back real, wizard first-use, un día de daily driver y entrega del paquete a GPT-5.6-sol.
- **Estado:** no quedan fases de implementación F6. El único pendiente técnico es 6.7.6: auditoría independiente GPT-5.6-sol y ejecución humana de F6a-e. No hay `[AUDIT_PASS]` de maker.

## 1. Qué construí

- F6.6E Unified Cost Ledger v2 (Codex maker, 2026-07-15):
  - Nuevo `cli/cost.ts` y `ebrain cost --json`: normaliza el ledger legacy de `route.ts` y un sidecar local para adapters en cortes por provider, agente, modelo, sesion y workflow.
  - Estados explicitos: `metered` (USD de uso real/estimado), `token-only` (tokens sin precio verificable) y `untracked` (sin telemetria). No hay costo de suscripcion ni conversion de cuotas a USD por ejecucion.
  - `ebrain cost record ... --yes` permite que adapters OpenAI/Gemini registren tokens/costo explicito en `~/.config/ebrain/cost.jsonl` (dir 700, archivo 600). `actual`/`estimated` exige USD; `token-only`/`untracked` lo prohibe.
  - `ebrain route` acepta atribucion opcional `--agent`, `--session`, `--workflow`; el flujo Memory workflow -> Launch -> route preserva el ID del workflow en el evento OpenRouter.
  - Routing TUI (`5`) alterna con `c` al Cost Ledger: provider, estado, tokens, USD conocido, modelos+agentes, workflows y sesiones.
  - Nuevo `docs/COST-LEDGER.md` con el contrato, fuentes, permisos y limites.
- F6.6C/D Workflow/Skill memory (Codex maker, 2026-07-15):
  - Nuevo `cli/workflows.ts` y superficie `ebrain workflows {ingest,list,search,show,run,capture,skillify} --json`.
  - `ingest` descubre SOPs/workflows en roots locales de Second Brain y Company Brain, persiste registros versionados en `~/.config/ebrain/workflows` (directorio 700, registros 600) y redacta contenido antes de guardarlo/materializarlo.
  - Los IDs incluyen scope del root (`workflows`, `sops`, `ckis`, `backlog`) para que paths relativos homonimos no se sobrescriban.
  - `run` genera prompt/checklist, sin ejecutar shell, proveedor ni agente. `capture` solo propone candidatos repetidos desde learnings/sessions. `skillify` solo escribe un `SKILL.md` local con `--yes` explicito.
  - Memory TUI consume el contrato por `knowledge/run.ts`: paneles learnings/workflows/session logs; Tab cambia foco, Enter previsualiza el prompt y `a` lo adjunta a Launch. Adjuntar no llama al advisor, OpenRouter ni tmux.
  - Nuevo `docs/WORKFLOW-LEARNING-LOOP.md`: adaptacion de Hermes conversation -> learning -> workflow -> skill, con integration de `ebrain remember` y skills federadas (`list_skills`/`get_skill`).
- F6.6A/B Orchestration UX (Codex maker, 2026-07-15):
  - `cli/routing.ts`: nuevo contrato `ebrain routing --json` para exponer el stack OpenRouter como capacidades operables: winner/fallback/floor, pricing, gasto MTD, remaining y comando.
  - Routing tab consume `routing --json`; ya muestra chains reales del stack chino y no lee YAML/JSONL directo.
  - Launch task router: `t` abre composer de tarea; Enter pide `ebrain advise --json`; la vista muestra task/capability/lane/agent/model/costo/razón.
  - Enter con `one_shot_route` abre confirmación explícita y ejecuta `ebrain route --json --cap <cap>`.
  - Enter con carril de sesión lanza el agente recomendado y envía el prompt inicial a la sesión tmux; si el send falla, Sessions muestra la sesión creada y el error `initial prompt: ...`.
  - Nuevo plan `docs/SPRINT-ORCHESTRATION.md` para workflows/skills y cost ledger v2.
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

- **Tokens primero; suscripcion nunca se monetiza:** el dato util para Eduardo es consumo por modelo. Si un provider no emite precio verificable, ebrain conserva tokens como `token-only` o declara `untracked`; no reparte una cuota mensual como gasto ficticio.
- **Cap con scope explicito:** `routing.yaml` protege OpenRouter. `known_mtd` puede sumar USD verificable de otros adapters, pero no se presenta como si compartiera el cap OpenRouter.
- **Sidecar opt-in para adapters:** OpenAI/Gemini u otros writers pueden entregar tokens/costo sin que ebrain scrapee paneles, lea secretos o dependa de formatos inestables. La escritura exige `--yes` y campos identificadores restringidos.
- **Workflow store local redactado, no vault ni repo:** los SOPs de Eduardo permanecen privados; ebrain versiona su representacion local para la experiencia diaria, con hash/version y permisos restrictivos, sin convertir el vault en artefacto open-source.
- **Materializar antes de actuar:** Enter y `workflows run` devuelven texto revisable. El traspaso a Launch es una segunda accion y ejecutar un route o sesion sigue sus propios candados. Esto mantiene workflows como memoria operable, no autonomia implicita.
- **Skillify con `--yes`, assets/scripts manuales:** un candidato repetido no es evidencia suficiente para publicar automatizacion. La conversion a skill requiere aprobacion humana y la curacion de artefactos adicionales permanece deliberada.
- **Scope en IDs por root:** Second Brain y Company Brain tienen varios roots; el mismo path relativo en `workflows` y `sops` debe representar dos workflows distintos, no una actualizacion falsa del mismo registro.
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

- `token-only` y `untracked` deben tener USD nulo: permitir USD en esos estados vuelve ambiguo si el costo es verificado. El writer los rechaza; `actual`/`estimated` exige USD.
- La atribucion no puede inferirse de un prompt. `--workflow` viaja explicitamente desde el workflow adjuntado en Launch; tareas manuales siguen sin workflow en el ledger.
- El cost view no agrega una septima tab: vive dentro de Routing para preservar el mapa `1-6`; `c` alterna routing/cost y cada refresh trae ambos contratos.
- `workflows` tiene roots hermanos del mismo brain; no usar solo `source + relative path` como identidad. Incluir scope del root evita que `workflows/release.md` y `sops/release.md` se pisen.
- El parser de flags no puede excluir `rest[-1 + 1]`: sin `--limit`/`--min-count` eso descarta el primer posicional. `parseArgs()` ahora construye posicionales de forma explicita y hay regresion para `run`, `skillify` y search multi-word.
- El store y los prompts deben pasar por `scrubSecrets` incluso si el input es Markdown local: una ruta confiable no garantiza contenido seguro de volver a publicar por MCP.
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

- F6.6E:
  - `bun test ./cli/` → 178 pass / 0 fail.
  - `bun test ./tui/test/` → 373 pass / 0 fail.
  - Focal: `bun test ./cli/cost.test.ts ./cli/contract.test.ts ./cli/route.test.ts ./tui/test/launch.test.ts ./tui/test/knowledge/contracts.test.ts ./tui/test/knowledge/panels.test.ts` → 123 pass / 0 fail.
  - Smoke aislado con `EBRAIN_COST_LOG` temporal: evento Gemini `token-only` = 120 input + 40 output, USD 0; `ebrain cost --json` conserva los tokens, no altera el ledger real y mantiene OpenRouter como `metered`.
- F6.6C/D:
  - `bun test ./cli/` → 169 pass / 0 fail.
  - `bun test ./tui/test/` → 369 pass / 0 fail.
  - Focal: `bun test ./cli/workflows.test.ts ./cli/contract.test.ts` → 60 pass / 0 fail; `bun test ./tui/test/knowledge/contracts.test.ts ./tui/test/knowledge/panels.test.ts` → 34 pass / 0 fail.
  - Smoke aislado contra `docs/` en store temporal: ingest=37, list limitado=2, `run` devuelve id/titulo/checklist/prompt, capture=0 candidatos y `skillify` sin `--yes` rc=2. No se ingirieron ni mostraron SOPs privados.
  - `git diff --check` limpio; cero-hex TUI limpio (`rg` sin matches fuera de `theme.ts`).
- F6.6A/B focused:
  - `bun test cli/routing.test.ts cli/contract.test.ts cli/advise.test.ts cli/spend.test.ts` → 69 pass / 0 fail.
  - `bun test ./tui/test/launch.test.ts ./tui/test/knowledge/contracts.test.ts ./tui/test/knowledge/panels.test.ts ./tui/test/app.test.ts` → 71 pass / 0 fail.
  - `bun test ./cli/` → 151 pass / 0 fail.
  - `bun test ./tui/test/` → 366 pass / 0 fail.
  - `git diff --check` → limpio.
  - Cero-hex TUI → limpio: `rg -n "#[0-9a-fA-F]{3,8}|38;2;|48;2;|38;5;|48;5;" tui/src --glob '!theme.ts'` no tuvo matches.
  - `ebrain routing --json | jq ...` → 7 capabilities con winner/fallback/floor reales; no imprime secretos.
  - `ebrain advise "Summarize this batch of transcripts" --json` → `one_shot_route` / `route` / `minimax/minimax-m3`.
  - `ebrain advise "Fix a bug in the CLI router" --json` → `interactive_codex` / `codex`.
- `bash -n scripts/ebrain-run scripts/ebrain-brain scripts/ebrain-q scripts/dream-cycle scripts/sessions-federate harness/core/remember.sh harness/core/doctor.sh scripts/ebrain-up scripts/ebrain-daemon` → OK.
- F-D2 full suites previas:
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
- `ebrain remember` ejecutado para learnings durables:
  - Learning F-D2 bridge command-only + token runtime.
  - Learning smoke OpenRouter chino + fallback terminal.
  - Learning F6.6A/B OpenRouter como rutas virtuales por capability.
  - Learning F6.6B Launch task router.
  - Learning gotcha shell: usar comillas simples si el learning contiene backticks literales. Hubo un learning intermedio con backticks evaluados por bash; quedó corregido con una llamada posterior.
- `ebrain daemon status` final observado UP/healthy tras restart.

TUI source sí fue tocado en F6.6A/B; cero-hex aplicó y salió limpio.

## 5. Pendientes

- Auditoría Opus del corte F6.6A/B antes de considerar merge de UX.
- Gate externo: Opus debe auditar F6.6C-E; Fable 5 debe correr el gate final al cerrar tambien F6.7.
- Auditoría Opus + Fable del cierre F-D2 bridge: revisar `cli/mcp-bridge.ts`, `cli/up.ts`, configs command-only y secreto fuera de repo.
- Installer `curl -fsSL ... | sh` todavía pendiente.
- P3/TUI 6.6 sigue pendiente: launch wizard, advisor v1, prompt composer.

## 6. Qué auditar

- F6.6E:
  - `cli/cost.ts` solo lee JSONL/config de routing; nunca secretos, dashboards ni prompts. Los eventos `token-only`/`untracked` no llevan USD y `actual`/`estimated` lo requieren.
  - El cap se calcula unicamente sobre `openrouter_mtd`; `known_mtd` no debe mostrarse como cap multi-provider.
  - `cost record` exige `--yes`, crea directorio 700/archivo 600 y no acepta texto libre.
  - `route.ts` conserva compatibilidad y agrega metadata opcional; workflow attribution llega desde Memory -> Launch -> confirm route.
  - `tui/src/knowledge/run.ts` obtiene `cost --json`; la vista `c` no lee JSONL/config directo y muestra tokens por provider/model/agent junto a workflow/sesion.
- F6.6C/D:
  - `cli/workflows.ts` nunca escribe ni imprime secretos; `workflowFromMarkdown`, capture y skillify trabajan sobre contenido redactado.
  - `ingest` rechaza paths de cliente y los IDs scoped no colisionan entre roots hermanos.
  - `run` es solo materializacion de texto; `skillify` exige `--yes` y crea archivos locales 600.
  - `tui/src/knowledge/run.ts` es el unico I/O de workflows; `buildMemoryView` no lee vault/fs y `a` solo adjunta el prompt a Launch.
  - Verificar que las afirmaciones de `WORKFLOW-LEARNING-LOOP.md` sobre skillpack/MCP coinciden con el wiring actual de skills federadas.
- F6.6A/B:
  - `cli/routing.ts` no llama a proveedores ni lee secretos; solo agrega config/ledger/pricing.
  - Routing tab consume `fetchRouting()`/`parseRouting()`, no `routing.yaml`/`spend.jsonl`.
  - Launch task router requiere confirmación explícita antes de ejecutar `route`.
  - El prompt inicial de un carril de sesión se envía por `sendToSession(..., yes=true)` después de crear la sesión.
  - Si `sendToSession` falla después de crear la sesión, la sesión se refresca en Sessions y se muestra error `initial prompt: ...`; Opus debe verificar que este manejo no oculte la sesión creada.
  - Frontier sigue confirm-only.
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

- F-D2 bridge: `bun test ./cli/` = 147 pass / 0 fail; `bun test ./tui/test/` = 360 pass / 0 fail.
- F6.6A/B orchestration UX: `bun test ./cli/` = 151 pass / 0 fail; `bun test ./tui/test/` = 366 pass / 0 fail; `git diff --check` limpio.
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

## 8. Independent GPT-5.6-sol audit - 2026-07-15

**Verdict:** `[AUDIT_FAIL]` at maker commit `dd55592`. Full evidence and required closure are in
`docs/AUDIT-GPT-5.6-SOL-F6.md`.

- **High:** workflow source roots can bypass the client-repository deny-list through an innocent
  symlink; the Launch Wizard starts a model-selected session but drops the reviewed task/workflow.
- **Medium:** Memory search opens/navigates recent learnings instead of displayed search results;
  search snippets are not scrubbed; `q --json` lacks a stable contract/isolation test; visible error
  paths and Task Profile are not English-only; profile provenance accepts empty/duplicate records;
  Routing presents undated static pricing.
- **Release:** installer, license, CI/package metadata and public OSS README remain incomplete;
  human F6a-e acceptance is still open.
- **Independent verification:** CLI 177/0, TUI 381/0, zero-hex clean, daemon healthy, bridge 94
  tools, doctor 29 ok / 2 warn / 0 fail, relevant local secret/config files mode 0600.
- **Next owner:** a distinct maker must close G56-F1..F8 and release blockers atomically. GPT-5.6-sol
  then re-runs focused regressions, full suites and the final gate; this checker does not
  self-approve its own fixes.
