#!/usr/bin/env bash
# log-session.sh — Stop hook
#
# Captures objective session metadata at end of session:
#   - timestamp + duration
#   - branch + git diff vs. session start
#   - commits made during the session
#   - /compact summaries extracted from JSONL transcript
#
# Writes .brain/sessions/YYYY-MM-DD-HHMM-session.md.
# Compact summaries go to .brain/sessions/compacts/ (separate files, pointer in session).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck disable=SC1091
source "$REPO_ROOT/.brain/config.sh"

# Read stdin payload if present (Claude Code Stop hook sends JSON).
PAYLOAD=""
if [ ! -t 0 ]; then
  PAYLOAD="$(cat)"
fi

SESSION_ID=""
TRANSCRIPT_PATH=""
if [ -n "$PAYLOAD" ] && command -v jq >/dev/null 2>&1; then
  SESSION_ID="$(echo "$PAYLOAD" | jq -r '.session_id // empty' 2>/dev/null || true)"
  TRANSCRIPT_PATH="$(echo "$PAYLOAD" | jq -r '.transcript_path // empty' 2>/dev/null || true)"
fi

NOW_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
NOW_LOCAL="$(date +"%Y-%m-%d %H:%M %Z")"
DATE_TAG="$(date +"%Y-%m-%d-%H%M")"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-git")"
HEAD_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")"

# Load session-start state if recorded.
START_SHA=""
START_LOCAL=""
SESSION_START_UTC=""
DURATION=""
if [ -f "$SESSION_STATE" ]; then
  # shellcheck disable=SC1090
  source "$SESSION_STATE"
  START_SHA="${SESSION_START_SHA:-}"
  START_LOCAL="${SESSION_START_LOCAL:-}"
  SESSION_START_UTC="${SESSION_START_UTC:-}"
  if [ -n "${SESSION_START_UTC:-}" ]; then
    start_epoch="$(date -u -d "$SESSION_START_UTC" +%s 2>/dev/null || echo 0)"
    end_epoch="$(date -u +%s)"
    if [ "$start_epoch" -gt 0 ]; then
      delta=$((end_epoch - start_epoch))
      DURATION="$((delta / 60)) min"
    fi
  fi
fi

# Compute git activity during the session.
FILES_CHANGED=""
COMMITS_MADE=""
DIFFSTAT=""
if [ -n "$START_SHA" ] && [ "$START_SHA" != "$HEAD_SHA" ]; then
  FILES_CHANGED="$(git diff --name-only "$START_SHA" HEAD 2>/dev/null || true)"
  COMMITS_MADE="$(git log --oneline "$START_SHA..HEAD" 2>/dev/null || true)"
  DIFFSTAT="$(git diff --stat "$START_SHA" HEAD 2>/dev/null | tail -n 1 || true)"
fi
WORKING_TREE="$(git status --short 2>/dev/null || true)"

# Pull in iterations captured during the session by log-tool-event.sh.
ACTIVE_LOG="$SESSIONS_DIR/_active.md"
ITERATIONS=""
if [ -f "$ACTIVE_LOG" ]; then
  ITERATIONS="$(grep -v '^<!--' "$ACTIVE_LOG" 2>/dev/null || true)"
fi

# ── Compact summary extraction ────────────────────────────────────────────────
# Extract /compact summaries (isCompactSummary: true) from the JSONL transcript.
# Each summary goes to .brain/sessions/compacts/<timestamp>-compact.md.
# The session file gets a ## Compactions section with a pointer + excerpt.

COMPACTS_DIR="$SESSIONS_DIR/compacts"
COMPACTS_TMP="$BRAIN_DIR/.compacts-this-session"
rm -f "$COMPACTS_TMP"

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ] \
   && command -v jq >/dev/null 2>&1; then
  mkdir -p "$COMPACTS_DIR"
  START_BOUND="${SESSION_START_UTC:-1970-01-01T00:00:00Z}"

  jq -c --arg start "$START_BOUND" '
    def textify:
      if type == "array" then
        [ .[] | select(.type == "text") | .text ] | join("\n\n")
      elif type == "string" then .
      else "" end;

    select(.isCompactSummary == true)
    | select((.timestamp // "") >= $start)
    | {ts: (.timestamp // "unknown"),
       content: (.message.content | textify)}
    | select(.content != "")
  ' "$TRANSCRIPT_PATH" 2>/dev/null | while IFS= read -r entry; do
    TS="$(echo "$entry" | jq -r '.ts')"
    CONTENT="$(echo "$entry" | jq -r '.content')"

    SLUG="$(date -u -d "$TS" +"%Y-%m-%d-%H%M" 2>/dev/null || echo "$DATE_TAG")"
    OUT_FILE="$COMPACTS_DIR/${SLUG}-compact.md"
    n=1
    while [ -e "$OUT_FILE" ]; do
      OUT_FILE="$COMPACTS_DIR/${SLUG}-compact-${n}.md"
      n=$((n+1))
    done

    {
      echo "---"
      echo "type: compact-summary"
      echo "project: $PROJECT_SLUG"
      echo "session-id: ${SESSION_ID:-unknown}"
      echo "compacted-at: $TS"
      echo "tags: [compact, $PROJECT_SLUG]"
      echo "---"
      echo
      echo "# Compact Summary — $TS"
      echo
      echo "$CONTENT"
    } > "$OUT_FILE"

    EXCERPT="$(echo "$CONTENT" | awk 'NF { print; exit }' | head -c 200)"
    echo "${TS}|${OUT_FILE}|${EXCERPT}" >> "$COMPACTS_TMP"
  done
fi

# ── Dev Brain compact routing ────────────────────────────────────────────────
{
  if [ -f "$REPO_ROOT/.brain/scripts/lib/compact-routing.sh" ]; then
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.brain/scripts/lib/compact-routing.sh"
    route_all_session_compacts "$COMPACTS_TMP" "$PROJECT_SLUG" "${SESSION_ID:-unknown}"
  fi
} 2>/dev/null || true

# Re-read compact entries for use in the heredoc (subshell doesn't share arrays).
COMPACT_LINES=()
if [ -f "$COMPACTS_TMP" ]; then
  while IFS= read -r line; do
    COMPACT_LINES+=("$line")
  done < "$COMPACTS_TMP"
fi

# ─────────────────────────────────────────────────────────────────────────────

mkdir -p "$SESSIONS_DIR"
OUT="$SESSIONS_DIR/$DATE_TAG-session.md"

{
  echo "---"
  echo "type: session"
  echo "project: $PROJECT_SLUG"
  echo "date: $(date +%Y-%m-%d)"
  echo "started: ${START_LOCAL:-unknown}"
  echo "ended: $NOW_LOCAL"
  echo "duration: ${DURATION:-unknown}"
  echo "branch: $BRANCH"
  echo "head-start: ${START_SHA:-unknown}"
  echo "head-end: $HEAD_SHA"
  [ -n "$SESSION_ID" ] && echo "session-id: $SESSION_ID"
  echo "tags: [session, $PROJECT_SLUG]"
  echo "---"
  echo
  echo "# Session — $NOW_LOCAL"
  echo
  echo "## Summary"
  echo
  echo "<!--"
  echo "Fill in during the session (or right before stop) with 2–4 bullets:"
  echo "- What was done"
  echo "- What was decided"
  echo "- What's next"
  echo "-->"
  echo
  echo "## Iterations"
  echo
  echo "_Auto-captured by \`log-tool-event.sh\` during the session: builds, tests, lint, commits._"
  echo
  if [ -n "$ITERATIONS" ]; then
    echo "$ITERATIONS"
  else
    echo "_No build/test/lint/commit events recorded._"
  fi
  echo
  echo "## Compactions"
  echo
  if [ "${#COMPACT_LINES[@]}" -gt 0 ]; then
    for line in "${COMPACT_LINES[@]}"; do
      IFS='|' read -r ts file excerpt <<< "$line"
      echo "- **$ts** → \`$file\`"
      echo "  > ${excerpt}…"
    done
  else
    echo "_No /compact during this session._"
  fi
  echo
  echo "## Commits made"
  echo
  if [ -n "$COMMITS_MADE" ]; then
    echo '```'
    echo "$COMMITS_MADE"
    echo '```'
  else
    echo "_No commits made during this session._"
  fi
  echo
  echo "## Files changed"
  echo
  if [ -n "$FILES_CHANGED" ]; then
    echo '```'
    echo "$FILES_CHANGED"
    echo '```'
    [ -n "$DIFFSTAT" ] && echo "**Diffstat:** $DIFFSTAT"
  else
    echo "_No tracked files changed via commits._"
  fi
  echo
  echo "## Working tree at end"
  echo
  if [ -n "$WORKING_TREE" ]; then
    echo '```'
    echo "$WORKING_TREE"
    echo '```'
  else
    echo "_Clean._"
  fi
  echo
} > "$OUT"

# Cleanup transient session state.
rm -f "$SESSION_STATE"
rm -f "$ACTIVE_LOG"
rm -f "$COMPACTS_TMP"

echo "[brain] Session logged → $OUT" >&2

# ── Dev Brain session index ───────────────────────────────────────────────────
# Append a pointer to Dev Brain so any agent can query session history.
# Fails silently — Dev Brain indexing must never break the primary stop hook.
{
  DEV_BRAIN_VAULT="${DEV_BRAIN_VAULT:-$HOME/Documents/Dev Brain}"
  if [ -d "$DEV_BRAIN_VAULT" ]; then
    IDX="$DEV_BRAIN_VAULT/sessions/index.md"
    # Hybrid summary: compact → commit → last assistant turn → diffstat → no-summary.
    # All tiers routed through _sb_sanitize to keep the pipe-delimited index format intact.
    _sb_sanitize() {
      tr '\n\r\t|' '    ' | tr -s ' ' | sed 's/^ *//;s/ *$//' | head -c 120
    }

    SUMMARY_LINE=""

    # Tier 1: compact excerpt (LLM-distilled, highest signal when present)
    if [ "${#COMPACT_LINES[@]}" -gt 0 ]; then
      SUMMARY_LINE="$(printf '%s' "${COMPACT_LINES[0]}" | awk -F'|' '{for(i=3;i<=NF;i++)printf "%s%s",$i,(i<NF?"|":"")}' | _sb_sanitize)"
    fi

    # Tier 2: first (most recent) commit subject
    if [ -z "$SUMMARY_LINE" ] && [ -n "$COMMITS_MADE" ]; then
      SUMMARY_LINE="$(printf '%s' "$COMMITS_MADE" | head -n1 | sed 's/^[0-9a-f]\{7,\} //' | _sb_sanitize)"
    fi

    # Tier 3: last assistant text turn from transcript
    if [ -z "$SUMMARY_LINE" ] && [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
      SUMMARY_LINE="$(jq -rs '
        [ .[]
          | select(.type=="assistant")
          | select(.isCompactSummary != true)
          | .message.content
          | if type=="array" then map(select(.type=="text") | .text) | join(" ")
            elif type=="string" then .
            else empty end
          | select(. != null and . != "")
          | select(startswith("This session is being continued from a previous conversation") | not)
        ] | last // empty
      ' "$TRANSCRIPT_PATH" 2>/dev/null | _sb_sanitize)"
    fi

    # Tier 4: diffstat as structural fallback
    if [ -z "$SUMMARY_LINE" ] && [ -n "$DIFFSTAT" ]; then
      SUMMARY_LINE="$(printf '%s' "$DIFFSTAT" | _sb_sanitize)"
    fi

    SUMMARY_LINE="${SUMMARY_LINE:-no-summary}"
    # Append one-liner to global index (pipe-separated for grep/awk)
    echo "${NOW_UTC} | ${PROJECT_SLUG} | ${DURATION:-unknown} | ${HEAD_SHA} | ${SUMMARY_LINE} | ${OUT}" >> "$IDX"
    echo "[brain] Session indexed → $IDX" >&2
  fi
} 2>/dev/null || true
