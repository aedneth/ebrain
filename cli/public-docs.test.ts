import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..");
const PUBLIC_FILES = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "assets/README.md",
  "docs/PUBLIC-DOCUMENTATION.md",
  "docs/getting-started/install.md",
  "docs/getting-started/quickstart.md",
  "docs/getting-started/onboarding.md",
  "docs/getting-started/first-memory.md",
  "docs/getting-started/workspace-session.md",
  "docs/launch/manual-launch.md",
  "docs/launch/guided-launch.md",
  "docs/launch/sessions.md",
  "docs/memory/context-packs.md",
  "docs/memory/episodes.md",
  "docs/memory/procedures-and-workflows.md",
  "docs/routing/task-signals.md",
  "docs/routing/profiles-and-targets.md",
  "docs/concepts/memory.md",
  "docs/concepts/workspaces-sessions.md",
  "docs/concepts/procedures.md",
  "docs/concepts/costs.md",
  "docs/architecture/daemon-federation.md",
  "docs/architecture/ckis.md",
  "docs/architecture/adr-index.md",
  "docs/guides/agents.md",
  "docs/guides/routing.md",
  "docs/guides/privacy.md",
  "docs/guides/migration.md",
  "docs/guides/troubleshooting.md",
  "docs/reference/cli.md",
  "docs/reference/tui.md",
  "docs/reference/mcp.md",
  "docs/reference/configuration.md",
  "docs/reference/json-contracts.md",
  "docs/release/contributor-workflow.md",
  "docs/release/security-and-license.md",
  "docs/release/open-source-readiness.md",
  "docs/release/devpost-evidence.md",
];
const PUBLIC_ASSETS = ["assets/ebrain-wordmark.svg", "assets/ebrain-tui-demo.svg"];
const PUBLIC_ROOT_DESTINATIONS = ["LICENSE"];
const PUBLIC_DESTINATIONS = new Set([...PUBLIC_FILES, ...PUBLIC_ASSETS, ...PUBLIC_ROOT_DESTINATIONS].map((file) => normalize(join(ROOT, file))));
const LINK = /!?\[[^\]]*\]\(([^)]+)\)/g;
const ANSI = /\x1b\[/;
const EMOJI = /\p{Extended_Pictographic}/u;

function read(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

function localLinks(file: string): string[] {
  const links: string[] = [];
  for (const match of read(file).matchAll(LINK)) {
    const target = match[1]!.trim();
    if (!target || target.startsWith("http:") || target.startsWith("https:") || target.startsWith("#") || target.startsWith("mailto:")) continue;
    links.push(target.split("#", 1)[0]!);
  }
  return links;
}

describe("F10.2 public documentation contract", () => {
  test("ships the public navigation tree and keeps every local Markdown/image link within the public allowlist", () => {
    for (const file of PUBLIC_FILES) expect(existsSync(join(ROOT, file))).toBe(true);
    for (const file of PUBLIC_FILES) {
      for (const target of localLinks(file)) {
        const resolved = normalize(join(ROOT, dirname(file), target));
        expect(resolved.startsWith(ROOT)).toBe(true);
        expect(existsSync(resolved)).toBe(true);
        expect(PUBLIC_DESTINATIONS.has(resolved)).toBe(true);
      }
    }
  });

  test("keeps public copy English-oriented, path-free, and free of dotenv/token examples", () => {
    for (const file of PUBLIC_FILES) {
      const text = read(file);
      expect(text).not.toContain("/home/");
      expect(text).not.toContain("~/.config");
      expect(text).not.toMatch(/\.env(?:\b|\*)/);
      expect(text).not.toMatch(/(?:API|TOKEN|SECRET|PASSWORD)_[A-Z0-9_]+\s*=/);
      expect(text).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
    }
    expect(EMOJI.test(read("README.md"))).toBe(false);
  });

  test("includes repository-owned generated assets without terminal control sequences or local data", () => {
    const wordmark = read("assets/ebrain-wordmark.svg");
    const demo = read("assets/ebrain-tui-demo.svg");
    expect(wordmark).toContain("eBrain");
    expect(demo).toContain("sanitized eBrain TUI home frame");
    expect(demo).toContain("Store reviewed decisions as durable memory.");
    expect(demo).not.toMatch(ANSI);
    expect(demo).not.toContain("/home/");
    expect(demo).not.toContain("~/");
    expect(demo).not.toContain("~/.config");
    expect(demo).not.toMatch(/(?:API|TOKEN|SECRET|PASSWORD)_[A-Z0-9_]+\s*=/);
  });

  test("does not route public navigation into historical operator artifacts", () => {
    const index = read("docs/PUBLIC-DOCUMENTATION.md");
    expect(index).not.toContain("HANDOFF");
    expect(index).not.toContain("SPRINT-");
    expect(index).not.toContain("AUDIT-");
    expect(index).not.toContain("F10.0-");
  });
});
