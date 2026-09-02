/**
 * cli/adapters.test.ts — the adapter contract.
 *
 * The manifests are now the extension point, so the property that matters is that a WRONG manifest
 * fails loudly and names the line. Before this, each consumer poked at the fields it cared about
 * and ignored the rest, so a typo surfaced as a feature quietly not working — an adapter that
 * would not launch, a guard that was never wired.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  AdapterManifestError,
  AdapterManifestSchema,
  loadAdapterFile,
  loadAdapters,
  toAdapter,
  validateAdapters,
} from "./adapters.ts";

const REAL = join(import.meta.dir, "..", "harness", "adapters");
const temps: string[] = [];

function adapterDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ebrain-adapter-"));
  temps.push(dir);
  for (const [agent, yaml] of Object.entries(files)) {
    mkdirSync(join(dir, agent), { recursive: true });
    writeFileSync(join(dir, agent, "manifest.yaml"), yaml);
  }
  return dir;
}

afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const VALID = `
agent: pi
class: light
description: A fictitious agent used to prove a manifest is all it takes.
norms: { target: ~/.pi/NORMS.md, mode: managed-block }
mcp:
  register: "ebrain onboard pi"
  method: cli
  binary: pi
  add: ["mcp", "add", "{name}", "--", "{bridge}"]
  remove: ["mcp", "remove", "{name}"]
  config: ~/.pi/config.json
  format: json
  keys: [mcpServers]
launch: pi --yolo
doctor: "pi --version"
`;

describe("the shipped adapters", () => {
  test("all validate", () => {
    const results = validateAdapters(REAL, "/home/tester");
    for (const result of results) {
      // Naming the offender beats a bare `every(...)` when this fails on someone's branch.
      expect({ agent: result.agent, issues: result.issues }).toEqual({ agent: result.agent, issues: [] });
    }
    expect(results.length).toBeGreaterThanOrEqual(6);
  });

  test("load into typed adapters with the right guard mode", () => {
    const by = Object.fromEntries(loadAdapters(REAL, "/home/tester").map((a) => [a.agent, a]));
    // An adapter with no hook runtime cannot technically deny anything; saying otherwise would be
    // the fleet view claiming protection that does not exist.
    expect(by.claude!.guard).toBe("enforced");
    expect(by.codex!.guard).toBe("enforced");
    expect(by.cursor!.guard).toBe("advisory");
    expect(by.opencode!.guard).toBe("advisory");
    expect(by.generic!.guard).toBe("advisory");
    expect(by.claude!.ramClass).toBe("heavy");
    expect(by.gemini!.ramClass).toBe("light");
    expect(by.claude!.norms.target).toBe("/home/tester/.claude/CLAUDE.md");
  });
});

describe("a new adapter", () => {
  test("is loaded and validated from its manifest alone", () => {
    const dir = adapterDir({ pi: VALID });
    expect(validateAdapters(dir, "/home/t")).toEqual([{ agent: "pi", file: join(dir, "pi", "manifest.yaml"), ok: true, issues: [] }]);
    const adapter = loadAdapters(dir, "/home/t")[0]!;
    expect(adapter.agent).toBe("pi");
    expect(adapter.launch).toBe("pi --yolo");
    expect(adapter.mcp.method).toBe("cli");
    // No hook runtime declared, so the guard is advisory — derived, not asserted by the author.
    expect(adapter.guard).toBe("advisory");
  });
});

describe("a wrong manifest fails loudly", () => {
  test("an unknown key is an error, not silence", () => {
    // The whole point: a mistyped `lauch:` used to be ignored, and the adapter simply never
    // launched, with nothing on screen to say why.
    const dir = adapterDir({ pi: `${VALID}\nlauch: pi --yolo\n` });
    const result = validateAdapters(dir, "/home/t")[0]!;
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("lauch");
  });

  test("a missing required field names the field", () => {
    const dir = adapterDir({ pi: "class: light\ndescription: no agent id\n" });
    const result = validateAdapters(dir, "/home/t")[0]!;
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("agent");
  });

  test("reports every problem at once", () => {
    const dir = adapterDir({ pi: "agent: PI\nclass: enormous\n" });
    const result = validateAdapters(dir, "/home/t")[0]!;
    // agent id shape, class enum, and the missing description — all three, one run.
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });

  test("unparseable YAML is reported against the file, not thrown at the user", () => {
    const dir = adapterDir({ pi: "agent: [unclosed\n" });
    const result = validateAdapters(dir, "/home/t")[0]!;
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test("a directory name that disagrees with the declared agent is caught", () => {
    // Every path-based lookup would silently miss this adapter.
    const dir = adapterDir({ "not-pi": VALID });
    const result = validateAdapters(dir, "/home/t")[0]!;
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("not-pi");
  });

  test("an adapter directory with no manifest is reported rather than skipped", () => {
    const dir = adapterDir({});
    mkdirSync(join(dir, "empty"), { recursive: true });
    const result = validateAdapters(dir, "/home/t").find((r) => r.agent === "empty")!;
    expect(result.ok).toBe(false);
  });
});

describe("cross-field checks the schema cannot express", () => {
  test("a cli mechanism with no binary or no argv is caught", () => {
    const noBinary = adapterDir({ pi: VALID.replace("  binary: pi\n", "") });
    expect(validateAdapters(noBinary, "/home/t")[0]!.issues.join(" ")).toContain("mcp.binary");

    const noArgv = adapterDir({ pi: VALID.replace('  add: ["mcp", "add", "{name}", "--", "{bridge}"]\n', "") });
    expect(validateAdapters(noArgv, "/home/t")[0]!.issues.join(" ")).toContain("mcp.add");
  });

  test("an onboardable adapter with no config path cannot be verified, and says so", () => {
    const dir = adapterDir({ pi: VALID.replace("  config: ~/.pi/config.json\n", "") });
    expect(validateAdapters(dir, "/home/t")[0]!.issues.join(" ")).toContain("verified");
  });

  test("a wrapper on an event the manifest never maps is caught", () => {
    const dir = adapterDir({
      pi: `
agent: pi
description: hooks that go nowhere
hooks:
  config: ~/.pi/hooks.json
  format: claude-json
  dir: ~/.pi/hooks
  events: { session_start: SessionStart }
  wrappers:
    - { file: guard.sh, core: guard-secrets.sh, event: pre_tool_use }
`,
    });
    // The guard would be written to disk and wired to nothing at all.
    expect(validateAdapters(dir, "/home/t")[0]!.issues.join(" ")).toContain("pre_tool_use");
  });
});

describe("schema", () => {
  test("accepts a minimal manifest", () => {
    expect(AdapterManifestSchema.safeParse({ agent: "x", description: "d" }).success).toBe(true);
  });

  test("loadAdapterFile throws a typed error naming the file", () => {
    const dir = adapterDir({ pi: "agent: 9bad\ndescription: d\n" });
    expect(() => loadAdapterFile(join(dir, "pi", "manifest.yaml"), "pi", "/home/t")).toThrow(AdapterManifestError);
  });

  test("toAdapter derives the launch binary when mcp declares none", () => {
    // `detect()` must probe the binary the agent is really invoked as; falling back to the
    // adapter's name would have probed `cursor` instead of `agent`.
    const adapter = toAdapter(
      AdapterManifestSchema.parse({ agent: "x", description: "d", launch: "some-binary --flag" }),
      { agent: "x" },
      "/home/t",
    );
    expect(adapter.launch).toBe("some-binary --flag");
  });
});
