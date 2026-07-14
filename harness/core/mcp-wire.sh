#!/usr/bin/env bash
# harness/core/mcp-wire.sh <agent> — cablea el MCP de ebrain (BUS DE MEMORIA cross-agente) en la config
# del agente, idempotente, preservando otros servers. Es la unificación real para agentes SIN hooks:
# la lectura de memoria es agnóstica (MCP), así que basta registrar el server. FAIL si falta jq/launcher.
#
# Formatos soportados:
#   cursor   → ~/.cursor/mcp.json               (.mcpServers.ebrain)
#   opencode → ~/.config/opencode/opencode.json (.mcp.ebrain + .instructions → AGENTS.md de normas)
set -uo pipefail

agent="${1:?uso: mcp-wire.sh <cursor|opencode>}"
SRV="$HOME/.config/ebrain/ebrain-mcp"
[ -x "$SRV" ] || SRV="$HOME/.config/ebrain/gbrain-mcp"
command -v jq >/dev/null 2>&1 || { echo "mcp-wire: jq requerido" >&2; exit 1; }
[ -x "$SRV" ] || { echo "mcp-wire: falta el launcher MCP $SRV" >&2; exit 1; }

merge() { # <file> <jq-filter>
  local f="$1" filter="$2" tmp; mkdir -p "$(dirname "$f")"
  [ -f "$f" ] || echo '{}' > "$f"
  tmp="$(mktemp)" || return 1
  if jq --arg cmd "$SRV" --arg agm "$HOME/.config/opencode/AGENTS.md" "$filter" "$f" > "$tmp" 2>/dev/null; then
    mv "$tmp" "$f"
  else
    rm -f "$tmp"; echo "mcp-wire: JSON inválido en $f — no lo toco (arreglalo a mano)" >&2; return 1
  fi
}

case "$agent" in
  cursor)
    f="$HOME/.cursor/mcp.json"
    merge "$f" '.mcpServers.ebrain = {command:$cmd, args:[]}' && echo "mcp-wire ✓ cursor → $f (server 'ebrain')"
    ;;
  opencode)
    f="$HOME/.config/opencode/opencode.json"
    merge "$f" '.mcp.ebrain = {type:"local", command:[$cmd], enabled:true} | .instructions = ((.instructions // []) + [$agm] | unique)' \
      && echo "mcp-wire ✓ opencode → $f (server 'ebrain' + instructions AGENTS.md)"
    ;;
  *) echo "mcp-wire: agente no soportado '$agent' (cursor|opencode)" >&2; exit 2 ;;
esac
