#!/usr/bin/env bash
# sync-graph-to-vault.sh — Copies GRAPH_REPORT.md into the CKIS vault.
#
# Called from:
#   - assemble-context.sh (SessionStart) — catch-up on every session open
#   - post-commit.brain git hook — low-latency sync after each commit
#
# Wraps the report in CKIS-standard frontmatter so Obsidian indexes it
# correctly. Skips if the file is already identical to avoid mtime churn.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

source "$REPO_ROOT/.brain/config.sh" 2>/dev/null || exit 0

SRC="$REPO_ROOT/$GRAPH_DIR/GRAPH_REPORT.md"
DEST_DIR="$CKIS_VAULT/03-projects/$PROJECT_SLUG"
DEST="$DEST_DIR/graph-report.md"

[ -f "$SRC" ] || exit 0
[ -d "$DEST_DIR" ] || exit 0  # vault not mounted on this machine — no-op

NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TMP="$(mktemp)"

{
  echo "---"
  echo "type: graph-report"
  echo "project: $PROJECT_SLUG"
  echo "source: \"$SRC\""
  echo "generated: $NOW"
  echo "auto: true"
  echo "tags: [graph, $PROJECT_SLUG, auto-generated]"
  echo "---"
  echo
  echo "> Auto-synced from \`.brain/graph/GRAPH_REPORT.md\` — do not hand-edit."
  echo
  cat "$SRC"
} > "$TMP"

# Skip write if content is identical (avoids triggering Obsidian re-index).
if [ -f "$DEST" ] && cmp -s "$TMP" "$DEST"; then
  rm -f "$TMP"
  exit 0
fi

mv "$TMP" "$DEST"
echo "[brain] graph-report synced → $DEST" >&2
