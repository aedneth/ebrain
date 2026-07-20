import { afterEach, describe, expect, test } from "bun:test";

// Deny policy is operator configuration; this suite declares its own neutral fixture policy.
process.env.EBRAIN_DENIED_REPOS = "denied-alpha,denied-beta";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createContextProposal,
  getContextPack,
  initializeContextPack,
  listContextPacks,
  listContextProposals,
  readContextPack,
  readContextProposal,
  reviewContextProposal,
  updateContextPack,
  validateContextText,
} from "./context.ts";
import { addWorkspace, writeWorkspaceStore } from "./workspaces.ts";

const roots: string[] = [];
function root(): string {
  const value = mkdtempSync(join(tmpdir(), "ebrain-context-"));
  roots.push(value);
  return value;
}
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("governed context packs", () => {
  test("initializes private Markdown packs and exposes only summaries until bounded get", async () => {
    const dir = root();
    const opts = { dir: join(dir, "context"), now: "2026-07-18T00:00:00.000Z" };
    const initialized = await initializeContextPack({ scope: "operator" }, opts);
    expect(initialized.created).toBe(true);
    expect(initialized.pack).toMatchObject({ id: "operator", scope: "operator", version: 1 });
    expect(statSync(opts.dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(opts.dir, "operator.md")).mode & 0o777).toBe(0o600);

    const listed = await listContextPacks(opts);
    expect(listed).toHaveLength(1);
    expect("content" in listed[0]!).toBe(false);
    const bounded = await getContextPack("operator", 18, opts);
    expect(bounded.content.length).toBe(18);
    expect(bounded.pack.id).toBe("operator");
    expect((await initializeContextPack({ scope: "operator" }, opts)).created).toBe(false);
  });

  test("requires a registered generated workspace id for a workspace pack", async () => {
    const dir = root();
    const workspaceDir = join(dir, "workspace");
    const workspaceStorePath = join(dir, "config", "workspaces.json");
    mkdirSync(workspaceDir);
    const store = await addWorkspace({ schema_version: 1, workspaces: [] }, { label: "Workspace", cwd: workspaceDir });
    await writeWorkspaceStore(store, workspaceStorePath);
    const opts = { dir: join(dir, "context"), workspaceStorePath, now: "2026-07-18T00:00:00.000Z" };
    const initialized = await initializeContextPack({ scope: "workspace", workspaceId: "workspace" }, opts);
    expect(initialized.pack).toMatchObject({ id: "workspace-workspace", scope: "workspace", workspace_id: "workspace" });
    await expect(initializeContextPack({ scope: "workspace", workspaceId: "missing" }, opts)).rejects.toThrow("registered workspace");
  });

  test("keeps proposals pending until an explicit accept, rejects stale bases, and never mutates a pack during proposal", async () => {
    const dir = root();
    const opts = { dir: join(dir, "context"), now: "2026-07-18T00:00:00.000Z" };
    await initializeContextPack({ scope: "operator" }, opts);
    const first = await createContextProposal({
      packId: "operator", agent: "codex", session: "ebr-codex-context", evidence: "The operator repeatedly requested concise verification.", content: "# Operator context\n\nPrefer concise verification summaries.",
    }, opts);
    const second = await createContextProposal({
      packId: "operator", agent: "claude", session: "ebr-claude-context", evidence: "A separate proposed preference needs review.", content: "# Operator context\n\nUse a separate proposal.",
    }, opts);
    expect((await readContextPack("operator", opts))?.version).toBe(1);
    expect((await listContextProposals(opts)).map((proposal) => proposal.status)).toEqual(["pending", "pending"]);

    const accepted = await reviewContextProposal(first.id, "accept", { ...opts, now: "2026-07-18T00:01:00.000Z" });
    expect(accepted.proposal.status).toBe("accepted");
    expect(accepted.pack).toMatchObject({ version: 2 });
    expect((await readContextPack("operator", opts))?.content).toContain("concise verification");
    await expect(reviewContextProposal(second.id, "accept", { ...opts, now: "2026-07-18T00:02:00.000Z" })).rejects.toThrow("stale");
  });

  test("makes a direct human update explicit, versioned, and stale-safe for prior proposals", async () => {
    const dir = root();
    const opts = { dir: join(dir, "context"), now: "2026-07-18T00:00:00.000Z" };
    await initializeContextPack({ scope: "operator" }, opts);
    const proposal = await createContextProposal({
      packId: "operator", agent: "codex", session: "ebr-codex-context", evidence: "A safe proposal awaits review.", content: "# Operator context\n\nProposal replacement.",
    }, opts);
    const updated = await updateContextPack("operator", "# Operator context\n\nHuman-owned replacement.", { ...opts, now: "2026-07-18T00:01:00.000Z" });
    expect(updated).toMatchObject({ id: "operator", version: 2 });
    expect((await readContextPack("operator", opts))?.content).toContain("Human-owned replacement");
    await expect(reviewContextProposal(proposal.id, "accept", { ...opts, now: "2026-07-18T00:02:00.000Z" })).rejects.toThrow("stale");
  });

  test("rejects secret-shaped and denied-client proposal text rather than redacting or activating it", async () => {
    const dir = root();
    const opts = { dir: join(dir, "context"), now: "2026-07-18T00:00:00.000Z" };
    await initializeContextPack({ scope: "operator" }, opts);
    await expect(createContextProposal({
      packId: "operator", agent: "codex", session: "ebr-codex-context", evidence: "Evidence is safe.", content: "OPENROUTER_API_KEY=example-placeholder",
    }, opts)).rejects.toThrow("secret-shaped");
    await expect(createContextProposal({
      packId: "operator", agent: "codex", session: "ebr-codex-context", evidence: "Evidence is safe.", content: "Do work in denied-alpha.",
    }, opts)).rejects.toThrow("denied client");
    expect(() => validateContextText("x".repeat(8_001), 8_000, "context content")).toThrow("bounded limit");
  });

  test("fails closed on malformed pack metadata instead of treating hand-edited data as active", async () => {
    const dir = root();
    const contextDir = join(dir, "context");
    mkdirSync(contextDir, { recursive: true, mode: 0o700 });
    chmodSync(contextDir, 0o700);
    writeFileSync(join(contextDir, "operator.md"), "---\nschema_version: 1\nid: operator\nscope: operator\nversion: 1\nupdated_at: 2026-07-18T00:00:00.000Z\ncontent_hash: bad\nunexpected: true\n---\ntext\n", { mode: 0o600 });
    chmodSync(join(contextDir, "operator.md"), 0o600);
    await expect(readContextPack("operator", { dir: contextDir })).rejects.toThrow("invalid context pack metadata");
  });

  test("fails closed if a context record or its storage directory stops being private", async () => {
    const dir = root();
    const opts = { dir: join(dir, "context"), now: "2026-07-18T00:00:00.000Z" };
    await initializeContextPack({ scope: "operator" }, opts);
    chmodSync(join(opts.dir, "operator.md"), 0o644);
    await expect(readContextPack("operator", opts)).rejects.toThrow("record is not private");
    chmodSync(join(opts.dir, "operator.md"), 0o600);
    chmodSync(opts.dir, 0o755);
    await expect(readContextPack("operator", opts)).rejects.toThrow("directory is not private");
  });

  test("rejects proposal records when either private storage boundary is widened", async () => {
    const dir = root();
    const opts = { dir: join(dir, "context"), now: "2026-07-18T00:00:00.000Z" };
    await initializeContextPack({ scope: "operator" }, opts);
    const proposal = await createContextProposal({
      packId: "operator", agent: "codex", session: "ebr-codex-context", evidence: "A safe proposal awaits review.", content: "# Operator context\n\nProposal replacement.",
    }, opts);
    chmodSync(join(opts.dir, "proposals", `${proposal.id}.json`), 0o644);
    await expect(readContextProposal(proposal.id, opts)).rejects.toThrow("record is not private");
    chmodSync(join(opts.dir, "proposals", `${proposal.id}.json`), 0o600);
    chmodSync(opts.dir, 0o755);
    await expect(listContextProposals(opts)).rejects.toThrow("directory is not private");
  });
});
