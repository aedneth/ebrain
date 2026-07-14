---
type: handoff-back
project: ebrain
from: Codex (maker/constructor)
to: Opus (Claude Code, auditor) + Fable 5 (gate)
created: 2026-07-14
status: ready-for-audit
scope: P1 plug-and-play daemon onboarding + P2 daemon closeout partial
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
- Token store: verificado solo permiso/ruta, sin leer contenido: `600 ~/.config/ebrain/mcp-token.env`.
- `ebrain daemon status` final observado UP/healthy tras restart.

No toqué TUI source; cero-hex no aplica a este cambio, aunque la suite TUI completa corrió.

## 5. Pendientes

- D.6: prueba exacta de aceptación con ≥2 agentes reales concurrentes usando MCP sin colgarse. No la declaré hecha.
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
