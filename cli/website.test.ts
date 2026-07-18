import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { DOC_SECTIONS, ORDERED_DOCS, REPOSITORY_URL, SOCIAL_LINKS, docRoute } from "../website/src/lib/navigation.ts";

const ROOT = join(import.meta.dir, "..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("F10.3 static documentation website contract", () => {
  test("maps every navigation entry to one allowlisted public Markdown source and public route", () => {
    const publicIndex = read("docs/PUBLIC-DOCUMENTATION.md");
    const ids = ORDERED_DOCS.map((doc) => doc.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(DOC_SECTIONS.length).toBeGreaterThan(1);
    for (const doc of ORDERED_DOCS) {
      expect(existsSync(join(ROOT, "docs", `${doc.id}.md`))).toBe(true);
      expect(publicIndex).toContain(`(${doc.id}.md)`);
      expect(docRoute(doc.id)).toBe(`/docs/${doc.id}/`);
    }
  });

  test("keeps the website static, source-rooted, and free of deployment adapters", () => {
    const config = read("website/astro.config.mjs");
    const content = read("website/src/content.config.ts");
    const packageJson = read("website/package.json");

    expect(config).toContain('output: "static"');
    expect(config).not.toContain("@astrojs/vercel");
    expect(content).toContain('base: new URL("../../docs/", import.meta.url)');
    expect(content).toContain('"release/**/*.md"');
    expect(content).not.toContain("HANDOFF");
    expect(content).not.toContain("AUDIT-");
    expect(packageJson).toContain('"private": true');
    expect(packageJson).not.toContain("@astrojs/vercel");
    expect(existsSync(join(ROOT, "vercel.json"))).toBe(false);
  });

  test("uses repository-owned social destinations and locally synchronised visual assets", () => {
    expect(REPOSITORY_URL).toBe("https://github.com/aedneth/ebrain");
    expect(SOCIAL_LINKS.x).toBe("https://x.com/aedneth");
    expect(SOCIAL_LINKS.linkedin).toBe("https://www.linkedin.com/in/eduardo-borjas/");

    for (const asset of [
      "website/public/assets/ebrain-wordmark.svg",
      "website/public/assets/ebrain-tui-demo.svg",
      "website/public/icons/github.svg",
      "website/public/icons/x.svg",
      "website/public/icons/search.svg",
    ]) {
      expect(existsSync(join(ROOT, asset))).toBe(true);
    }
  });
});
