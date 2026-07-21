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
#
# --json (SPRINT-TUI 6.1.2): corre EXACTAMENTE los mismos checks (mismo costo/lock-awareness)
# pero en vez de texto coloreado emite UN objeto JSON a stdout y nada más —
# {checks:[{id,level:"ok"|"warn"|"fail",msg}], rc} — con rc coherente con el peor nivel (igual
# que el path humano: rc=1 solo si hay algún fail). El path humano (sin --json) es el de siempre.
set -uo pipefail

. "$(dirname -- "${BASH_SOURCE[0]}")/ebrain-home.sh"
EBRAIN_HOME="$(ebrain_resolve_home "${BASH_SOURCE[0]}")"

CORE="$EBRAIN_HOME/harness/core"
CFG="$HOME/.config/ebrain"
RUN="$CFG/ebrain-run"
[ -x "$RUN" ] || RUN="$CFG/gbrain-run"

JSON=0
for _da in "$@"; do [ "$_da" = "--json" ] && JSON=1; done

WARN=0; FAILN=0
declare -a CHECKS=()

add_check() { # level id msg
  CHECKS+=("$(jq -n --arg id "$2" --arg level "$1" --arg msg "$3" '{id:$id, level:$level, msg:$msg}')")
}

# c_ok/c_warn/c_fail <id> <msg> — siempre acumulan el check estructurado; el texto coloreado
# solo se imprime en el path humano (JSON=0).
c_ok(){   add_check ok "$1" "$2";                       [ "$JSON" = 1 ] || printf '  \033[32mok\033[0m   %s\n' "$2"; }
c_warn(){ add_check warn "$1" "$2"; WARN=$((WARN+1));   [ "$JSON" = 1 ] || printf '  \033[33mwarn\033[0m %s\n' "$2"; }
c_fail(){ add_check fail "$1" "$2"; FAILN=$((FAILN+1));  [ "$JSON" = 1 ] || printf '  \033[31mFAIL\033[0m %s\n' "$2"; }
c_sec(){  [ "$JSON" = 1 ] || printf '\n\033[1m%s\033[0m\n' "$1"; }

[ "$JSON" = 1 ] || printf '\033[1mebrain doctor\033[0m — %s\n' "$(date '+%Y-%m-%d %H:%M')"

# ── launchers ────────────────────────────────────────────────────────────────
c_sec "launchers"
for f in ebrain-run ebrain-mcp ebrain-route ebrain-q ebrain-brain ebrain-daemon ebrain-up; do
  if [ -x "$CFG/$f" ]; then c_ok "launcher:$f" "$f"; else c_fail "launcher:$f" "$f falta o no ejecutable ($CFG/$f)"; fi
done
for f in gbrain-run gbrain-mcp; do
  if [ -e "$CFG/$f" ]; then c_ok "launcher:compat:$f" "$f compat"; else c_warn "launcher:compat:$f" "$f compat ausente (fallback stdio/legacy podría requerirlo)"; fi
done
if command -v ebrain >/dev/null 2>&1; then c_ok "path:ebrain" "ebrain en PATH ($(command -v ebrain))"; else c_warn "path:ebrain" "ebrain no está en PATH (~/.local/bin)"; fi

c_sec "daemon HTTP-MCP"
if "$EBRAIN_HOME/scripts/ebrain-daemon" status >/dev/null 2>&1; then
  c_ok "daemon:status" "daemon HTTP-MCP UP (:${EBRAIN_BRAIN_PORT:-8541} healthy)"
else
  c_warn "daemon:status" "daemon HTTP-MCP DOWN (fallback stdio disponible si se registra manualmente)"
fi

# ── config ───────────────────────────────────────────────────────────────────
c_sec "config"
[ -f "$CFG/routing.yaml" ] && c_ok "config:routing.yaml" "routing.yaml" || c_fail "config:routing.yaml" "routing.yaml falta ($CFG/routing.yaml)"
if [ -f "$CFG/.env" ]; then
  perm="$(stat -c '%a' "$CFG/.env" 2>/dev/null || echo '?')"
  [ "$perm" = "600" ] && c_ok "config:dotenv:perm" "dotenv de config presente (chmod 600)" || c_warn "config:dotenv:perm" "dotenv presente pero perms=$perm (esperado 600)"
  # presencia de keys SIN imprimir valor (subshell: source carga sin volcar; solo -n)
  for k in OPENAI_API_KEY OPENROUTER_API_KEY; do
    if ( set +u; . "$CFG/.env" >/dev/null 2>&1; [ -n "${!k:-}" ] ); then c_ok "config:env:$k" "$k set"; else c_warn "config:env:$k" "$k no presente en la config"; fi
  done
else
  c_fail "config:dotenv" "dotenv de config falta ($CFG/.env)"
fi

# ── guard / contract (alarma de drift) ───────────────────────────────────────
# El contrato (guard fixtures + JSON zod) es GLOBAL, no per-adapter. Se corre UNA vez acá, autoritativo,
# con la var sin setear; luego `export EBRAIN_CONTRACT_TESTED=1` hace que los 6 `install.sh --doctor`
# de la sección de flota (que también invocan contract-test.sh) hagan short-circuit en vez de re-correr
# la suite bun 6× (SPRINT-TUI 6.1.8 perf: doctor 31s→~18s). No cambia rc: este check ya registró
# ok/fail arriba; los adapters no son el watchdog del contrato — este bloque sí.
c_sec "guard de secretos (contract-test)"
ct_tmp="$(mktemp)"
if bash "$CORE/contract-test.sh" >"$ct_tmp" 2>&1; then
  c_ok "guard:contract-test" "$(tail -1 "$ct_tmp")"
else
  c_fail "guard:contract-test" "$(tail -1 "$ct_tmp")"
  [ "$JSON" = 1 ] || grep -E '✗|⚠' "$ct_tmp" | sed 's/^/       /'
fi
rm -f "$ct_tmp"
export EBRAIN_CONTRACT_TESTED=1   # ver comentario arriba: dedup del contrato en el árbol de este doctor

# ── flota de adapters ────────────────────────────────────────────────────────
c_sec "flota (harness adapters)"
all_agents(){ for m in "$EBRAIN_HOME"/harness/adapters/*/manifest.yaml; do [ -f "$m" ] && basename "$(dirname "$m")"; done; }
for a in $(all_agents); do
  a_tmp="$(mktemp)"
  if bash "$CORE/install.sh" --doctor "$a" >"$a_tmp" 2>&1; then c_ok "adapter:$a" "adapter $a"; else c_warn "adapter:$a" "adapter $a: pendiente (ver 'ebrain harness doctor $a')"; fi
  if grep -q 'mcp .*http-daemon' "$a_tmp" 2>/dev/null; then
    c_ok "adapter:$a:mcp" "adapter $a MCP=http-daemon"
  elif grep -q 'mcp .*stdio-local' "$a_tmp" 2>/dev/null; then
    c_warn "adapter:$a:mcp" "adapter $a MCP=stdio-local"
  fi
  rm -f "$a_tmp"
done

# ── sources: repository isolation (security-critical) ────────────────────────
# Read the deny policy from its single source of truth instead of restating it here: an inlined
# copy is exactly how this check silently drifted out of sync with the harness before.
c_sec "sources (repository isolation)"
. "$CORE/trust.sh"

# Surface the policy state FIRST. Every isolation verdict below is conditional on it, and a policy
# doctor cannot read is the one case where a green isolation line would be a lie.
if [ "$TRUST_POLICY_ERROR" -eq 1 ]; then
  c_fail "sources:deny-policy" "deny policy exists but is unreadable or invalid — every repository is being treated as denied"
elif [ -n "$TRUST_DENY" ]; then
  c_ok "sources:deny-policy" "deny policy loaded ($(printf '%s' "$TRUST_DENY" | tr '|' '\n' | grep -c .) entries)"
else
  c_ok "sources:deny-policy" "no deny entries configured (federation remains default-deny)"
fi

serve_pid="$(pgrep -f 'cli\.ts serve' 2>/dev/null | head -1 || true)"
REMOTE_TOOLS="$EBRAIN_HOME/cli/remote-tools.ts"
BUN_BIN="${BUN_BIN:-$HOME/.bun/bin/bun}"; command -v bun >/dev/null 2>&1 && BUN_BIN=bun
if [ -n "$serve_pid" ] && [ -f "$REMOTE_TOOLS" ]; then
  src_json="$(mktemp)"; src_err="$(mktemp)"
  if "$BUN_BIN" run "$REMOTE_TOOLS" sources-list --json >"$src_json" 2>"$src_err"; then
    if [ "$TRUST_POLICY_ERROR" -eq 1 ]; then
      # Never claim isolation is clean under a policy we could not parse.
      c_warn "sources:isolation" "cannot verify: the deny policy did not load (see sources:deny-policy)"
    elif [ -n "$TRUST_DENY" ] && jq -e --arg deny "$TRUST_DENY" '.sources[] | select(((.id // "") + " " + (.name // "") + " " + (.local_path // "")) | test($deny; "i"))' "$src_json" >/dev/null 2>&1; then
      c_fail "sources:isolation" "denied source detected via the MCP daemon"
    elif jq -e '.sources[] | select(.id == "second-brain" or .id == "company-brain" or .id == "agent-memory")' "$src_json" >/dev/null 2>&1; then
      c_ok "sources:isolation" "sources via the MCP daemon are federated and none is denied"
    else
      c_warn "sources:isolation" "the MCP daemon responded, but no expected federated source was visible"
    fi
  else
    c_warn "sources:isolation" "could not read sources via the MCP daemon: $(head -1 "$src_err")"
  fi
  rm -f "$src_json" "$src_err"
else
  src_out="$(cd /tmp && timeout 60 "$RUN" sources list --timeout=45000 2>&1 || true)"
  if [ "$TRUST_POLICY_ERROR" -eq 1 ]; then
    # trust_denied answers "denied" for everything in this state; that is correct for enforcement
    # but would be a false isolation verdict here.
    c_warn "sources:isolation" "cannot verify: the deny policy did not load (see sources:deny-policy)"
  elif trust_denied "$src_out"; then
    # Report that a denied source is present, never which one — doctor output gets pasted into
    # issues and chats.
    c_fail "sources:isolation" "a denied source is registered in the brain (check 'sources list' locally)"
  elif printf '%s' "$src_out" | grep -qiE 'second-brain|company-brain|agent-memory'; then
    c_ok "sources:isolation" "sources are federated and none is denied"
  else
    c_warn "sources:isolation" "no pude leer sources: $(printf '%s' "$src_out" | head -1)"
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
    c_fail "spend:mtd" "gasto MTD \$$mtd ≥ cap \$$cap (route.ts abortará)"
  elif awk -v s="$mtd" -v c="$cap" 'BEGIN{exit !(s+0 >= 0.8*(c+0))}'; then
    c_warn "spend:mtd" "gasto MTD \$$mtd (≥80% del cap \$$cap)"
  else
    c_ok "spend:mtd" "gasto MTD \$$mtd / cap \$$cap"
  fi
else
  c_warn "spend:mtd" "spend.jsonl aún no existe (sin rutas registradas)"
fi
c_warn "spend:gbrain-gap" "gap conocido: el spend del motor (think/dream) NO entra al ledger local; su cap real es server-side"

# ── brain engine ─────────────────────────────────────────────────────────────
c_sec "brain engine"
if [ -n "$serve_pid" ]; then
  c_ok "brain:engine" "brain UP (MCP serve, PID $serve_pid); stats vía tools MCP o 'ebrain status' con MCP idle"
else
  h_tmp="$(mktemp)"
  if (cd /tmp && timeout 60 "$RUN" doctor >"$h_tmp" 2>&1); then :; fi
  if grep -q 'GBrain Health Check' "$h_tmp"; then
    c_ok "brain:engine" "el motor respondió (WARN internos de resolver_health/skills = no-bloqueantes para ebrain)"
  else
    c_warn "brain:engine" "el motor no dio salud legible: $(head -1 "$h_tmp")"
  fi
  rm -f "$h_tmp"
fi

# ── veredicto ────────────────────────────────────────────────────────────────
rc=0; [ "$FAILN" -gt 0 ] && rc=1

if [ "$JSON" = 1 ]; then
  printf '%s\n' "${CHECKS[@]}" | jq -s --argjson rc "$rc" '{checks: ., rc: $rc}'
  exit "$rc"
fi

echo
if [ "$rc" -gt 0 ]; then
  printf '\033[31mebrain doctor: %d FAIL · %d warn\033[0m\n' "$FAILN" "$WARN"
else
  printf '\033[32mebrain doctor: OK\033[0m · %d warn\n' "$WARN"
fi
exit "$rc"
