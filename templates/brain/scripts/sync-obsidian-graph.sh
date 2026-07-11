#!/usr/bin/env bash
# sync-obsidian-graph.sh — regenerates Graphify Obsidian notes for this project.
#
# Reads .brain/graph/graph.json and writes one .md file per code node into
# ~/Documents/Dev Brain/code-graph/<slug>/ using the graphify.export Python API
# (the graphify CLI's `update` command does not expose --obsidian; the flag only
# exists in the Claude skill's full pipeline, so we call the Python API directly).
#
# Called from:
#   - post-commit.brain (cadence-gated: every OBSIDIAN_GRAPH_CADENCE commits)
#   - Manually: bash .brain/scripts/sync-obsidian-graph.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

source "$REPO_ROOT/.brain/config.sh" 2>/dev/null || exit 0

DEV_BRAIN_VAULT="${DEV_BRAIN_VAULT:-$HOME/Documents/Dev Brain}"
OBS_DIR="$DEV_BRAIN_VAULT/code-graph/$PROJECT_SLUG"
GRAPH_JSON="$REPO_ROOT/$GRAPH_DIR/graph.json"

[ -d "$DEV_BRAIN_VAULT" ] || { echo "[brain] Dev Brain vault not found at $DEV_BRAIN_VAULT — skipping" >&2; exit 0; }
[ -f "$GRAPH_JSON" ]       || { echo "[brain] graph.json not found — run graphify update . first" >&2; exit 0; }

mkdir -p "$OBS_DIR"

python3 - "$GRAPH_JSON" "$OBS_DIR" <<'PYEOF'
import sys, json, warnings
import networkx as nx
from pathlib import Path

graph_path, obs_dir = Path(sys.argv[1]), sys.argv[2]

with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    G = nx.node_link_graph(json.loads(graph_path.read_text()), edges="links")

communities = {}
for node, data in G.nodes(data=True):
    c = data.get("community", 0)
    communities.setdefault(c, []).append(node)

from graphify.export import to_obsidian
n = to_obsidian(G, communities, obs_dir)
print(f"[brain] {n} Obsidian notes written to {obs_dir}", file=sys.stderr)
PYEOF

# ── Build Dev Brain wiki page for this project ────────────────────────────────
BUILD_WIKI="$DEV_BRAIN_VAULT/.scripts/build-wiki-page.sh"
if [ -x "$BUILD_WIKI" ]; then
  bash "$BUILD_WIKI" "$PROJECT_SLUG" 2>/dev/null || true
fi
