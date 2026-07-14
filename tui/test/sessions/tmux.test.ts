/**
 * tui/test/sessions/tmux.test.ts — SPRINT-TUI 6.4.1 (control-plane wrapper) + 6.4.2
 * (fake-agent fixture survival). Two layers, same shape as cli/sessions.test.ts:
 *   1. Pure unit tests (insideTmux / attachTarget / re-export wiring) — always run.
 *   2. E2E against a REAL tmux server + scripts/fake-agent.sh: hasServer → new → list
 *      → peek (SCRUBBED) → send → kill. Skips CLEAN (never fails) when tmux is absent.
 *
 * Run explicitly (bunfig [test].root="cli" scopes bare `bun test` to cli/):
 *   bun test ./tui/test/sessions/tmux.test.ts
 */
import { test, expect, describe, afterAll } from "bun:test";
import { execSync } from "child_process";
import {
  insideTmux,
  attachTarget,
  hasServer,
  listSessions,
  newSession,
  peekSession,
  sendToSession,
  killSession,
  sessionName,
} from "../../src/sessions/tmux.ts";

// ── pure unit tests (always run) ────────────────────────────────────────────
describe("insideTmux / attachTarget (pure, no tmux)", () => {
  test("insideTmux reads $TMUX presence", () => {
    expect(insideTmux({ TMUX: "/tmp/tmux-1000/default,1234,0" } as NodeJS.ProcessEnv)).toBe(true);
    expect(insideTmux({} as NodeJS.ProcessEnv)).toBe(false);
    expect(insideTmux({ TMUX: "" } as NodeJS.ProcessEnv)).toBe(false);
  });

  test("attachTarget: attach outside tmux, switch-client inside (no nesting)", () => {
    expect(attachTarget("ebr-claude-x", {} as NodeJS.ProcessEnv)).toEqual({
      verb: "attach-session",
      args: ["attach-session", "-t", "ebr-claude-x"],
    });
    expect(attachTarget("ebr-claude-x", { TMUX: "sock,1,0" } as NodeJS.ProcessEnv)).toEqual({
      verb: "switch-client",
      args: ["switch-client", "-t", "ebr-claude-x"],
    });
  });

  test("re-exports are wired (backend REUSED from cli/sessions.ts, not reimplemented)", () => {
    expect(typeof listSessions).toBe("function");
    expect(typeof peekSession).toBe("function");
    expect(typeof sendToSession).toBe("function");
    expect(typeof killSession).toBe("function");
    expect(sessionName("claude", "korvex")).toBe("ebr-claude-korvex");
  });
});

// ── E2E — real tmux + fake-agent (skips clean if tmux absent) ────────────────
let HAS_TMUX = false;
try {
  execSync("command -v tmux", { stdio: "ignore" });
  HAS_TMUX = true;
} catch {
  HAS_TMUX = false;
}

const describeE2E = HAS_TMUX ? describe : describe.skip;
const FAKE = `${import.meta.dir}/../../../scripts/fake-agent.sh`;
const SLUG = `t${Date.now().toString(36)}`;
const NAME = sessionName("test", SLUG);

describeE2E("tmux E2E (real server + fake-agent 6.4.2)", () => {
  afterAll(async () => {
    await killSession(NAME, true); // best-effort teardown
  });

  test(
    "hasServer → new → list → peek(SCRUBBED) → send → kill",
    async () => {
      const created = await newSession("test", SLUG, { launchCmd: `bash ${FAKE}` });
      expect(created.ok).toBe(true);

      // server is now up, and our session is enumerated
      expect(await hasServer()).toBe("up");
      const list = await listSessions();
      expect(list.ok).toBe(true);
      if (list.ok) expect(list.sessions.some((s) => s.name === NAME)).toBe(true);

      // 6.4.2 survival: fake-agent must still be ticking after >1 cycle (~2s each).
      await Bun.sleep(4500);
      const peek1 = await peekSession(NAME);
      expect(peek1.ok).toBe(true);
      if (peek1.ok) {
        expect(peek1.text).toContain("fake-agent: listo");
        expect(peek1.text).toMatch(/tick [2-9]/); // still alive after multiple ticks
      }

      // 6.1.6 hard requirement carried through the wrapper: peek is ALWAYS scrubbed.
      const secret = "MY_API_KEY=sk-ant-abcdefgh12345678ZZ";
      const sent = await sendToSession(NAME, secret, true);
      expect(sent.ok).toBe(true);
      await Bun.sleep(1500);
      const peek2 = await peekSession(NAME);
      expect(peek2.ok).toBe(true);
      if (peek2.ok) {
        expect(peek2.text).not.toContain("sk-ant-abcdefgh12345678ZZ");
        expect(peek2.text).toContain("[REDACTED]");
      }

      // kill removes it from the enumeration
      const killed = await killSession(NAME, true);
      expect(killed.ok).toBe(true);
      const after = await listSessions();
      expect(after.ok).toBe(true);
      if (after.ok) expect(after.sessions.some((s) => s.name === NAME)).toBe(false);
    },
    20000,
  );

  test(
    "send is LITERAL (-l, gate F6.4.8): a prompt that is a tmux key-token arrives as TEXT",
    async () => {
      const litSlug = SLUG + "lit";
      const litName = sessionName("test", litSlug);
      const created = await newSession("test", litSlug, { launchCmd: `bash ${FAKE}` });
      expect(created.ok).toBe(true);
      await Bun.sleep(600);
      // Without -l, "Space" would inject a space char (fake-agent echoes "recibí:  ");
      // with -l it is sent literally, so the fake-agent echoes the WORD "Space".
      await sendToSession(litName, "Space", true);
      await Bun.sleep(1300);
      const p = await peekSession(litName);
      expect(p.ok).toBe(true);
      if (p.ok) expect(p.text).toContain("recibí: Space");
      await killSession(litName, true);
    },
    15000,
  );
});
