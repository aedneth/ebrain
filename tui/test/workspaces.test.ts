import { describe, expect, test } from "bun:test";
import { buildFrame, initialState, reduce, workspaceActivity, type AppState, type SessionListItem, type WorkspaceSlice } from "../src/app.ts";
import { displayWidth } from "../src/kit/draw.ts";
import { makeTheme } from "../src/theme.ts";

const theme = makeTheme({ trueColor: true, ascii: false });
const strip = (value: string) => value.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

const current = { label: "Current directory", cwd: "/tmp/current", persistent: false, validated: true };
const workspace: WorkspaceSlice = {
  data: {
    schemaVersion: 1,
    workspaces: [
      { id: "alpha", label: "Alpha", cwd: "/tmp/alpha" },
      { id: "beta", label: "Beta", cwd: "/tmp/beta" },
    ],
  },
  current,
  active: current,
  selected: 0,
  activitySelected: 0,
  status: "ready",
};
const sessions: SessionListItem[] = [
  { name: "ebr-test-alpha", agent: "claude", uptime: "00:10", attached: false, created: "2026-07-18T01:00:00.000Z", cwd: "/tmp/alpha", workspaceLabel: "Alpha" },
  { name: "ebr-test-beta", agent: "codex", uptime: "00:09", attached: false, created: "2026-07-18T02:00:00.000Z", cwd: "/tmp/beta", workspaceLabel: "Beta" },
  { name: "ebr-test-other", agent: "gemini", uptime: "00:08", attached: false, created: "2026-07-18T03:00:00.000Z", cwd: "/tmp/unregistered" },
];

function state(over: Partial<AppState> = {}): AppState {
  return {
    ...initialState(),
    tab: "workspaces",
    focusRegion: 0,
    workspace,
    sessions: { rows: sessions, selected: 0, peek: null, status: "ready" },
    ...over,
  };
}

describe("workspace cockpit", () => {
  test("derives current, registered, and unregistered live activity without inventing history", () => {
    const activity = workspaceActivity(workspace, sessions);
    expect(activity.map((entry) => [entry.label ?? "unregistered", entry.cwd, entry.sessions.length])).toEqual([
      ["Current directory", "/tmp/current", 0],
      ["Alpha", "/tmp/alpha", 1],
      ["Beta", "/tmp/beta", 1],
      ["unregistered", "/tmp/unregistered", 1],
    ]);
    expect(activity.find((entry) => entry.cwd === "/tmp/unregistered")?.selection).toBeUndefined();
    expect(activity.find((entry) => entry.cwd === "/tmp/beta")?.latestCreated).toBe("2026-07-18T02:00:00.000Z");
  });

  test("renders registry, activity, and selected detail at every supported terminal size", () => {
    for (const size of [{ cols: 80, rows: 24 }, { cols: 100, rows: 30 }, { cols: 160, rows: 48 }]) {
      const frame = buildFrame(state(), size, theme);
      const text = frame.map(strip).join("\n");
      expect(text).toContain("workspaces · 2 registered");
      expect(text).toContain("live activity · 3");
      expect(text).toContain("selected workspace");
      expect(text).toContain("Alpha");
      expect(text).toContain("Current directory");
      for (const row of frame) expect(displayWidth(row)).toBe(size.cols);
    }
    const wide = buildFrame(state(), { cols: 160, rows: 48 }, theme).map(strip).join("\n");
    expect(wide).toContain("unregistered directory");
    const selected = buildFrame(reduce(state(), { name: "down" }).state, { cols: 160, rows: 48 }, theme).map(strip).join("\n");
    expect(selected).toContain("latest active session  2026-07-18T01:00:00.000Z");
  });

  test("keeps the two primary boxes side by side at normal width and stacks only at the compact minimum", () => {
    const compact = buildFrame(state(), { cols: 80, rows: 24 }, theme).map(strip);
    const normal = buildFrame(state(), { cols: 100, rows: 30 }, theme).map(strip);
    expect(compact.some((line) => line.includes("workspaces · 2 registered") && line.includes("live activity"))).toBe(false);
    expect(normal.some((line) => line.includes("workspaces · 2 registered") && line.includes("live activity · 3"))).toBe(true);
  });

  test("registry and activity selection hand off only validated directories to the next launch", () => {
    const alpha = reduce(state(), { name: "down" }).state;
    expect(alpha.workspace?.selected).toBe(1);
    const selected = reduce(alpha, { name: "enter" }).state;
    expect(selected.workspace?.active).toMatchObject({ id: "alpha", cwd: "/tmp/alpha", persistent: true });
    expect(selected.tab).toBe("workspaces");
    expect(reduce(selected, { name: "char", char: "g" }).state.tab).toBe("launch");

    const activity = reduce(state({ focusRegion: 1 }), { name: "down" }).state;
    const detail = reduce(activity, { name: "enter" }).state;
    expect(detail.workspace?.selected).toBe(1);
    expect(detail.workspace?.active.cwd).toBe("/tmp/current");
  });

  test("add, rename, and remove remain explicit structured effects", () => {
    const add = reduce(state(), { name: "char", char: "a" });
    expect(add.state.overlay).toMatchObject({ kind: "workspaceAdd", origin: "cockpit" });

    const alpha = reduce(state(), { name: "down" }).state;
    const rename = reduce(alpha, { name: "char", char: "e" });
    expect(rename.state.overlay).toMatchObject({ kind: "workspaceRename", id: "alpha" });
    const renamed = reduce({ ...rename.state, overlay: { kind: "workspaceRename", id: "alpha", label: { text: "Alpha renamed", cursor: 13 } } }, { name: "enter" });
    expect(renamed.effect).toEqual({ type: "renameWorkspace", id: "alpha", label: "Alpha renamed" });

    const remove = reduce(alpha, { name: "char", char: "x" });
    expect(remove.state.overlay).toMatchObject({ kind: "confirmWorkspaceRemove", id: "alpha" });
    expect(reduce(remove.state, { name: "enter" }).effect).toBeUndefined();
    expect(reduce(remove.state, { name: "char", char: "y" }).effect).toEqual({ type: "removeWorkspace", id: "alpha" });
    expect(reduce(state(), { name: "char", char: "x" }).state.overlay).toBeNull();
  });

  test("rename and removal dialogs preserve readable actions at compact and wide sizes", () => {
    const alpha = reduce(state(), { name: "down" }).state;
    const renameState = { ...alpha, overlay: { kind: "workspaceRename" as const, id: "alpha", label: { text: "Alpha", cursor: 5 } } };
    const removeState = { ...alpha, overlay: { kind: "confirmWorkspaceRemove" as const, id: "alpha", label: "Alpha" } };
    for (const size of [{ cols: 80, rows: 24 }, { cols: 160, rows: 48 }]) {
      const rename = buildFrame(renameState, size, theme);
      const remove = buildFrame(removeState, size, theme);
      expect(rename.map(strip).join("\n")).toContain("rename workspace");
      expect(rename.map(strip).join("\n")).toContain("[enter] rename");
      expect(remove.map(strip).join("\n")).toContain("remove workspace");
      expect(remove.map(strip).join("\n")).toContain("[y] remove entry");
      for (const row of [...rename, ...remove]) expect(displayWidth(row)).toBe(size.cols);
    }
  });

  test("four opens the cockpit and r requests a fresh strict registry read", () => {
    expect(reduce(initialState(), { name: "char", char: "4" }).effect).toEqual({ type: "refreshWorkspaces" });
    expect(reduce(state(), { name: "char", char: "r" }).effect).toEqual({ type: "refreshWorkspaces" });
  });

  test("Sessions renders a workspace label only for an immutable cwd registered in the workspace store", () => {
    const sessionState = state({ tab: "sessions" });
    const text = buildFrame(sessionState, { cols: 120, rows: 32 }, theme).map(strip).join("\n");
    expect(text).toContain("ebr-test-alpha · Alpha");
    expect(text).toContain("ebr-test-beta · Beta");
    expect(text).not.toContain("ebr-test-other ·");
  });
});
