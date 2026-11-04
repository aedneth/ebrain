/**
 * Where the memory engine's store lives. GBRAIN_HOME is a *parent* directory: the engine always appends `.gbrain`.
 *
 * Order: $GBRAIN_HOME, then the one-line pointer `~/.config/ebrain/engine-home`, then $HOME. The pointer exists for
 * side-by-side upgrades: the daemon runs on a new store while the previous one stays intact as the way back, and
 * every reader (doctor, spend, uninstall) follows it without each process having to export the variable. It must stay
 * out of the environment of the thin clients, which set GBRAIN_HOME to their own config (see remote-tools.ts).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function engineHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.GBRAIN_HOME && env.GBRAIN_HOME.trim() !== "") return env.GBRAIN_HOME;
  const home = env.HOME || homedir();
  try {
    const pointed = readFileSync(join(home, ".config", "ebrain", "engine-home"), "utf8").trim();
    if (pointed) return pointed;
  } catch {
    // No pointer: the store is in its historical place.
  }
  return home;
}
