---
type: sprint-plan
project: ebrain
program: FD — Daemon compartido HTTP-MCP (fuera de F6)
created: 2026-07-14
modified: 2026-07-14
status: audit-pass (Opus 2026-07-14) · Fable 5 pendiente
tags: [ebrain, daemon, mcp, http, pglite, lock, sprint, tareas]
related: [adr/ADR-004-shared-brain-daemon.md, adr/ADR-001-brain-topology.md, adr/ADR-002-unified-harness.md, SPRINT-TUI.md]
---

# SPRINT — Daemon compartido HTTP-MCP (FASE D, fuera de F6)

> Ejecuta **ADR-004 = GO** (ratificado por Eduardo 2026-07-14). El ADR recomendó DEFER; Eduardo eligió GO
> y ahora hay **evidencia concreta del disparador**: el MCP de ebrain **nunca termina de cargar en sesiones
> lanzadas** — cada `gbrain serve` de agente hace polling del lock single-writer de PGLite (probe: 2º MCP
> `initialize` → exit 124). Sin daemon, el cockpit lanza agentes **sin memoria** = no entrega su valor core.

Reglas de ejecución (idénticas a F0–F6): una tarea = un worker = un resultado verificable con su verify.
Opus audita cada gate con `[AUDIT_PASS]` antes de avanzar. Commit por fase. Ninguna tarea toca
brisas-del-golfo/dekko. Pasos `[HUMANO]` (secretos, cutover en vivo) los ejecuta Eduardo con Opus al lado.
Convención: `[ ]` pendiente · `[~]` en curso · `[x]` hecho+auditado · `[!]` bloqueado.

**Estado P1/P2 (Codex maker, 2026-07-14):** construido `ebrain up` + `ebrain onboard`.
El boot del host asegura `EBRAIN_MCP_TOKEN` **antes** de bindear HTTP; el token queda en
`~/.config/ebrain/mcp-token.env` (chmod 600, nunca impreso). `ebrain up` es idempotente:
daemon healthy → token ready → smoke `tools/list` → registra claude/codex/gemini/cursor/opencode
por HTTP-MCP. Verificado en vivo: `tools/list` = 94 tools; `ebrain onboard --all` re-ejecuta limpio.
Doctor/harness ya reportan daemon + modo MCP; launchers nuevos `ebrain-run`/`ebrain-mcp` conviven con
compat `gbrain-run`/`gbrain-mcp`.

━━━

## Arquitectura (corregida en D.0 — importante)

**Descubrimiento que corrige el plan aprobado:** `gbrain serve` es **host-only** (está en `CLI_ONLY` +
`THIN_CLIENT_REFUSED_COMMANDS`: *"gbrain serve requires a local engine to expose. Thin clients don't have
one to expose."* — cli.ts:952). Es decir, un agente **NO puede** correr `gbrain serve` como thin-client-proxy.
El modo thin-client (`callRemoteTool`) sirve para **ops de CLI** (`query`/`search`/`think`), no para exponer MCP.

→ La arquitectura correcta NO es "thin-client serve" sino **MCP-HTTP directo**:

```
        ┌─────────────────────────────────────────────┐
        │  HOST daemon (residente, dueño del lock)      │
        │  gbrain serve --http  →  127.0.0.1:8541        │
        │  · abre PGLite (single-writer) UNA vez         │
        │  · MCP Streamable-HTTP + OAuth2.1 (CC grant)   │
        └───────────────▲───────────────▲───────────────┘
                        │ http/mcp+bearer │
          ┌─────────────┘                 └─────────────┐
    agente A (claude)                             agente B (codex)   … N agentes
    MCP = --transport http                        MCP = --url http…    (todos concurrentes,
    http://localhost:8541/mcp                     http://localhost:8541/mcp   sin lock local)
```

- **Host:** un solo `gbrain serve --http` bindeado a **loopback** (127.0.0.1:8541) — dueño único del lock.
- **Agentes:** cada CLI registra el MCP de ebrain como **transporte HTTP** al host (reemplaza el stdio
  `~/.config/ebrain/gbrain-mcp`). Confirmado que soportan HTTP MCP nativo: **claude** `mcp add --transport http`;
  **codex** `mcp add --url` ("streamable HTTP server"); **gemini** `mcp add <url>`; **cursor**/**opencode** por
  `url` en su config. `generic` (bash) no tiene MCP.
- **Auth:** OAuth 2.1 client_credentials + bearer (serve-http ya lo trae: `mcpAuthRouter` + `requireBearerAuth`).
  Un client provisionado para los agentes locales; el secret vía `GBRAIN_REMOTE_CLIENT_SECRET` (env), **manejado
  por Eduardo, nunca impreso**.

━━━

## Rename policy — gbrain → ebrain (SUPERFICIE, decidido por Eduardo 2026-07-14)

**Hallazgo:** `gbrain` es un **upstream de tercero** (`github.com/garrytan/gbrain`, v0.42.58.0, activo) que ebrain
vendorea; `~/.gbrain/` guarda la **memoria viva** (`brain.pglite` + `config.json`). Su capa interna tiene **5,629
refs** + decenas de env `GBRAIN_*` como interfaz pública. Renombrar el engine = forkearlo (perder updates) + migrar
memoria viva. **Decisión: rename SOLO de la superficie ebrain-owned, el engine queda como dep interno.**

- **SE RENOMBRA (nuestro):** los launchers wrapper `gbrain-run`→`ebrain-run`, `gbrain-mcp`→`ebrain-mcp` (en D.4, con
  symlink compat); los **strings de OUTPUT** user-facing que decían "gbrain" → "motor"/"brain engine" (hecho: doctor.sh,
  status.sh, remember.sh, spend.ts); **todos los artefactos NUEVOS del daemon nacen ebrain-native** (`ebrain-brain`,
  `ebrain daemon`).
- **SE QUEDA (interfaz del engine garrytan/gbrain):** env `GBRAIN_*` (el engine los consume), paths `~/.gbrain/` y
  `vendor/gbrain/`, el ancla de parseo `grep 'GBrain Health Check'` (matchea la salida real del engine), el campo de
  contrato `gbrain_untracked` (zod + tests), los check-IDs estables (`spend:gbrain-gap`, `launcher:gbrain-run`). Renombrar
  cualquiera de estos rompe el contrato o el engine.

## Los 4 gates de GO del ADR-004 (son los criterios de aceptación de esta fase, no precondiciones)

1. **≥2 agentes concurrentes** consultando memoria sostenidamente → prueba de aceptación D.6.
2. **serve HTTP con auth battle-tested / shim auditado** → D.2 (auditar la superficie OAuth de serve-http;
   bind loopback-only = no expuesto a red) es el gate.
3. **Presupuesto de RAM** para el residente → D.1 (medir RSS del host; verificar host + 1 heavy ≤ 4GB).
4. **Migración que preserve** default-deny de federación (ADR-001) + aislamiento de repos de cliente
   (brisas/dekko) **a través del canal compartido, con test** → D.5 (gate obligatorio).

━━━

## FASE D.0 — Spec + feasibility (este doc)  `[x]`

- [x] D.0.1 Confirmar que `serve` es host-only (no thin-proxy) → arquitectura = MCP-HTTP directo. **Verify:** cli.ts:952-960.
- [x] D.0.2 Confirmar soporte MCP-HTTP de los 6 adapters. **Verify:** claude `--transport http`, codex `--url` (streamable), gemini `<url>`, cursor/opencode `url`-config; generic n/a.
- [x] D.0.3 Confirmar auth del host: OAuth2.1 CC + bearer, loopback bind. **Verify:** serve-http.ts imports (mcpAuthRouter, requireBearerAuth, StreamableHTTPServerTransport).
- [x] D.0.4 Confirmar el bug que motiva la fase (lock single-writer, sin host :8541). **Verify:** probe 2º MCP → exit 124 (colgado).

## FASE D.1 — RAM (gate criterio 3)  `[x]`

- [x] D.1.1 Medir RSS del `serve` real (engine con datos reales). **Resultado:** el `gbrain serve` vivo (2d uptime) = **~9 MB RSS idle** (swappable), **VmHWM ~627 MB** (pico solo al servir activamente), VmSwap ~269 MB. Máquina: 3733 MB total, 442 libre. Embeddings = **API remota** (OpenAI 3-large) → sin modelo local residente. Overhead express/http del `--http` = despreciable vs el engine.
- [x] D.1.2 El cliente MCP-HTTP del agente es **transporte nativo del CLI** (claude/codex) → NO agrega proceso gbrain. El daemon **reemplaza** los N `serve` por-agente: **1×~600MB host vs N×~600MB** = neto MÁS eficiente para multi-agente. Thin-agents agregan ~0 RSS de gbrain.
- [x] D.1.3 **GATE criterio 3 = PASS (viable):** idle ~9MB (swappable), pico ~600MB solo al servir, consolida N serves en 1. La presión de 4GB es pre-existente; el daemon no la empeora (la consolida). **Nota:** el pico ~600MB al servir mantiene vigente el gobernador un-heavy-a-la-vez (F6.4.6).

## FASE D.2 — Host launcher supervisado (gate criterio 2)  `[~]`

- [x] D.2.1 Launcher `scripts/ebrain-brain` (ebrain-native): asegura `EBRAIN_MCP_TOKEN` con `cli/up.ts ensure-token --boot --quiet` **antes de bindear HTTP**, luego `gbrain serve --http --port ${EBRAIN_BRAIN_PORT:-8541} --bind 127.0.0.1`; mismo patrón de env que ebrain-mcp (cwd neutral + sourcea la key), SIN `MCP_STDIO=1`. Foreground; el background lo maneja el control. **Verify:** `bash -n` OK; `ebrain up` idempotente.
- [x] D.2.2 Control `scripts/ebrain-daemon` + `ebrain daemon {start,stop,status,restart}` cableado al dispatcher. **pidfile** `ebrain-brain.pid` + is_running + `/health` check + **GUARD del lock single-writer** (si hay un `serve` stdio vivo, `start` REHÚSA con puntero al cutover, no se cuelga). `start` usa `setsid` cuando existe para separar el process group del harness invocador; `nohup` solo era insuficiente bajo runners que limpian el group al cerrar. **Verify:** `status`→DOWN(rc3); `start` con stdio-serve vivo → **rehusó rc1, NO colgó** (probado); usage lista daemon; post-fix `start` siguió healthy >55s tras terminar la llamada. Systemd user-unit = opción futura (el supervisado bash alcanza para v1).
- [x] D.2.3 **Auditoría auth de serve-http (gate criterio 2):** (a) **bind default 127.0.0.1 loopback** — no expuesto a red salvo `--bind 0.0.0.0` (no lo usamos); (b) `/mcp` exige **bearer + scope enforcement** (`requireBearerAuth`); (c) **CORS default = deny-all cross-origin** (`GBRAIN_HTTP_CORS_ORIGIN` allowlist, ausente→reject); (d) **rate-limit** (express-rate-limit); (e) OAuth2.1 CC grant; **DCR y DCR-insecure OFF por default**; (f) `/health` sin auth (liveness read-only, 3s timeout). **Conclusión:** para topología host-localhost, superficie mínima (solo procesos locales alcanzan 127.0.0.1:8541 y aún necesitan bearer) → **criterio 2 = PASS** con el OAuth propio de gbrain como la superficie auditada (no hace falta shim propio).
- [x] D.2.4 Integrar estado del daemon en Doctor/harness: `ebrain doctor --json` emite `daemon:status` y checks de launchers `ebrain-brain`/`ebrain-daemon`/`ebrain-up`. **Verify:** `daemon:status ok`; rc doctor = 0.

## FASE D.3 — Auth provisioning  `[x]`

- [x] D.3.1 Estudiar `gbrain connect`/`auth`/`remote` (commands/connect.ts) — `gbrain connect --install` solo automatiza claude/codex y usa `GBRAIN_REMOTE_TOKEN`; para ebrain se eligió wrapper propio para usar superficie `EBRAIN_MCP_TOKEN` y cubrir gemini/cursor/opencode. **Verify:** `cli/up.ts` + tests `cli/up.test.ts`.
- [x] D.3.2 Provisioning local sin paso humano: `scripts/ebrain-brain` acuña el bearer vía `gbrain auth create` durante boot pre-bind; si el host ya está UP y falta token local, `ebrain up` usa el admin HTTP local con `GBRAIN_ADMIN_BOOTSTRAP_TOKEN` ya cargado por el wrapper, sin imprimir valores. Store: `~/.config/ebrain/mcp-token.env` chmod 600. **Verify:** `ebrain up` creó/recuperó token y `tools/list` autenticó.

## FASE D.4 — Rewire MCP de los adapters (stdio → HTTP)  `[~]`

- [x] D.4.1 Cambiar `mcp.register` de cada adapter de stdio (`gbrain-mcp`) a HTTP: manifests delegan a `ebrain onboard <agent>`; `onboard` registra claude/codex/gemini/cursor/opencode en `http://127.0.0.1:8541/mcp` con bearer. Codex usa `--bearer-token-env-var EBRAIN_MCP_TOKEN`; claude/gemini/opencode usan header; cursor mergea `~/.cursor/mcp.json`. **Verify:** `ebrain onboard --all` = 5 OK; `ebrain up` = smoke `tools/list` 94 tools.
- [x] D.4.2 Mantener el stdio `gbrain-mcp` como **fallback** (no borrar) para rollback y para el modo sin-daemon. **Verify:** `scripts/gbrain-mcp` sigue versionado; `scripts/README.md` documenta fallback vs daemon.
- [x] D.4.4 **Rename de launchers (surface, ver §Rename policy):** `~/.config/ebrain/gbrain-run`→`ebrain-run` y `gbrain-mcp`→`ebrain-mcp` con **symlink de compat** del nombre viejo→nuevo; refs de repo actualizadas (`doctor.sh`/`status.sh`/`remember.sh`/`mcp-wire.sh`/scripts). **Verify:** `ls -l ~/.config/ebrain/{ebrain-run,ebrain-mcp,gbrain-run,gbrain-mcp}` muestra ejecutables nuevos + symlinks compat; suite verde.
- [x] D.4.3 Actualizar doctor/harness para reportar el modo MCP activo (stdio-local vs http-daemon) por agente. **Verify:** `ebrain doctor --json` muestra `adapter:<agent>:mcp` ok para claude/codex/gemini/cursor/opencode; `ebrain harness status` imprime `mcp ✓ http-daemon`.

## FASE D.5 — ISOLATION GATE (criterio 4, obligatorio)  `[x]`

Entregado: `cli/isolation.ts` (módulo puro, SoT de los invariantes) + `cli/isolation.test.ts` (6 tests / 25 asserts, verde).

- [x] D.5.1 **Default-deny de federación (ADR-001):** `federatedSources(raw)` (fn pura que espeja el filtro `federated · !default · !cliente` de ebrain-q) + `assertNoClientSources(list)` (aserción que TIRA si un source de cliente se cuela). **Verify:** test rojo si un source deny aparece; verde con el set limpio.
- [x] D.5.2 **Aislamiento de repos de cliente (dos planos):** (a) plano-sesión — `isClientPath` bloquea literal/subpath/case + **cierra el gap F6.4.8**: un symlink de nombre inocente que RESUELVE a brisas/dekko se deniega (test con symlink real en tmp). (b) plano-source — `isClientSource` deniega nombres de source de cliente incl. `code-graph/brisas-del-golfo` (el vector del Dev Brain, ADR-001 §Frontera). **Verify:** brisas/dekko ausentes de todo set federado.
- [x] D.5.3 **GATE criterio 4:** los tests corren en la suite CI (`bun test ./cli/isolation.test.ts` = 6/6). **Nivel de enforcement (corregido en auditoría Opus 2026-07-14):** el invariante está cubierto por (a) el CI test del módulo puro, (b) federación default-deny en el discovery de sources (ebrain-q), y (c) el fail-check vivo de `doctor.sh` (`grep -qiE 'brisas|dekko'` cuando el lock está libre). **NO** hay todavía una aserción en el boot del host que hard-falle el daemon si un source de cliente aparece → ver D.5.4. Verificación viva: `ebrain q "brisas dekko cliente" 3` contra el canal compartido = cero contenido de cliente.
- [ ] D.5.4 **(follow-up, maker/Codex)** Cablear `assertNoClientSources()` (de `cli/isolation.ts`) al preflight de `scripts/ebrain-brain`: listar los sources configurados del engine y hard-fallar el boot ANTES de `serve --http` si alguno es de repo-cliente. Cierra el gap entre la afirmación "enforced en código" y la realidad (finding F-D1). **Verify:** un source `brisas`/`dekko` inyectado en config de test hace que `ebrain daemon start` rehúse con rc≠0.

## FASE D.6 — CUTOVER en vivo (`[HUMANO]` + Opus, juntos — runbook abajo)  `[x]`

- [x] D.6.1 Runbook de cutover ejecutado (reversible). **Auditoría Opus 2026-07-14 — PASS:** desde estado frío (daemon DOWN, cero `cli.ts serve`), `ebrain up` levantó el host, leyó el token (nunca impreso), smoke `tools/list`=94, onboard 5/5. **Prueba de concurrencia (criterio 1):** 6 clientes MCP `tools/list` simultáneos → los 6 devolvieron 94 tools en 0.24s con **UN solo** `cli.ts serve --http`; + `claude mcp list`=`✔ Connected` y `codex mcp list`=registrado (env-var bearer) **en paralelo**, serve count = 1 durante y después. `ss` confirma bind loopback `127.0.0.1:8541`.
- [x] D.6.2 TUI/CLI lock-aware sana. **Verify:** `ebrain status --json` = `brain.state=up · served_by=mcp:<pid>`, fleet 6/6, memoria legible (8 learnings/39 sessions); `ebrain doctor --json` rc=0, 28 ok / 3 warn (`sources:isolation` diferido por lock = esperado), `daemon:status ok`, 5 adapters `MCP=http-daemon`. Idempotencia: `ebrain up`×2 + `ebrain onboard --all`×2 sin duplicar ni romper.

## FASE D.7 — GATE + auditoría  `[x]`

- [x] D.7.1 **GATE FD `[AUDIT_PASS]` (Opus, checker, 2026-07-14):** los 4 criterios GO satisfechos —
  (1) ≥2 agentes concurrentes = PASS (D.6.1); (2) serve HTTP auth+loopback auditado = PASS (D.2.3 + `ss` loopback);
  (3) RAM viable = PASS (D.1; host idle ~9MB, 1428MB avail con daemon up, governor un-heavy intacto);
  (4) aislamiento cliente con test = PASS a nivel test+vivo (D.5) **con caveat**: la enforcement en boot del host
  queda pendiente (D.5.4) — es defensa-en-profundidad, no un leak activo. Suites verdes: `bun test ./cli/` 135/0,
  `bun test ./tui/test/` 360/0. TUI no tocado → cero-hex n/a. Secret-safety: sin token en archivos tracked ni en
  `daemon.log`; store fuera del repo, chmod 600.
- [ ] D.7.2 **Fable 5** audita la fase (segundo checker, maker≠checker) — PENDIENTE (lo dispara Eduardo).
- [x] D.7.3 CHANGELOG + `ebrain remember` del aprendizaje (lock single-writer → daemon HTTP-MCP). Hecho por Opus en el cierre de auditoría.

### Findings de auditoría (Opus 2026-07-14)
- **F-D1 (isolation enforcement, media/baja):** `assertNoClientSources()` NO está cableada al boot del host; solo la ejerce el CI test. Los docs (D.5.3 + docstring de `cli/isolation.ts`) lo afirmaban como "enforced en runtime". **Acción checker:** corregidas ambas afirmaciones + abierta D.5.4 (maker). No es leak activo (probe vivo por canal compartido = cero cliente).
- **F-D2 (token en reposo, baja):** claude/gemini/opencode/cursor guardan el valor del bearer en sus configs (`~/.claude.json`, settings de gemini, `~/.cursor/mcp.json` [chmod 600], config de opencode); solo **codex** usa indirección por env-var (`--bearer-token-env-var`). Aceptable para loopback-local P1; **item de hardening antes del release público** (preferir indirección por env/secret-store o token de vida corta rotable).

━━━

## Runbook plug-and-play (P1 — reversible)

1. `ebrain up`
   - Si el host está down: arranca `ebrain daemon start`; el launcher acuña `EBRAIN_MCP_TOKEN` antes de exponer HTTP.
   - Si el host ya está up: reutiliza el token store o acuña por admin HTTP local si falta.
   - Siempre corre smoke `tools/list` y `ebrain onboard --all`.
2. `ebrain onboard [--all|agent]` re-registra HTTP-MCP idempotente sin mostrar tokens.
3. Rollback local: `ebrain daemon stop` y registrar el fallback stdio con `~/.config/ebrain/gbrain-mcp` si se necesita volver al modelo anterior.

## Runbook histórico de CUTOVER (D.6 — reversible)

> Toca el backend de memoria VIVO. La liberación del lock implica cerrar el MCP stdio del orquestador
> (esta sesión Claude Code) — por eso se hace **desde una terminal fresca**, no auto, con Eduardo.

1. **Backup:** copiar configs MCP actuales de los 6 agentes + `~/.config/ebrain/gbrain-mcp`. (rollback = restaurarlas)
2. **Provisionar** el OAuth client (D.3.2, `[HUMANO]`, secret a env). 
3. **Liberar el lock:** cerrar las sesiones que corren `gbrain serve` stdio (incluida esta Claude Code) → el lock de PGLite queda libre.
4. **Levantar el host:** `ebrain daemon start` → `gbrain serve --http` toma el lock en :8541. `ebrain daemon status` = UP. `curl -s localhost:8541/health` OK.
5. **Re-registrar** el MCP HTTP en cada agente (D.4.1).
6. **Prueba de aceptación:** lanzar 2 agentes (p.ej. claude + codex) → **ambos** cargan el MCP de ebrain sin colgarse. `ps` muestra UN solo `gbrain serve` (el host).
7. **Rollback** (si algo falla): `ebrain daemon stop` + restaurar configs stdio del paso 1 → vuelve al modelo actual (lock-aware, un MCP a la vez).

## Riesgos (las razones DEFER del maker, ahora gates)

- **RAM (4GB):** el host residente. Mitigación: embeddings son API remota (sin modelo local); thin-agents no agregan gbrain. Gate D.1.3.
- **Superficie HTTP no battle-tested:** mitigación: **bind loopback-only** (no expuesto a red) + auditoría D.2.3 + OAuth de gbrain. Gate criterio 2.
- **Regresión de aislamiento:** un canal compartido es nueva superficie de cruce. Mitigación: el host sirve el MISMO brain a todos; brisas/dekko nunca son sources; gate de tests D.5.
- **Dependencia de un residente:** si el host cae, todos los agentes pierden memoria. Mitigación: `Restart=on-failure` + fallback stdio (D.4.2) + doctor lo vigila (D.2.4).
