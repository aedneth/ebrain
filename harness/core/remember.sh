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

# Resolve the eBrain root ONCE, here, and derive everything else from it. The checkout path is the
# operator's choice: `cli/ebrain` exports EBRAIN_HOME from its own location, so an install at any
# path reaches this script correctly. The $HOME default only applies to a direct, uninstalled call.
EBRAIN_HOME="${EBRAIN_HOME:-$HOME/eBrain}"
MEM="${EBRAIN_MEMORY_HOME:-$EBRAIN_HOME/memory}"
LEARN="$MEM/learnings"
# Shared trust policy (deny policy + unified redaction) — single source of truth for the harness.
. "$EBRAIN_HOME/harness/core/trust.sh"

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
  echo "remember: nothing to remember (pass the text as an argument or on stdin)." >&2
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
# 1) trust-policy: repo de cliente por slug O por remote → negar (hard-deny; no default-deny, para no
#    bloquear learnings legítimos en repos OSS/ajenos — el sweep sí es default-deny, remember es intencional).
if trust_denied "$SLUG"; then
  echo "remember: REFUSED — this repository is denied by the local deny policy; its context does not enter eBrain." >&2
  exit 3
fi
if [ -n "$REPO" ]; then
  RURL="$(git -C "$REPO" remote get-url origin 2>/dev/null || true)"
  if trust_denied "$RURL"; then
    echo "remember: REFUSED — this repository's remote is denied by the local deny policy." >&2
    exit 3
  fi
fi
# 2) redact-scan: si el texto trae un secreto obvio → negar (nunca embeber un secreto).
if trust_redact_hit_text "$CONTENT"; then
  echo "remember: REFUSED — the text appears to contain a secret (key/token/DSN/private key); nothing was written." >&2
  exit 4
fi

# --- Escritura ---
DEST="$LEARN/$SLUG"; mkdir -p "$DEST" 2>/dev/null || { echo "remember: could not create $DEST" >&2; exit 1; }
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
} > "$OUT" 2>/dev/null || { echo "remember: could not write $OUT" >&2; exit 1; }

echo "remember ✓ ($AGENT/$SLUG) → $OUT"

# commit local del repo agent-memory (add específico, nunca cerca de env)
if [ -d "$MEM/.git" ]; then
  git -C "$MEM" add learnings/ >/dev/null 2>&1 || true
  git -C "$MEM" commit -q -m "remember: $AGENT/$SLUG $DATE_TAG" >/dev/null 2>&1 || true
fi

# MCP write-through to the daemon, so the learning is searchable without fighting the PGLite lock.
# EBRAIN_HOME is already resolved at the top of this script.
REMOTE="$EBRAIN_HOME/cli/remote-tools.ts"
if [ -z "${BUN_BIN:-}" ]; then
  BUN_BIN="$HOME/.bun/bin/bun"
  command -v bun >/dev/null 2>&1 && BUN_BIN=bun
fi
EPISODES="$EBRAIN_HOME/cli/episodes.ts"

# An explicit remember is also a high-signal local episode. Mirroring is deliberately best-effort:
# the durable learning above is already committed, and a secondary recall-store failure must never
# turn that successful write into a user-visible failure or block the agent's workflow.
if [ -f "$EPISODES" ]; then
  EP_ARGS=(record --kind learning --source remember --project "$SLUG" --agent "$AGENT" --text "$CONTENT" --yes)
  [ -n "$SESSION_ID" ] && EP_ARGS+=(--session "$SESSION_ID")
  if "$BUN_BIN" run "$EPISODES" "${EP_ARGS[@]}" >/dev/null 2>&1; then
    echo "  episode mirror ✓ (local bounded recall)"
  else
    echo "  WARN: episode mirror failed; durable learning remains available"
  fi
fi

SLUG_PATH="learnings/$SLUG/${DATE_TAG}-${AGENT}-${HASH}"
if [ "$SYNC" = "1" ] && [ -f "$REMOTE" ]; then
  if "$BUN_BIN" run "$REMOTE" put-page --source agent-memory --slug "$SLUG_PATH" --file "$OUT" >/dev/null 2>&1; then
    echo "  MCP put_page agent-memory ✓ (searchable in ebrain)"
  else
    echo "  WARN: MCP write-through failed; the learning is on disk but is not searchable via the daemon yet"
  fi
fi
exit 0
