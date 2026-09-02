#!/usr/bin/env bash
# register-to-dev-brain.sh — Register this project in Dev Brain's registry.
# Run once per project (idempotent). Updates projects.json + AGENT_README.md.
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/.brain/config.sh" 2>/dev/null
bash "$HOME/Documents/Dev Brain/.scripts/register-project.sh" \
  "$PROJECT_SLUG" \
  "$PROJECT_NAME" \
  "$REPO_ROOT"
