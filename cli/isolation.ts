/**
 * cli/isolation.ts — the single surface for the isolation invariants that the daemon's SHARED
 * CHANNEL (phase D / ADR-004 criterion 4) must preserve.
 *
 * Two planes, both testable in CI (see cli/isolation.test.ts):
 *   1. session plane: `isClientPath` — no agent may launch a session whose cwd resolves under a
 *      denied repository. This is the door through which denied code would otherwise enter the
 *      brain via a session. (Policy source of truth: cli/deny-policy.ts, operator-configured.)
 *   2. source plane: `isClientSource` / `federatedSources` / `assertNoClientSources` — no denied
 *      repository may appear as a federated source of the shared host. Reproduces the discovery
 *      filter of `scripts/ebrain-q` (federated · !default · !denied) as a function, so the host
 *      can ENFORCE it rather than merely document it.
 */
import { clientDenylist, isClientPath } from "./sessions.ts";
import { isDeniedSourceName } from "./deny-policy.ts";

export { clientDenylist, isClientPath };

/**
 * A source name identifies a denied repository (never federable) when it contains a denied entry,
 * case-insensitively. Mirrors the discovery filter of `scripts/ebrain-q`.
 */
export function isClientSource(name: string): boolean {
  return isDeniedSourceName(name);
}

export interface SourceIdentity {
  id?: unknown;
  name?: unknown;
  path?: unknown;
}

/**
 * Runtime source filtering must inspect every identity field supplied by gbrain. A source can
 * have an innocent id while its display name or local path identifies a denied client repo.
 */
export function isClientSourceRecord(source: SourceIdentity): boolean {
  return [source.id, source.name, source.path]
    .filter((value): value is string => typeof value === "string")
    .some((value) => isClientSource(value) || isClientPath(value));
}

/**
 * Source discovery filter as a function: from the raw `sources list` output,
 * keep ONLY the federated, non-'default', non-denied entries — the same criterion the
 * `ebrain-q` discovery pipeline applies.
 */
export function federatedSources(rawSourcesList: string): string[] {
  return rawSourcesList
    .split("\n")
    .filter((l) => /federated/.test(l))
    .map((l) => l.trim().split(/\s+/)[0] ?? "")
    .filter((name) => name.length > 0 && name !== "default" && !isClientSource(name));
}

/**
 * Gate assertion: a denied source may NEVER appear in a federated set.
 *
 * Enforced at runtime, not by convention: `cli/daemon-preflight.ts` calls this over the live
 * source list before the host binds HTTP, and `scripts/ebrain-brain` runs that preflight ahead of
 * `serve --http`. The CI test (cli/isolation.test.ts) covers the predicate itself.
 */
export function assertNoClientSources(sources: readonly string[]): void {
  const leaked = sources.filter(isClientSource);
  if (leaked.length > 0) {
    // Count, never names: this can surface in daemon boot output.
    throw new Error(`isolation broken: ${leaked.length} denied source(s) reached the federated set`);
  }
}
