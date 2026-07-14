/**
 * tui/test/sessions/panel.test.ts — the Sessions view (SPRINT-TUI 6.4.3).
 * Two layers, both TTY-free:
 *   1. buildFrame over a fixture sessions slice — the fleet list + live peek render
 *      (the snapshot half of the 6.4.3 verify).
 *   2. reduce over the sessions tab — ↑↓ nav and a/k/p actions emit the right EFFECTS
 *      (attach/kill/send) purely, with no tmux running.
 *
 *   bun test ./tui/test/sessions/panel.test.ts
 */
import { test, expect, describe } from "bun:test";
import { makeTheme } from "../../src/theme.js";
import { parseKey } from "../../src/kit/input.js";
import { displayWidth } from "../../src/kit/draw.js";
import {
  buildFrame,
  reduce,
  initialState,
  type AppState,
  type SessionsSlice,
  type SessionListItem,
} from "../../src/app.js";

const t = makeTheme({ trueColor: true, ascii: false });
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const size = { cols: 120, rows: 32 };

const ROWS: SessionListItem[] = [
  { name: "ebr-claude-korvex", agent: "claude", uptime: "02:41", attached: false },
  { name: "ebr-codex-tests", agent: "codex", uptime: "01:03", attached: false },
  { name: "ebr-gemini-web", agent: "gemini", uptime: "00:12", attached: true },
];

function slice(over: Partial<SessionsSlice> = {}): SessionsSlice {
  return { rows: ROWS, selected: 0, peek: null, status: "ready", ...over };
}
function stateOn(sessions: SessionsSlice): AppState {
  return { tab: "sessions", confirmQuit: false, cwd: "~", sessions };
}

describe("buildSessionsView — fleet + live peek from a fixture", () => {
  test("fleet title carries the count and lists every session + uptime", () => {
    const frame = buildFrame(stateOn(slice()), size, t).map(strip).join("\n");
    expect(frame).toContain("fleet · 3 sessions");
    expect(frame).toContain("ebr-claude-korvex");
    expect(frame).toContain("ebr-codex-tests");
    expect(frame).toContain("ebr-gemini-web");
    expect(frame).toContain("02:41");
  });

  test("peek pane is titled for the SELECTED session and marked live", () => {
    const s = slice({ selected: 1, peek: { name: "ebr-codex-tests", text: "$ bun test\n42 pass", at: 0 } });
    const frame = buildFrame(stateOn(s), size, t).map(strip).join("\n");
    expect(frame).toContain("peek · ebr-codex-tests");
    expect(frame).toContain("live");
    expect(frame).toContain("42 pass");
  });

  test("empty fleet → guidance, never a spinner-forever", () => {
    const frame = buildFrame(stateOn(slice({ rows: [], status: "no-server" })), size, t).map(strip).join("\n");
    expect(frame).toContain("no active sessions");
  });

  test("no-tmux state is explicit (not an error)", () => {
    const frame = buildFrame(stateOn(slice({ rows: [], status: "no-tmux" })), size, t).map(strip).join("\n");
    expect(frame).toContain("tmux is not installed");
  });

  test("hint bar shows the mockup's session actions", () => {
    const frame = buildFrame(stateOn(slice()), size, t).map(strip).join("\n");
    expect(frame).toContain("a attach");
    expect(frame).toContain("k kill");
    expect(frame).toContain("p prompt");
  });

  test("every row is exactly `cols` wide (character-buffer invariant)", () => {
    for (const row of buildFrame(stateOn(slice()), size, t)) {
      expect(displayWidth(row)).toBe(size.cols);
    }
  });
});

describe("reduce — sessions nav & actions emit effects (pure, no tmux)", () => {
  const base = stateOn(slice());

  test("navigating to sessions requests a refresh", () => {
    const r = reduce(initialState(), parseKey("2"));
    expect(r.state.tab).toBe("sessions");
    expect(r.effect).toEqual({ type: "refreshSessions" });
  });

  test("↓ moves the selection and requests a peek of the new row", () => {
    const r = reduce(base, { name: "down" });
    expect(r.state.sessions?.selected).toBe(1);
    expect(r.effect).toEqual({ type: "peek", name: "ebr-codex-tests" });
  });

  test("↑ at the top is a clamped no-op (no effect)", () => {
    const r = reduce(base, { name: "up" });
    expect(r.state.sessions?.selected).toBe(0);
    expect(r.effect).toBeUndefined();
  });

  test("a → attach effect for the selected session", () => {
    const r = reduce(base, parseKey("a"));
    expect(r.effect).toEqual({ type: "attach", name: "ebr-claude-korvex" });
  });

  test("k opens a danger confirm; ONLY `y` emits kill (enter does not; n cancels)", () => {
    const opened = reduce(base, parseKey("k"));
    expect(opened.state.overlay).toEqual({ kind: "confirmKill", name: "ebr-claude-korvex" });
    expect(opened.effect).toBeUndefined();

    const enter = reduce(opened.state, { name: "enter" });
    expect(enter.effect).toBeUndefined(); // destructive default must be explicit
    expect(enter.state.overlay).not.toBeNull(); // stays open

    const confirmed = reduce(opened.state, parseKey("y"));
    expect(confirmed.effect).toEqual({ type: "kill", name: "ebr-claude-korvex" });
    expect(confirmed.state.overlay).toBeNull();

    const cancelled = reduce(opened.state, parseKey("n"));
    expect(cancelled.effect).toBeUndefined();
    expect(cancelled.state.overlay).toBeNull();
  });

  test("p opens a prompt; typing + enter emits a send with the typed text", () => {
    const opened = reduce(base, parseKey("p"));
    expect(opened.state.overlay?.kind).toBe("prompt");
    let st = opened.state;
    for (const ch of "hola") st = reduce(st, parseKey(ch)).state;
    expect((st.overlay as { kind: "prompt"; line: { text: string } }).line.text).toBe("hola");
    const sent = reduce(st, { name: "enter" });
    expect(sent.effect).toEqual({ type: "send", name: "ebr-claude-korvex", text: "hola" });
    expect(sent.state.overlay).toBeNull();
  });

  test("prompt: esc cancels without sending; empty + enter just closes", () => {
    const opened = reduce(base, parseKey("p"));
    const esc = reduce(opened.state, { name: "escape" });
    expect(esc.effect).toBeUndefined();
    expect(esc.state.overlay).toBeNull();

    const reopened = reduce(base, parseKey("p"));
    const enterEmpty = reduce(reopened.state, { name: "enter" });
    expect(enterEmpty.effect).toBeUndefined();
    expect(enterEmpty.state.overlay).toBeNull();
  });

  test("global keys still work over the sessions tab (q quits, / opens palette)", () => {
    expect(reduce(base, parseKey("q")).quit).toBe(true);
    expect(reduce(base, parseKey("/")).state.overlay?.kind).toBe("palette");
  });
});
