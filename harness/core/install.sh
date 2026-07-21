#!/usr/bin/env bash
# harness/core/install.sh — `ebrain harness install <agent>` / `ebrain harness doctor [agent]`.
# Instala/actualiza el harness de un agente desde su manifest declarativo (adapters/<agent>/manifest.yaml):
#   1) escribe los wrappers de hooks (thin exec de los scripts core, estampando AGENT_NAME) — idempotente
#   2) renderiza el bloque de normas gestionado en el target del agente
#   3) reporta el registro MCP (lo corre con --mcp)
#   4) verifica el cableado de hooks en el config del runtime (sin mutar JSON: reporta wired/pending)
#   5) doctor: contract tests del guard + self-test + doctor nativo del agente
# claude/codex ya están cableados → install = verificación + CERO cambio de comportamiento (la validación).
# gemini/generic = agente nuevo: crea todo desde el manifest (la prueba de la tesis).
set -uo pipefail

. "$(dirname -- "${BASH_SOURCE[0]}")/ebrain-home.sh"
EBRAIN_HOME="$(ebrain_resolve_home "${BASH_SOURCE[0]}")"

HARNESS="$EBRAIN_HOME/harness"
CORE="$HARNESS/core"
ADAPTERS="$HARNESS/adapters"
MGET="$CORE/manifest-get.ts"
BUN="${BUN:-$HOME/.bun/bin/bun}"; command -v bun >/dev/null 2>&1 && BUN=bun

DOCTOR_ONLY=0; RUN_MCP=0; AGENT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --doctor) DOCTOR_ONLY=1; shift ;;
    --mcp)    RUN_MCP=1; shift ;;
    -*) echo "install: flag desconocido '$1'" >&2; exit 2 ;;
    *) AGENT="$1"; shift ;;
  esac
done
[ -n "$AGENT" ] || { echo "uso: ebrain harness install <agent> | ebrain harness doctor <agent>" >&2; exit 2; }

MANIFEST="$ADAPTERS/$AGENT/manifest.yaml"
[ -f "$MANIFEST" ] || { echo "install: no hay adapter '$AGENT' ($MANIFEST). Disponibles: $(ls "$ADAPTERS" 2>/dev/null | tr '\n' ' ')" >&2; exit 1; }

exp() { printf '%s' "${1/#\~/$HOME}"; }
mget() { "$BUN" run "$MGET" "$MANIFEST" "$1" 2>/dev/null; }

# FAIL-HARD contra éxito-silencioso: si el parser (bun) no está o no puede leer la clave OBLIGATORIA
# `agent`, abortamos. Sin esto, un fallo del parser deja todas las variables vacías → todos los pasos
# se saltan por `[ -n … ]` y el doctor pinta "OK" sin haber instalado nada (el peor bug: control plane
# que miente éxito). Este es exactamente el hallazgo del audit.
command -v "$BUN" >/dev/null 2>&1 || { echo "install: 'bun' no disponible ($BUN) — no puedo parsear el manifest. Abort." >&2; exit 1; }
if [ "$(mget agent)" != "$AGENT" ]; then
  echo "install: el manifest '$MANIFEST' no parsea (clave 'agent' ausente o != '$AGENT'). ¿YAML inválido o clave mal escrita? Abort — no instalo a ciegas." >&2
  exit 1
fi

AGENT_NAME_V="$(mget env.AGENT_NAME)"; [ -z "$AGENT_NAME_V" ] && AGENT_NAME_V="$AGENT"
NORMS_TARGET="$(exp "$(mget norms.target)")"
NORMS_MODE="$(mget norms.mode)"
HOOKS_DIR="$(exp "$(mget hooks.dir)")"
HOOKS_CONFIG="$(exp "$(mget hooks.config)")"
HOOKS_FORMAT="$(mget hooks.format)"
WRAPPERS_JSON="$(mget hooks.wrappers)"; [ -z "$WRAPPERS_JSON" ] && WRAPPERS_JSON='[]'
MCP_REGISTER="$(mget mcp.register)"
AGENT_DOCTOR="$(mget doctor)"

echo "━━━ ebrain harness $([ "$DOCTOR_ONLY" = 1 ] && echo doctor || echo install): $AGENT (AGENT_NAME=$AGENT_NAME_V) ━━━"

wrapper_files() { printf '%s' "$WRAPPERS_JSON" | jq -r '.[] | [.file, .core, .event] | @tsv' 2>/dev/null; }

# ---- INSTALL (write) ----
if [ "$DOCTOR_ONLY" = 0 ]; then
  # 1) wrappers de hooks
  if [ -n "$HOOKS_DIR" ] && [ "$HOOKS_DIR" != "null" ]; then
    mkdir -p "$HOOKS_DIR" 2>/dev/null || true
    while IFS=$'\t' read -r file core event; do
      [ -z "$file" ] && continue
      w="$HOOKS_DIR/$file"
      cat > "$w" <<EOF
#!/usr/bin/env bash
# ebrain harness — wrapper generado ($AGENT/$event → core/$core). Ejecuta el core canónico. FAIL-OPEN.
# NO editar a mano: se regenera con \`ebrain harness install $AGENT\`. La lógica vive en el core.
export AGENT_NAME=$AGENT_NAME_V
# Baked in at install time: this wrapper is a copy living outside the checkout, so it
# has no checkout to walk up to and no EBRAIN_HOME in its environment.
CANON="$EBRAIN_HOME/harness/core/$core"
[ -f "\$CANON" ] && exec bash "\$CANON" "\$@"
exit 0
EOF
      chmod +x "$w" 2>/dev/null || true
      echo "  wrapper ✓ $w  →  core/$core  [$event]"
    done < <(wrapper_files)
  fi

  # 2) normas (bloque gestionado)
  if [ "$NORMS_MODE" = "managed-block" ] && [ -n "$NORMS_TARGET" ] && [ "$NORMS_TARGET" != "null" ]; then
    mkdir -p "$(dirname "$NORMS_TARGET")" 2>/dev/null || true
    bash "$CORE/render-norms.sh" "$NORMS_TARGET" >/dev/null && echo "  normas ✓ bloque gestionado → $NORMS_TARGET"
  fi

  # 3) MCP
  if [ -n "$MCP_REGISTER" ] && [ "$MCP_REGISTER" != "null" ]; then
    if [ "$RUN_MCP" = 1 ]; then
      echo "  MCP: ejecutando registro…"; eval "$MCP_REGISTER" && echo "  MCP ✓ registrado" || echo "  MCP ⚠ el registro falló (¿binario del agente ausente?)"
    else
      echo "  MCP: registrá con →  $MCP_REGISTER   (o corré install con --mcp)"
    fi
  fi
fi

# ---- DOCTOR / verificación (siempre) ----
echo "── doctor ──"
rc=0

# a) cableado de hooks en el config del runtime
if [ -n "$HOOKS_CONFIG" ] && [ "$HOOKS_CONFIG" != "null" ]; then
  if [ -f "$HOOKS_CONFIG" ]; then
    while IFS=$'\t' read -r file core event; do
      [ -z "$file" ] && continue
      if grep -q "$file" "$HOOKS_CONFIG" 2>/dev/null; then
        echo "  hook ✓ '$file' cableado en $HOOKS_CONFIG [$event]"
      else
        echo "  hook ⚠ '$file' NO cableado en $HOOKS_CONFIG — agregá un entry \"$event\" con command: $HOOKS_DIR/$file"; rc=1
      fi
    done < <(wrapper_files)
  else
    echo "  hook ⚠ config $HOOKS_CONFIG no existe todavía (crealo con los entries del manifest)"; rc=1
  fi
elif [ "$HOOKS_FORMAT" = "none" ]; then
  GUARD_MODE="$(mget guard)"; [ -z "$GUARD_MODE" ] && GUARD_MODE="n/a"
  echo "  hooks: clase no-hook (sin intercepción de runtime). Guard = ${GUARD_MODE} (norma + aislamiento, NO técnico)."
  echo "         contexto/write-back por: bus MCP (lectura) + 'ebrain remember' (escritura) + git-hooks/CLI."
fi

# b) normas presentes
if [ -n "$NORMS_TARGET" ] && [ "$NORMS_TARGET" != "null" ] && [ -f "$NORMS_TARGET" ]; then
  grep -q 'ebrain-norms:begin' "$NORMS_TARGET" && echo "  normas ✓ bloque presente en $NORMS_TARGET" || { echo "  normas ⚠ bloque ausente en $NORMS_TARGET"; rc=1; }
fi

# b.1) modo MCP declarado por el adapter (D.4.3)
if [ -n "$MCP_REGISTER" ] && [ "$MCP_REGISTER" != "null" ]; then
  if printf '%s' "$MCP_REGISTER" | grep -q 'ebrain onboard'; then
    echo "  mcp ✓ http-daemon (ebrain onboard)"
  elif printf '%s' "$MCP_REGISTER" | grep -qE 'gbrain-mcp|ebrain-mcp'; then
    echo "  mcp ⚠ stdio-local fallback"
  else
    echo "  mcp ⚠ custom register: $MCP_REGISTER"
  fi
elif [ "$HOOKS_FORMAT" = "none" ]; then
  echo "  mcp: no native MCP registration declared for this adapter"
fi

# c) contract tests del guard canónico (drift = rojo, no silencioso)
if [ -f "$CORE/contract-test.sh" ]; then
  if bash "$CORE/contract-test.sh" "$CORE/guard-secrets.sh" >/dev/null 2>&1; then
    echo "  guard ✓ contract tests (fixtures) pasan"
  else
    echo "  guard ✗ contract tests FALLAN — el guard de secretos está roto"; rc=1
  fi
fi

# d) self-test: el guard niega una lectura de dotenv (fixture deny), vía el wrapper del agente si existe
GW=""; while IFS=$'\t' read -r file core event; do [ "$core" = "guard-secrets.sh" ] && GW="$HOOKS_DIR/$file"; done < <(wrapper_files)
FIX="$HARNESS/contract/fixtures/deny-cat-envlocal.json"
if [ -n "$GW" ] && [ -x "$GW" ] && [ -f "$FIX" ]; then
  bash "$GW" < "$FIX" >/dev/null 2>&1; [ "$?" = 2 ] && echo "  self-test ✓ el wrapper del guard niega (exit 2)" || { echo "  self-test ⚠ el wrapper del guard NO negó"; rc=1; }
fi

# e) doctor nativo del agente (best-effort)
if [ -n "$AGENT_DOCTOR" ] && [ "$AGENT_DOCTOR" != "null" ]; then
  bin="${AGENT_DOCTOR%% *}"
  if command -v "$bin" >/dev/null 2>&1; then
    eval "$AGENT_DOCTOR" >/dev/null 2>&1 && echo "  agente ✓ '$AGENT_DOCTOR' ok" || echo "  agente ⚠ '$AGENT_DOCTOR' reportó problemas"
  else
    echo "  agente ⚠ '$bin' no está instalado — el harness quedó listo; instalá/logueá el CLI y re-corré doctor"
  fi
fi

echo "── $([ "$rc" = 0 ] && echo 'doctor OK' || echo 'doctor con pendientes (ver ⚠)') ──"
exit "$rc"
