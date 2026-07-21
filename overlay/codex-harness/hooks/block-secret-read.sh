#!/usr/bin/env bash

# This file is installed as a COPY outside the checkout, so it cannot locate eBrain by walking up
# from its own path the way harness/core/ebrain-home.sh does. It reads the location install.sh
# recorded — applying the SAME validation the canonical resolver applies, which is the part pass 5
# found missing (F-S7): the previous version accepted any non-empty record, so a record left behind
# by a moved or deleted checkout won over a perfectly good one at the default location. For THIS
# hook that mattered more than for the other one: an unresolvable location silently disabled the
# secret-read guard.
ebrain__looks_like_root() { [ -f "$1/cli/ebrain" ] && [ -d "$1/harness/core" ]; }
if [ -z "${EBRAIN_HOME:-}" ]; then
	# `[ -r ]` guard BEFORE the redirect (pass 6, F-T13): `< missingfile` makes the shell itself
	# print "No such file or directory" — the `2>/dev/null` on tr does not suppress the redirect's
	# own failure — so on a machine where the record was never written this leaked on EVERY guarded
	# tool call, burying the INACTIVE signal. Same shape the canonical resolver already uses.
	_rec_file="${XDG_CONFIG_HOME:-$HOME/.config}/ebrain/home"
	if [ -r "$_rec_file" ]; then _rec="$(tr -d '\r\n' < "$_rec_file")"; else _rec=""; fi
	if [ -n "$_rec" ] && ebrain__looks_like_root "$_rec"; then
		EBRAIN_HOME="$_rec"
	else
		EBRAIN_HOME="$HOME/eBrain"
	fi
fi
# Codex pre_tool_use guard — WRAPPER al guard canónico del ebrain harness (fuente única).
# La lógica vive UNA sola vez en ~/eBrain/harness/core/guard-secrets.sh (dual-output válido para
# Claude y Codex). FAIL-OPEN si el canónico no está. (En H5 este overlay pasa a ser el adapter codex.)
CANON="$EBRAIN_HOME/harness/core/guard-secrets.sh"
[ -f "$CANON" ] && exec bash "$CANON"

# Still fail-open — blocking every tool call because eBrain moved would be worse than the risk this
# guard covers, and the agent's own instructions also forbid reading secrets. But it is no longer
# SILENT: a disabled secret guard that says nothing is indistinguishable from a working one, which
# is how F-S7 stayed invisible. Set EBRAIN_GUARD_STRICT=1 to make this deny instead.
printf 'ebrain: secret-read guard INACTIVE — %s not found (EBRAIN_HOME=%s)\n' "$CANON" "$EBRAIN_HOME" >&2
if [ "${EBRAIN_GUARD_STRICT:-0}" = "1" ]; then exit 2; fi
exit 0
