/**
 * tui/test/launch.test.ts — the Launch view + RAM-governor gate (SPRINT-TUI 6.4.5/6.4.6).
 * Launch renders task, guided-launch, and manual-agent decisions separately. reduce()
 * drives explicit focus + the safe launch effect; the confirmLaunch overlay proves
 * the governor override is explicit (only `y`).
 * All TTY-free — the actual newSession/governor I/O lives in the loop.
 *
 *   bun test ./tui/test/launch.test.ts
 */
import { test, expect, describe } from "bun:test";
import { makeTheme } from "../src/theme.js";
import { parseKey } from "../src/kit/input.js";
import { displayWidth } from "../src/kit/draw.js";
import { lineFrom } from "../src/kit/lineedit.js";
import { buildFrame, reduce, initialState, buildTargetLaunchArgs, hintsForState, type AppState, type LaunchIntent } from "../src/app.js";

const t = makeTheme({ trueColor: true, ascii: false });
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const size = { cols: 100, rows: 30 };

function launchState(selected = 0, focusRegion = 0): AppState {
  return {
    tab: "launch",
    confirmQuit: false,
    cwd: "~/eBrain",
    launch: { selected, task: "", profile: null, status: "idle" },
    focusRegion,
  };
}

describe("buildLaunchView — the guided information architecture", () => {
  test("separates task, guided launch, and manual agents", () => {
    const frame = buildFrame(launchState(), size, t).map(strip).join("\n");
    expect(frame).toContain("1 · task & signals");
    expect(frame).toContain("2 · guided launch");
    expect(frame).toContain("3 · manual agents");
    expect(frame).toContain("claude");
    expect(frame).toContain("gemini");
    expect(frame).toContain("generic");
    expect(frame).toContain("Start a direct local session");
  });

  test("shows heavy vs light class per agent", () => {
    const frame = buildFrame(launchState(), size, t).map(strip).join("\n");
    expect(frame).toContain("heavy");
    expect(frame).toContain("light");
  });

  test("manual-agent box reflects the selected agent", () => {
    expect(buildFrame(launchState(0, 2), size, t).map(strip).join("\n")).toContain("New session with claude");
    expect(buildFrame(launchState(2, 2), size, t).map(strip).join("\n")).toContain("New session with gemini");
  });

  test("focused manual-agent box shows launch controls", () => {
    const frame = buildFrame(launchState(0, 2), size, t).map(strip).join("\n");
    expect(frame).toContain("agent");
    expect(frame).toContain("launch");
    expect(frame).toContain("[enter]");
  });

  test("the compact control row never exceeds six actions", () => {
    expect(hintsForState(launchState()).length).toBeLessThanOrEqual(6);
    expect(hintsForState(launchState(0, 1)).length).toBeLessThanOrEqual(6);
    expect(hintsForState(launchState(0, 2)).length).toBeLessThanOrEqual(6);
  });

  test("confirmation hints name the only keys the safety gates accept", () => {
    const hints = hintsForState({ ...launchState(), overlay: { kind: "confirmProfilesInit" } });
    expect(hints).toEqual([{ k: "y", label: "confirm" }, { k: "n", label: "cancel" }]);
  });

  test("every row is exactly cols wide", () => {
    for (const row of buildFrame(launchState(), size, t)) expect(displayWidth(row)).toBe(size.cols);
  });

  test("80x24 keeps all manual agents visible instead of collapsing the launch path", () => {
    const frame = buildFrame(launchState(0, 2), { cols: 80, rows: 24 }, t).map(strip).join("\n");
    expect(frame).toContain("manual agents");
    expect(frame).toContain("claude");
    expect(frame).toContain("opencode");
    expect(frame).toContain("generic");
  });
});

describe("reduce — launch nav + enter → governor (pure, no tmux)", () => {
  test("l opens the launch tab", () => {
    expect(reduce(initialState(), parseKey("l")).state.tab).toBe("launch");
  });

  test("arrows move the selection only while the manual-agent box is focused", () => {
    expect(reduce(launchState(0, 2), { name: "right" }).state.launch?.selected).toBe(1);
    expect(reduce(launchState(0, 2), { name: "down" }).state.launch?.selected).toBe(2); // +LAUNCH_COLS
    expect(reduce(launchState(0, 2), { name: "left" }).state.launch?.selected).toBe(0); // clamp low
    expect(reduce(launchState(5, 2), { name: "right" }).state.launch?.selected).toBe(5); // clamp high
    expect(reduce(launchState(0, 0), { name: "right" }).state.launch?.selected).toBe(0);
  });

  test("grid navigation preserves the complete launch slice so refresh never crashes", () => {
    const state = reduce(launchState(0, 2), { name: "right" }).state;
    expect(state.launch?.task).toBe("");
    expect(state.launch?.profile).toBeNull();
    const refresh = reduce(state, parseKey("r"));
    expect(refresh.effect).toBeUndefined();
    expect(refresh.state.launch?.error).toBe("Describe a task before refreshing task signals.");
  });

  test("enter emits a launch effect only from the selected manual-agent box", () => {
    expect(reduce(launchState(1, 2), { name: "enter" }).effect).toEqual({ type: "launch", agent: "codex", prompt: "" });
    expect(reduce(launchState(1, 0), { name: "enter" }).state.overlay?.kind).toBe("launchTask");
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
      ...launchState(0, 2),
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
      ...launchState(0, 2),
      launch: {
        ...launchState().launch!,
        wizard: {
          targets: [{ id: "opencode-openrouter", agent: "opencode", provider: "openrouter", ramClass: "heavy" }],
          profiles: { initialized: true, profiles: [{ id: "my-stack", label: "My stack", provider: "openrouter", capabilities: ["coding"], models: 1, evidence: { source: "user", asOf: "d" } }] },
          targetSelected: 0, profileSelected: 0, capability: "coding", cwd: "/tmp/project", focus: "target", plan: null,
        },
      },
    };
    const modal: AppState = { ...st, overlay: { kind: "launchWizard" } };
    expect(reduce(modal, { name: "enter" }).effect).toEqual({ type: "planLaunchWizard" });
    const planned: AppState = { ...st, launch: { ...st.launch!, wizard: { ...st.launch!.wizard!, plan: { target: "opencode-openrouter", agent: "opencode", profile: "my-stack", capability: "coding", model: "deepseek/x", fallbackModels: [], cwd: "/tmp/project", ramClass: "heavy", costStatus: "untracked" } } } };
    const review = reduce({ ...planned, overlay: { kind: "launchWizard" } }, { name: "enter" });
    expect(review.state.overlay?.kind).toBe("confirmTargetLaunch");
    expect(reduce(review.state, parseKey("y")).effect).toEqual({ type: "requestTargetLaunch", plan: planned.launch!.wizard!.plan, intent: { prompt: "" } });
  });

  test("wizard Tab reaches profile selection inside its modal instead of the page focus ring", () => {
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
    const modal: AppState = { ...st, overlay: { kind: "launchWizard" } };
    expect(reduce(modal, { name: "tab" }).state.launch?.wizard?.focus).toBe("profile");
  });

  test("wizard exposes all fields and returns to it after editing the directory", () => {
    const st: AppState = {
      ...launchState(),
      overlay: { kind: "launchWizard" },
      launch: {
        ...launchState().launch!,
        wizard: {
          targets: [{ id: "opencode-openrouter", agent: "opencode", provider: "openrouter", ramClass: "heavy" }],
          profiles: { initialized: true, profiles: [{ id: "my-stack", label: "My stack", provider: "openrouter", capabilities: ["coding", "review"], models: 1, evidence: { source: "user", asOf: "d" } }] },
          targetSelected: 0, profileSelected: 0, capability: "coding", cwd: "/tmp/project", focus: "target", plan: null,
        },
      },
    };
    const capability = reduce(reduce(st, { name: "tab" }).state, { name: "tab" }).state;
    expect(capability.launch?.wizard?.focus).toBe("capability");
    expect(reduce(capability, { name: "right" }).state.launch?.wizard?.capability).toBe("review");
    const cwd = reduce(reduce(capability, { name: "tab" }).state, { name: "enter" }).state;
    expect(cwd.overlay?.kind).toBe("wizardCwd");
    const saved = reduce({ ...cwd, overlay: { kind: "wizardCwd", line: lineFrom("/tmp/next"), returnToWizard: true } }, { name: "enter" });
    expect(saved.state.overlay?.kind).toBe("launchWizard");
    expect(saved.state.launch?.wizard?.cwd).toBe("/tmp/next");
  });

  test("wizard is a visible dialog with choices and never launches on open", () => {
    const st: AppState = {
      ...launchState(),
      overlay: { kind: "launchWizard" },
      launch: {
        ...launchState().launch!,
        wizard: {
          targets: [{ id: "opencode-openrouter", agent: "opencode", provider: "openrouter", ramClass: "heavy" }],
          profiles: { initialized: true, profiles: [{ id: "my-stack", label: "My stack", provider: "openrouter", capabilities: ["coding"], models: 1, evidence: { source: "user", asOf: "d" } }] },
          targetSelected: 0, profileSelected: 0, capability: "coding", cwd: "/tmp/project", focus: "target", plan: null,
        },
      },
    };
    const frame = buildFrame(st, size, t).map(strip).join("\n");
    expect(frame).toContain("guided launch");
    expect(frame).toContain("opencode-openrouter");
    expect(frame).toContain("My stack");
    expect(reduce(st, { name: "enter" }).effect).toEqual({ type: "planLaunchWizard" });
  });

  test("first-use profile initialization is explicit: only y invokes the migration effect", () => {
    const st: AppState = { ...launchState(), overlay: { kind: "confirmProfilesInit" } };
    expect(reduce(st, parseKey("y")).effect).toEqual({ type: "initializeProfiles" });
    expect(reduce(st, parseKey("n")).effect).toBeUndefined();
  });

  test("governor override dialog: ONLY y proceeds (launchConfirmed); n/esc/enter do not", () => {
    const st: AppState = {
      ...launchState(0, 2),
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
    const base = launchState(0, 1);
    return {
      ...base,
      overlay: { kind: "launchWizard" },
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
    const base = launchState(1, 2);
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
