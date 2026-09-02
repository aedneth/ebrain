#!/bin/sh
# eBrain installer — plug-and-play. Public entrypoint for:
#   curl -fsSL https://raw.githubusercontent.com/aedneth/ebrain/main/scripts/install.sh | sh
#
# Installs Bun if missing, clones/updates eBrain, pins the gbrain engine, installs deps,
# links `ebrain` into your PATH, and runs `ebrain up`. Idempotent and safe to re-run.
#
# It NEVER prints secret values, NEVER sources a foreign dotenv, and does NOT install agent
# CLIs or call any provider. Test/CI overrides (env vars): EBRAIN_HOME, EBRAIN_REPO, EBRAIN_REF,
# GBRAIN_REPO, GBRAIN_REF, EBRAIN_BIN_DIR, EBRAIN_SKIP_GBRAIN=1, EBRAIN_SKIP_UP=1 (test only).
set -eu

EBRAIN_REPO="${EBRAIN_REPO:-https://github.com/aedneth/ebrain.git}"
EBRAIN_REF="${EBRAIN_REF:-main}"
# Track whether the operator chose the location explicitly: --from-source below falls back to this
# script's own checkout, but an explicit EBRAIN_HOME always wins.
EBRAIN_HOME_EXPLICIT="${EBRAIN_HOME:+1}"
EBRAIN_HOME="${EBRAIN_HOME:-$HOME/eBrain}"
GBRAIN_REPO="${GBRAIN_REPO:-https://github.com/garrytan/gbrain.git}"
# Pinned engine commit (v0.42.58.0). See docs/SPRINT.md §0.1.5 and docs/ARCHITECTURE.md.
GBRAIN_REF="${GBRAIN_REF:-a25209bbb2bacf1b88e06fd5282b27f1bf4a3e7a}"
EBRAIN_BIN_DIR="${EBRAIN_BIN_DIR:-$HOME/.local/bin}"

FROM_SOURCE=0
LAUNCHER_NAME="ebrain"

usage() {
  cat <<'EOF'
eBrain installer

Usage: install.sh [--from-source] [--name <bin-name>]

  --from-source   Use this script's own checkout instead of cloning (override: EBRAIN_HOME).
  --name <name>   Install the launcher under a custom name (default: ebrain).
  -h, --help      Show this help.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --from-source) FROM_SOURCE=1 ;;
    --name) shift; [ $# -gt 0 ] || { echo "install.sh: --name requires a value" >&2; exit 2; }; LAUNCHER_NAME="$1" ;;
    --name=*) LAUNCHER_NAME="${1#--name=}" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "install.sh: unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
log() { printf '    %s\n' "$*"; }
die() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# 1. Bun (installed only if missing; never overwrites an existing install)
if ! have bun && [ -x "$HOME/.bun/bin/bun" ]; then PATH="$HOME/.bun/bin:$PATH"; fi
if ! have bun; then
  say "Installing Bun"
  curl -fsSL https://bun.sh/install | bash
  PATH="$HOME/.bun/bin:$PATH"
fi
have bun || die "bun is required and could not be installed (see https://bun.sh)"
have git || die "git is required"

# 2. eBrain source
if [ "$FROM_SOURCE" -eq 1 ]; then
  # Resolve the checkout from this script's own location unless EBRAIN_HOME was set explicitly.
  # The documented quickstart clones into a directory of the user's choosing and runs
  # ./scripts/install.sh from inside it, so defaulting to "$HOME/eBrain" would reject the very
  # checkout the user just made.
  if [ -z "$EBRAIN_HOME_EXPLICIT" ]; then
    SCRIPT_ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")/.." 2>/dev/null && pwd)" || SCRIPT_ROOT=""
    if [ -n "$SCRIPT_ROOT" ] && [ -d "$SCRIPT_ROOT/cli" ]; then EBRAIN_HOME="$SCRIPT_ROOT"; fi
  fi
  [ -d "$EBRAIN_HOME/cli" ] || die "--from-source expects an existing checkout at $EBRAIN_HOME"
  say "Using existing checkout at $EBRAIN_HOME"
elif [ -d "$EBRAIN_HOME/.git" ]; then
  say "Updating eBrain at $EBRAIN_HOME"
  git -C "$EBRAIN_HOME" fetch --quiet origin "$EBRAIN_REF" 2>/dev/null || git -C "$EBRAIN_HOME" fetch --quiet origin || true
  git -C "$EBRAIN_HOME" checkout --quiet "$EBRAIN_REF" 2>/dev/null || true
  git -C "$EBRAIN_HOME" pull --quiet --ff-only 2>/dev/null || true
else
  say "Cloning eBrain into $EBRAIN_HOME"
  mkdir -p "$(dirname "$EBRAIN_HOME")"
  git clone --quiet "$EBRAIN_REPO" "$EBRAIN_HOME"
  git -C "$EBRAIN_HOME" checkout --quiet "$EBRAIN_REF" 2>/dev/null || true
fi
[ -f "$EBRAIN_HOME/cli/ebrain" ] || die "eBrain checkout is missing cli/ebrain at $EBRAIN_HOME"

# 3. gbrain engine (pinned; lives in the gitignored vendor/ dir)
if [ "${EBRAIN_SKIP_GBRAIN:-0}" = "1" ]; then
  log "skipping gbrain engine (EBRAIN_SKIP_GBRAIN=1)"
else
  GBRAIN_DIR="$EBRAIN_HOME/vendor/gbrain"
  if [ -d "$GBRAIN_DIR/.git" ]; then
    say "Pinning gbrain engine @ ${GBRAIN_REF%%[!0-9a-f]*}"
    git -C "$GBRAIN_DIR" fetch --quiet origin 2>/dev/null || true
  else
    say "Cloning gbrain engine (pinned)"
    mkdir -p "$EBRAIN_HOME/vendor"
    git clone --quiet "$GBRAIN_REPO" "$GBRAIN_DIR"
  fi
  git -C "$GBRAIN_DIR" checkout --quiet "$GBRAIN_REF" || die "could not pin gbrain @ $GBRAIN_REF"
  # The engine is a separate package with its own lockfile — cloning it is not enough. The CLI's
  # MCP bridge imports its modules directly, so `ebrain up` fails on a fresh machine unless these
  # are installed here. Scripts stay disabled: this is vendored upstream code, and a pinned commit
  # is only a supply-chain guarantee if its postinstall hooks never run.
  log "Installing engine dependencies"
  ( cd "$GBRAIN_DIR" && { bun install --frozen-lockfile --ignore-scripts 2>/dev/null || bun install --ignore-scripts; } ) \
    || die "could not install gbrain engine dependencies at $GBRAIN_DIR"
fi

# 4. Dependencies (reproducible; falls back if the lockfile is ahead of the checkout)
say "Installing dependencies"
( cd "$EBRAIN_HOME" && { bun install --frozen-lockfile 2>/dev/null || bun install; } )

# 4b. Record the chosen location. Files that are installed as COPIES outside the checkout — the
# agent hooks under ~/.codex/hooks — cannot find eBrain by walking up from their own path, and
# their environment has no EBRAIN_HOME. This record is how they locate it.
say "Recording the install location"
EBRAIN_RECORD_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ebrain"
mkdir -p "$EBRAIN_RECORD_DIR"
printf '%s\n' "$EBRAIN_HOME" > "$EBRAIN_RECORD_DIR/home"

# 5. Launcher on PATH (idempotent: always rewritten to the canonical dispatcher)
say "Linking '$LAUNCHER_NAME' into $EBRAIN_BIN_DIR"
mkdir -p "$EBRAIN_BIN_DIR"
LAUNCHER="$EBRAIN_BIN_DIR/$LAUNCHER_NAME"
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
# launcher: eBrain CLI -> canonical dispatcher in the repo. Managed by install.sh.
exec bash "\${EBRAIN_HOME:-$EBRAIN_HOME}/cli/ebrain" "\$@"
EOF
chmod +x "$LAUNCHER"

# 5b. Re-running this script is how eBrain is UPGRADED: it pulls new code and re-pins the engine.
# A host started from the previous revision keeps serving that revision, and `ebrain up` below
# short-circuits on a healthy port — so without this the upgrade appears to succeed while every
# agent still talks to the old code, and every diagnostic reports green. Restart what is running.
if [ "${EBRAIN_SKIP_UP:-0}" != "1" ]; then
  if EBRAIN_HOME="$EBRAIN_HOME" "$EBRAIN_HOME/scripts/ebrain-daemon" status >/dev/null 2>&1; then
    say "Restarting the running host so the upgraded code is what serves"
    EBRAIN_HOME="$EBRAIN_HOME" "$EBRAIN_HOME/scripts/ebrain-daemon" restart \
      || die "could not restart the shared host after upgrading; run '$LAUNCHER_NAME daemon restart' to diagnose"
  fi
fi

# 6. Bring the shared brain up (user default; skipped only for isolated tests)
if [ "${EBRAIN_SKIP_UP:-0}" = "1" ]; then
  log "skipping 'ebrain up' (EBRAIN_SKIP_UP=1)"
else
  say "Bringing the shared brain up"
  EBRAIN_HOME="$EBRAIN_HOME" "$LAUNCHER" up || die "'ebrain up' failed; run '$LAUNCHER_NAME doctor' to diagnose"
fi

say "eBrain is ready."
log "Try:  $LAUNCHER_NAME remember \"eBrain remembers this across sessions.\""
log "      $LAUNCHER_NAME q \"what does eBrain remember?\""
case ":$PATH:" in
  *":$EBRAIN_BIN_DIR:"*) : ;;
  *) log "Add $EBRAIN_BIN_DIR to your PATH to use '$LAUNCHER_NAME' directly." ;;
esac
