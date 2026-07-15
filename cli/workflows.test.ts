import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  captureCandidatesFromEntries,
  findWorkflow,
  ingestWorkflows,
  materializeRun,
  parseArgs,
  searchWorkflows,
  skillifyWorkflow,
  slugify,
  workflowFromMarkdown,
  type WorkflowRecord,
} from "./workflows.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ebrain-workflows-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function sampleMarkdown(title = "Structured Agentic Development"): string {
  return `---
title: ${title}
tags: [dev, sop]
trigger: "Use when building software changes"
summary: "Spec driven development workflow."
---
# ${title}

This workflow keeps implementation disciplined and auditable.

1. Load context before changing code.
2. Write a concrete plan.
3. Implement one scoped phase.
4. Run focused tests.

- Verify: bun test ./cli/
- Gate: maker != checker before merge.
`;
}

describe("workflow contract", () => {
  test("slugify creates stable ids", () => {
    expect(slugify("Desarrollo Agéntico / Fase 6.6")).toBe("desarrollo-agentico-fase-6-6");
  });

  test("argument parsing preserves positional ids and multi-word searches without numeric flags", () => {
    expect(parseArgs(["run", "local-dev-sop", "--json"]).id).toBe("local-dev-sop");
    expect(parseArgs(["skillify", "local-dev-sop", "--yes", "--json"]).id).toBe("local-dev-sop");
    expect(parseArgs(["search", "structured", "agentic", "development", "--json"]).query).toBe("structured agentic development");
    expect(parseArgs(["list", "--limit", "3", "--json"]).limit).toBe(3);
  });

  test("workflowFromMarkdown extracts trigger, summary, steps and gates", async () => {
    const dir = tmp();
    try {
      const file = join(dir, "_workflow.md");
      writeFileSync(file, sampleMarkdown());
      const rec = await workflowFromMarkdown({ source: "local", dir }, file, undefined, "2026-07-15T00:00:00.000Z");
      expect(rec.id).toBe("local-workflow");
      expect(rec.title).toBe("Structured Agentic Development");
      expect(rec.trigger).toContain("building software");
      expect(rec.steps).toHaveLength(4);
      expect(rec.gates.join(" ")).toContain("maker");
      expect(rec.version).toBe(1);
    } finally {
      cleanup(dir);
    }
  });

  test("workflow ingestion persists a scrubbed local representation", async () => {
    const dir = tmp();
    try {
      const file = join(dir, "safe.md");
      writeFileSync(file, sampleMarkdown() + "\nOPENAI_API_KEY=not-a-real-secret\n");
      const rec = await workflowFromMarkdown({ source: "local", dir }, file);
      expect(rec.body).not.toContain("not-a-real-secret");
      expect(rec.body).toContain("[REDACTED]");
    } finally {
      cleanup(dir);
    }
  });

  test("ingest writes local versioned workflow records and increments only on content change", async () => {
    const source = tmp();
    const store = tmp();
    try {
      const file = join(source, "dev-sop.md");
      writeFileSync(file, sampleMarkdown());

      const first = await ingestWorkflows({
        storeDir: store,
        sourceRoots: [{ source: "local", dir: source }],
        now: "2026-07-15T00:00:00.000Z",
      });
      expect(first.ingested).toBe(1);
      expect(first.changed).toBe(1);
      expect(first.workflows[0].version).toBe(1);

      const second = await ingestWorkflows({
        storeDir: store,
        sourceRoots: [{ source: "local", dir: source }],
        now: "2026-07-15T00:01:00.000Z",
      });
      expect(second.changed).toBe(0);
      expect(second.workflows[0].version).toBe(1);

      chmodSync(store, 0o755);
      await ingestWorkflows({
        storeDir: store,
        sourceRoots: [{ source: "local", dir: source }],
        now: "2026-07-15T00:01:30.000Z",
      });
      expect(statSync(store).mode & 0o777).toBe(0o700);

      writeFileSync(file, sampleMarkdown("Structured Agentic Development v2"));
      const third = await ingestWorkflows({
        storeDir: store,
        sourceRoots: [{ source: "local", dir: source }],
        now: "2026-07-15T00:02:00.000Z",
      });
      expect(third.changed).toBe(1);
      expect(third.workflows[0].version).toBe(2);
    } finally {
      cleanup(source);
      cleanup(store);
    }
  });

  test("ingest keeps same-relative-path workflows from distinct roots separate", async () => {
    const firstRoot = tmp();
    const secondRoot = tmp();
    const store = tmp();
    try {
      writeFileSync(join(firstRoot, "release.md"), sampleMarkdown("Workflow A"));
      writeFileSync(join(secondRoot, "release.md"), sampleMarkdown("Workflow B"));
      const ingested = await ingestWorkflows({
        storeDir: store,
        sourceRoots: [
          { source: "second-brain", scope: "workflows", dir: firstRoot },
          { source: "second-brain", scope: "sops", dir: secondRoot },
        ],
      });
      expect(ingested.ingested).toBe(2);
      expect(new Set(ingested.workflows.map((w) => w.id)).size).toBe(2);
    } finally {
      cleanup(firstRoot);
      cleanup(secondRoot);
      cleanup(store);
    }
  });

  test("search and run expose actionable prompts without executing the workflow", async () => {
    const source = tmp();
    const store = tmp();
    try {
      writeFileSync(join(source, "dev-sop.md"), sampleMarkdown());
      await ingestWorkflows({ storeDir: store, sourceRoots: [{ source: "local", dir: source }] });

      const found = await searchWorkflows("software tests", store);
      expect(found.workflows[0].id).toBe("local-dev-sop");

      const workflow = await findWorkflow("local-dev-sop", store);
      expect(workflow).not.toBeNull();
      const run = materializeRun(workflow as WorkflowRecord);
      expect(run.prompt).toContain("Use ebrain workflow");
      expect(run.prompt).toContain("Steps:");
      expect(run.checklist.some((x) => x.includes("Run focused tests"))).toBe(true);
    } finally {
      cleanup(source);
      cleanup(store);
    }
  });

  test("capture proposes repeated workflow candidates and scrubs secrets from snippets", () => {
    const candidates = captureCandidatesFromEntries([
      { source: "session:a", text: "Follow workflow `release checklist` and run the gate. OPENAI_API_KEY=secret" },
      { source: "learning:b", text: "The SOP `release checklist` is repeated after every npm publish." },
      { source: "session:c", text: "Unrelated note." },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe("captured-release-checklist");
    expect(candidates[0].count).toBe(2);
    expect(candidates[0].snippets.join("\n")).not.toContain("secret");
    expect(candidates[0].snippets.join("\n")).toContain("[REDACTED]");
  });

  test("skillify requires explicit approval and writes SKILL.md only with --yes", async () => {
    const source = tmp();
    const store = tmp();
    const skills = tmp();
    try {
      writeFileSync(join(source, "dev-sop.md"), sampleMarkdown());
      await ingestWorkflows({ storeDir: store, sourceRoots: [{ source: "local", dir: source }] });

      const refused = await skillifyWorkflow("local-dev-sop", { storeDir: store, skillsDir: skills, yes: false });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.type).toBe("confirm-required");

      const written = await skillifyWorkflow("local-dev-sop", { storeDir: store, skillsDir: skills, yes: true });
      expect(written.ok).toBe(true);
      if (written.ok) {
        const text = readFileSync(written.path, "utf8");
        expect(text).toContain("workflow_id: local-dev-sop");
        expect(text).toContain("## Safety");
      }
    } finally {
      cleanup(source);
      cleanup(store);
      cleanup(skills);
    }
  });
});
