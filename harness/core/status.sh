#!/usr/bin/env bash
# status.sh — `ebrain status`: snapshot rápido (siempre rc=0). Lo que un humano quiere ver de un vistazo.
# Lock-aware: si el MCP tiene el lock de PGLite, muestra lo que se puede sin tocar la DB.
#
# --json (SPRINT-TUI 6.1.1): emite UN objeto JSON a stdout y nada más —
# {brain:{state,served_by,sources,cached},spend:{mtd,cap,remaining},fleet:{agents:[{name,ok}]},memory:{learnings,sessions}}.
# Mismo lock-awareness que el path humano: si el brain está servido por MCP, NO se dispara una query
# que compita por el lock de PGLite — `brain.sources` degrada a la última lista cacheada
# ($CFG/.cache/sources.json) con `brain.cached:true`. El path humano (sin --json), abajo, queda intacto:
# este bloque hace `exit 0` antes de llegar a él.
set -uo pipefail

EBRAIN_HOME="${EBRAIN_HOME:-$HOME/eBrain}"
CORE="$EBRAIN_HOME/harness/core"
CFG="$HOME/.config/ebrain"

JSON=0
for _sa in "$@"; do [ "$_sa" = "--json" ] && JSON=1; done

if [ "$JSON" = 1 ]; then
  CACHE_DIR="$CFG/.cache"; SOURCES_CACHE="$CACHE_DIR/sources.json"
  BUN="${BUN:-$HOME/.bun/bin/bun}"; command -v bun >/dev/null 2>&1 && BUN=bun
  MGET="$CORE/manifest-get.ts"

  serve_pid="$(pgrep -f 'cli\.ts serve' 2>/dev/null | head -1 || true)"
  if [ -n "$serve_pid" ]; then
    j_state="up"; j_served_by="mcp:$serve_pid"; j_cached=true
    j_sources="$( [ -f "$SOURCES_CACHE" ] && cat "$SOURCES_CACHE" || echo '[]' )"
    printf '%s' "$j_sources" | jq -e . >/dev/null 2>&1 || j_sources='[]'
  else
    j_state="idle"; j_served_by="direct"; j_cached=false
    j_src="$(cd /tmp && timeout 50 "$CFG/gbrain-run" sources list --timeout=40000 2>&1 || true)"
    j_names="$(printf '%s' "$j_src" | grep -oE '"name": *"[^"]+"' | cut -d'"' -f4 | grep -v '^default$')"
    j_sources="$(printf '%s\n' "$j_names" | jq -R -s -c 'split("\n") | map(select(length>0))')"
    mkdir -p "$CACHE_DIR" 2>/dev/null || true
    printf '%s' "$j_sources" > "$SOURCES_CACHE" 2>/dev/null || true
  fi

  j_spend="$CFG/spend.jsonl"
  j_cap="$(grep -E 'monthly_usd' "$CFG/routing.yaml" 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)"; j_cap="${j_cap:-10}"
  j_mtd="0.0000"
  if [ -f "$j_spend" ]; then
    j_mtd="$(awk -F'"usd":' -v m="$(date +%Y-%m)" '$0 ~ "\"ts\":\""m {split($2,a,"[,}]"); s+=a[1]} END{printf "%.4f", s+0}' "$j_spend")"
  fi
  j_remaining="$(awk -v c="$j_cap" -v m="$j_mtd" 'BEGIN{printf "%.4f", c-m}')"

  j_fleet="[]"
  if command -v "$BUN" >/dev/null 2>&1 && [ -f "$MGET" ]; then
    j_fleet="$(
      for m in "$EBRAIN_HOME"/harness/adapters/*/manifest.yaml; do
        [ -f "$m" ] || continue
        ja="$(basename "$(dirname "$m")")"
        jkey="$("$BUN" run "$MGET" "$m" agent 2>/dev/null || true)"
        jok=false; [ "$jkey" = "$ja" ] && jok=true
        jq -n --arg name "$ja" --argjson ok "$jok" '{name:$name, ok:$ok}'
      done | jq -s -c '.'
    )"
  fi

  j_mem="$EBRAIN_HOME/memory"
  j_learn=0; j_sess=0
  if [ -d "$j_mem" ]; then
    j_learn="$(find "$j_mem/learnings" -name '*.md' 2>/dev/null | wc -l)"
    j_sess="$(find "$j_mem/sessions" -name '*.md' 2>/dev/null | wc -l)"
  fi

  jq -n \
    --arg state "$j_state" --arg served_by "$j_served_by" --argjson cached "$j_cached" --argjson sources "$j_sources" \
    --argjson mtd "$j_mtd" --argjson cap "$j_cap" --argjson remaining "$j_remaining" \
    --argjson fleet_agents "$j_fleet" --argjson learnings "$j_learn" --argjson sessions "$j_sess" \
    '{brain:{state:$state, served_by:$served_by, sources:$sources, cached:$cached},
      spend:{mtd:$mtd, cap:$cap, remaining:$remaining},
      fleet:{agents:$fleet_agents},
      memory:{learnings:$learnings, sessions:$sessions}}'
  exit 0
fi

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
  printf '  gasto    $%s / $%s cap · %s rutas este mes (ledger route.ts; motor server-side aparte)\n' "$mtd" "$cap" "$n"
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
