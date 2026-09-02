#!/usr/bin/env bash
# log-tool-event.sh — PostToolUse hook
#
# Captures objectively important Bash command outcomes (builds, tests, lint,
# commits) and appends them to the active session log:
#   .brain/sessions/_active.md
#
# All other tool calls (Edit, Read, Write, etc.) and unrelated Bash commands
# are ignored. The Stop hook merges _active.md into the final session log.
#
# Fail-safe: any parse error or missing field results in a silent no-op so
# the user's session is never disrupted.

set -uo pipefail  # no -e: never break the user's session

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck disable=SC1091
source "$REPO_ROOT/.brain/config.sh" 2>/dev/null || exit 0

ACTIVE_LOG="$SESSIONS_DIR/_active.md"

# Read JSON payload from stdin (Claude Code provides tool_name, tool_input, tool_response).
PAYLOAD=""
if [ ! -t 0 ]; then
  PAYLOAD="$(cat)"
fi
[ -z "$PAYLOAD" ] && exit 0

# jq is required to parse the payload — degrade gracefully if missing.
command -v jq >/dev/null 2>&1 || exit 0

TOOL_NAME=$(echo "$PAYLOAD" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
[ "$TOOL_NAME" != "Bash" ] && exit 0

CMD=$(echo "$PAYLOAD" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
[ -z "$CMD" ] && exit 0

# Filter: only log build / test / lint / commit. Everything else is noise.
EVENT_KIND=""
case "$CMD" in
  *"npm run build"*|*"yarn build"*|*"pnpm build"*)        EVENT_KIND="build" ;;
  *"npm run test"*|*"npm test"*|*"yarn test"*|*"pnpm test"*) EVENT_KIND="test" ;;
  *"npm run lint"*|*"yarn lint"*|*"pnpm lint"*)            EVENT_KIND="lint" ;;
  *"git commit"*)                                          EVENT_KIND="commit" ;;
  *) exit 0 ;;
esac

# Extract result fields (defensive — schema may vary).
EXIT_CODE=$(echo "$PAYLOAD" | jq -r '
  .tool_response.exit_code //
  .tool_response.exitCode //
  .tool_response.returncode //
  0
' 2>/dev/null || echo "0")

OUTPUT=$(echo "$PAYLOAD" | jq -r '
  .tool_response.output //
  .tool_response.stdout //
  .tool_response.content //
  empty
' 2>/dev/null || echo "")

# Init active log if missing.
mkdir -p "$SESSIONS_DIR"
if [ ! -f "$ACTIVE_LOG" ]; then
  {
    echo "<!-- active session iteration log — merged into session file by Stop hook -->"
    echo
  } > "$ACTIVE_LOG"
fi

NOW="$(date +"%H:%M")"
STATUS="✅"
[ "$EXIT_CODE" != "0" ] && STATUS="❌"

case "$EVENT_KIND" in
  commit)
    if [ "$EXIT_CODE" = "0" ]; then
      SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "?")"
      MSG="$(git log -1 --pretty=%s 2>/dev/null | head -c 100 || echo "")"
      FILES="$(git show --stat --format= HEAD 2>/dev/null | tail -n 1 | tr -s ' ' || echo "")"
      {
        echo "- [${NOW}] **commit** \`${SHA}\` · ${MSG}"
        [ -n "$FILES" ] && echo "  - ${FILES}"
      } >> "$ACTIVE_LOG"
    else
      echo "- [${NOW}] ❌ **commit failed** (exit ${EXIT_CODE})" >> "$ACTIVE_LOG"
    fi
    ;;
  build|test|lint)
    # Truncate command for readability.
    CMD_SHORT="$(echo "$CMD" | head -c 80 | tr '\n' ' ')"
    if [ "$EXIT_CODE" = "0" ]; then
      echo "- [${NOW}] ${STATUS} **${EVENT_KIND}** \`${CMD_SHORT}\`" >> "$ACTIVE_LOG"
    else
      # Capture last 8 lines of output on failure — that's where the error usually is.
      TAIL="$(echo "$OUTPUT" | tail -n 8)"
      {
        echo "- [${NOW}] ${STATUS} **${EVENT_KIND} FAILED** \`${CMD_SHORT}\` (exit ${EXIT_CODE})"
        if [ -n "$TAIL" ]; then
          echo '  ```'
          echo "$TAIL" | sed 's/^/  /'
          echo '  ```'
        fi
      } >> "$ACTIVE_LOG"
    fi
    ;;
esac

exit 0
