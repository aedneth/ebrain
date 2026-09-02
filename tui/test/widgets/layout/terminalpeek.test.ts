/**
 * Snapshot test for layout/terminalpeek.ts (SPRINT-TUI 6.3.2).
 * Props match TerminalPeek.d.ts (title, live, height, width, body). Border is
 * ALWAYS dim (background.border) — NEVER the teal focus border. `live` appends a
 * dim separator + "live" to the title. Rounded corners (renders via Panel, no dialog).
 */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { displayWidth } from "../../../src/kit/draw.js";
import { terminalPeek } from "../../../src/widgets/layout/terminalpeek.ts";

describe("terminalPeek", () => {
  const theme = makeTheme({ trueColor: true, ascii: false });

  it("renders a dim rounded frame with foreign output, exact geometry", () => {
    const rows = terminalPeek(
      { title: "peek ebr-claude", live: true, width: 28, height: 4, body: ["$ claude --resume"] },
      theme,
    );
    expect(rows.length).toBe(4);
    for (const r of rows) expect(displayWidth(r)).toBe(28);

    // rounded corners (not a dialog)
    expect(rows[0]).toContain("╭");
    expect(rows[3]).toContain("╰");
    // live indicator in the title
    expect(rows[0]).toContain("live");

    // border is ALWAYS dim: the teal focus escape must appear NOWHERE.
    const teal = theme.focusBorder;
    for (const r of rows) expect(r.includes(teal)).toBe(false);
    // border uses the dim background.border color
    expect(rows[0]).toContain(theme.fg("background.border"));
  });

  it("without live, the title has no live indicator and stays dim", () => {
    const rows = terminalPeek({ title: "peek", width: 20, height: 3, body: [] }, theme);
    expect(rows.length).toBe(3);
    for (const r of rows) expect(displayWidth(r)).toBe(20);
    expect(rows[0]).not.toContain("live");
    expect(rows[0].includes(theme.focusBorder)).toBe(false);
  });
});
