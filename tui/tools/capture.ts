#!/usr/bin/env bun
/**
 * tui/tools/capture.ts — drive the real TUI in a headless terminal and capture what it draws.
 *
 * A terminal UI is the one part of this project that cannot be reviewed by reading its tests. The
 * suite asserts that a reducer produced the right string; it cannot tell you that two panels fight
 * for attention, that a label is unreadable at 80x24, or that the thing a first-time user should
 * press is the least visible element on screen. Those are the questions the acceptance checklist
 * asks, and answering them has meant a person sitting in front of a terminal.
 *
 * So: run the TUI under tmux at an exact geometry, send it a scripted key sequence, and capture the
 * pane WITH its escape sequences. The result is three artifacts:
 *
 *   <name>.ans        the raw capture, replayable with `cat`
 *   <name>.grid.json  the parsed cell grid — one place where ANSI is interpreted
 *   <name>.svg        a self-contained render, which is what the repository already uses for TUI
 *                     assets and what a docs page or a review can look at directly
 *
 * `tui/tools/grid-to-png.py` turns the grid into a PNG when a reviewer (or a tool that reads
 * images rather than markup) needs a raster.
 *
 * This is deliberately a capture tool, not a screenshot of a mock: it drives the same entrypoint a
 * user runs, so what it shows is what ships.
 *
 * Usage:
 *   bun tui/tools/capture.ts --out shots/home                       # default 120x34, no keys
 *   bun tui/tools/capture.ts --out shots/launch-80 --size 80x24 --keys "2"
 *   bun tui/tools/capture.ts --out shots/help --keys "3,?" --settle 900
 */

const ESC = "";

export interface Cell {
  ch: string;
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
}

interface Style {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
  reverse: boolean;
}

const BASE: Style = { fg: null, bg: null, bold: false, dim: false, reverse: false };

/** xterm's 256-colour cube, so a capture renders in the colours the terminal actually showed. */
function xterm256(n: number): string {
  if (n < 16) {
    const base = [
      "#000000", "#cd0000", "#00cd00", "#cdcd00", "#0000ee", "#cd00cd", "#00cdcd", "#e5e5e5",
      "#7f7f7f", "#ff0000", "#00ff00", "#ffff00", "#5c5cff", "#ff00ff", "#00ffff", "#ffffff",
    ];
    return base[n] ?? "#ffffff";
  }
  if (n < 232) {
    const i = n - 16;
    const steps = [0, 95, 135, 175, 215, 255];
    const r = steps[Math.floor(i / 36) % 6]!;
    const g = steps[Math.floor(i / 6) % 6]!;
    const b = steps[i % 6]!;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  const v = 8 + (n - 232) * 10;
  const h = v.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

function applySgr(style: Style, params: number[]): Style {
  const next = { ...style };
  for (let i = 0; i < params.length; i++) {
    const p = params[i]!;
    if (p === 0) {
      next.fg = null; next.bg = null; next.bold = false; next.dim = false; next.reverse = false;
    } else if (p === 1) next.bold = true;
    else if (p === 2) next.dim = true;
    else if (p === 7) next.reverse = true;
    else if (p === 22) { next.bold = false; next.dim = false; }
    else if (p === 27) next.reverse = false;
    else if (p >= 30 && p <= 37) next.fg = xterm256(p - 30);
    else if (p >= 90 && p <= 97) next.fg = xterm256(p - 90 + 8);
    else if (p >= 40 && p <= 47) next.bg = xterm256(p - 40);
    else if (p >= 100 && p <= 107) next.bg = xterm256(p - 100 + 8);
    else if (p === 39) next.fg = null;
    else if (p === 49) next.bg = null;
    else if (p === 38 || p === 48) {
      const mode = params[i + 1];
      // 5;N is indexed, 2;R;G;B is truecolour. Anything else is left alone rather than guessed at.
      if (mode === 5 && params[i + 2] !== undefined) {
        const colour = xterm256(params[i + 2]!);
        if (p === 38) next.fg = colour; else next.bg = colour;
        i += 2;
      } else if (mode === 2 && params[i + 4] !== undefined) {
        const [r, g, b] = [params[i + 2]!, params[i + 3]!, params[i + 4]!];
        const colour = `#${[r, g, b].map((v) => (v & 255).toString(16).padStart(2, "0")).join("")}`;
        if (p === 38) next.fg = colour; else next.bg = colour;
        i += 4;
      }
    }
  }
  return next;
}

/**
 * Parse a captured pane into a rectangular grid.
 *
 * Only SGR is interpreted. `capture-pane` emits a static snapshot — no cursor motion, no scroll
 * regions — so a full terminal emulator would be answering a question nobody asked here.
 */
export function parseAnsi(text: string, cols: number): Cell[][] {
  const grid: Cell[][] = [];
  // tmux emits an SGR only where attributes CHANGE and does not reset at line ends, so a style
  // carries across rows until something overrides it. Resetting per line here painted every
  // dimmed row after the first as default-coloured and made a scrim look like a no-op.
  let style = { ...BASE };
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const row: Cell[] = [];
    let i = 0;
    while (i < rawLine.length) {
      if (rawLine[i] === ESC && rawLine[i + 1] === "[") {
        const end = rawLine.indexOf("m", i);
        // A CSI we cannot terminate is not a style; treat the rest of the line as text.
        if (end === -1) { i += 2; continue; }
        const body = rawLine.slice(i + 2, end);
        if (/^[\d;]*$/.test(body)) {
          const params = body.split(";").map((p) => (p === "" ? 0 : parseInt(p, 10)));
          style = applySgr(style, params);
        }
        i = end + 1;
        continue;
      }
      const ch = rawLine[i]!;
      const fg = style.reverse ? (style.bg ?? "#0b0e14") : style.fg;
      const bg = style.reverse ? (style.fg ?? "#e6edf3") : style.bg;
      row.push({ ch, fg, bg, bold: style.bold, dim: style.dim });
      i += 1;
    }
    while (row.length < cols) row.push({ ch: " ", fg: null, bg: null, bold: false, dim: false });
    grid.push(row.slice(0, cols));
  }
  return grid;
}

const XML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
function xml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => XML_ESCAPES[c]!);
}

export interface RenderOptions {
  cellWidth?: number;
  cellHeight?: number;
  fontSize?: number;
  background?: string;
  foreground?: string;
}

/** Render the grid as a self-contained SVG: one rect per background run, one text per style run. */
export function toSvg(grid: Cell[][], opts: RenderOptions = {}): string {
  const cw = opts.cellWidth ?? 8.4;
  const ch = opts.cellHeight ?? 18;
  const fontSize = opts.fontSize ?? 14;
  const bg = opts.background ?? "#0b0e14";
  const fg = opts.foreground ?? "#e6edf3";
  const cols = grid[0]?.length ?? 0;
  const width = Math.ceil(cols * cw);
  const height = grid.length * ch;

  const rects: string[] = [];
  const texts: string[] = [];

  grid.forEach((row, y) => {
    // Background runs first, so text never sits on a seam between two rects.
    let runStart = 0;
    for (let x = 1; x <= row.length; x++) {
      const prev = row[x - 1]!.bg;
      const curr = x < row.length ? row[x]!.bg : Symbol("end");
      if (curr !== prev) {
        if (prev) {
          rects.push(
            `<rect x="${(runStart * cw).toFixed(2)}" y="${y * ch}" width="${((x - runStart) * cw).toFixed(2)}" height="${ch}" fill="${prev}"/>`,
          );
        }
        runStart = x;
      }
    }

    let x = 0;
    while (x < row.length) {
      const cell = row[x]!;
      if (cell.ch === " ") { x += 1; continue; }
      let end = x;
      while (
        end < row.length &&
        row[end]!.ch !== " " &&
        row[end]!.fg === cell.fg &&
        row[end]!.bold === cell.bold &&
        row[end]!.dim === cell.dim
      ) end += 1;
      const run = row.slice(x, end).map((c) => c.ch).join("");
      const attrs = [
        `x="${(x * cw).toFixed(2)}"`,
        `y="${(y * ch + fontSize).toFixed(2)}"`,
        `fill="${cell.fg ?? fg}"`,
        cell.bold ? 'font-weight="700"' : "",
        cell.dim ? 'opacity="0.55"' : "",
      ].filter(Boolean).join(" ");
      texts.push(`<text ${attrs}>${xml(run)}</text>`);
      x = end;
    }
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<rect width="${width}" height="${height}" fill="${bg}"/>`,
    `<g font-family="JetBrains Mono, DejaVu Sans Mono, ui-monospace, monospace" font-size="${fontSize}" xml:space="preserve">`,
    ...rects,
    ...texts,
    `</g></svg>`,
  ].join("\n");
}

// ── tmux driver ─────────────────────────────────────────────────────────────────────────────────

async function tmux(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["tmux", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, stdout, stderr };
}

export interface CaptureOptions {
  session: string;
  cols: number;
  rows: number;
  command: string;
  cwd: string;
  keys: string[];
  settleMs: number;
  keyDelayMs: number;
}

export async function capture(opts: CaptureOptions): Promise<string> {
  await tmux(["kill-session", "-t", opts.session]);
  const created = await tmux([
    "new-session", "-d", "-s", opts.session,
    "-x", String(opts.cols), "-y", String(opts.rows),
    "-c", opts.cwd, opts.command,
  ]);
  if (created.code !== 0) throw new Error(`tmux new-session failed: ${created.stderr.trim()}`);

  try {
    await Bun.sleep(opts.settleMs);
    for (const key of opts.keys) {
      // -l sends the key literally; a token like `?` must arrive as text, not as a tmux key name.
      const literal = key.length === 1 && key !== " ";
      await tmux(literal ? ["send-keys", "-t", opts.session, "-l", "--", key] : ["send-keys", "-t", opts.session, key]);
      await Bun.sleep(opts.keyDelayMs);
    }
    const shot = await tmux(["capture-pane", "-t", opts.session, "-p", "-e"]);
    if (shot.code !== 0) throw new Error(`tmux capture-pane failed: ${shot.stderr.trim()}`);
    return shot.stdout;
  } finally {
    await tmux(["kill-session", "-t", opts.session]);
  }
}

function flag(argv: string[], name: string, fallback?: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const out = flag(argv, "--out");
  if (!out || argv.includes("--help")) {
    console.error(
      "usage: bun tui/tools/capture.ts --out PATH [--size 120x34] [--keys \"2,?\"] [--settle MS] [--command CMD]",
    );
    process.exit(out ? 0 : 2);
  }

  const size = flag(argv, "--size", "120x34")!;
  const match = /^(\d{2,4})x(\d{2,4})$/.exec(size);
  if (!match) { console.error(`--size must look like 120x34, got '${size}'`); process.exit(2); }
  const cols = parseInt(match[1]!, 10);
  const rows = parseInt(match[2]!, 10);

  const home = flag(argv, "--home", process.env.EBRAIN_HOME || process.cwd())!;
  const keysRaw = flag(argv, "--keys", "")!;
  const keys = keysRaw ? keysRaw.split(",").map((k) => k.trim()).filter(Boolean) : [];

  const text = await capture({
    session: flag(argv, "--session", `ebrain-shot-${process.pid}`)!,
    cols, rows,
    command: flag(argv, "--command", `TERM=xterm-256color bash ${home}/cli/ebrain ui`)!,
    cwd: home,
    keys,
    settleMs: parseInt(flag(argv, "--settle", "4000")!, 10),
    keyDelayMs: parseInt(flag(argv, "--key-delay", "700")!, 10),
  });

  const grid = parseAnsi(text, cols);
  await Bun.write(`${out}.ans`, text);
  await Bun.write(`${out}.grid.json`, JSON.stringify({ cols, rows, size, keys, grid }));
  await Bun.write(`${out}.svg`, toSvg(grid));
  console.log(`${out}.ans\n${out}.grid.json\n${out}.svg`);
}

if (import.meta.main) await main();
