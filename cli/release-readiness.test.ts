import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("release readiness", () => {
  test("keeps the static docs build local and generated website state out of the tree", () => {
    const ignored = read(".gitignore");
    const astroConfig = read("website/astro.config.mjs");
    const packageJson = read("package.json");
    const trackedGenerated = execFileSync("git", ["ls-files", "website/.astro", "website/dist"], { cwd: ROOT, encoding: "utf8" }).trim();

    expect(ignored).toContain("website/.astro/");
    expect(ignored).toContain("website/dist/");
    expect(astroConfig).toContain('output: "static"');
    expect(astroConfig).not.toContain("@astrojs/vercel");
    expect(packageJson).toContain('"website:build"');
    expect(read("vercel.json")).toContain('"outputDirectory": "website/dist"');
    expect(trackedGenerated).toBe("");
  });

  test("describes the site as it is: static and credential-free, with its measurement disclosed", () => {
    // The claim that matters is symmetric. A README that overstated the build would be one defect;
    // a README that said "no analytics" while the hosted copy measures page traffic would be the
    // same defect pointing the other way.
    const readme = read("README.md");
    expect(readme).toContain("https://ebrain.vercel.app");
    expect(readme).toContain("no server adapter, no provider calls, and no runtime credential requirement");
    expect(readme).toContain("Core Web Vitals");
  });

  test("working material stays out of the public tree", () => {
    // Phase reports, decision records, handoffs and the operator's own agent instructions live in
    // docs/internal/, which is ignored. This asserts the boundary rather than trusting it: a file
    // moved back by accident is a file published by accident.
    const ignored = read(".gitignore");
    expect(ignored).toContain("/docs/internal/");

    const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
    expect(tracked).not.toContain("docs/internal/");
    for (const marker of ["docs/HANDOFF", "docs/SPRINT", "docs/AUDIT-", "docs/ULTRAPLAN", "-MAKER-REPORT"]) {
      expect(tracked).not.toContain(marker);
    }
  });
});
