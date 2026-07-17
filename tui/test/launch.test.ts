/**
 * tui/test/launch.test.ts — the Launch view + RAM-governor gate (SPRINT-TUI 6.4.5/6.4.6).
 * buildLaunchView renders the agent grid; reduce drives selection + the launch effect,
 * and the confirmLaunch overlay proves the governor override is explicit (only `y`).
 * All TTY-free — the actual newSession/governor I/O lives in the loop.
 *
 *   bun test ./tui/test/launch.test.ts
 */
import { test, expect, describe } from "bun:test";
import { makeTheme } from "../src/theme.js";
import { parseKey } from "../src/kit/input.js";
import { displayWidth } from "../src/kit/draw.js";
import { lineFrom } from "../src/kit/lineedit.js";
import { buildFrame, reduce, initialState, buildTargetLaunchArgs, type AppState, type LaunchIntent } from "../src/app.js";

const t = makeTheme({ trueColor: true, ascii: false });
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const size = { cols: 100, rows: 30 };

function launchState(selected = 0): AppState {
  return {
    tab: "launch",
    confirmQuit: false,
    cwd: "~/eBrain",
    launch: { selected, task: "", profile: null, status: "idle" },
  };
}

describe("buildLaunchView — the agent grid (F6.4.5)", () => {
  test("lists the launchable agents + the lanzar hint", () => {
    const frame = buildFrame(launchState(), size, t).map(strip).join("\n");
    expect(frame).toContain("launch · task router");
    expect(frame).toContain("claude");
    expect(frame).toContain("gemini");
    expect(frame).toContain("generic");
    expect(frame).toContain("enter → new session");
  });

  test("shows heavy vs light class per agent", () => {
    const frame = buildFrame(launchState(), size, t).map(strip).join("\n");
    expect(frame).toContain("heavy");
    expect(frame).toContain("light");
  });

  test("footer reflects the selected agent", () => {
    expect(buildFrame(launchState(0), size, t).map(strip).join("\n")).toContain("new session claude");
    expect(buildFrame(launchState(2), size, t).map(strip).join("\n")).toContain("new session gemini");
  });

  test("hint bar shows agent + launch", () => {
    const frame = buildFrame(launchState(), size, t).map(strip).join("\n");
    expect(frame).toContain("agent");
    expect(frame).toContain("run/launch");
  });

  test("every row is exactly cols wide", () => {
    for (const row of buildFrame(launchState(), size, t)) expect(displayWidth(row)).toBe(size.cols);
  });
});

describe("reduce — launch nav + enter → governor (pure, no tmux)", () => {
  test("l opens the launch tab", () => {
    expect(reduce(initialState(), parseKey("l")).state.tab).toBe("launch");
  });

  test("arrows move the selection, clamped to the grid", () => {
    expect(reduce(launchState(0), { name: "right" }).state.launch?.selected).toBe(1);
    expect(reduce(launchState(0), { name: "down" }).state.launch?.selected).toBe(2); // +LAUNCH_COLS
    expect(reduce(launchState(0), { name: "left" }).state.launch?.selected).toBe(0); // clamp low
    expect(reduce(launchState(5), { name: "right" }).state.launch?.selected).toBe(5); // clamp high
  });

  test("grid navigation preserves the complete launch slice so refresh never crashes", () => {
    const state = reduce(launchState(0), { name: "right" }).state;
    expect(state.launch?.task).toBe("");
    expect(state.launch?.profile).toBeNull();
    expect(reduce(state, parseKey("r")).effect).toBeUndefined();
  });

  test("enter emits a launch effect for the selected agent", () => {
    expect(reduce(launchState(1), { name: "enter" }).effect).toEqual({ type: "launch", agent: "codex", prompt: "" });
  });

  test("t opens task composer and enter requests a Task Profile", () => {
    const opened = reduce(launchState(), parseKey("t")).state;
    expect(opened.overlay?.kind).toBe("launchTask");
    const typed: AppState = { ...opened, overlay: { kind: "launchTask", line: lineFrom("Summarize batch transcripts") } };
    const submitted = reduce(typed, { name: "enter" });
    expect(submitted.effect).toEqual({ type: "profileLaunchTask", task: "Summarize batch transcripts" });
  });

  test("a Task Profile never changes the manually selected agent", () => {
    const st: AppState = {
      ...launchState(),
      launch: {
        selected: 0,
        task: "Summarize batch transcripts",
        status: "ready",
        profile: {
          task: "Summarize batch transcripts",
          selectedCapability: "long_context",
          signals: [{ capability: "long_context", matched: ["summarize", "batch"] }],
          compatibleTargets: ["manual-session", "openrouter-one-shot"],
          disclaimer: "Signals only.",
        },
      },
    };
    const r = reduce(st, { name: "enter" });
    expect(r.effect).toEqual({ type: "launch", agent: "claude", prompt: "Summarize batch transcripts" });
    expect(r.state.overlay).toBeUndefined();
  });

  test("wizard selects explicit target/profile, previews a plan, and confirms before launch", () => {
    const st: AppState = {
      ...launchState(),
      launch: {
        ...launchState().launch!,
        wizard: {
          targets: [{ id: "opencode-openrouter", agent: "opencode", provider: "openrouter", ramClass: "heavy" }],
          profiles: { initialized: true, profiles: [{ id: "my-stack", label: "My stack", provider: "openrouter", capabilities: ["coding"], models: 1, evidence: { source: "user", asOf: "d" } }] },
          targetSelected: 0, profileSelected: 0, capability: "coding", cwd: "/tmp/project", focus: "target", plan: null,
        },
      },
    };
    expect(reduce(st, { name: "enter" }).effect).toEqual({ type: "planLaunchWizard" });
    const planned: AppState = { ...st, launch: { ...st.launch!, wizard: { ...st.launch!.wizard!, plan: { target: "opencode-openrouter", agent: "opencode", profile: "my-stack", capability: "coding", model: "deepseek/x", fallbackModels: [], cwd: "/tmp/project", ramClass: "heavy", costStatus: "untracked" } } } };
    const review = reduce(planned, { name: "enter" });
    expect(review.state.overlay?.kind).toBe("confirmTargetLaunch");
    expect(reduce(review.state, parseKey("y")).effect).toEqual({ type: "requestTargetLaunch", plan: planned.launch!.wizard!.plan, intent: { prompt: "" } });
  });

  test("wizard Tab reaches profile selection instead of being intercepted by the page focus ring", () => {
    const st: AppState = {
      ...launchState(),
      launch: {
        ...launchState().launch!,
        wizard: {
          targets: [{ id: "opencode-openrouter", agent: "opencode", provider: "openrouter", ramClass: "heavy" }],
          profiles: { initialized: true, profiles: [{ id: "my-stack", label: "My stack", provider: "openrouter", capabilities: ["coding"], models: 1, evidence: { source: "user", asOf: "d" } }] },
          targetSelected: 0, profileSelected: 0, capability: "coding", cwd: "/tmp/project", focus: "target", plan: null,
        },
      },
    };
    expect(reduce(st, { name: "tab" }).state.launch?.wizard?.focus).toBe("profile");
  });

  test("first-use profile initialization is explicit: only y invokes the migration effect", () => {
    const st: AppState = { ...launchState(), overlay: { kind: "confirmProfilesInit" } };
    expect(reduce(st, parseKey("y")).effect).toEqual({ type: "initializeProfiles" });
    expect(reduce(st, parseKey("n")).effect).toBeUndefined();
  });

  test("governor override dialog: ONLY y proceeds (launchConfirmed); n/esc/enter do not", () => {
    const st: AppState = {
      ...launchState(0),
      overlay: { kind: "confirmLaunch", agent: "codex", cwd: "/home/x/proj", reason: "2 heavy" },
    };
    const yes = reduce(st, parseKey("y"));
    expect(yes.effect).toEqual({ type: "launchConfirmed", agent: "codex", cwd: "/home/x/proj", reason: "2 heavy", prompt: "" });
    expect(yes.state.overlay).toBeNull();

    expect(reduce(st, parseKey("n")).state.overlay).toBeNull();
    expect(reduce(st, parseKey("n")).effect).toBeUndefined();
    expect(reduce(st, { name: "escape" }).state.overlay).toBeNull();
    expect(reduce(st, { name: "enter" }).effect).toBeUndefined(); // enter is NOT confirm
  });

  test("confirmLaunch dialog renders the governor reason + agent", () => {
    const st: AppState = {
      ...launchState(0),
      overlay: { kind: "confirmLaunch", agent: "codex", cwd: "/home/x/proj", reason: "1 heavy already live · 800 MB free" },
    };
    const frame = buildFrame(st, size, t).map(strip).join("\n");
    expect(frame).toContain("RAM governor");
    expect(frame).toContain("800 MB");
    expect(frame).toContain("launch codex anyway");
  });
});

describe("G56-F2 — the reviewed task is captured, threaded, previewed and wired to launch", () => {
  const PLAN = { target: "opencode-openrouter", agent: "opencode", profile: "my-stack", capability: "coding", model: "deepseek/x", fallbackModels: [] as string[], cwd: "/tmp/project", ramClass: "heavy", costStatus: "untracked" };

  function wizardWith(task: string, workflowId?: string): AppState {
    const base = launchState();
    return {
      ...base,
      launch: {
        ...base.launch!,
        task,
        workflowId,
        wizard: {
          targets: [{ id: PLAN.target, agent: PLAN.agent, provider: "openrouter", ramClass: "heavy" }],
          profiles: { initialized: true, profiles: [{ id: "my-stack", label: "My stack", provider: "openrouter", capabilities: ["coding"], models: 1, evidence: { source: "user", asOf: "d" } }] },
          targetSelected: 0, profileSelected: 0, capability: "coding", cwd: "/tmp/project", focus: "target", plan: { ...PLAN },
        },
      },
    };
  }

  test("Enter on a ready plan snapshots the reviewed task + workflow into the confirm overlay", () => {
    const st = wizardWith("implement the parser", "second-brain-dev-sop");
    const review = reduce(st, { name: "enter" });
    expect(review.state.overlay?.kind).toBe("confirmTargetLaunch");
    const ov = review.state.overlay as { kind: "confirmTargetLaunch"; intent: LaunchIntent };
    expect(ov.intent).toEqual({ prompt: "implement the parser", workflowId: "second-brain-dev-sop" });
  });

  test("confirming carries the SAME intent into the launch effect (never dropped)", () => {
    const st = wizardWith("do the thing", "wf-1");
    const review = reduce(st, { name: "enter" });
    const confirmed = reduce(review.state, parseKey("y"));
    expect(confirmed.effect).toEqual({ type: "requestTargetLaunch", plan: st.launch!.wizard!.plan, intent: { prompt: "do the thing", workflowId: "wf-1" } });
  });

  test("the preview shows the exact task + workflow attribution (ADR-005 reviewability)", () => {
    const st = wizardWith("summarize the transcripts", "company-brain-sop");
    const review = reduce(st, { name: "enter" });
    const frame = buildFrame(review.state, size, t).map(strip).join("\n");
    expect(frame).toContain("launch target");
    expect(frame).toContain("summarize the transcripts");
    expect(frame).toContain("workflow: company-brain-sop");
  });

  test("the manual grid launch also snapshots the reviewed task (no post-await re-read)", () => {
    const base = launchState(1);
    const st: AppState = { ...base, launch: { ...base.launch!, task: "manual task body" } };
    expect(reduce(st, { name: "enter" }).effect).toEqual({ type: "launch", agent: "codex", prompt: "manual task body" });
  });

  test("buildTargetLaunchArgs wires the task over stdin + the workflow flag, and omits both when absent", () => {
    const withBoth = buildTargetLaunchArgs(PLAN, { prompt: "deliver me", workflowId: "wf-9" }, "slug1");
    expect(withBoth.stdin).toBe("deliver me");
    expect(withBoth.args).toContain("--prompt-stdin");
    expect(withBoth.args.join(" ")).toContain("--workflow wf-9");

    const withNone = buildTargetLaunchArgs(PLAN, { prompt: "" }, "slug2");
    expect(withNone.stdin).toBeNull();
    expect(withNone.args).not.toContain("--prompt-stdin");
    expect(withNone.args).not.toContain("--workflow");
  });
});
