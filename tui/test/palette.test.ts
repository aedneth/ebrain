import { describe, it, expect } from "bun:test";
import { makeTheme } from "../src/theme.js";
import { parseKey } from "../src/kit/input.js";
import { displayWidth } from "../src/kit/draw.js";
import {
  emptyPaletteState,
  fuzzyMatch,
  filterCommands,
  paletteCommands,
  toItems,
  paletteApplyKey,
} from "../src/palette.js";
import { commandPalette } from "../src/widgets/input/commandpalette.js";
import { buildFrame, initialState, reduce } from "../src/app.js";

const t = makeTheme({ trueColor: true, ascii: false });
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

describe("palette logic", () => {
  it("empty state is closed", () => {
    expect(emptyPaletteState()).toEqual({ open: false, query: "", selected: 0 });
  });

  it("fuzzyMatch is a case-insensitive subsequence test", () => {
    expect(fuzzyMatch("ss", "sessions")).toBe(true);
    expect(fuzzyMatch("dr", "doctor")).toBe(true);
    expect(fuzzyMatch("", "anything")).toBe(true);
    expect(fuzzyMatch("zx", "sessions")).toBe(false);
    expect(fuzzyMatch("HOME", "home")).toBe(true);
  });

  it("filterCommands: empty query returns all palette commands, in order", () => {
    const all = filterCommands("");
    expect(all).toEqual(paletteCommands());
    expect(all.map((c) => c.id)).toContain("nav.sessions");
  });

  it("palette excludes the hint-only + opener + cycle commands", () => {
    const ids = paletteCommands().map((c) => c.id);
    expect(ids).not.toContain("nav.tabs");
    expect(ids).not.toContain("palette.open");
    expect(ids).not.toContain("nav.cycleNext");
  });

  it("filterCommands('ss') fuzzy-narrows to sessions", () => {
    const f = filterCommands("ss");
    expect(f.map((c) => c.id)).toEqual(["nav.sessions"]);
  });

  it("applyKey: char appends to query and resets selection", () => {
    const r = paletteApplyKey({ open: true, query: "", selected: 3 }, parseKey("s"));
    expect(r.state.query).toBe("s");
    expect(r.state.selected).toBe(0);
  });

  it("applyKey: backspace drops a char", () => {
    const r = paletteApplyKey({ open: true, query: "se", selected: 0 }, parseKey("\x7f"));
    expect(r.state.query).toBe("s");
  });

  it("applyKey: down/up move selection, clamped", () => {
    const down = paletteApplyKey({ open: true, query: "", selected: 0 }, parseKey("\x1b[B"));
    expect(down.state.selected).toBe(1);
    const up = paletteApplyKey({ open: true, query: "", selected: 0 }, parseKey("\x1b[A"));
    expect(up.state.selected).toBe(0);
  });

  it("applyKey: enter runs the selected command and closes", () => {
    const r = paletteApplyKey({ open: true, query: "ss", selected: 0 }, parseKey("\r"));
    expect(r.action).toEqual({ type: "run", command: filterCommands("ss")[0]! });
    expect(r.state.open).toBe(false);
  });

  it("applyKey: escape closes", () => {
    const r = paletteApplyKey({ open: true, query: "x", selected: 0 }, parseKey("\x1b"));
    expect(r.action).toEqual({ type: "close" });
    expect(r.state).toEqual(emptyPaletteState());
  });
});

describe("commandPalette widget (DS CommandPalette.jsx)", () => {
  it("renders a teal-bordered box with the › prompt and footer, exact width", () => {
    const rows = commandPalette({ query: "", items: toItems(filterCommands("")), selected: 0, width: 48 }, t);
    for (const r of rows) expect(displayWidth(r)).toBe(48);
    const plain = rows.map(strip);
    expect(plain[0]).toContain("╭"); // rounded panel corners
    expect(plain[1]).toContain("›"); // prompt glyph
    expect(plain.some((r) => r.includes("navegar"))).toBe(true); // footer hint
    // teal border escape present (the accent moment)
    expect(rows[0]).toContain(t.fg("accent.teal"));
  });

  it("selected row carries the raised background; matched chars get the accent", () => {
    const items = toItems(filterCommands("ss"));
    const rows = commandPalette({ query: "ss", items, selected: 0, width: 48 }, t);
    // the item row (index 2: border0, prompt is body via panel... find the row with 'sessions')
    const itemRow = rows.find((r) => strip(r).includes("sessions"))!;
    expect(itemRow).toContain(t.bg("background.raised")); // selected highlight
    expect(itemRow).toContain(t.fg("accent.teal")); // fuzzy-matched chars
  });
});

describe("palette app integration (reduce + buildFrame)", () => {
  const size = { cols: 120, rows: 32 };

  it("'/' opens the palette overlay; buildFrame composites it", () => {
    const r = reduce(initialState(), parseKey("/"));
    expect(r.state.overlay?.kind).toBe("palette");
    const frame = buildFrame(r.state, size, t).map(strip).join("\n");
    expect(frame).toContain("›");
    expect(frame).toContain("navegar");
  });

  it("ctrl+p also opens the palette", () => {
    const r = reduce(initialState(), parseKey("\x10"));
    expect(r.state.overlay?.kind).toBe("palette");
  });

  it("typing filters, enter switches tab, overlay closes", () => {
    let s = reduce(initialState(), parseKey("/")).state;
    s = reduce(s, parseKey("s")).state;
    s = reduce(s, parseKey("s")).state;
    const after = reduce(s, parseKey("\r"));
    expect(after.state.overlay).toBeNull();
    expect(after.state.tab).toBe("sessions");
  });

  it("esc closes the palette without changing the tab", () => {
    let s = reduce(initialState(), parseKey("/")).state;
    const after = reduce(s, parseKey("\x1b"));
    expect(after.state.overlay).toBeNull();
    expect(after.state.tab).toBe("home");
  });
});
