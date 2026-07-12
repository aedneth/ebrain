#!/usr/bin/env bash
# Codex pre_tool_use guard — WRAPPER al guard canónico del ebrain harness (fuente única).
# La lógica vive UNA sola vez en ~/eBrain/harness/core/guard-secrets.sh (dual-output válido para
# Claude y Codex). FAIL-OPEN si el canónico no está. (En H5 este overlay pasa a ser el adapter codex.)
CANON="$HOME/eBrain/harness/core/guard-secrets.sh"
[ -f "$CANON" ] && exec bash "$CANON"
exit 0
