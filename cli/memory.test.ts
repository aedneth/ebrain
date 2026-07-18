/**
 * Tests de memory.ts — funciones puras sobre fixtures de filesystem (sin tocar memory/ ni
 * Dev Brain reales). `bun test cli/memory.test.ts`.
 */
import { test, expect } from "bun:test";
import { listLearningFiles, recentLearnings, parseSessionLine, recentSessions } from "./memory.ts";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function freshDir(prefix: string): string {
  const d = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(d, { recursive: true });
  return d;
}

function learningFile(project: string, name: string, meta: Record<string, string>, body: string): string {
  const lines = ["---", ...Object.entries(meta).map(([k, v]) => `${k}: ${v}`), "---", "", body, ""];
  return lines.join("\n");
}

test("listLearningFiles: recorre memory/learnings/<project>/*.md a un nivel", () => {
  const dir = freshDir("ebrain-mem-list");
  mkdirSync(join(dir, "ebrain"), { recursive: true });
  writeFileSync(join(dir, "ebrain", "a.md"), "x");
  writeFileSync(join(dir, "ebrain", "b.md"), "x");
  writeFileSync(join(dir, "ebrain", "not-md.txt"), "x"); // no cuenta
  mkdirSync(join(dir, "korvex-web"), { recursive: true });
  writeFileSync(join(dir, "korvex-web", "c.md"), "x");

  expect(listLearningFiles(dir).length).toBe(3);
});

test("listLearningFiles: directorio inexistente → []", () => {
  expect(listLearningFiles(join(tmpdir(), "no-existe-jamas-learnings"))).toEqual([]);
});

test("recentLearnings: ordena por 'created' desc, respeta --limit, extrae texto y tags", async () => {
  const dir = freshDir("ebrain-mem-recent");
  mkdirSync(join(dir, "ebrain"), { recursive: true });
  writeFileSync(join(dir, "ebrain", "old.md"), learningFile("ebrain", "old", {
    type: "agent-learning", project: "ebrain", agent: "claude", date: "2026-07-10",
    created: "2026-07-10T10:00:00Z", tags: "[learning, old]",
  }, "# Old heading\n\nOld learning text."));
  writeFileSync(join(dir, "ebrain", "new.md"), learningFile("ebrain", "new", {
    type: "agent-learning", project: "ebrain", agent: "codex", date: "2026-07-12",
    created: "2026-07-12T10:00:00Z", tags: "[learning, new]",
  }, "# New heading\n\nNew learning text."));

  const rows = await recentLearnings(dir, 10);
  expect(rows.length).toBe(2);
  expect(rows[0].agent).toBe("codex"); // más reciente primero
  expect(rows[0].text).toBe("New learning text.");
  expect(rows[0].tags).toEqual(["learning", "new"]);
  expect(rows[1].agent).toBe("claude");

  const limited = await recentLearnings(dir, 1);
  expect(limited.length).toBe(1);
  expect(limited[0].agent).toBe("codex");
});

test("recentLearnings: sin 'created' cae a 'date'; frontmatter ausente no rompe (defaults 'unknown')", async () => {
  const dir = freshDir("ebrain-mem-fallback");
  mkdirSync(join(dir, "proj"), { recursive: true });
  writeFileSync(join(dir, "proj", "no-created.md"), learningFile("proj", "x", {
    project: "proj", agent: "gemini", date: "2026-07-11",
  }, "# H\n\nBody."));
  writeFileSync(join(dir, "proj", "sin-frontmatter.md"), "solo texto plano, sin ---\n");

  const rows = await recentLearnings(dir, 10);
  expect(rows.length).toBe(2);
  const withDate = rows.find((r) => r.agent === "gemini");
  expect(withDate?.date).toBe("2026-07-11");
  const noMeta = rows.find((r) => r.agent === "unknown");
  expect(noMeta?.project).toBe("unknown");
});

test("parseSessionLine: estilo nuevo (duration '-', agente en [bracket] del summary)", () => {
  const line = "2026-07-12T00:59:45Z | testrepo | - | 5373307 | [codex] seed commit | /tmp/x/.brain/sessions/y.md";
  const r = parseSessionLine(line);
  expect(r).not.toBeNull();
  expect(r!.ts).toBe("2026-07-12T00:59:45Z");
  expect(r!.project).toBe("testrepo");
  expect(r!.agent).toBe("codex");
  expect(r!.commit).toBe("5373307");
  expect(r!.summary).toBe("seed commit");
  expect(r).not.toHaveProperty("path");
});

test("parseSessionLine: estilo viejo (agente crudo en field3, sin bracket en summary)", () => {
  const line = "2026-07-11T22:59:40Z | second-brain | unknown | 95f83ee | resumen sin bracket | /path/log.md";
  const r = parseSessionLine(line);
  expect(r).not.toBeNull();
  expect(r!.agent).toBe("unknown");
  expect(r!.summary).toBe("resumen sin bracket");
});

test("parseSessionLine: línea malformada (menos de 6 campos) → null", () => {
  expect(parseSessionLine("solo | tres | campos")).toBeNull();
  expect(parseSessionLine("")).toBeNull();
});

test("recentSessions: toma las últimas N líneas del índice (append-only), orden más-reciente-primero", async () => {
  const dir = freshDir("ebrain-mem-sessions");
  const idx = join(dir, "index.md");
  const lines = [
    "2026-07-10T00:00:00Z | p1 | - | aaa0001 | [codex] uno | /a.md",
    "2026-07-11T00:00:00Z | p1 | - | aaa0002 | [codex] dos | /b.md",
    "2026-07-12T00:00:00Z | p1 | - | aaa0003 | [claude] tres | /c.md",
  ];
  writeFileSync(idx, lines.join("\n") + "\n");

  const all = await recentSessions(idx, 10);
  expect(all.length).toBe(3);
  expect(all[0].summary).toBe("tres"); // más reciente primero

  const limited = await recentSessions(idx, 2);
  expect(limited.length).toBe(2);
  expect(limited[0].summary).toBe("tres");
  expect(limited[1].summary).toBe("dos");
});

test("recentSessions: índice inexistente → []", async () => {
  expect(await recentSessions(join(tmpdir(), "no-existe-jamas-index.md"), 10)).toEqual([]);
});

test("recentSessions: ignora líneas malformadas mezcladas con válidas", async () => {
  const dir = freshDir("ebrain-mem-sessions-mixed");
  const idx = join(dir, "index.md");
  writeFileSync(idx, [
    "2026-07-12T00:00:00Z | p1 | - | aaa0001 | [codex] ok | /a.md",
    "línea rota sin suficientes campos",
    "",
  ].join("\n"));
  const rows = await recentSessions(idx, 10);
  expect(rows.length).toBe(1);
  expect(rows[0].summary).toBe("ok");
});
