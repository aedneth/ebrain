import { describe, expect, test } from "bun:test";
import { makeTheme } from "../../../src/theme.ts";
import { displayWidth } from "../../../src/kit/draw.ts";
import { responsiveDialog, wrapDialogText } from "../../../src/widgets/dialog/responsive.ts";

const theme = makeTheme({ trueColor: true, ascii: false });
const strip = (value: string): string => value.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

describe("ResponsiveDialog", () => {
  test("wraps prose and long unbroken identifiers without dropping visible text", () => {
    const text = "Choose a workspace before launching agent-with-a-very-long-unbroken-identifier-for-a-small-terminal.";
    const rows = wrapDialogText(text, 18);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(displayWidth(row)).toBeLessThanOrEqual(18);
    expect(rows.join(" ").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
  });

  test("caps a long modal to its viewport and exposes an honest scroll position", () => {
    const dialog = responsiveDialog({
      title: "long confirmation",
      width: 76,
      maxHeight: 6,
      blocks: [
        { kind: "paragraph", text: "This explanatory confirmation intentionally contains enough words to require a terminal-sized viewport rather than silently truncating the message." },
        { kind: "spacer" },
        { kind: "keyValue", key: "directory", value: "/tmp/workspaces/a-very-long-project-path-that-must-remain-readable-to-the-user" },
        { kind: "spacer" },
        { kind: "actions", items: [{ key: "y", label: "confirm" }, { key: "n", label: "cancel" }] },
      ],
    }, theme);
    expect(dialog.rows.length).toBeLessThanOrEqual(6);
    expect(dialog.maxScroll).toBeGreaterThan(0);
    expect(strip(dialog.rows.join("\n"))).toContain("[↑↓] scroll");
    for (const row of dialog.rows) expect(displayWidth(row)).toBe(76);
  });

  test("scroll offset clamps and reveals later semantic content", () => {
    const props = {
      title: "details",
      width: 48,
      maxHeight: 4,
      blocks: [{ kind: "paragraph" as const, text: "first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth" }],
    };
    const first = responsiveDialog(props, theme);
    const last = responsiveDialog({ ...props, scroll: 999 }, theme);
    expect(last.scroll).toBe(last.maxScroll);
    expect(strip(first.rows.join("\n"))).not.toBe(strip(last.rows.join("\n")));
    for (const row of last.rows) expect(displayWidth(row)).toBe(48);
  });

  test("wraps an overlong action label instead of truncating its command", () => {
    const label = "initialize a local execution profile without any provider call or credential storage";
    const dialog = responsiveDialog({
      title: "profile setup",
      width: 36,
      blocks: [{ kind: "actions", items: [{ key: "y", label }, { key: "n", label: "cancel" }] }],
    }, theme);
    const visible = strip(dialog.rows.join("\n"));
    expect(visible.replace(/[│┌┐└┘─]/g, "").replace(/\s+/g, " ")).toContain(label);
    for (const row of dialog.rows) expect(displayWidth(row)).toBe(36);
  });

  test("renders a complete editable value through the dialog viewport", () => {
    const value = "A task prompt that remains visible even when it is much longer than one compact terminal row.";
    const dialog = responsiveDialog({
      title: "task prompt",
      width: 42,
      maxHeight: 4,
      blocks: [{ kind: "input", value, cursor: 12, placeholder: "optional task" }],
    }, theme);
    const plain = strip(dialog.rows.join("\n"));
    expect(plain).toContain("▏");
    expect(dialog.maxScroll).toBeGreaterThan(0);
    for (const row of dialog.rows) expect(displayWidth(row)).toBe(42);
  });
});
