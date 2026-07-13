/**
 * Ported from FlowClock (~/flowclock-cli/test/tui.test.ts — parseKey section,
 * and ~/flowclock-cli/test/input-paste.test.ts in full) — input.ts coverage.
 * Adapted from vitest to bun:test and repointed to ebrain's vendored kit at
 * ../../src/kit/input.js.
 */
import { describe, it, expect } from "bun:test";
import { EventEmitter } from "node:events";
import {
  parseKey,
  tokenize,
  startNavReader,
  PASTE_START,
  PASTE_END,
  type Key,
} from "../../src/kit/input.js";

// ---------------------------------------------------------------------------
// input.ts — parseKey
// ---------------------------------------------------------------------------

describe("parseKey", () => {
  it("parses up arrow (CSI)", () => {
    expect(parseKey("\x1b[A")).toEqual({ name: "up" });
  });

  it("parses down arrow (CSI)", () => {
    expect(parseKey("\x1b[B")).toEqual({ name: "down" });
  });

  it("parses right arrow (CSI)", () => {
    expect(parseKey("\x1b[C")).toEqual({ name: "right" });
  });

  it("parses left arrow (CSI)", () => {
    expect(parseKey("\x1b[D")).toEqual({ name: "left" });
  });

  it("parses up arrow (SS3 / application mode)", () => {
    expect(parseKey("\x1bOA")).toEqual({ name: "up" });
  });

  it("parses down arrow (SS3)", () => {
    expect(parseKey("\x1bOB")).toEqual({ name: "down" });
  });

  it("parses right arrow (SS3)", () => {
    expect(parseKey("\x1bOC")).toEqual({ name: "right" });
  });

  it("parses left arrow (SS3)", () => {
    expect(parseKey("\x1bOD")).toEqual({ name: "left" });
  });

  it("parses Enter (\\r)", () => {
    expect(parseKey("\r")).toEqual({ name: "enter" });
  });

  it("parses Enter (\\n)", () => {
    expect(parseKey("\n")).toEqual({ name: "enter" });
  });

  it("parses Tab", () => {
    expect(parseKey("\t")).toEqual({ name: "tab" });
  });

  it("parses Escape", () => {
    expect(parseKey("\x1b")).toEqual({ name: "escape" });
  });

  it("parses Backspace (DEL)", () => {
    expect(parseKey("\x7f")).toEqual({ name: "backspace" });
  });

  it("parses Home (CSI H)", () => {
    expect(parseKey("\x1b[H")).toEqual({ name: "home" });
  });

  it("parses End (CSI F)", () => {
    expect(parseKey("\x1b[F")).toEqual({ name: "end" });
  });

  it("parses Home (CSI 1~)", () => {
    expect(parseKey("\x1b[1~")).toEqual({ name: "home" });
  });

  it("parses End (CSI 4~)", () => {
    expect(parseKey("\x1b[4~")).toEqual({ name: "end" });
  });

  it("parses Home (CSI 7~)", () => {
    expect(parseKey("\x1b[7~")).toEqual({ name: "home" });
  });

  it("parses End (CSI 8~)", () => {
    expect(parseKey("\x1b[8~")).toEqual({ name: "end" });
  });

  it("parses Delete / Supr (CSI 3~)", () => {
    expect(parseKey("\x1b[3~")).toEqual({ name: "delete" });
  });

  it("parses Ctrl-C as char with empty string char", () => {
    expect(parseKey("\x03")).toEqual({ name: "char", char: "\x03" });
  });

  it("parses printable ASCII char", () => {
    expect(parseKey("q")).toEqual({ name: "char", char: "q" });
  });

  it("parses space as char", () => {
    expect(parseKey(" ")).toEqual({ name: "char", char: " " });
  });

  it("parses digit as char", () => {
    expect(parseKey("1")).toEqual({ name: "char", char: "1" });
  });

  it("parses uppercase letter as char", () => {
    expect(parseKey("G")).toEqual({ name: "char", char: "G" });
  });

  it("parses slash as char", () => {
    expect(parseKey("/")).toEqual({ name: "char", char: "/" });
  });
});

// ---------------------------------------------------------------------------
// input.ts — tokenize
// ---------------------------------------------------------------------------

describe("tokenize — multi-char chunks no longer drop characters", () => {
  it("splits a batched plain-text chunk into one char Key each", () => {
    expect(tokenize("abc")).toEqual([
      { name: "char", char: "a" },
      { name: "char", char: "b" },
      { name: "char", char: "c" },
    ]);
  });

  it("recognizes escape sequences embedded in a burst (arrow auto-repeat)", () => {
    expect(tokenize("\x1b[A\x1b[A")).toEqual([{ name: "up" }, { name: "up" }]);
  });

  it("mixes text and control bytes correctly", () => {
    expect(tokenize("a\x7fb")).toEqual([
      { name: "char", char: "a" },
      { name: "backspace" },
      { name: "char", char: "b" },
    ]);
  });

  it("keeps multibyte code points whole", () => {
    expect(tokenize("a😀")).toEqual([
      { name: "char", char: "a" },
      { name: "char", char: "😀" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// input.ts — startNavReader (bracketed paste assembly)
// ---------------------------------------------------------------------------

/** Minimal fake of a raw-mode TTY ReadStream for the reader. */
class FakeIn extends EventEmitter {
  isTTY = true;
  isRaw = false;
  setRawMode(v: boolean) {
    this.isRaw = v;
    return this;
  }
  resume() {
    return this;
  }
  pause() {
    return this;
  }
  setEncoding() {
    return this;
  }
  send(data: string) {
    this.emit("data", data);
  }
}

class FakeOut {
  isTTY = true;
  written: string[] = [];
  write(s: string) {
    this.written.push(s);
    return true;
  }
}

describe("startNavReader — bracketed paste assembly", () => {
  it("emits a single paste Key for wrapped text, sanitized of newlines", () => {
    const input = new FakeIn();
    const keys: Key[] = [];
    const stop = startNavReader(input as never, (k) => keys.push(k));
    input.send(`${PASTE_START}line one\nline two${PASTE_END}`);
    stop();
    expect(keys).toEqual([{ name: "paste", text: "line one\nline two" }]);
  });

  it("assembles a paste that spans multiple data events", () => {
    const input = new FakeIn();
    const keys: Key[] = [];
    startNavReader(input as never, (k) => keys.push(k));
    input.send(`${PASTE_START}hel`);
    input.send("lo wor");
    input.send(`ld${PASTE_END}`);
    expect(keys).toEqual([{ name: "paste", text: "hello world" }]);
  });

  it("handles text before and after the paste in the same chunk", () => {
    const input = new FakeIn();
    const keys: Key[] = [];
    startNavReader(input as never, (k) => keys.push(k));
    input.send(`x${PASTE_START}yo${PASTE_END}z`);
    expect(keys).toEqual([
      { name: "char", char: "x" },
      { name: "paste", text: "yo" },
      { name: "char", char: "z" },
    ]);
  });

  it("toggles bracketed-paste mode on the output TTY and restores on stop", () => {
    const input = new FakeIn();
    const out = new FakeOut();
    const stop = startNavReader(input as never, () => {}, out as never);
    expect(out.written).toContain("\x1b[?2004h");
    stop();
    expect(out.written).toContain("\x1b[?2004l");
  });
});
