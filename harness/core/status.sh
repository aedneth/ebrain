#!/usr/bin/env bash
# status.sh — `ebrain status`: snapshot rápido (siempre rc=0). Lo que un humano quiere ver de un vistazo.
# Lock-aware: si el MCP tiene el lock de PGLite, muestra lo que se puede sin tocar la DB.
set -uo pipefail

EBRAIN_HOME="${EBRAIN_HOME:-$HOME/eBrain}"
CFG="$HOME/.config/ebrain"

printf '\033[1mebrain status\033[0m — %s\n' "$(date '+%Y-%m-%d %H:%M')"

# brain
serve_pid="$(pgrep -f 'cli\.ts serve' 2>/dev/null | head -1 || true)"
if [ -n "$serve_pid" ]; then
  printf '  brain    UP · servido por MCP (PID %s) · lock PGLite activo\n' "$serve_pid"
else
  src="$(cd /tmp && timeout 50 "$CFG/gbrain-run" sources list --timeout=40000 2>&1 || true)"
  names="$(printf '%s' "$src" | grep -oE '"name": *"[^"]+"' | cut -d'"' -f4 | grep -v '^default$' | paste -sd' ' - 2>/dev/null)"
  if [ -n "$names" ]; then printf '  brain    idle · sources: %s\n' "$names"
  else printf '  brain    idle · sources: (no legibles) %s\n' "$(printf '%s' "$src" | head -1)"; fi
fi

# gasto
spend="$CFG/spend.jsonl"
cap="$(grep -E 'monthly_usd' "$CFG/routing.yaml" 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)"; cap="${cap:-10}"
if [ -f "$spend" ]; then
  mtd="$(awk -F'"usd":' -v m="$(date +%Y-%m)" '$0 ~ "\"ts\":\""m {split($2,a,"[,}]"); s+=a[1]} END{printf "%.4f", s+0}' "$spend")"
  n="$(grep -c "\"ts\":\"$(date +%Y-%m)" "$spend" 2>/dev/null || echo 0)"
  printf '  gasto    $%s / $%s cap · %s rutas este mes (ledger route.ts; gbrain server-side aparte)\n' "$mtd" "$cap" "$n"
else
  printf '  gasto    sin rutas registradas · cap $%s\n' "$cap"
fi

# flota
agents="$(for m in "$EBRAIN_HOME"/harness/adapters/*/manifest.yaml; do [ -f "$m" ] && basename "$(dirname "$m")"; done | paste -sd' ' -)"
na="$(printf '%s' "$agents" | wc -w)"
printf '  flota    %s adapters: %s\n' "$na" "$agents"

# memoria agéntica
mem="$EBRAIN_HOME/memory"
if [ -d "$mem" ]; then
  learn="$(find "$mem/learnings" -name '*.md' 2>/dev/null | wc -l)"
  sess="$(find "$mem/sessions" -name '*.md' 2>/dev/null | wc -l)"
  printf '  memoria  %s learnings · %s sesiones (agent-memory git)\n' "$learn" "$sess"
fi

exit 0
