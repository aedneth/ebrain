// cli/citations.test.ts — a cited file must exist.
//
// This exists because the same mistake was made twice in a row, the second time inside the commit
// that corrected the first.
//
// Pass 4 found the CHANGELOG claiming two TypeScript modules were "the last two sites" that
// hardcoded the eBrain location. Twenty-six existed. The claim was false because nobody ran the
// search. The remediation for that was cli/ebrain-home.test.ts: make the search itself a test.
//
// Pass 5 found that same remediation commit citing `docs/AUDIT-F7-F12-PASS4.md` in the CHANGELOG and
// in the PR body. That file has never existed. The citation was written without opening it.
//
// Both are the same defect: an assertion about the repository, published without running the
// trivial check that would have refuted it. So the check is now a test. A reference to a repository
// path inside a tracked document either resolves or fails the build.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

function tracked(pattern: string[]): string[] {
  // -z: without it git quotes paths containing spaces or non-ASCII, and the repository has both —
  // the quoted form is not a path and every read of it throws.
  const proc = Bun.spawnSync(["git", "-C", ROOT, "ls-files", "-z", ...pattern], { stdout: "pipe" });
  return proc.stdout.toString().split("\0").filter(Boolean);
}

/**
 * Paths cited inside backticks that look like they name a file in this repository. Restricted to
 * backticked spans with a known source extension, because prose mentions directories, glob shapes,
 * and hypothetical filenames, and flagging those would make this test noise rather than signal.
 *
 * `vendor/` is deliberately NOT in the prefix set (pass 6, F-T7): it is a gitignored, vendored
 * upstream tree, so whether a `vendor/...` citation resolves depends entirely on whether the machine
 * running the test happens to have that checkout. On the author's machine it exists and the test
 * failed; on CI and most machines it does not and the test passed — an assertion on machine-local
 * state, which is the exact anti-pattern this whole effort is about. A vendored path is not a
 * repository path this project controls, so it is out of scope for citation integrity.
 */
const CITATION = /`((?:docs|cli|scripts|harness|overlay|website|tui)\/[\w./-]+\.(?:md|ts|tsx|sh|json|yml|yaml|astro|css|service|timer|in))`/g;

/** Documents whose whole purpose is to describe files that do not exist yet, or no longer do. */
const EXEMPT_DOCS = new Set<string>([
  // Audit reports are historical records: they describe a tree as it was at the time of the audit,
  // including files a remediation later renamed. Rewriting them would falsify the record.
  "docs/AUDIT-F7-F12-INDEPENDENT.md",
  "docs/AUDIT-F7-F12-REAUDIT.md",
  "docs/AUDIT-F7-F12-PASS3.md",
  "docs/AUDIT-F7-F12-PASS5.md",
  "docs/AUDIT-FABLE-F6-CORRECTIONS.md",
  "docs/AUDIT-FABLE-FASE-D.md",
  "docs/AUDIT-GPT-5.6-SOL-F6.md",
]);

/** Individual citations that are deliberately about something absent, with the reason. */
const EXEMPT_CITATIONS = new Map<string, string>([
  ["docs/AUDIT-F7-F12-PASS4.md", "named in the correction that documents its non-existence"],
]);

/**
 * Broken citations that already existed when this test was written, frozen 2026-07-21.
 *
 * Turning this test on found twenty of them — planning documents pointing at files that were
 * renamed, never written, or lived in a vendored tree. None is a shipping defect, and fixing them
 * all here would bury the portability work in unrelated churn. So they are a baseline that can only
 * SHRINK: a citation not on this list must resolve, and an entry that starts resolving must be
 * deleted from the list (asserted below), so the debt cannot quietly be re-added under an old name.
 */
const KNOWN_BROKEN = new Set<string>([
  "CHANGELOG.md → cli/model-pricing.ts",
  "discovery/00-environment.md → docs/INSTALL.md",
  "discovery/01-gbrain-engine.md → docs/INSTALL.md",
  "discovery/01-gbrain-engine.md → docs/architecture/schema-packs.md",
  "discovery/01-gbrain-engine.md → docs/architecture/pack-upgrade-mechanism.md",
  "discovery/03-gstack-skills.md → scripts/resolvers/redact-doc.ts",
  "discovery/04-connection-contract.md → scripts/preflight-agent-sdk.ts",
  "docs/GUARDRAILS.md → docs/trust-map.md",
  "docs/HANDOFF-CLAUDE-F6-CORRECTIONS.md → cli/model-pricing.ts",
  "docs/SPRINT-TUI.md → cli/model-pricing.ts",
  "docs/SPRINT.md → docs/multi-provider-brain-audit.md",
  "docs/SPRINT.md → docs/validation-f4.md",
  "docs/prompts/CLAUDE-DESIGN-BRIEF.md → tui/src/kit/wordmark.ts",
]);

/** Every broken citation in the tree right now, as `doc → cited`. */
function brokenCitations(pattern: string[], re: RegExp): string[] {
  const broken: string[] = [];
  for (const doc of tracked(pattern)) {
    if (EXEMPT_DOCS.has(doc)) continue;
    const text = readFileSync(join(ROOT, doc), "utf8");
    for (const m of text.matchAll(re)) {
      const cited = m[1]!;
      if (EXEMPT_CITATIONS.has(cited)) continue;
      if (!existsSync(join(ROOT, cited))) broken.push(`${doc} → ${cited}`);
    }
  }
  return [...new Set(broken)];
}

describe("a cited repository path resolves", () => {
  test("no NEW document cites a file that does not exist", () => {
    const unexpected = brokenCitations(["*.md", "docs/*.md", "docs/**/*.md", "discovery/*.md"], CITATION)
      .filter((entry) => !KNOWN_BROKEN.has(entry));
    expect(unexpected).toEqual([]);
  });

  test("the frozen baseline only shrinks — a fixed citation must leave the list", () => {
    // Without this the baseline rots into a permanent allowlist, and a future contributor could
    // delete a real file and satisfy the test by re-adding its old name here.
    const stillBroken = new Set(brokenCitations(["*.md", "docs/*.md", "docs/**/*.md", "discovery/*.md"], CITATION));
    const staleEntries = [...KNOWN_BROKEN].filter((entry) => !stillBroken.has(entry));
    expect(staleEntries).toEqual([]);
  });

  test("the detector finds the citation that actually shipped", () => {
    // Without this, a broken CITATION regex silently passes everything — the vacuous-test failure
    // mode that produced three of the five audit rounds.
    const sample = "read `docs/AUDIT-F7-F12-PASS4.md` if it is present";
    expect([...sample.matchAll(CITATION)].map((m) => m[1])).toEqual(["docs/AUDIT-F7-F12-PASS4.md"]);
  });

  test("every audit report referenced as a pass exists, with no baseline forgiveness", () => {
    // The exact shape of the pass-5 finding: a document announcing "pass N is recorded at X".
    // Audit citations get no baseline — the whole integrity of the maker/checker record rests on
    // a cited verdict being readable by the person who wants to check it.
    expect(brokenCitations(["*.md", "docs/*.md"], /`(docs\/AUDIT-[\w.-]+\.md)`/g)).toEqual([]);
  });
});
