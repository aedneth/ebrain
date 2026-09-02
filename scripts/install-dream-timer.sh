#!/usr/bin/env bash
# install-dream-timer.sh — install the nightly dream-cycle systemd user units.
#
# Why this script exists. The units used to be copied by hand with `cp`, and they hardcoded
# `%h/eBrain` — systemd's expansion for $HOME/eBrain. That is correct only for a checkout at
# $HOME/eBrain. Anyone who cloned elsewhere (which the quickstart invites) installed a timer whose
# ExecStart pointed at nothing; systemd would report the failure to the journal at 03:30 and nowhere
# a person would look. Pass 5 found it as F-S2 — the same defect class as the shell entrypoints,
# surviving in a file type the regression guard could not see.
#
# The units are now templates. This script resolves the real checkout with the shared resolver and
# substitutes it, so there is one answer about where eBrain lives, in every file type.
#
# It deliberately does NOT `enable` the timer: the dream cycle spends money on every run, and turning
# on recurring autonomous spend is a human decision. The command to do it is printed at the end.
set -euo pipefail

# Resolve our own symlink FIRST: a launcher symlinked onto PATH has a BASH_SOURCE pointing at the
# symlink, so `dirname`/../harness would look for the resolver next to the link, not next to the
# real script, and the source would fail before the resolver could do anything (pass 5, F-S3).
# `readlink -f` is coreutils; where it is absent this degrades to the previous behaviour.
EBRAIN_SELF="${BASH_SOURCE[0]}"
# `|| true` and an `if` rather than an `&&` chain: under `set -e` a trailing failed `&&` would
# abort the launcher on any system where readlink lacks -f, turning a graceful degradation into
# a hard failure.
EBRAIN_REAL="$(readlink -f -- "$EBRAIN_SELF" 2>/dev/null || true)"
if [ -n "$EBRAIN_REAL" ]; then EBRAIN_SELF="$EBRAIN_REAL"; fi
. "$(dirname -- "$EBRAIN_SELF")/../harness/core/ebrain-home.sh"
ebrain_export_home "$EBRAIN_SELF"

UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SRC_DIR="$EBRAIN_HOME/scripts/systemd"

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

[ -d "$SRC_DIR" ] || die "unit templates not found at $SRC_DIR (is $EBRAIN_HOME a real checkout?)"
command -v systemctl >/dev/null 2>&1 || die "systemctl not found; these units are for systemd user sessions"

mkdir -p "$UNIT_DIR"

for template in "$SRC_DIR"/*.in; do
	[ -e "$template" ] || die "no unit templates matched $SRC_DIR/*.in"
	unit=$(basename "$template" .in)
	# The checkout path is substituted as data, not as a shell expansion, so a path containing
	# spaces or regex metacharacters lands verbatim. `|` cannot appear in the placeholder, and any
	# `|` in the path is handled by escaping it for sed's replacement.
	escaped=$(printf '%s' "$EBRAIN_HOME" | sed -e 's/[\\&|]/\\&/g')
	sed -e "s|@EBRAIN_HOME@|$escaped|g" "$template" > "$UNIT_DIR/$unit"
	printf 'installed %s\n' "$UNIT_DIR/$unit"
done

# Fail loudly rather than leaving a half-installed timer: a unit still holding the placeholder would
# be a silently broken install, which is precisely what this script exists to prevent.
if grep -l '@EBRAIN_HOME@' "$UNIT_DIR"/ebrain-dream.* >/dev/null 2>&1; then
	die "substitution failed; a unit still contains @EBRAIN_HOME@"
fi

systemctl --user daemon-reload

cat <<EOF

Units installed against: $EBRAIN_HOME

The timer is NOT enabled. It runs the dream cycle nightly at 03:30, and every run spends money
through your configured provider. Enable it only when you have watched a supervised run:

  bash "$EBRAIN_HOME/scripts/dream-cycle" --dry-run   # preview, no spend
  bash "$EBRAIN_HOME/scripts/dream-cycle"             # one real supervised run
  systemctl --user enable --now ebrain-dream.timer    # recurring autonomous spend
EOF
