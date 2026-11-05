#!/usr/bin/env bun
/**
 * cli/agent-hooks.ts — what an agent's hook says to eBrain, and what eBrain says back, per agent.
 *
 *   bun cli/agent-hooks.ts guard   <agent>    stdin = the agent's PreToolUse payload
 *   bun cli/agent-hooks.ts context <agent>    stdin = the agent's prompt payload
 *
 * Two jobs, both agent-neutral at the core and agent-specific only at the edges:
 *
 * **guard.** The canonical secret guard (`harness/core/guard-secrets.sh`) reads shell commands only. Agents
 * that read files through their own tools (`view_file`, `read_file`, `grep_search`, `execute_code`) would send
 * a credential to the model provider without a shell ever running. So each call is translated into the shell
 * line that would do the same read, and the canon is asked. The list of secret file shapes lives in one place.
 * Writing a secret is not blocked: it does not send it to the model. An error of the guard's own lets the call
 * through, like the canon, because a broken guard must not stop legitimate work — but a missing canon announces
 * itself on stderr.
 *
 * **context.** The agent's prompt hook runs the *context command* and hands the agent its text. eBrain does not
 * contain that command: it is whatever retrieves for your brain, configured in `EBRAIN_CONTEXT_CMD` or the first
 * line of `~/.config/ebrain/context-command` (contract: docs/reference/prompt-context.md). Nothing configured,
 * the off-switch present, an error or a timeout: no output, and the prompt goes through untouched.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const HOME = process.env.HOME || homedir();
const CONFIG_DIR = process.env.EBRAIN_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(HOME, ".config"), "ebrain");

export const GUARD_REASON =
  "BLOCKED (ebrain harness): this tool would read a secrets file and send it to the model provider. Use the variable at runtime, never its value.";

// ───────────────────────────── guard ─────────────────────────────

/** Tools that run a shell line, and the argument that holds it. */
const SHELL_TOOLS: Record<string, string> = { run_command: "CommandLine", terminal: "command", shell: "command", bash: "command" };
/** Tools whose argument is code that reads files without a shell. */
const CODE_TOOLS: Record<string, string> = { execute_code: "code" };
const WRITES = /write|replace|patch|edit|create|delete|remove|mkdir|move|rename/i;
const PATH_KEY = /path|file|target|dir|includes/i;

/** Extra credential locations for read tools only: `~/.config/ebrain/guard-extra-paths`, one regex per line. */
export function extraPatterns(file = join(CONFIG_DIR, "guard-extra-paths")): RegExp[] {
  if (!existsSync(file)) return [];
  const out: RegExp[] = [];
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    try { out.push(new RegExp(line)); } catch { /* an invalid line protects nothing; skip it */ }
  }
  return out;
}

export function pathsOf(args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (!PATH_KEY.test(key)) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string" && item.trim()) out.push(item);
    }
  }
  return out;
}

const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

export type CanonAsk = (shellLine: string) => boolean;

/** Is this tool call a read of a secret? `ask` is the canon: true when it denies the shell line. */
export function blocks(name: string | undefined, rawArgs: unknown, ask: CanonAsk, extra: RegExp[] = extraPatterns()): boolean {
  const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? (rawArgs as Record<string, unknown>) : {};
  const tool = name ?? "";
  if (tool in SHELL_TOOLS) return ask(String(args[SHELL_TOOLS[tool]] ?? ""));
  if (tool in CODE_TOOLS) {
    const code = String(args[CODE_TOOLS[tool]] ?? "");
    return extra.some((re) => re.test(code)) || ask(`cat ${code}`);
  }
  if (WRITES.test(tool)) return false;
  for (const path of pathsOf(args)) {
    if (extra.some((re) => re.test(path)) || ask(`cat ${shellQuote(path)}`)) return true;
  }
  return false;
}

/** The canon, resolved next to this file so it follows the checkout rather than a hard-coded home. */
export function canonPath(): string {
  return process.env.EBRAIN_GUARD_CANON || resolve(dirname(import.meta.path), "..", "harness", "core", "guard-secrets.sh");
}

export function askCanon(canon = canonPath()): CanonAsk {
  return (line) => {
    if (!existsSync(canon)) {
      process.stderr.write(`ebrain harness: guard-secrets.sh INACTIVE — ${canon} not found\n`);
      return false;
    }
    const r = spawnSync("bash", [canon], { input: JSON.stringify({ tool_input: { command: line } }), encoding: "utf8", timeout: 5000 });
    return r.status === 2;
  };
}

/** The decision, in the shape each agent's runtime expects. Returns the stdout text (possibly empty). */
export function guardOutput(agent: string, payload: any, ask: CanonAsk = askCanon(), extra?: RegExp[]): string {
  if (agent === "antigravity") {
    const call = payload?.toolCall ?? {};
    const bad = blocks(call.name, call.args, ask, extra);
    return JSON.stringify(bad ? { decision: "deny", reason: GUARD_REASON } : { decision: "allow" });
  }
  // hermes, and any agent that sends {tool_name, tool_input}
  const bad = blocks(payload?.tool_name, payload?.tool_input, ask, extra);
  return bad ? JSON.stringify({ decision: "block", reason: GUARD_REASON }) : "";
}

// ───────────────────────────── context ─────────────────────────────

export function contextCommand(): string | null {
  const fromEnv = process.env.EBRAIN_CONTEXT_CMD?.trim();
  if (fromEnv) return fromEnv;
  const file = join(CONFIG_DIR, "context-command");
  if (!existsSync(file)) return null;
  const line = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
  return line || null;
}

export function offSwitch(): boolean {
  return existsSync(join(CONFIG_DIR, "sin-memoria-en-prompt"));
}

/** The last USER_INPUT in an Antigravity transcript, unwrapped from <USER_REQUEST>. */
export function promptFromTranscript(file: string): string {
  if (!file || !existsSync(file)) return "";
  let last = "";
  for (const line of readFileSync(file, "utf8").split("\n")) {
    try {
      const d = JSON.parse(line);
      if (d?.type === "USER_INPUT") last = String(d.content ?? "");
    } catch { /* not a JSON line */ }
  }
  const m = last.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
  return m ? m[1] : last;
}

/** What the agent's hook payload says: the prompt and where the agent is. Null: nothing to do this time. */
export function readPrompt(agent: string, payload: any): { prompt: string; cwd: string } | null {
  if (agent === "antigravity") {
    if ((payload?.invocationNum ?? 0) !== 0) return null; // only the first model call of each request
    const prompt = String(payload?.lastUserInput || promptFromTranscript(String(payload?.transcriptPath ?? "")));
    return { prompt, cwd: String(payload?.workspacePaths?.[0] ?? process.cwd()) };
  }
  return { prompt: String(payload?.prompt ?? ""), cwd: String(payload?.cwd ?? process.cwd()) };
}

export function runContext(prompt: string, cwd: string, agent: string, cmd: string, timeoutMs: number): string {
  const r = spawnSync("sh", ["-c", cmd], {
    input: JSON.stringify({ prompt, cwd }),
    encoding: "utf8",
    timeout: timeoutMs,
    cwd: existsSync(cwd) ? cwd : undefined,
    env: { ...process.env, EBRAIN_PROMPT_CWD: cwd, EBRAIN_PROMPT_AGENT: agent },
    maxBuffer: 1 << 20,
  });
  return r.status === 0 ? (r.stdout ?? "").trim() : "";
}

/** The agent-shaped output for a context text. Hermes wants plain text; the others a JSON envelope. */
export function contextOutput(agent: string, text: string): string {
  if (!text) return "";
  if (agent === "antigravity") return JSON.stringify({ injectSteps: [{ ephemeralMessage: text }] });
  if (agent === "hermes") return text;
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: text } });
}

export function contextFor(agent: string, payload: any): string {
  if (offSwitch()) return "";
  const cmd = contextCommand();
  if (!cmd) return "";
  const p = readPrompt(agent, payload);
  if (!p || !p.prompt.trim()) return "";
  const timeout = Number(process.env.EBRAIN_CONTEXT_TIMEOUT_MS) || 15000;
  return contextOutput(agent, runContext(p.prompt, p.cwd, agent, cmd, timeout));
}

// ───────────────────────────── entry ─────────────────────────────

async function main(): Promise<void> {
  const [mode, agent] = process.argv.slice(2);
  if (!["guard", "context"].includes(mode ?? "") || !agent) {
    console.error("usage: agent-hooks.ts <guard|context> <agent>");
    process.exit(2);
  }
  let payload: any = {};
  try { payload = JSON.parse(await Bun.stdin.text()); } catch { /* an unreadable payload is no payload */ }
  try {
    const out = mode === "guard" ? guardOutput(agent, payload) : contextFor(agent, payload);
    if (out) process.stdout.write(`${out}\n`);
    // Hermes' guard denies by the JSON it prints; Antigravity by its decision. Neither uses an exit code.
  } catch {
    if (mode === "guard" && agent === "antigravity") process.stdout.write('{"decision":"allow"}\n');
  }
  process.exit(0);
}

if (import.meta.main) await main();
