#!/usr/bin/env bash
# Codex SessionStart hook — inyecta contexto ebrain/CKIS al arrancar una sesión, para que
# el cerebro (Codex) trabaje CON contexto sin que Eduardo tenga que pegarlo a mano.
# Emite additionalContext (Claude-compatible). FAIL-OPEN: cualquier error → sin contexto (exit 0).
set -uo pipefail

# This file is installed as a COPY outside the checkout, so it cannot locate eBrain by
# walking up from its own path the way harness/core/ebrain-home.sh does. It reads the
# location install.sh recorded instead.
EBRAIN_HOME="${EBRAIN_HOME:-$(cat "${XDG_CONFIG_HOME:-$HOME/.config}/ebrain/home" 2>/dev/null)}"
: "${EBRAIN_HOME:=$HOME/eBrain}"

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
