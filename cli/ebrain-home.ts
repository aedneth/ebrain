// cli/ebrain-home.ts — the TypeScript half of "where does eBrain live".
//
// Why this exists as a second implementation. `harness/core/ebrain-home.sh` already answers this
// question for shell. Pass 5 found that answer never reached TypeScript: every `scripts/*` launcher
// resolved the checkout correctly, assigned it to a plain shell variable, and `exec`ed into `bun` —
// where a plain assignment is not part of the child's environment. Eight `.ts` files then re-derived
// their own `join(homedir(), "eBrain")`, and `cli/up.ts` wrote that guess into the MCP command string
// registered with every agent. The shell knew; the process that acts on the answer did not.
//
// The fix is not "remember to export" — that is a rule someone has to keep. It is that each language
// can answer the question by itself, from a fact it cannot lose: the physical location of the module
// being executed. `import.meta.dir` is that fact. The shell resolver now exports as well, so the two
// mechanisms are redundant on purpose; either alone lands on the right checkout.
//
// Resolution order matches the shell resolver exactly, and the parity is asserted in
// cli/ebrain-home.test.ts:
//   1. $EBRAIN_HOME, when the operator set it.
//   2. The checkout this module physically lives in (walk up from import.meta.dir).
//   3. The location scripts/install.sh recorded, for code running outside any checkout.
//   4. $HOME/eBrain, last, and only so an install predating (3) keeps working.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/** A checkout has the dispatcher and the harness core. Same predicate as ebrain__looks_like_root. */
export function looksLikeEbrainRoot(dir: string): boolean {
  return existsSync(join(dir, "cli", "ebrain")) && existsSync(join(dir, "harness", "core"));
}

/** Nearest ancestor of `start` that looks like a checkout, or null. Same walk as ebrain__walk_up. */
export function walkUpToRoot(start: string): string | null {
  let dir = start;
  while (dir && dir !== "/" && dir !== ".") {
    if (looksLikeEbrainRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Where scripts/install.sh records the chosen location. Same path as ebrain_home_record_path. */
export function ebrainHomeRecordPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config");
  return join(base, "ebrain", "home");
}

export interface ResolveOptions {
  /** Directory to start the walk from. Defaults to this module's own directory. */
  startDir?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolve the eBrain checkout root. Never throws: the final fallback is the historical default,
 * matching the shell resolver's contract that an old install keeps working.
 */
export function resolveEbrainHome(opts: ResolveOptions = {}): string {
  const env = opts.env ?? process.env;

  const explicit = env.EBRAIN_HOME;
  if (explicit) return explicit;

  const start = opts.startDir ?? import.meta.dir;
  const found = walkUpToRoot(start);
  if (found) return found;

  const record = ebrainHomeRecordPath(env);
  if (existsSync(record)) {
    let recorded = "";
    try {
      // Tolerate CRLF and a trailing newline, exactly as the shell half does with `tr -d '\r\n'`.
      recorded = readFileSync(record, "utf8").replace(/[\r\n]/g, "");
    } catch {
      recorded = "";
    }
    if (recorded && looksLikeEbrainRoot(recorded)) return recorded;
  }

  return join(env.HOME || homedir(), "eBrain");
}

/** The resolved root for this process. Computed once; call resolveEbrainHome() for a custom start. */
export const EBRAIN_HOME: string = resolveEbrainHome();
