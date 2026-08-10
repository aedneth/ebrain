// cli/help-flag.ts — deciding whether the user asked for help, without eating a real operation.
//
// This has now been wrong twice in opposite directions, which is why it is one shared function.
//
// Pass 3 (F-P6): `ebrain context --help` was documented but fell through to the unknown-subcommand
// path, printing usage as an error on stderr with exit 2. A reader following the docs saw a failure.
// The fix scanned the entire argv for a help flag.
//
// Pass 4 (F-Q3): that scan made `ebrain context get -h` print usage and exit 0 instead of rejecting
// an invalid pack id — a real operation silently swallowed. The fix restricted `-h` to position 0,
// and justified leaving the long form unrestricted with the claim that "no subcommand takes --help
// as a value".
//
// Pass 5 (F-S4): that claim was false in the same file. `--content` and `--evidence` take free text,
// so `ebrain context update <id> --content --help --yes` printed usage and exited 0 — the user asked
// to set a pack's content to the literal string "--help" (documenting the flag is a plausible reason)
// and got a silent no-op indistinguishable from success.
//
// The rule that satisfies all three: a help flag is help only where a flag can appear. A token
// consumed as the VALUE of a value-taking flag is data, whatever it is spelled like. That requires
// knowing the value-flag set, so callers pass their own — the same set their parser already uses,
// so the two cannot drift apart.

/**
 * True when argv is a request for help.
 *
 * - `--help` or `-h` as the first token (in place of a subcommand) is always help.
 * - After that, `--help` is help only in a flag position: tokens consumed as the value of a flag in
 *   `valueFlags` are skipped, because they are data.
 * - `-h` past position 0 is never help, so `<sub> -h` still reaches the subcommand and is rejected
 *   or handled on its own terms.
 */
export function isHelpRequest(argv: readonly string[], valueFlags: ReadonlySet<string>): boolean {
  if (argv.length === 0) return false;
  if (argv[0] === "--help" || argv[0] === "-h") return true;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (valueFlags.has(arg)) {
      index += 1; // the next token is this flag's value — data, not a flag position
      continue;
    }
    if (arg === "--help") return true;
  }
  return false;
}
