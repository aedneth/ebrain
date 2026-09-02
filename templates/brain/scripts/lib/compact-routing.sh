#!/usr/bin/env bash
# compact-routing.sh — shared helpers for routing compact summaries to Dev Brain.
# Source-only. No side effects on load.

# route_compact_to_dev_brain <local_compact_path> <project_slug> <ts> <session_id>
#   Copies a compact .md to $DEV_BRAIN_VAULT/sessions/compacts/<project>/.
#   Idempotent: skips if destination already exists with same content.
#   Fail-safe: any error is swallowed; never affects caller exit status.
route_compact_to_dev_brain() {
  local src="$1" project="$2" ts="$3" sid="${4:-unknown}"
  local vault="${DEV_BRAIN_VAULT:-$HOME/Documents/Dev Brain}"

  [ -f "$src" ] || return 0
  [ -d "$vault" ] || return 0

  local dest_dir="$vault/sessions/compacts/$project"
  mkdir -p "$dest_dir" 2>/dev/null || return 0

  local base
  base="$(basename "$src")"
  local dest="$dest_dir/$base"

  # Idempotency: skip if destination already exists with identical content.
  if [ -f "$dest" ] && cmp -s "$src" "$dest" 2>/dev/null; then
    return 0
  fi

  # Build dest content: source file + wikilinks footer (for Obsidian graph connectivity).
  local tmp="$dest.tmp.$$"
  {
    cat "$src"
    # Inject footer only if not already present.
    if ! grep -q "\[\[wiki/$project\]\]" "$src" 2>/dev/null; then
      echo ""
      echo "---"
      printf '[[wiki/%s]] · [[sessions/index]]\n' "$project"
    fi
  } > "$tmp" 2>/dev/null || return 0
  mv -f "$tmp" "$dest" 2>/dev/null || { rm -f "$tmp"; return 0; }

  echo "[brain] Compact routed → $dest" >&2
  return 0
}

# route_all_session_compacts <compacts_tmp_file> <project_slug> <session_id>
#   Reads the COMPACTS_TMP ledger (ts|path|excerpt) and routes each entry.
route_all_session_compacts() {
  local tmp="$1" project="$2" sid="${3:-unknown}"
  [ -f "$tmp" ] || return 0
  while IFS='|' read -r ts path excerpt; do
    [ -n "$path" ] && route_compact_to_dev_brain "$path" "$project" "$ts" "$sid"
  done < "$tmp"
}
