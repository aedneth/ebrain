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
    // F11 keeps its immutable review packet, while the handoff tracks the live F12 candidate.
    expect(handoff).toContain("## Required checker audit");
    expect(handoff).toContain("Keep the PR as draft");
    expect(handoff).toContain("Do not merge, deploy");
    expect(handoff).toContain("independent Opus or Fable audit");
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
    // Hosting config exists as of the 2026-07-20 deployment; what must stay true is that generated
    // website state is never committed and the build stays static. See cli/website.test.ts.
    expect(read("vercel.json")).toContain('"outputDirectory": "website/dist"');
    expect(trackedGenerated).toBe("");
  });

  test("classifies the documentation website as static and does not imply a deployment before one is verified", () => {
    const audit = read("docs/F10.0-PUBLIC-CLAIM-AUDIT.md");
    const readme = read("README.md");

    // The site is live as of 2026-07-20, so the README may — and must — name it. The claim that
    // matters now is the opposite of the original one: the build is static and credential-free,
    // AND the hosted copy's measurement is disclosed rather than described as absent. A README
    // that still said "no analytics" would be the F-A2 defect again, in the other direction.
    expect(audit).toContain("can be built locally");
    expect(audit).toContain("https://ebrain.vercel.app");
    expect(readme).toContain("https://ebrain.vercel.app");
    expect(readme).toContain("no server adapter, no provider calls, and no runtime credential requirement");
    expect(readme).toContain("Core Web Vitals");
  });
});
