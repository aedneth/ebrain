#!/usr/bin/env bash
# Codex SessionStart hook — inyecta contexto ebrain/CKIS al arrancar una sesión, para que
# el cerebro (Codex) trabaje CON contexto sin que Eduardo tenga que pegarlo a mano.
# Emite additionalContext (Claude-compatible). FAIL-OPEN: cualquier error → sin contexto (exit 0).
set -uo pipefail

# This file is installed as a COPY outside the checkout, so it cannot locate eBrain by walking up
# from its own path the way harness/core/ebrain-home.sh does. It reads the location install.sh
# recorded — applying the SAME validation the canonical resolver applies, which is the part pass 5
# found missing (F-S7): the previous version accepted any non-empty record, so a record left behind
# by a moved or deleted checkout won over a perfectly good one at the default location, and CRLF in
# the record produced a path with a trailing carriage return that matched nothing.
ebrain__looks_like_root() { [ -f "$1/cli/ebrain" ] && [ -d "$1/harness/core" ]; }
if [ -z "${EBRAIN_HOME:-}" ]; then
	# `[ -r ]` guard before the redirect: `< missingfile` makes the shell print an error that
	# `2>/dev/null` on tr does not suppress (pass 6, F-T13).
	_rec_file="${XDG_CONFIG_HOME:-$HOME/.config}/ebrain/home"
	if [ -r "$_rec_file" ]; then _rec="$(tr -d '\r\n' < "$_rec_file")"; else _rec=""; fi
	if [ -n "$_rec" ] && ebrain__looks_like_root "$_rec"; then
		EBRAIN_HOME="$_rec"
	else
		EBRAIN_HOME="$HOME/eBrain"
	fi
fi

CTX=""
add() { CTX="${CTX}$1
"; }

add "▶ ebrain: MCP conectado (mcp ebrain). Usá list_skills/get_skill (75 skills federadas) y query/search/think (memoria semántica cross-source Second Brain + Company Brain) ANTES de asumir. Estructura de código → graphify/Dev Brain."
add "▶ Normas activas (~/.codex/AGENTS.md): secretos = nunca leer/imprimir .env/credenciales (guard PreToolUse activo); repos denegados (política local de deny) = deny de exfiltración/push; SOP + maker≠checker (Opus audita a Codex); rastro narrativo (session log + CHANGELOG); un agente vivo a la vez (RAM 4GB)."

# Última línea estructural del CHANGELOG de ebrain, si estamos en/cerca del repo o siempre útil.
CL="$EBRAIN_HOME/CHANGELOG.md"
if [ -f "$CL" ]; then
  latest="$(grep -m1 '^## ' "$CL" 2>/dev/null | sed 's/^## //')"
  [ -n "$latest" ] && add "▶ ebrain último cambio: ${latest}"
fi

# Salida como additionalContext de SessionStart.
jq -n --arg c "$CTX" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}' 2>/dev/null || {
  # fallback: texto plano por si el runtime toma stdout directo
  printf '%s\n' "$CTX"
}
exit 0
