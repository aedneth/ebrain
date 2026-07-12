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

# Cliente / código ajeno — nunca entra, aunque matcheara otra regla.
TRUST_DENY='brisas-del-golfo|dekko'
# Remotes propios (ownership demostrable). Ampliá acá si sumás una org/host propio.
TRUST_ALLOW_REMOTES='(github|gitlab)\.com[:/]aedneth/'
# Repos local-only (sin remote propio) que SÍ son de Eduardo: vaults + infra.
TRUST_ALLOW_SLUGS_LOCALONLY='second-brain|company-brain|ebrain|dev-brain|agent-memory'
# Redact unificado (secretos que NUNCA se embeben). Un solo lugar → no más drift entre scripts.
TRUST_REDACT='sk-[A-Za-z0-9_-]{20,}|postgres://[^ ]*:[^ ]*@|mysql://[^ ]*:[^ ]*@|-----BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}'

# trust_federate_ok <repo_dir> <slug> → 0 = federar, 1 = denegar
trust_federate_ok() {
  local repo="$1" slug="$2" remote
  printf '%s' "$slug" | grep -Eiq "$TRUST_DENY" && return 1
  remote="$(git -C "$repo" remote get-url origin 2>/dev/null || true)"
  printf '%s' "$remote" | grep -Eiq "$TRUST_DENY" && return 1
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
