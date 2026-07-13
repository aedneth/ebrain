/**
 * Snapshot test for chrome/footer.ts (SPRINT-TUI 6.3.2).
 * Props (cwd, branch, right) match Footer.d.ts. All dim: cwd=muted,
 * branch=secondary, right=muted.
 */
import { describe, it, expect } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { displayWidth } from "../../../src/kit/draw.js";
import { footer } from "../../../src/widgets/chrome/footer.ts";

describe("footer", () => {
  const theme = makeTheme({ trueColor: true, ascii: false });

  it("renders cwd:branch left (branch secondary) and version right, exact width", () => {
    const row = footer(
      { cwd: "~/code/korvex", branch: "main", right: "ebrain 0.4.2" },
      theme,
      40,
    );
    const muted = theme.fg("text.muted");
    const secondary = theme.fg("text.secondary");
    // leftPlain len 18, rightPlain len 12, inner 38, gap 8
    const leftColored = muted + "~/code/korvex" + ":" + theme.reset + secondary + "main" + theme.reset;
    const rightColored = muted + "ebrain 0.4.2" + theme.reset;
    const expected = " " + leftColored + " ".repeat(8) + rightColored + " ";

    expect(row).toBe(expected);
    expect(displayWidth(row)).toBe(40);
  });

  it("omits the branch segment when branch is absent", () => {
    const row = footer({ cwd: "~/x", right: "v1" }, theme, 20);
    expect(displayWidth(row)).toBe(20);
    // No secondary-colored branch escape present.
    expect(row.includes(theme.fg("text.secondary"))).toBe(false);
  });
});
