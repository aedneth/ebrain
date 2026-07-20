/**
 * cli/deny-policy.ts — user-owned repository deny policy (single source of truth).
 *
 * Some repositories must never enter eBrain: client work under NDA, a contractor's tree, an
 * employer monorepo. Which ones those are is a property of the *operator*, not of eBrain, so the
 * list lives in user-owned local configuration instead of being compiled into the product.
 *
 * Resolution order:
 *   1. `EBRAIN_DENIED_REPOS` — comma/whitespace separated. Authoritative when set (tests, CI,
 *      one-shot overrides). An explicitly empty value means "deny nothing", not "fall through".
 *   2. `EBRAIN_DENY_CONFIG`, else `${XDG_CONFIG_HOME:-~/.config}/ebrain/denied-repos` — one entry
 *      per line, `#` starts a comment. This file is local state; it is never repository content.
 *   3. Empty. A clean install denies nothing by name, because federation is already default-deny:
 *      a source has to be registered before it can be read at all. This list is the second gate,
 *      for directories the operator wants refused even if someone tries to register them.
 *
 * FAIL-CLOSED is the rule that matters here. If the config exists but cannot be read or contains
 * an entry we cannot interpret, we throw instead of continuing with a silently smaller policy —
 * degrading to "deny nothing" on a parse error is exactly how an isolation guarantee dies quietly.
 *
 * Entries are matched as whole path SEGMENTS (see `isDeniedPath`) or as substrings of a source
 * identity (see `isDeniedSourceName`), always case-insensitively.
 */
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/** A deny entry is a bare directory/source name: no separators, no globs, no whitespace. */
const SAFE_ENTRY = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

/** Path of the deny configuration, whether or not it exists. Exposed for `doctor` and docs. */
export function denyConfigPath(): string {
  const explicit = process.env.EBRAIN_DENY_CONFIG;
  if (explicit) return explicit;
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "ebrain", "denied-repos");
}

function parseEntries(raw: string, origin: string): string[] {
  const entries: string[] = [];
  raw.split("\n").forEach((line, index) => {
    const stripped = line.replace(/#.*$/, "").trim().toLowerCase();
    if (!stripped) return;
    for (const token of stripped.split(/[\s,]+/)) {
      if (!token) continue;
      if (!SAFE_ENTRY.test(token)) {
        throw new Error(
          `${origin}: invalid deny entry "${token}" on line ${index + 1} — expected a bare directory or source name (letters, digits, '.', '_', '-')`,
        );
      }
      if (!entries.includes(token)) entries.push(token);
    }
  });
  return entries;
}

/**
 * The denied repository identifiers for this machine. Read on every call: the policy is small,
 * the callers are CLI-rate, and a cache would let a stale process keep using a policy the operator
 * has already tightened.
 */
export function deniedRepos(): string[] {
  const override = process.env.EBRAIN_DENIED_REPOS;
  if (override !== undefined) return parseEntries(override, "EBRAIN_DENIED_REPOS");

  const path = denyConfigPath();
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    // Present but unreadable: the operator asked for a policy we cannot see. Refuse to proceed
    // under an unknown policy rather than assume it was empty.
    throw new Error(`deny policy at ${path} exists but could not be read — refusing to run with an unknown policy`);
  }
  return parseEntries(raw, path);
}

/**
 * A path is denied when any of its segments is a denied entry. Segment equality, not substring:
 * a directory named `dekko-notes` is not `dekko`, and over-blocking teaches operators to disable
 * the guard. Callers that accept user input must resolve symlinks BEFORE calling this.
 */
export function isDeniedPath(p: string, denied: readonly string[] = deniedRepos()): boolean {
  if (denied.length === 0) return false;
  const segments = p.split(/[\\/]+/).map((s) => s.toLowerCase());
  return denied.some((d) => segments.includes(d));
}

/**
 * A source identity is denied when it *contains* a denied entry. Substring here is deliberate and
 * asymmetric with `isDeniedPath`: a source name is free-form text chosen by whoever registered it
 * ("dekko export", "code-graph/dekko"), so the safe reading is the broad one.
 */
export function isDeniedSourceName(name: string, denied: readonly string[] = deniedRepos()): boolean {
  if (denied.length === 0) return false;
  const n = name.toLowerCase();
  return denied.some((d) => n.includes(d));
}

/** True when free text references a denied repository — used to keep memory inputs clean. */
export function referencesDeniedRepo(text: string, denied: readonly string[] = deniedRepos()): boolean {
  return isDeniedSourceName(text, denied);
}
