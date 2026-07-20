/** Dispatcher invocation matrix for F7.4. Bare `ebrain` is interactive only with a real TTY;
 * no-argument scripts retain help and `ebrain ui` fails visibly instead of emitting an alt-screen. */
import { afterEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "ebrain");
const ROOT = join(import.meta.dir, "..");
const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

async function invoke(args: string[]): Promise<{ exit: number; out: string; err: string }> {
  const proc = Bun.spawn(["bash", CLI, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, err, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { exit, out, err };
}

describe("ebrain dispatcher non-interactive compatibility", () => {
  test("bare ebrain on pipes keeps help output and never starts the TUI", async () => {
    const result = await invoke([]);
    expect(result.exit).toBe(0);
    expect(result.out).toContain("unified harness + agentic-memory layer");
    expect(result.out).toContain("ebrain ui");
    expect(result.out).not.toContain("\x1b[?1049h");
  });

  test("explicit ui on pipes fails clearly before the Bun entrypoint", async () => {
    const result = await invoke(["ui"]);
    expect(result.exit).toBe(1);
    expect(result.err).toContain("needs a real interactive terminal");
  });
});

let hasTmux = false;
try {
  execSync("command -v tmux", { stdio: "ignore" });
  hasTmux = true;
} catch {
  hasTmux = false;
}

const ttyTest = hasTmux ? test : test.skip;
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

ttyTest("bare ebrain and the ui alias start the same TUI entrypoint from a real pseudo-terminal", async () => {
  const root = mkdtempSync(join(tmpdir(), "ebrain-entry-"));
  tempRoots.push(root);
  const bin = join(root, "bin");
  const fakeBun = join(bin, "bun");
  const home = join(root, "home");
  mkdirSync(bin, { recursive: true });
  writeFileSync(fakeBun, "#!/bin/sh\nprintf 'FAKE_BUN_TUI:%s\\n' \"$*\"\n");
  chmodSync(fakeBun, 0o755);
  // `run_bun` only needs a PATH entry; its neutral config cwd falls back to /tmp in this fixture.
  for (const [index, args] of [[], ["ui"]].entries()) {
    const session = `ebr-entry-${Date.now().toString(36)}-${index}`;
    const command = `PATH=${shellQuote(bin)}:$PATH HOME=${shellQuote(home)} EBRAIN_HOME=${shellQuote(ROOT)} TERM=xterm-256color bash ${shellQuote(CLI)} ${args.map(shellQuote).join(" ")}; sleep 1`;
    try {
      const created = Bun.spawn(["tmux", "new-session", "-d", "-x", "100", "-y", "30", "-s", session, command], { stdout: "ignore", stderr: "pipe" });
      expect(await created.exited).toBe(0);
      await Bun.sleep(150);
      const captured = Bun.spawn(["tmux", "capture-pane", "-p", "-t", session], { stdout: "pipe", stderr: "pipe" });
      const [out, exit] = await Promise.all([new Response(captured.stdout).text(), captured.exited]);
      expect(exit).toBe(0);
      expect(out).toContain(`FAKE_BUN_TUI:run ${ROOT}/tui/src/app.ts`);
    } finally {
      const killed = Bun.spawn(["tmux", "kill-session", "-t", session], { stdout: "ignore", stderr: "ignore" });
      await killed.exited;
    }
  }
});
