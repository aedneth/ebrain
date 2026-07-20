#!/usr/bin/env bun
/** Generate repository-owned public docs assets from stable product source/fixtures. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildFrame, initialState } from "../tui/src/app.ts";
import { makeTheme } from "../tui/src/theme.ts";

const ROOT = join(import.meta.dir, "..");
const ASSETS = join(ROOT, "assets");
const COLS = 120;
const ROWS = 32;
const CELL_WIDTH = 8.15;
const CELL_HEIGHT = 15.4;
const SVG_WIDTH = Math.ceil(COLS * CELL_WIDTH + 40);
const SVG_HEIGHT = Math.ceil(ROWS * CELL_HEIGHT + 40);

const stripAnsi = (value: string): string => value.replace(/\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g, "");
const escapeXml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

function tuiDemoSvg(): string {
  const state = {
    ...initialState(),
    cwd: "workspace/demo-app",
    overview: {
      data: {
        brain: { state: "up" as const, servedBy: "mcp:loopback", cached: false },
        spend: { mtd: 0.42, cap: 10, remaining: 9.58 },
        fleet: { total: 5, online: 5 },
        memory: { learnings: 12, sessions: 3 },
      },
      memory: {
        learnings: [{ project: "demo", agent: "codex", date: "2026-07-18", tags: ["decision"], text: "Store reviewed decisions as durable memory." }],
        sessions: [],
      },
      status: "ready" as const,
      atLabel: "12:00",
    },
    sessions: {
      rows: [{ name: "ebr-codex-docs", agent: "codex", uptime: "00:42", attached: false, workspaceLabel: "demo-app" }],
      selected: 0,
      peek: null,
      status: "ready" as const,
    },
  };
  const frame = buildFrame(state, { cols: COLS, rows: ROWS }, makeTheme({ trueColor: true, ascii: false })).map(stripAnsi);
  const rows = frame.map((line, index) => `<text x="20" y="${36 + index * CELL_HEIGHT}">${escapeXml(line)}</text>`).join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-labelledby="title desc">
  <title id="title">eBrain terminal cockpit</title>
  <desc id="desc">A sanitized eBrain TUI home frame generated from the production renderer.</desc>
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#101317"/>
  <rect x="1" y="1" width="${SVG_WIDTH - 2}" height="${SVG_HEIGHT - 2}" fill="none" stroke="#2dd4bf" stroke-opacity="0.45"/>
  <g fill="#d9e1e8" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13" xml:space="preserve">
  ${rows}
  </g>
</svg>
`;
}

const WORDMARK = {
  e: [".###", "#..#", "####", "#...", ".###"],
  b: ["#...", "#...", "###.", "#..#", "###."],
  r: ["....", "#.##", "##..", "#...", "#..."],
  a: [".###", "#..#", "####", "#..#", "#..#"],
  i: ["#", ".", "#", "#", "#"],
  n: ["....", "#.#.", "##.#", "#..#", "#..#"],
} as const;

function wordmarkSvg(): string {
  const unit = 10;
  const gap = 5;
  let x = 0;
  const rects: string[] = [];
  for (const [index, letter] of [..."ebrain"].entries()) {
    const matrix = WORDMARK[letter as keyof typeof WORDMARK];
    const fill = index === 0 ? "#2dd4bf" : "#e8eef2";
    matrix.forEach((row, y) => [...row].forEach((pixel, column) => {
      if (pixel === "#") rects.push(`<rect x="${x + column * unit}" y="${y * unit}" width="${unit}" height="${unit}" fill="${fill}"/>`);
    }));
    x += Math.max(...matrix.map((row) => row.length)) * unit + gap;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="255" height="50" viewBox="0 0 255 50" role="img" aria-labelledby="title">
  <title id="title">eBrain</title>
  <rect width="255" height="50" fill="#101317"/>
  ${rects.join("\n  ")}
</svg>
`;
}

await mkdir(ASSETS, { recursive: true });
await writeFile(join(ASSETS, "ebrain-wordmark.svg"), wordmarkSvg(), "utf8");
await writeFile(join(ASSETS, "ebrain-tui-demo.svg"), tuiDemoSvg(), "utf8");
