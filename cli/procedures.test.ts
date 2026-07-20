import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  listProcedures,
  parseProcedureArgs,
  parseProcedureMetadata,
  readProcedureMetadata,
  recordProcedureUse,
  reviewProcedure,
  showProcedure,
} from "./procedures.ts";
import { ingestWorkflows } from "./workflows.ts";

const roots: string[] = [];
function root(): string {
  const value = mkdtempSync(join(tmpdir(), "ebrain-procedures-"));
  roots.push(value);
  return value;
}
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function workflowMarkdown(): string {
  return `---
title: Release checklist
trigger: "Use before a reviewed release"
summary: "Run the release verification sequence."
tags: [release, checklist]
---
# Release checklist

1. Run focused tests.
2. Review the diff.

- Verify: bun test ./cli/
`;
}

async function seeded(): Promise<{ source: string; workflows: string; procedures: string; skills: string; id: string }> {
  const base = root();
  const source = join(base, "source");
  const workflows = join(base, "workflows");
  const procedures = join(base, "procedures");
  const skills = join(base, "skills");
  mkdirSync(source);
  writeFileSync(join(source, "release.md"), workflowMarkdown());
  const result = await ingestWorkflows({ storeDir: workflows, sourceRoots: [{ source: "local", dir: source }], now: "2026-07-18T00:00:00.000Z" });
  return { source, workflows, procedures, skills, id: result.workflows[0]!.id };
}

describe("reviewed procedure lifecycle", () => {
  test("defaults safely to active without writing metadata and exposes no workflow path/body", async () => {
    const fixture = await seeded();
    const rows = await listProcedures(10, { dir: fixture.procedures, workflowStoreDir: fixture.workflows, skillsDir: fixture.skills });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: fixture.id, state: "active", use_count: 0, skillified: false });
    expect(existsSync(fixture.procedures)).toBe(false);
    expect("source_path" in rows[0]!).toBe(false);
    expect("body" in rows[0]!).toBe(false);
    expect("path" in rows[0]!).toBe(false);
  });

  test("records explicit use without inferring success or changing lifecycle state", async () => {
    const fixture = await seeded();
    const opts = { dir: fixture.procedures, workflowStoreDir: fixture.workflows, skillsDir: fixture.skills, now: "2026-07-18T00:00:00.000Z" };
    const used = await recordProcedureUse(fixture.id, opts);
    expect(used).toMatchObject({ state: "active", use_count: 1, last_used_at: "2026-07-18T00:00:00.000Z" });
    expect(statSync(fixture.procedures).mode & 0o777).toBe(0o700);
    expect(statSync(join(fixture.procedures, `${fixture.id}.procedure.json`)).mode & 0o777).toBe(0o600);
    const detail = await showProcedure(fixture.id, opts);
    expect(detail.events).toEqual([{ kind: "used", at: "2026-07-18T00:00:00.000Z", workflow_version: 1 }]);
  });

  test("requires explicit reviewed transitions and can revive stale or archived procedures", async () => {
    const fixture = await seeded();
    const opts = { dir: fixture.procedures, workflowStoreDir: fixture.workflows, skillsDir: fixture.skills, now: "2026-07-18T00:00:00.000Z" };
    const stale = await reviewProcedure(fixture.id, "stale", opts);
    expect(stale).toMatchObject({ state: "stale", reviewed_at: "2026-07-18T00:00:00.000Z" });
    const active = await reviewProcedure(fixture.id, "active", { ...opts, now: "2026-07-18T00:01:00.000Z" });
    expect(active).toMatchObject({ state: "active", reviewed_at: "2026-07-18T00:01:00.000Z" });
    const archived = await reviewProcedure(fixture.id, "archived", { ...opts, now: "2026-07-18T00:02:00.000Z" });
    expect(archived.state).toBe("archived");
    const revived = await reviewProcedure(fixture.id, "active", { ...opts, now: "2026-07-18T00:03:00.000Z" });
    expect(revived.state).toBe("active");
  });

  test("derives skill presence from the actual local skill file instead of a mutable flag", async () => {
    const fixture = await seeded();
    mkdirSync(join(fixture.skills, fixture.id), { recursive: true });
    writeFileSync(join(fixture.skills, fixture.id, "SKILL.md"), "# Local skill\n");
    const detail = await showProcedure(fixture.id, { dir: fixture.procedures, workflowStoreDir: fixture.workflows, skillsDir: fixture.skills });
    expect(detail.skillified).toBe(true);
  });

  test("keeps a bounded event tail while retaining total explicit use count", async () => {
    const fixture = await seeded();
    const opts = { dir: fixture.procedures, workflowStoreDir: fixture.workflows, skillsDir: fixture.skills };
    for (let index = 0; index < 66; index += 1) {
      await recordProcedureUse(fixture.id, { ...opts, now: `2026-07-18T00:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z` });
    }
    const detail = await showProcedure(fixture.id, opts);
    expect(detail.use_count).toBe(66);
    expect(detail.events).toHaveLength(64);
    expect(detail.events.every((event) => event.kind === "used")).toBe(true);
  });

  test("fails closed on malformed or widened metadata and writes nothing for missing workflows", async () => {
    const fixture = await seeded();
    const opts = { dir: fixture.procedures, workflowStoreDir: fixture.workflows, skillsDir: fixture.skills, now: "2026-07-18T00:00:00.000Z" };
    await expect(recordProcedureUse("missing", opts)).rejects.toThrow("not found");
    expect(existsSync(fixture.procedures)).toBe(false);

    mkdirSync(fixture.procedures, { recursive: true, mode: 0o700 });
    chmodSync(fixture.procedures, 0o700);
    writeFileSync(join(fixture.procedures, `${fixture.id}.procedure.json`), JSON.stringify({ schema_version: 1, workflow_id: fixture.id, state: "active", use_count: 0, events: [], extra: true }) + "\n", { mode: 0o600 });
    chmodSync(join(fixture.procedures, `${fixture.id}.procedure.json`), 0o600);
    await expect(showProcedure(fixture.id, opts)).rejects.toThrow("invalid procedure metadata");

    rmSync(join(fixture.procedures, `${fixture.id}.procedure.json`));
    const used = await recordProcedureUse(fixture.id, opts);
    chmodSync(join(fixture.procedures, `${used.id}.procedure.json`), 0o644);
    await expect(readProcedureMetadata(fixture.id, opts)).rejects.toThrow("record is not private");
    chmodSync(join(fixture.procedures, `${used.id}.procedure.json`), 0o600);
    chmodSync(fixture.procedures, 0o755);
    await expect(listProcedures(10, opts)).rejects.toThrow("directory is not private");
  });

  test("strict parser rejects conflicting event history and ambiguous CLI grammar", () => {
    expect(() => parseProcedureMetadata({
      schema_version: 1, workflow_id: "local-release", state: "archived", use_count: 0,
      reviewed_at: "2026-07-18T00:00:00.000Z", events: [],
    })).not.toThrow();
    expect(() => parseProcedureMetadata({
      schema_version: 1, workflow_id: "local-release", state: "active", use_count: 1,
      events: [{ kind: "used", at: "2026-07-18T00:00:00.000Z", workflow_version: 1 }],
    })).toThrow("timestamps do not match");
    expect(parseProcedureArgs(["review", "local-release", "--state", "stale", "--yes", "--json"]).values.get("--state")).toBe("stale");
    expect(() => parseProcedureArgs(["list", "--limit", "2", "--limit", "3"])).toThrow("requires one value");
  });
});
