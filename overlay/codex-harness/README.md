# codex-harness — el harness de seguridad+contexto de Codex (cerebro/driver primario)

> Eduardo corre Codex con `--sandbox danger-full-access` (sin gate de aprobación). Bajo ese modo,
> `AGENTS.md` es gobierno **blando** (comportamiento); el control **duro** son estos **hooks** —
> el mismo mecanismo que Claude Code, que Codex implementa Claude-compatible.

## Qué instala (`install.sh`, idempotente + no-destructivo)

Copia a `~/.codex/hooks/` y mergea `~/.codex/hooks/hooks.json` (preservando hooks existentes):

| Hook | Evento | Qué hace |
|---|---|---|
| `block-secret-read.sh` | `pre_tool_use` | **Guard técnico de secretos** (equivalente al `block-env-read.sh` de Claude Code). Bloquea cualquier comando que LEA un archivo de secretos (`.env*`, `*.pem`, `*.key`, `id_rsa`, `credentials`, `.npmrc`, `.netrc`) o haga `printenv`/`env`-dump al contexto. Emite `permissionDecision:deny` + exit 2. FAIL-OPEN ante error propio. Permite escribir/`source` (no imprimen). |
| `session-context.sh` | `session_start` | Inyecta `additionalContext`: MCP ebrain disponible (list_skills/query/think), normas de `AGENTS.md`, último cambio del CHANGELOG. Para que el cerebro arranque CON contexto sin pegarlo a mano. |

## Contrato de hooks de Codex (reverse-engineered 2026-07-11, codex-cli 0.144.1)

Idéntico a Claude Code. **Input** (JSON stdin): `session_id, cwd, hook_event_name, tool_name, tool_input, permission_mode, transcript_path`. **Output**: `hookSpecificOutput.permissionDecision` (`deny|allow|ask`) / `decision` / `additionalContext` / `systemMessage`, o exit code (2 = block). Config: `~/.codex/hooks/hooks.json`, eventos snake_case (`pre_tool_use`, `post_tool_use`, `session_start`, `user_prompt_submit`, `pre_compact`, `post_compact`, `subagent_start`, `subagent_stop`, `permission_request`). Matcher vacío = match-all (el script se auto-descarta si no es shell). Sistema de **hook trust**: la 1ª corrida puede pedir confiar los hooks (o `--dangerously-bypass-hook-trust` en automatización).

## Verificado

- Guard: `cat .env.local` → deny+exit2 ✓ · `ls/git` → allow+exit0 ✓ · `grep KEY .env` → deny ✓.
- session-context: JSON válido con `additionalContext` ✓.
- `codex doctor`: config + hooks.json cargan sin error ✓.
- **Pendiente (Eduardo):** en tu próxima sesión `codex`, confirmá el trust de los hooks si lo pide. Test vivo: pedile a Codex `cat ~/.config/ebrain/.env` → debe negarse.

## Reinstalar / refrescar

`bash ~/eBrain/overlay/codex-harness/install.sh` (source de verdad = este dir versionado; `~/.codex/hooks/` son copias).
