#!/usr/bin/env bash

# This file is installed as a COPY outside the checkout, so it cannot locate eBrain by
# walking up from its own path the way harness/core/ebrain-home.sh does. It reads the
# location install.sh recorded instead.
EBRAIN_HOME="${EBRAIN_HOME:-$(cat "${XDG_CONFIG_HOME:-$HOME/.config}/ebrain/home" 2>/dev/null)}"
: "${EBRAIN_HOME:=$HOME/eBrain}"
# Codex pre_tool_use guard — WRAPPER al guard canónico del ebrain harness (fuente única).
# La lógica vive UNA sola vez en ~/eBrain/harness/core/guard-secrets.sh (dual-output válido para
# Claude y Codex). FAIL-OPEN si el canónico no está. (En H5 este overlay pasa a ser el adapter codex.)
CANON="$EBRAIN_HOME/harness/core/guard-secrets.sh"
[ -f "$CANON" ] && exec bash "$CANON"
exit 0
