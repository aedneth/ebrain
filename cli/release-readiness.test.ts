import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("F11 release readiness preparation", () => {
  test("keeps maker preparation distinct from independent review and owner-controlled external actions", () => {
    const plan = read("docs/F11-RELEASE-GATE-PLAN.md");
    const packet = read("docs/F11-REVIEW-PACKET.md");
    const readiness = read("docs/release/open-source-readiness.md");
    const handoff = read("docs/HANDOFF-BACK.md");

    expect(plan).toContain("independent checker");
    expect(plan).toContain("not complete");
    expect(packet).toContain("required-checker: Opus");
    expect(packet).toContain("no verdict recorded");
    expect(packet).toContain("Do not push, deploy");
    expect(plan).toContain("6ab8023^..4d7bbe7");
    expect(packet).toContain("6ab8023^..4d7bbe7");
    expect(handoff).toContain("review-candidate: 6ab8023^..4d7bbe7");
    expect(readiness).toContain("Remaining release gates");
    expect(readiness).toContain("independent review");
    expect(readiness).toContain("explicit approval");
  });

  test("keeps the static docs build local and generated website state out of the candidate", () => {
    const ignored = read(".gitignore");
    const astroConfig = read("website/astro.config.mjs");
    const packageJson = read("package.json");
    const trackedGenerated = execFileSync("git", ["ls-files", "website/.astro", "website/dist"], { cwd: ROOT, encoding: "utf8" }).trim();

    expect(ignored).toContain("website/.astro/");
    expect(ignored).toContain("website/dist/");
    expect(astroConfig).toContain('output: "static"');
    expect(astroConfig).not.toContain("@astrojs/vercel");
    expect(packageJson).toContain('"website:build"');
    expect(existsSync(join(ROOT, "vercel.json"))).toBe(false);
    expect(trackedGenerated).toBe("");
  });

  test("classifies the documentation website as static and does not imply a deployment before one is verified", () => {
    const audit = read("docs/F10.0-PUBLIC-CLAIM-AUDIT.md");
    const readme = read("README.md");

    expect(audit).toContain("can be built locally");
    expect(audit).toContain("Do not link a live site");
    expect(readme).toContain("Build the static site locally");
    expect(readme).toContain("no server adapter, analytics, provider calls, or runtime credential requirement");
    expect(readme).not.toContain("https://ebrain.vercel.app");
  });
});
