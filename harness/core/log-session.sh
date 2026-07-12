#!/usr/bin/env bash
# harness/core/log-session.sh — WRITE-BACK FLOOR, agent-agnostic.
# Hook stop / subagent_stop de CUALQUIER agente. Escribe un registro de sesión estampado `agent:`
# al `.brain/sessions/` del repo activo + una línea al índice del Dev Brain. Deriva el repo del `cwd`
# del payload (no del path del script) y NO depende del transcript (eso es enriquecimiento por-agente).
# FAIL-OPEN: cualquier error → exit 0 (nunca rompe el cierre de sesión).
#
# Agente: $AGENT_NAME (lo setea el adapter del harness) → fallback $1 → "unknown".
set -uo pipefail

AGENT="${AGENT_NAME:-${1:-unknown}}"

PAYLOAD=""; [ ! -t 0 ] && PAYLOAD="$(cat 2>/dev/null || true)"
jqget() { [ -n "$PAYLOAD" ] && command -v jq >/dev/null 2>&1 && printf '%s' "$PAYLOAD" | jq -r "$1 // empty" 2>/dev/null || true; }
SESSION_ID="$(jqget '.session_id')"
CWD="$(jqget '.cwd')"; [ -z "$CWD" ] && CWD="$PWD"

# Repo activo desde cwd; el floor solo escribe en repos con .brain (resto → `ebrain remember`/CLI).
REPO="$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")"
[ -d "$REPO/.brain" ] || exit 0

SLUG="$(basename "$REPO")"
if [ -f "$REPO/.brain/config.sh" ]; then
  PROJECT_SLUG=""; . "$REPO/.brain/config.sh" 2>/dev/null || true
  [ -n "${PROJECT_SLUG:-}" ] && SLUG="$PROJECT_SLUG"
fi

NOW_UTC="$(date -u +%FT%TZ)"; NOW_LOCAL="$(date +'%Y-%m-%d %H:%M %Z')"; DATE_TAG="$(date +%Y-%m-%d-%H%M)"
BRANCH="$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo no-git)"
HEAD_SHA="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo no-git)"
RECENT="$(git -C "$REPO" log --oneline -10 2>/dev/null || true)"
WORKTREE="$(git -C "$REPO" status --short 2>/dev/null | head -40 || true)"

SESSDIR="$REPO/.brain/sessions"; mkdir -p "$SESSDIR" 2>/dev/null || exit 0
OUT="$SESSDIR/$DATE_TAG-$AGENT-session.md"
{
  echo "---"
  echo "type: session"; echo "project: $SLUG"; echo "agent: $AGENT"
  echo "date: $(date +%Y-%m-%d)"; echo "ended: $NOW_LOCAL"
  echo "branch: $BRANCH"; echo "head-end: $HEAD_SHA"
  [ -n "$SESSION_ID" ] && echo "session-id: $SESSION_ID"
  echo "tags: [session, $SLUG, $AGENT]"
  echo "---"; echo
  echo "# Session ($AGENT) — $NOW_LOCAL"; echo
  echo "## Recent commits"; echo
  if [ -n "$RECENT" ]; then echo '```'; echo "$RECENT"; echo '```'; else echo "_none_"; fi; echo
  echo "## Working tree at end"; echo
  if [ -n "$WORKTREE" ]; then echo '```'; echo "$WORKTREE"; echo '```'; else echo "_clean_"; fi; echo
} > "$OUT" 2>/dev/null || exit 0

# Índice Dev Brain — MISMO esquema de 6 campos (ts|project|duration|head|summary|path); agente
# estampado en el summary como [agent] para no romper consumidores existentes (grep '| slug |').
DEV="${DEV_BRAIN_VAULT:-$HOME/Documents/Dev Brain}"
if [ -d "$DEV/sessions" ]; then
  # UTF-8 SAFE: cortar por bytes (`head -c`) parte caracteres multibyte y corrompe el índice (acentos
  # → bytes inválidos → grep lo trata como binario). Sándwich iconv -c: limpia, corta a 100 bytes,
  # y descarta el carácter parcial del final. Robusto sin depender de la versión de cut/awk.
  subj="$(printf '%s' "$RECENT" | head -1 | sed 's/^[0-9a-f]\{7,\} //' | tr '\n\r\t|' '    ' | tr -s ' ' | iconv -f UTF-8 -t UTF-8 -c 2>/dev/null | cut -b1-100 | iconv -f UTF-8 -t UTF-8 -c 2>/dev/null)"
  echo "${NOW_UTC} | ${SLUG} | - | ${HEAD_SHA} | [${AGENT}] ${subj:-session} | ${OUT}" >> "$DEV/sessions/index.md" 2>/dev/null || true
fi
echo "[harness] session logged ($AGENT) → $OUT" >&2
exit 0
