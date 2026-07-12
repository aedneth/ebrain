#!/usr/bin/env bash
# harness/core/remember.sh — primitiva de WRITE-BACK SEMÁNTICO, agent-agnostic.
# Escribe una página tipada `agent-learning` al source `agent-memory` (~/eBrain/memory/learnings/)
# y la sincroniza a gbrain, para que quede buscable cross-agente en ebrain. Es el tier de alta señal
# del write-back loop (el piso determinístico es log-session.sh; el barrido es sessions-federate).
#
# Uso:   remember.sh [--project <slug>] [--tags a,b] [--type <t>] [--no-sync] "<learning>"
#        echo "<learning>" | remember.sh            (lee stdin si no hay texto en args)
# Agente: $AGENT_NAME (lo setea el adapter) → fallback "unknown".
# Sesión: $EBRAIN_SESSION_ID si existe.
#
# FAIL-CLOSED en seguridad: en repos de cliente (deny-policy) o si el texto trae un secreto obvio,
# se NIEGA a escribir (exit ≠ 0). Robusto en lo demás. NO es un hook: lo invoca el agente/CLI a mano.
set -uo pipefail

MEM="$HOME/eBrain/memory"
LEARN="$MEM/learnings"
DENY_SLUG='brisas-del-golfo|dekko'
SECRET='sk-[A-Za-z0-9_-]{20,}|postgres://[^ ]*:[^ ]*@|-----BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}'

PROJECT_OVERRIDE=""; TAGS=""; PTYPE="agent-learning"; SYNC=1
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT_OVERRIDE="${2:-}"; shift 2 ;;
    --tags)    TAGS="${2:-}"; shift 2 ;;
    --type)    PTYPE="${2:-agent-learning}"; shift 2 ;;
    --no-sync) SYNC=0; shift ;;
    --) shift; while [ $# -gt 0 ]; do ARGS+=("$1"); shift; done ;;
    *) ARGS+=("$1"); shift ;;
  esac
done

CONTENT="${ARGS[*]:-}"
if [ -z "${CONTENT// }" ] && [ ! -t 0 ]; then CONTENT="$(cat 2>/dev/null || true)"; fi
if [ -z "${CONTENT// }" ]; then
  echo "remember: nada que recordar (pasá el texto como argumento o por stdin)." >&2
  exit 1
fi

AGENT="${AGENT_NAME:-unknown}"
SESSION_ID="${EBRAIN_SESSION_ID:-}"

# Proyecto: override → .brain/config.sh PROJECT_SLUG → basename del repo git → "general".
SLUG="general"
REPO="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$REPO" ]; then
  SLUG="$(basename "$REPO")"
  if [ -f "$REPO/.brain/config.sh" ]; then
    PROJECT_SLUG=""; . "$REPO/.brain/config.sh" 2>/dev/null || true
    [ -n "${PROJECT_SLUG:-}" ] && SLUG="$PROJECT_SLUG"
  fi
fi
[ -n "$PROJECT_OVERRIDE" ] && SLUG="$PROJECT_OVERRIDE"

# --- Seguridad FAIL-CLOSED ---
# 1) trust-policy: repo de cliente por slug O por remote → negar.
if printf '%s' "$SLUG" | grep -Eiq "$DENY_SLUG"; then
  echo "remember: DENEGADO — '$SLUG' es repo de cliente (deny-policy). Su contexto no entra a ebrain." >&2
  exit 3
fi
if [ -n "$REPO" ]; then
  RURL="$(git -C "$REPO" remote get-url origin 2>/dev/null || true)"
  if printf '%s' "$RURL" | grep -Eiq "$DENY_SLUG"; then
    echo "remember: DENEGADO — el remote de este repo es de cliente (deny-policy)." >&2
    exit 3
  fi
fi
# 2) redact-scan: si el texto trae un secreto obvio → negar (nunca embeber un secreto).
if printf '%s' "$CONTENT" | grep -Eq "$SECRET"; then
  echo "remember: DENEGADO — el texto parece contener un secreto (key/token/DSN/clave privada). No lo guardo." >&2
  exit 4
fi

# --- Escritura ---
DEST="$LEARN/$SLUG"; mkdir -p "$DEST" 2>/dev/null || { echo "remember: no pude crear $DEST" >&2; exit 1; }
NOW_UTC="$(date -u +%FT%TZ)"; DATE_TAG="$(date +%Y-%m-%d-%H%M)"; DAY="$(date +%Y-%m-%d)"
HASH="$(printf '%s%s' "$NOW_UTC" "$CONTENT" | (sha1sum 2>/dev/null || shasum 2>/dev/null) | cut -c1-8)"
[ -z "$HASH" ] && HASH="$RANDOM"
OUT="$DEST/$DATE_TAG-$AGENT-$HASH.md"

# título: primera línea (recortada) del contenido
TITLE="$(printf '%s' "$CONTENT" | head -1 | tr -s ' ' | cut -c1-80)"
YTAGS="[learning, $SLUG, $AGENT]"
if [ -n "$TAGS" ]; then
  extra="$(printf '%s' "$TAGS" | tr ',' ' ' | tr -s ' ')"
  YTAGS="[learning, $SLUG, $AGENT, ${extra// /, }]"
fi

{
  echo "---"
  echo "type: $PTYPE"
  echo "project: $SLUG"
  echo "agent: $AGENT"
  echo "date: $DAY"
  echo "created: $NOW_UTC"
  [ -n "$SESSION_ID" ] && echo "session: $SESSION_ID"
  echo "source: remember"
  echo "tags: $YTAGS"
  echo "---"
  echo
  echo "# $TITLE"
  echo
  printf '%s\n' "$CONTENT"
} > "$OUT" 2>/dev/null || { echo "remember: no pude escribir $OUT" >&2; exit 1; }

echo "remember ✓ ($AGENT/$SLUG) → $OUT"

# commit local del repo agent-memory (add específico, nunca cerca de env)
if [ -d "$MEM/.git" ]; then
  git -C "$MEM" add learnings/ >/dev/null 2>&1 || true
  git -C "$MEM" commit -q -m "remember: $AGENT/$SLUG $DATE_TAG" >/dev/null 2>&1 || true
fi

# sync a gbrain para que sea buscable de inmediato (una página = costo mínimo). --no-sync lo salta.
if [ "$SYNC" = "1" ] && [ -x "$HOME/.config/ebrain/gbrain-run" ]; then
  if "$HOME/.config/ebrain/gbrain-run" sync --source agent-memory >/dev/null 2>&1; then
    echo "  gbrain sync agent-memory ✓ (buscable en ebrain)"
  else
    echo "  (gbrain sync diferido — quedará en el próximo sweep)"
  fi
fi
exit 0
