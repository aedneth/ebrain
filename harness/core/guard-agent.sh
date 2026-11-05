#!/usr/bin/env bash
# harness/core/guard-agent.sh — bridge from an agent's hook to cli/agent-hooks.ts (guard); the agent comes from $AGENT_NAME.
# FAIL-OPEN: no bun or any error means exit 0 with no output; a missing bun on the GUARD says so on stderr.
. "$(dirname -- "${BASH_SOURCE[0]}")/ebrain-home.sh"
ebrain_prefer_pinned_bun
EBRAIN_HOME="$(ebrain_resolve_home "${BASH_SOURCE[0]}")"
if ! command -v bun >/dev/null 2>&1; then
  [ "guard" = guard ] && printf 'ebrain harness: guard INACTIVE — bun not found\n' >&2
  exit 0
fi
exec bun run "$EBRAIN_HOME/cli/agent-hooks.ts" guard "${AGENT_NAME:-unknown}"
