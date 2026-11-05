/**
 * cli/agent-hooks.test.ts — the translator in front of the secret guard, and the per-agent context envelopes.
 * The canon is the real harness/core guard, so a pattern added there is covered here without a second list.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askCanon, blocks, contextOutput, guardOutput, promptFromTranscript, readPrompt, runContext } from "./agent-hooks.ts";

const ask = askCanon();

describe("guard translation", () => {
  test("shell tools go to the canon as they are", () => {
    expect(blocks("run_command", { CommandLine: "cat .env" }, ask, [])).toBe(true);
    expect(blocks("terminal", { command: "ls -la" }, ask, [])).toBe(false);
  });
  test("file tools are translated into the read they perform", () => {
    expect(blocks("view_file", { AbsolutePath: "/tmp/x/.env" }, ask, [])).toBe(true);
    expect(blocks("read_file", { path: "/home/u/.codex/auth.json" }, ask, [])).toBe(true);
    expect(blocks("grep_search", { SearchPath: "/home/u/.gemini/oauth_creds.json", Query: "a" }, ask, [])).toBe(true);
    expect(blocks("search_files", { path: ["src", "/x/id_rsa"] }, ask, [])).toBe(true);
    expect(blocks("read_file", { path: "README.md" }, ask, [])).toBe(false);
  });
  test("a path with a quote cannot smuggle a second command", () => {
    expect(blocks("read_file", { path: "a'; echo hi; '" }, ask, [])).toBe(false);
  });
  test("writing a secret is not blocked: it does not send it to the model", () => {
    expect(blocks("write_to_file", { TargetFile: "/tmp/x/.env" }, ask, [])).toBe(false);
  });
  test("code that names a secret file is blocked", () => {
    expect(blocks("execute_code", { code: "print(open('/tmp/x/.env').read())" }, ask, [])).toBe(true);
    expect(blocks("execute_code", { code: "print(1+1)" }, ask, [])).toBe(false);
  });
  test("extra patterns apply to read tools only", () => {
    const extra = [/\.config\/nimbus\//];
    expect(blocks("read_file", { path: "/home/u/.config/nimbus/key" }, ask, extra)).toBe(true);
    expect(blocks("terminal", { command: 'KEY="$(cat ~/.config/nimbus/key)" run' }, ask, extra)).toBe(false);
  });
  test("each agent gets its own verdict shape", () => {
    const agy = JSON.parse(guardOutput("antigravity", { toolCall: { name: "view_file", args: { AbsolutePath: "/x/.env" } } }, ask, []));
    expect(agy.decision).toBe("deny");
    expect(JSON.parse(guardOutput("antigravity", { toolCall: { name: "view_file", args: { AbsolutePath: "/x/a.md" } } }, ask, [])).decision).toBe("allow");
    expect(JSON.parse(guardOutput("hermes", { tool_name: "read_file", tool_input: { path: "/x/.env" } }, ask, [])).decision).toBe("block");
    expect(guardOutput("hermes", { tool_name: "read_file", tool_input: { path: "/x/a.md" } }, ask, [])).toBe("");
  });
  test("a missing canon lets the call through but says so", () => {
    expect(askCanon("/nonexistent/guard")("cat .env")).toBe(false);
  });
});

describe("context envelopes", () => {
  test("codex gets additionalContext, antigravity ephemeral steps, hermes plain text", () => {
    expect(JSON.parse(contextOutput("codex", "T")).hookSpecificOutput).toEqual({ hookEventName: "UserPromptSubmit", additionalContext: "T" });
    expect(JSON.parse(contextOutput("antigravity", "T"))).toEqual({ injectSteps: [{ ephemeralMessage: "T" }] });
    expect(contextOutput("hermes", "T")).toBe("T");
    expect(contextOutput("codex", "")).toBe("");
  });
  test("antigravity only injects on the first model call of a request", () => {
    expect(readPrompt("antigravity", { invocationNum: 1, lastUserInput: "x" })).toBeNull();
    expect(readPrompt("antigravity", { invocationNum: 0, lastUserInput: "x", workspacePaths: ["/w"] })).toEqual({ prompt: "x", cwd: "/w" });
  });
  test("the prompt falls back to the transcript, unwrapped", () => {
    const dir = mkdtempSync(join(tmpdir(), "ebrain-ah-"));
    try {
      const f = join(dir, "t.jsonl");
      writeFileSync(f, `${JSON.stringify({ type: "USER_INPUT", content: "old" })}\n${JSON.stringify({ type: "USER_INPUT", content: "<USER_REQUEST>\nship it\n</USER_REQUEST>" })}\nnot json\n`);
      expect(promptFromTranscript(f)).toBe("ship it");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("the context command gets the prompt on stdin and the agent in its environment; failure is silence", () => {
    const dir = mkdtempSync(join(tmpdir(), "ebrain-ah-"));
    try {
      const ok = join(dir, "ok.sh");
      writeFileSync(ok, '#!/bin/sh\nread -r j; echo "got:$EBRAIN_PROMPT_AGENT:$j"\n');
      chmodSync(ok, 0o755);
      const out = runContext("hello", dir, "codex", ok, 5000);
      expect(out.startsWith("got:codex:")).toBe(true);
      expect(out).toContain('"prompt":"hello"');
      const bad = join(dir, "bad.sh");
      writeFileSync(bad, "#!/bin/sh\necho partial; exit 3\n");
      chmodSync(bad, 0o755);
      expect(runContext("hello", dir, "codex", bad, 5000)).toBe("");
      expect(runContext("hello", dir, "codex", "sleep 5", 200)).toBe("");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
