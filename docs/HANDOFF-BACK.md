---
type: handoff-back
project: ebrain
from: Codex (maker/constructor)
to: Opus (Claude Code, auditor) + Fable 5 (gate)
created: 2026-07-14
status: ready-for-audit
scope: P1 plug-and-play daemon onboarding + P2 daemon closeout partial + D6 local preflight
---

# HANDOFF-BACK — P1/P2 daemon work

## 1. Qué construí

- `ebrain up`
  - Asegura daemon HTTP-MCP en `127.0.0.1:8541`.
  - Asegura `EBRAIN_MCP_TOKEN` sin imprimirlo.
  - Corre smoke `tools/list`.
  - Ejecuta onboarding de agentes detectados.
- `ebrain onboard [--all|agent]`
  - Registra HTTP-MCP para `claude`, `codex`, `gemini`, `cursor`, `opencode`.
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

- **Wrapper propio ebrain en vez de `gbrain connect --install`:** upstream solo automatiza Claude/Codex y usa `GBRAIN_REMOTE_TOKEN`. ebrain necesita superficie `EBRAIN_MCP_TOKEN` y cubrir Gemini/Cursor/OpenCode.
- **Bearer legacy local, no OAuth client credentials para agentes locales:** el objetivo P1 es plug-and-play local loopback; bearer está soportado por `serve-http` y evita UI/OAuth para el usuario.
- **Token file chmod 600 en `~/.config/ebrain/`:** no hay credential helper portable garantizado en esta laptop; el store local cumple "usuario no ve token" y evita poner secretos en configs donde Codex sí puede usar env var.
- **Cursor por merge JSON:** Cursor Agent expone `mcp list/login/enable`, pero no `mcp add`; se mantiene el patrón del harness actual de editar `~/.cursor/mcp.json`, ahora con `url`.
- **STDIO fallback no se borra:** `scripts/gbrain-mcp` queda versionado para rollback o modo sin-daemon.
- **Rename solo de superficie:** no se toca `vendor/gbrain`, `GBRAIN_*` ni `~/.gbrain/`; los nombres nuevos son wrappers ebrain-owned sobre el motor interno.

## 3. Gotchas nuevos

- `tools/list` de MCP HTTP responde como SSE (`data: {...}`), no solo JSON plano. El primer smoke autenticaba pero contaba `0 tools`; corregido con parser SSE (`toolsCountFromMcpBody`).
- `ebrain-daemon` prefiere la copia viva `~/.config/ebrain/ebrain-brain`; cambiar solo el template en repo no basta. Instalé la copia viva actualizada.
- `opencode mcp add` espera header como `KEY=VALUE`; Claude/Gemini esperan `Authorization: Bearer ...`.
- `nohup` no bastaba bajo el harness de ejecución: el host quedaba en el process group del runner y podía morir segundos después de cerrar la llamada. Fix: `setsid "$LAUNCHER" ... &`. Verificado con SID/PGID propios y health >55s tras terminar el comando invocador.
- El rename de launchers debe conservar compat porque varias rutas históricas (`runbook`, docs viejos, configs MCP de rollback) todavía mencionan `gbrain-run`/`gbrain-mcp`.

## 4. Tests y verificación

- `bash -n scripts/ebrain-up scripts/ebrain-brain scripts/ebrain-daemon` → OK.
- `bun test ./cli/` → 135 pass / 0 fail.
- `bun test ./tui/test/` → 360 pass / 0 fail.
- `ebrain up` → daemon UP, token ready, `tools/list` OK con 94 tools, 5 agentes registrados.
- `ebrain up` repetido → idempotente, mismo resultado.
- `ebrain onboard --all` → claude/codex/gemini/cursor/opencode OK.
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
- `ebrain daemon status` final observado UP/healthy tras restart.

No toqué TUI source; cero-hex no aplica a este cambio, aunque la suite TUI completa corrió.

## 5. Pendientes

- D.6: prueba exacta de aceptación con ≥2 agentes reales concurrentes usando MCP sin colgarse. No la declaré hecha; sólo corrí preflight local sin agentes pesados.
- D.7: gate `[AUDIT_PASS]` Opus + Fable 5.
- Installer `curl -fsSL ... | sh` todavía pendiente.
- P3/TUI 6.6 sigue pendiente: launch wizard, advisor v1, prompt composer.

## 6. Qué auditar

- Secret-safety:
  - Que ningún token se imprime en stdout/stderr, tests, docs o commits.
  - Que `redactSecrets` cubre errores de CLI y bearer/header.
  - Que `mcp-token.env` queda fuera del repo y chmod 600.
- Idempotencia:
  - `ebrain up` y `ebrain onboard --all` repetidos no duplican ni rompen registros.
  - `harness install --mcp <agent>` ya no revierte a stdio.
- Runtime:
  - Daemon estable tras restart.
  - `tools/list` 94 tools con bearer.
  - Sesiones lanzadas por TUI heredan `EBRAIN_MCP_TOKEN`.
- Arquitectura:
  - La decisión bearer-local es aceptable para loopback P1.
  - Cursor/OpenCode con header literal en config es el mejor compromiso actual o requiere un store/env nativo por agente.

━━━

## 7. Audit result (Opus, checker — 2026-07-14)

**Veredicto: `[AUDIT_PASS]` para FASE D (daemon HTTP-MCP). Fable 5 = segundo checker, PENDIENTE.**

### D.6 concurrencia — PASS (evidencia)
- Estado frío verificado antes del test: daemon DOWN, **cero** `cli.ts serve`, token store presente chmod 600, 1428 MB avail.
- `ebrain up` (cold boot): daemon UP · token leído del store (nunca impreso) · smoke `tools/list`=94 · onboard 5/5 `registered`.
- Idempotencia: `ebrain up`×2 y `ebrain onboard --all`×2 → limpio, sin duplicados ni errores (opencode confirmado upsert-tolerante en vivo).
- **Criterio 1 (≥2 agentes concurrentes sin colgarse):** 6 clientes MCP `tools/list` simultáneos → los 6 = 94 tools en **0.24s**, `serve` count = **1**. `claude mcp list`=`✔ Connected` + `codex mcp list`=registrado (env-var bearer), **en paralelo**, serve=1 mid-handshake y después.
- Invariante single-writer: `ss` = `127.0.0.1:8541` loopback-only, un `bun` PID dueño; char-class pgrep = 1 serve real.
- Aislamiento vivo por el canal compartido: `ebrain q "brisas dekko cliente" 3` = cero contenido de cliente.
- `ebrain status --json` = brain up / served_by mcp / fleet 6/6 / memoria legible; `ebrain doctor --json` rc=0 (28 ok / 3 warn; `sources:isolation` diferido por lock = esperado).

### D.7 gate — los 4 criterios GO
1. ≥2 concurrentes = **PASS**. 2. serve HTTP auth+loopback = **PASS**. 3. RAM = **PASS**. 4. aislamiento con test = **PASS (con caveat F-D1)**.
- Suites: `bun test ./cli/` 135/0 · `bun test ./tui/test/` 360/0. TUI no tocado → cero-hex n/a.
- Secret-safety: sin token en archivos tracked ni en `daemon.log`; store fuera del repo, chmod 600.

### Findings (para que el maker cierre)
- **F-D1 (media/baja) — enforcement de aislamiento no cableada al runtime.** `assertNoClientSources()`/`isClientSource`/`federatedSources` viven en `cli/isolation.ts` pero **solo los llama el CI test** — NO el boot del host. D.5.3 y el docstring de `cli/isolation.ts` lo afirmaban como "enforced en runtime, no solo doc": overstatement. **Corregido por Opus** (docs ajustados) + **abierta D.5.4**: cablear la aserción al preflight de `scripts/ebrain-brain` (listar sources del engine, hard-fallar boot si hay cliente). No es leak activo. → **Codex: implementar D.5.4.**
- **F-D2 (baja) — token bearer en reposo en configs de agente.** claude/gemini/opencode/cursor guardan el valor del token en sus configs (`~/.claude.json`, settings gemini, `~/.cursor/mcp.json` [chmod 600], config opencode). Solo **codex** usa indirección `--bearer-token-env-var` (lo correcto). Aceptable para loopback-local P1; **hardening antes del release público**: preferir indirección env/secret-store o token corto rotable para todos los adapters. → backlog open-source.

### Pendiente tras esta auditoría
- **Fable 5** corre como segundo checker sobre FASE D (lo dispara Eduardo).
- Codex: **D.5.4** (F-D1) + P1 restante (`ebrain up` installer `curl | sh`) + P3/TUI 6.6.
