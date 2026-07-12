#!/usr/bin/env bash
# doctor.sh — `ebrain doctor`: chequeos CKIS de salud sobre el harness + motor gbrain.
# Superset de `ebrain harness doctor` (que solo mira adapters). Agrega: launchers, config,
# alarma de drift del guard (contract-test), aislamiento de sources de cliente, gasto vs cap.
#
# Lock-aware: PGLite es single-connection. Si el MCP `serve` tiene el lock (sesión de agente
# viva), los chequeos que tocan la DB se REPORTAN como diferidos en vez de fallar — el chequeo
# directo autoritativo corre cuando el MCP está abajo (p.ej. el cron nocturno / dream cycle).
#
# rc=1 SOLO si un check DURO falla: launcher faltante, routing.yaml/dotenv ausente,
# contract-test con divergencia, o SOURCE DE CLIENTE detectado. Los WARN no tumban rc.
set -uo pipefail

EBRAIN_HOME="${EBRAIN_HOME:-$HOME/eBrain}"
CORE="$EBRAIN_HOME/harness/core"
CFG="$HOME/.config/ebrain"

WARN=0; FAILN=0
c_ok(){   printf '  \033[32mok\033[0m   %s\n' "$1"; }
c_warn(){ printf '  \033[33mwarn\033[0m %s\n' "$1"; WARN=$((WARN+1)); }
c_fail(){ printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAILN=$((FAILN+1)); }
c_sec(){  printf '\n\033[1m%s\033[0m\n' "$1"; }

printf '\033[1mebrain doctor\033[0m — %s\n' "$(date '+%Y-%m-%d %H:%M')"

# ── launchers ────────────────────────────────────────────────────────────────
c_sec "launchers"
for f in gbrain-run gbrain-mcp ebrain-route ebrain-q; do
  if [ -x "$CFG/$f" ]; then c_ok "$f"; else c_fail "$f falta o no ejecutable ($CFG/$f)"; fi
done
if command -v ebrain >/dev/null 2>&1; then c_ok "ebrain en PATH ($(command -v ebrain))"; else c_warn "ebrain no está en PATH (~/.local/bin)"; fi

# ── config ───────────────────────────────────────────────────────────────────
c_sec "config"
[ -f "$CFG/routing.yaml" ] && c_ok "routing.yaml" || c_fail "routing.yaml falta ($CFG/routing.yaml)"
if [ -f "$CFG/.env" ]; then
  perm="$(stat -c '%a' "$CFG/.env" 2>/dev/null || echo '?')"
  [ "$perm" = "600" ] && c_ok "dotenv de config presente (chmod 600)" || c_warn "dotenv presente pero perms=$perm (esperado 600)"
  # presencia de keys SIN imprimir valor (subshell: source carga sin volcar; solo -n)
  for k in OPENAI_API_KEY OPENROUTER_API_KEY; do
    if ( set +u; . "$CFG/.env" >/dev/null 2>&1; [ -n "${!k:-}" ] ); then c_ok "$k set"; else c_warn "$k no presente en la config"; fi
  done
else
  c_fail "dotenv de config falta ($CFG/.env)"
fi

# ── guard / contract (alarma de drift) ───────────────────────────────────────
c_sec "guard de secretos (contract-test)"
ct_tmp="$(mktemp)"
if bash "$CORE/contract-test.sh" >"$ct_tmp" 2>&1; then
  c_ok "$(tail -1 "$ct_tmp")"
else
  c_fail "$(tail -1 "$ct_tmp")"
  grep -E '✗|⚠' "$ct_tmp" | sed 's/^/       /'
fi
rm -f "$ct_tmp"

# ── flota de adapters ────────────────────────────────────────────────────────
c_sec "flota (harness adapters)"
all_agents(){ for m in "$EBRAIN_HOME"/harness/adapters/*/manifest.yaml; do [ -f "$m" ] && basename "$(dirname "$m")"; done; }
for a in $(all_agents); do
  a_tmp="$(mktemp)"
  if bash "$CORE/install.sh" --doctor "$a" >"$a_tmp" 2>&1; then c_ok "adapter $a"; else c_warn "adapter $a: pendiente (ver 'ebrain harness doctor $a')"; fi
  rm -f "$a_tmp"
done

# ── sources: aislamiento de cliente (security-critical) ──────────────────────
c_sec "sources (aislamiento de cliente)"
serve_pid="$(pgrep -f 'cli\.ts serve' 2>/dev/null | head -1 || true)"
if [ -n "$serve_pid" ]; then
  c_warn "brain servido por MCP (PID $serve_pid) → lock PGLite activo; chequeo directo de sources diferido (corre con MCP abajo, p.ej. cron nocturno)"
else
  src_out="$(cd /tmp && timeout 60 "$CFG/gbrain-run" sources list --timeout=45000 2>&1 || true)"
  if printf '%s' "$src_out" | grep -qiE 'brisas|dekko'; then
    c_fail "SOURCE DE CLIENTE detectado en el brain: $(printf '%s' "$src_out" | grep -iE 'brisas|dekko' | head -1)"
  elif printf '%s' "$src_out" | grep -qiE 'second-brain|company-brain|agent-memory'; then
    c_ok "sources = solo propios (second-brain / company-brain / agent-memory); cero cliente"
  else
    c_warn "no pude leer sources: $(printf '%s' "$src_out" | head -1)"
  fi
fi

# ── gasto OpenRouter (mes actual) ────────────────────────────────────────────
c_sec "gasto OpenRouter (mes actual)"
spend="$CFG/spend.jsonl"
cap="$(grep -E 'monthly_usd' "$CFG/routing.yaml" 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)"
cap="${cap:-10}"
if [ -f "$spend" ]; then
  mtd="$(awk -F'"usd":' -v m="$(date +%Y-%m)" '$0 ~ "\"ts\":\""m {split($2,a,"[,}]"); s+=a[1]} END{printf "%.4f", s+0}' "$spend")"
  if awk -v s="$mtd" -v c="$cap" 'BEGIN{exit !(s+0 >= c+0)}'; then
    c_fail "gasto MTD \$$mtd ≥ cap \$$cap (route.ts abortará)"
  elif awk -v s="$mtd" -v c="$cap" 'BEGIN{exit !(s+0 >= 0.8*(c+0))}'; then
    c_warn "gasto MTD \$$mtd (≥80% del cap \$$cap)"
  else
    c_ok "gasto MTD \$$mtd / cap \$$cap"
  fi
else
  c_warn "spend.jsonl aún no existe (sin rutas registradas)"
fi
c_warn "gap conocido: el spend de gbrain (think/dream) NO entra al ledger local; su cap real es server-side"

# ── brain (motor gbrain) ─────────────────────────────────────────────────────
c_sec "brain (motor gbrain)"
if [ -n "$serve_pid" ]; then
  c_ok "brain UP (MCP serve, PID $serve_pid); stats vía tools MCP o 'ebrain status' con MCP idle"
else
  h_tmp="$(mktemp)"
  if (cd /tmp && timeout 60 "$CFG/gbrain-run" doctor >"$h_tmp" 2>&1); then :; fi
  if grep -q 'GBrain Health Check' "$h_tmp"; then
    c_ok "gbrain doctor corrió (WARN internos de resolver_health/skills = no-bloqueantes para ebrain)"
  else
    c_warn "gbrain doctor no dio salud legible: $(head -1 "$h_tmp")"
  fi
  rm -f "$h_tmp"
fi

# ── veredicto ────────────────────────────────────────────────────────────────
echo
if [ "$FAILN" -gt 0 ]; then
  printf '\033[31mebrain doctor: %d FAIL · %d warn\033[0m\n' "$FAILN" "$WARN"; exit 1
else
  printf '\033[32mebrain doctor: OK\033[0m · %d warn\n' "$WARN"; exit 0
fi
