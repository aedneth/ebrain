#!/usr/bin/env bash
# harness/core/inject-context.sh — SESSION_START, agent-agnostic. Inyecta contexto ebrain/CKIS al
# arrancar una sesión, para que CUALQUIER agente trabaje CON contexto sin que Eduardo lo pegue a mano.
# Emite additionalContext (contrato compartido) + fallback en texto plano. FAIL-OPEN: error → exit 0.
#
# Agente: $AGENT_NAME (lo setea el adapter) → fallback "el agente".
set -uo pipefail

. "$(dirname -- "${BASH_SOURCE[0]}")/ebrain-home.sh"
EBRAIN_HOME="$(ebrain_resolve_home "${BASH_SOURCE[0]}")"

AGENT="${AGENT_NAME:-el agente}"

PAYLOAD=""; [ ! -t 0 ] && PAYLOAD="$(cat 2>/dev/null || true)"
CWD=""
if [ -n "$PAYLOAD" ] && command -v jq >/dev/null 2>&1; then
  CWD="$(printf '%s' "$PAYLOAD" | jq -r '.cwd // empty' 2>/dev/null || true)"
fi
[ -z "$CWD" ] && CWD="$PWD"

CTX=""
add() { CTX="${CTX}$1
"; }

add "▶ ebrain: MCP conectado. Usá list_skills/get_skill (skills federadas: ckis+company+gstack+harness, incl. 'remember') y query/search/think (memoria semántica cross-source: Second Brain + Company Brain + agent-memory) ANTES de asumir. Estructura de código → graphify/Dev Brain."
add "▶ Memoria de escritura: cuando aprendas algo durable, guardalo con 'ebrain remember \"<learning>\"' (permanente, cross-agente). El session log al cerrar es automático."
add "▶ Normas activas (bloque ebrain-norms, fuente $EBRAIN_HOME/harness/core/NORMS.md): secretos = nunca leer/imprimir dotenv/credenciales (guard PreToolUse activo); repos denegados (política local de deny) = deny de exfiltración/push; SOP + quien construye no aprueba (otro agente audita); rastro narrativo; un agente vivo a la vez (RAM 4GB); nunca auto-escalar a frontier."

# CHANGELOG del repo activo (desde cwd), si existe.
REPO="$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || true)"
for cl in "$REPO/CHANGELOG.md" "$REPO/01-systems/ckis/CHANGELOG.md"; do
  if [ -n "$REPO" ] && [ -f "$cl" ]; then
    latest="$(grep -m1 '^## ' "$cl" 2>/dev/null | sed 's/^## //')"
    [ -n "$latest" ] && { add "▶ $(basename "$REPO") último cambio: ${latest}"; break; }
  fi
done

# CHANGELOG de ebrain (siempre útil: es la infra de todos los agentes).
CL="$EBRAIN_HOME/CHANGELOG.md"
if [ -f "$CL" ]; then
  latest="$(grep -m1 '^## ' "$CL" 2>/dev/null | sed 's/^## //')"
  [ -n "$latest" ] && add "▶ ebrain último cambio: ${latest}"
fi

# Salida como additionalContext (contrato compartido) + fallback texto plano.
jq -n --arg c "$CTX" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}' 2>/dev/null || printf '%s\n' "$CTX"
exit 0
