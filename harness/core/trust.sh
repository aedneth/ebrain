#!/usr/bin/env bash
# harness/core/trust.sh — FUENTE ÚNICA de la política de confianza del canal de memoria agéntica.
# La consumen `scripts/sessions-federate` y `harness/core/remember.sh` (source, no copia). Reemplaza
# la deny-list duplicada que había en ambos (y que ya había driftado: faltaban AKIA/ghp_ en el sweep).
#
# POSTURA: DEFAULT-DENY. El destino de esta memoria son embeddings que SALEN de la máquina, así que un
# repo se federa SOLO si es demostrablemente de Eduardo. "Denegar lo desconocido" es lo correcto acá
# (a diferencia del guard de secretos, que es fail-open por disponibilidad).
#
# Reglas de federación (en orden):
#   1) hard-deny: slug o remote de cliente conocido → NUNCA (override absoluto).
#   2) allow: remote ∈ ownership propio (aedneth) → sí.
#   3) tiene remote pero NO es propio → NO (cierra el default-open: cliente futuro, fork ajeno, etc.).
#   4) sin remote: solo slugs local-only explícitos (vaults/infra) → sí; resto → NO.

# Denied repositories — never federated, even if another rule would allow them. This is OPERATOR
# configuration, not product content: it resolves from the same policy the CLI reads
# (cli/deny-policy.ts) — $EBRAIN_DENIED_REPOS, else one bare name per line in the config file,
# with '#' comments. A clean install denies nothing by name; default-deny federation is the first
# gate and this is the second.
TRUST_DENY_CONFIG="${EBRAIN_DENY_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/ebrain/denied-repos}"
TRUST_POLICY_ERROR=0
TRUST_DENY=''

# trust__load <origin> <raw> — parse AND VALIDATE the policy into an ERE alternation.
#
# Validation is not optional here. This string is spliced into `grep -E`, so an unvalidated entry
# is a fail-OPEN hole, not a cosmetic issue: `foo(` makes the whole pattern an invalid ERE, grep
# exits 2, and "no match" reads as ALLOW — disabling every other valid entry too. A leading dash is
# parsed as a grep option with the same result, and a CR left by a CRLF-saved file makes an entry
# match nothing at all, silently. The grammar is deliberately identical to SAFE_ENTRY in
# cli/deny-policy.ts: the two halves must agree on what a policy means.
trust__load() {
  local origin="$1" raw="$2" tok esc out='' n=0
  raw="$(printf '%s\n' "$raw" | tr -d '\r' | sed 's/#.*//' | tr ', \t' '\n\n\n')"
  while IFS= read -r tok; do
    [ -n "$tok" ] || continue
    tok="$(printf '%s' "$tok" | tr '[:upper:]' '[:lower:]')"
    n=$((n + 1))
    if ! printf '%s' "$tok" | grep -Eq '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$'; then
      # Report the position, never the token: a malformed entry can still contain a real name.
      TRUST_POLICY_ERROR=1
      TRUST_DENY=''
      printf 'trust.sh: %s: entry %s is not a bare repository name — treating every repository as denied\n' "$origin" "$n" >&2
      return 1
    fi
    # Escape dots so a validated entry matches literally, matching the TS substring semantics
    # (an unescaped `.` would make `a.b` match `aXb`).
    esc="$(printf '%s' "$tok" | sed 's/\./\\./g')"
    out="${out:+$out|}$esc"
  done <<EOF
$raw
EOF
  TRUST_DENY="$out"
}

if [ -n "${EBRAIN_DENIED_REPOS+x}" ]; then
  trust__load "EBRAIN_DENIED_REPOS" "$EBRAIN_DENIED_REPOS" || :
elif [ -e "$TRUST_DENY_CONFIG" ]; then
  if [ -r "$TRUST_DENY_CONFIG" ]; then
    trust__load "$TRUST_DENY_CONFIG" "$(cat "$TRUST_DENY_CONFIG")" || :
  else
    # Present but unreadable: we cannot know the policy, so we assume the strictest one.
    TRUST_POLICY_ERROR=1
    printf 'trust.sh: deny policy exists but is unreadable — treating every repository as denied\n' >&2
  fi
fi

# trust_denied <text> → 0 when the text matches the deny policy.
# An EMPTY policy must deny NOTHING: `grep -E ""` matches every input, which would silently lock
# out all federation instead of allowing it. Never inline the grep at a call site.
trust_denied() {
  [ "$TRUST_POLICY_ERROR" -eq 1 ] && return 0
  [ -n "$TRUST_DENY" ] || return 1
  printf '%s' "$1" | grep -Eiq "$TRUST_DENY"
}
# Proyectos PROPIOS de Eduardo aunque el remote actual sea de un colaborador/temporal (el oficial será
# suyo; se migran después). Override del deny-por-remote-ajeno, PERO nunca del hard-deny de cliente.
TRUST_ALLOW_SLUGS_OWNED='busnet-app|busnet'
# Remotes propios (ownership demostrable). Ampliá acá si sumás una org/host propio.
TRUST_ALLOW_REMOTES='(github|gitlab)\.com[:/]aedneth/'
# Repos local-only (sin remote propio) que SÍ son de Eduardo: vaults + infra.
TRUST_ALLOW_SLUGS_LOCALONLY='second-brain|company-brain|ebrain|dev-brain|agent-memory'
# Redact unificado (secretos que NUNCA se embeben). Un solo lugar → no más drift entre scripts.
TRUST_REDACT='sk-[A-Za-z0-9_-]{20,}|postgres://[^ ]*:[^ ]*@|mysql://[^ ]*:[^ ]*@|-----BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}'

# trust_federate_ok <repo_dir> <slug> → 0 = federar, 1 = denegar
trust_federate_ok() {
  local repo="$1" slug="$2" remote
  # 1) hard-deny (absolute, first — nothing overrides it).
  trust_denied "$slug" && return 1
  remote="$(git -C "$repo" remote get-url origin 2>/dev/null || true)"
  trust_denied "$remote" && return 1
  # 2) proyecto propio declarado (override del remote ajeno temporal; NO revierte el hard-deny de arriba).
  printf '%s' "$slug" | grep -Eiq "^($TRUST_ALLOW_SLUGS_OWNED)$" && return 0
  if [ -n "$remote" ]; then
    printf '%s' "$remote" | grep -Eiq "$TRUST_ALLOW_REMOTES" && return 0
    return 1   # tiene remote pero no es propio → default-deny
  fi
  printf '%s' "$slug" | grep -Eiq "^($TRUST_ALLOW_SLUGS_LOCALONLY)$" && return 0
  return 1
}

# trust_redact_hit <archivo> → 0 si contiene un secreto obvio (saltar la página)
trust_redact_hit() { grep -Eq "$TRUST_REDACT" "$1" 2>/dev/null; }
# trust_redact_hit_text <texto>
trust_redact_hit_text() { printf '%s' "$1" | grep -Eq "$TRUST_REDACT"; }
