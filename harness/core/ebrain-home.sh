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

# ebrain_export_home <caller-path> — resolve AND export, which is what every launcher actually wants.
#
# Pass 5 (F-S1): every launcher wrote `EBRAIN_HOME="$(ebrain_resolve_home ...)"` — a plain assignment.
# The resolved path was substituted into the `exec` argument, so the right file ran, but a plain
# assignment is not part of a child process's environment. `cli/up.ts` read `process.env.EBRAIN_HOME`
# back as undefined and guessed `$HOME/eBrain`, then wrote that guess into the MCP command string
# registered with every agent. The launcher knew the answer and did not pass it on.
#
# Callers use this, not the bare resolver, wherever the value crosses into a child process. The
# resolver stays pure for tests and for the rare caller that only wants to inspect.
ebrain_export_home() {
	EBRAIN_HOME=$(ebrain_resolve_home "${1:-$0}")
	export EBRAIN_HOME
}

# ── portable userland ────────────────────────────────────────────────────────
#
# eBrain is developed and CI-tested on Linux, and the shell it grew up in is GNU. Three GNU
# spellings had leaked across the harness and each one fails differently on a BSD userland
# (macOS), always quietly: a bare `mktemp` aborts, `stat -c` prints nothing, and a missing
# `timeout` makes the whole command substitution empty. Every one of those is swallowed by a
# nearby `|| true` or `2>/dev/null`, so the symptom is not an error — it is a check that
# silently reports the wrong thing, which is the failure class this harness cares about most.
#
# These shims are not a claim of macOS support; see the platform note in README. They exist so
# that a Mac user sees eBrain degrade honestly instead of misreporting.

# ebrain_mktemp — a temp file with an explicit template. GNU allows a bare `mktemp`; BSD requires
# the template, so passing one always is the portable spelling.
ebrain_mktemp() {
	mktemp "${TMPDIR:-/tmp}/ebrain.XXXXXXXX"
}

# ebrain_timeout <seconds> <command...> — bound a command's runtime where the platform can.
# GNU coreutils ships `timeout`; macOS ships none in the base system and `gtimeout` only with
# Homebrew coreutils. Running unbounded is the honest degradation: the alternative is refusing to
# run a diagnostic at all on a platform where it would have worked.
ebrain_timeout() {
	_secs=$1
	shift
	if command -v timeout >/dev/null 2>&1; then
		timeout "$_secs" "$@"
	elif command -v gtimeout >/dev/null 2>&1; then
		gtimeout "$_secs" "$@"
	else
		# No timeout binary at all (macOS base userland). "Unbounded" is not an honest fallback
		# for a diagnostic: a blocked engine call would hang `ebrain doctor` forever, and a hang
		# is indistinguishable from slow. A shell watchdog is less precise than timeout(1) but it
		# always terminates.
		"$@" &
		_ebrain_job=$!
		( sleep "$_secs"; kill "$_ebrain_job" 2>/dev/null ) &
		_ebrain_watch=$!
		wait "$_ebrain_job"
		_ebrain_rc=$?
		kill "$_ebrain_watch" 2>/dev/null
		return $_ebrain_rc
	fi
}

# ebrain_file_mode <path> — octal permissions, or empty when they cannot be read.
ebrain_file_mode() {
	stat -c '%a' "$1" 2>/dev/null || stat -f '%OLp' "$1" 2>/dev/null || printf ''
}

# ebrain_os — the platform, named honestly for anything that reports support.
ebrain_os() {
	case "$(uname -s 2>/dev/null)" in
		Linux)  printf 'linux' ;;
		Darwin) printf 'macos' ;;
		*)      printf 'other' ;;
	esac
}
