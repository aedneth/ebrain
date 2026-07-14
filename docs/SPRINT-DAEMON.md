---
type: sprint-plan
project: ebrain
program: FD — Daemon compartido HTTP-MCP (fuera de F6)
created: 2026-07-14
modified: 2026-07-14
status: proposed
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

## FASE D.2 — Host launcher supervisado (gate criterio 2)  `[ ]`

- [ ] D.2.1 Launcher persistente `gbrain serve --http --port 8541 --bind 127.0.0.1` con **pidfile + single-instance guard** (nunca 2 hosts) y logs a `~/.config/ebrain/daemon.log`. Ubicación **ebrain-native**: `~/.config/ebrain/ebrain-brain` (ver §Rename policy).
- [ ] D.2.2 Comando de control `ebrain daemon {start,stop,status,restart}` (o systemd user unit `ebrain-brain.service` con `Restart=on-failure`). Decidir supervisado-vs-systemd en D.2. **Verify:** start→status UP→stop→status DOWN.
- [ ] D.2.3 **Auditar** la superficie auth de serve-http (OAuth CC, bearer, rate-limit, CORS, bind loopback) — el gate criterio 2. Documentar hallazgos; loopback-only mitiga exposición. **Verify:** curl a :8541 sin bearer → 401; con bearer → 200.
- [ ] D.2.4 Integrar el estado del daemon en el panel **Doctor** de la TUI (health check del host). **Verify:** doctor muestra "brain daemon: up/down".

## FASE D.3 — Auth provisioning  `[ ]`

- [ ] D.3.1 Estudiar `gbrain connect`/`auth`/`remote` (commands/connect.ts) — cómo provisiona el client (issuer_url/mcp_url/client_id/secret) para un host local. **Verify:** doc del flujo.
- [ ] D.3.2 `[HUMANO]` Eduardo genera el OAuth client para los agentes locales (client_id + secret). El secret va a `GBRAIN_REMOTE_CLIENT_SECRET` (env del harness), **nunca al repo ni a logs**. Asegurar que el archivo de config con el secret esté fuera de git (`.gitignore`). **Verify:** `test -n "$GBRAIN_REMOTE_CLIENT_SECRET" && echo set` (sin imprimir valor).

## FASE D.4 — Rewire MCP de los adapters (stdio → HTTP)  `[ ]`

- [ ] D.4.1 Cambiar `mcp.register` de cada adapter de stdio (`gbrain-mcp`) a HTTP: claude `mcp add --transport http ebrain http://localhost:8541/mcp`; codex `mcp add ebrain --url http://localhost:8541/mcp`; gemini `<url>`; cursor/opencode `url` en su config (mcp-wire.sh). Bearer/OAuth por client_credentials con el client de D.3. **Verify:** `harness install <agent>` deja el registro HTTP.
- [ ] D.4.2 Mantener el stdio `gbrain-mcp` como **fallback** (no borrar) para rollback y para el modo sin-daemon. **Verify:** ambos caminos documentados.
- [ ] D.4.4 **Rename de launchers (surface, ver §Rename policy):** `~/.config/ebrain/gbrain-run`→`ebrain-run` y `gbrain-mcp`→`ebrain-mcp` con **symlink de compat** del nombre viejo→nuevo (para no romper configs/registros vivos), y actualizar refs en repo (doctor.sh/status.sh/remember.sh/mcp-wire.sh/manifests + check-id `launcher:gbrain-run`). Se hace ACÁ (no antes) porque toca el MCP vivo y su hogar natural es el rewire. **Verify:** ambos nombres resuelven; suite verde.
- [ ] D.4.3 Actualizar doctor/harness para reportar el modo MCP activo (stdio-local vs http-daemon) por agente. **Verify:** `ebrain harness status` lo muestra.

## FASE D.5 — ISOLATION GATE (criterio 4, obligatorio)  `[ ]`

- [ ] D.5.1 Test: el canal HTTP compartido **preserva el default-deny de federación** (ADR-001) — un agente no ve sources no autorizados vía el host. **Verify:** test rojo si un source deny aparece en resultados.
- [ ] D.5.2 Test: **aislamiento de repos de cliente** — brisas/dekko NUNCA son sources del brain, así que no hay contenido que filtrar por el canal; asertar (a) query no devuelve su contenido, (b) el host no ingiere desde su path. **Verify:** test verde; brisas/dekko ausentes del brain.
- [ ] D.5.3 GATE criterio 4: los tests de D.5.1/2 en la suite CI. **Verify:** `bun test` los corre y pasan.

## FASE D.6 — CUTOVER en vivo (`[HUMANO]` + Opus, juntos — runbook abajo)  `[ ]`

- [ ] D.6.1 Ejecutar el runbook de cutover (reversible). **Verify:** ≥2 agentes lanzados cargan el MCP concurrentemente **sin colgarse** (el criterio 1). 
- [ ] D.6.2 Confirmar que la TUI/CLI lock-aware sigue sana (status/doctor/memory contra el host). **Verify:** paneles vivos.

## FASE D.7 — GATE + auditoría  `[ ]`

- [ ] D.7.1 GATE FD `[AUDIT_PASS]`: los 4 criterios satisfechos + suite verde + cero-hex (si tocó TUI).
- [ ] D.7.2 **Fable 5** audita la fase (maker≠checker), + la auditoría profunda 6.5→ que Eduardo pidió.
- [ ] D.7.3 CHANGELOG + `ebrain remember` del aprendizaje (lock single-writer → daemon HTTP-MCP).

━━━

## Runbook de CUTOVER (D.6 — reversible)

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
