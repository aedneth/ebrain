# shellcheck shell=sh
# harness/core/ebrain-home.sh — the ONE place that decides where eBrain lives.
#
# Why this file exists. Twenty-three sites across fifteen shell entrypoints each wrote their own
# `${EBRAIN_HOME:-$HOME/eBrain}`, and several wrote a bare `$HOME/eBrain` with no override at all.
# That default is wrong for every user who follows the published quickstart, which says to clone
# into a directory of their choosing. The worst case was `scripts/ebrain-mcp-bridge`: the literal
# command every supported agent spawns to reach eBrain over MCP, registered by `ebrain up`. A user
# who cloned anywhere else got an agent integration that failed silently — no error surfaced by the
# onboarding smoke test, which talks to the daemon over HTTP and never spawns the bridge.
#
# Resolution order, most explicit first:
#   1. $EBRAIN_HOME, when the operator set it.
#   2. The checkout this script physically lives in, found by walking up from the caller's own
#      directory until a directory looks like an eBrain root. Depth-independent, so scripts/ and
#      harness/core/ use identical code, and correct after symlink resolution.
#   3. The location install.sh recorded, for files that are COPIES living outside the checkout —
#      the overlay agent hooks are installed into ~/.codex/hooks and cannot walk up to anything.
#   4. $HOME/eBrain, last, and only as the historical default for an install that predates (3).
#
# POSIX sh: a sourced file cannot portably know its own path, so the caller passes its own ($0 or
# ${BASH_SOURCE[0]}). That is the one line of ceremony this design costs.

# ebrain__looks_like_root <dir> — a checkout has the dispatcher and the harness core.
ebrain__looks_like_root() {
	[ -f "$1/cli/ebrain" ] && [ -d "$1/harness/core" ]
}

# ebrain__walk_up <dir> — nearest ancestor that looks like a checkout, or nothing.
ebrain__walk_up() {
	_d=$1
	while [ -n "$_d" ] && [ "$_d" != "/" ] && [ "$_d" != "." ]; do
		if ebrain__looks_like_root "$_d"; then
			printf '%s' "$_d"
			return 0
		fi
		_d=$(dirname "$_d")
	done
	return 1
}

# ebrain_home_record_path — where install.sh records the chosen location.
ebrain_home_record_path() {
	printf '%s/ebrain/home' "${XDG_CONFIG_HOME:-$HOME/.config}"
}

# ebrain_resolve_home <caller-path> — echoes the resolved root. Never fails: the last fallback is
# the historical default, so an old install keeps working while a new one is located correctly.
ebrain_resolve_home() {
	if [ -n "${EBRAIN_HOME:-}" ]; then
		printf '%s' "$EBRAIN_HOME"
		return 0
	fi

	_caller=${1:-$0}
	# Resolve symlinks so a launcher symlinked onto PATH still finds its own checkout.
	_dir=$(CDPATH='' cd -- "$(dirname -- "$_caller")" 2>/dev/null && pwd -P) || _dir=''
	if [ -n "$_dir" ]; then
		if _root=$(ebrain__walk_up "$_dir"); then
			printf '%s' "$_root"
			return 0
		fi
	fi

	_record=$(ebrain_home_record_path)
	if [ -r "$_record" ]; then
		_recorded=$(cat "$_record" 2>/dev/null | tr -d '\r\n')
		if [ -n "$_recorded" ] && ebrain__looks_like_root "$_recorded"; then
			printf '%s' "$_recorded"
			return 0
		fi
	fi

	printf '%s/eBrain' "$HOME"
}
