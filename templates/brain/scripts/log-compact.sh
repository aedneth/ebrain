#!/usr/bin/env bash
# log-compact.sh — UserPromptSubmit hook
#
# Fires when the user submits "/compact" or "/compact <focus>".
# At this moment, the NEW compact hasn't been generated yet — but any PRIOR
# compact from this session IS already in the transcript. We eagerly extract
# the most recent prior compact and route it to Dev Brain immediately, so
# long-running sessions don't accumulate un-mirrored compacts until session end.
#
# The Stop hook (log-session.sh) is the final catch-all — this is best-effort
# acceleration. Both use the same idempotent route_compact_to_dev_brain helper.
#
# Fail-safe: any error → silent no-op. UserPromptSubmit must not emit stdout.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

source "$REPO_ROOT/.brain/config.sh" 2>/dev/null || exit 0

PAYLOAD=""
[ ! -t 0 ] && PAYLOAD="$(cat)"
[ -z "$PAYLOAD" ] && exit 0

command -v jq >/dev/null 2>&1 || exit 0

PROMPT="$(echo "$PAYLOAD" | jq -r '.prompt // empty' 2>/dev/null || echo "")"
case "$PROMPT" in
  "/compact"|"/compact "*) ;;
  *) exit 0 ;;
esac

TRANSCRIPT_PATH="$(echo "$PAYLOAD" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")"
SESSION_ID="$(echo "$PAYLOAD" | jq -r '.session_id // empty' 2>/dev/null || echo "")"
[ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ] || exit 0

mkdir -p "$SESSIONS_DIR/compacts" 2>/dev/null || exit 0

# Extract the most recent prior compact summary (if any).
LAST_COMPACT="$(jq -cs '
  def textify:
    if type == "array" then
      [ .[] | select(.type == "text") | .text ] | join("\n\n")
    elif type == "string" then .
    else "" end;

  [ .[]
    | select(.isCompactSummary == true)
    | {ts: (.timestamp // "unknown"),
       content: (.message.content | textify)}
    | select(.content != "")
  ] | last // empty
' "$TRANSCRIPT_PATH" 2>/dev/null)"

[ -z "$LAST_COMPACT" ] || [ "$LAST_COMPACT" = "null" ] && exit 0

TS="$(echo "$LAST_COMPACT" | jq -r '.ts')"
CONTENT="$(echo "$LAST_COMPACT" | jq -r '.content')"
SLUG="$(date -u -d "$TS" +"%Y-%m-%d-%H%M" 2>/dev/null || date -u +"%Y-%m-%d-%H%M")"
OUT_FILE="$SESSIONS_DIR/compacts/${SLUG}-compact.md"

# Write compact file only if it doesn't already exist (idempotent).
if [ ! -f "$OUT_FILE" ]; then
  {
    echo "---"
    echo "type: compact-summary"
    echo "project: $PROJECT_SLUG"
    echo "session-id: ${SESSION_ID:-unknown}"
    echo "compacted-at: $TS"
    echo "source: log-compact.sh (eager)"
    echo "tags: [compact, $PROJECT_SLUG]"
    echo "---"
    echo
    echo "# Compact Summary — $TS"
    echo
    echo "$CONTENT"
  } > "$OUT_FILE" 2>/dev/null
fi

# Route to Dev Brain.
if [ -f "$REPO_ROOT/.brain/scripts/lib/compact-routing.sh" ]; then
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.brain/scripts/lib/compact-routing.sh"
  route_compact_to_dev_brain "$OUT_FILE" "$PROJECT_SLUG" "$TS" "${SESSION_ID:-unknown}"
fi 2>/dev/null || true

# No stdout — UserPromptSubmit must not inject context.
exit 0
