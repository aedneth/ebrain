import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = join(import.meta.dir, "..");
const OFFICIAL_AGPL3_SHA256 = "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0";

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

describe("F10.1 root license and distribution metadata", () => {
  test("ships the exact GNU AGPL v3 text and AGPL-3.0-only package metadata", () => {
    const license = read("LICENSE");
    const packageJson = JSON.parse(read("package.json")) as { license?: string };
    expect(license).toStartWith("                    GNU AFFERO GENERAL PUBLIC LICENSE\n                       Version 3, 19 November 2007\n");
    expect(createHash("sha256").update(license).digest("hex")).toBe(OFFICIAL_AGPL3_SHA256);
    expect(packageJson.license).toBe("AGPL-3.0-only");
  });

  test("aligns root public metadata while preserving upstream attribution boundaries", () => {
    const readme = read("README.md");
    const contributing = read("CONTRIBUTING.md");
    const notices = read("THIRD_PARTY_NOTICES.md");
    expect(readme).toContain("License: AGPL-3.0-only");
    expect(readme).toContain("GNU AGPL v3.0 only");
    expect(readme).not.toContain("License: MIT");
    expect(contributing).toContain("GNU Affero General Public License v3.0 only");
    expect(notices).toContain("not a tracked subtree");
    expect(notices).toContain("gbrain");
    expect(notices).toContain("Zod");
    expect(notices).toMatch(/upstream MIT\s+License/);
    expect(notices).toContain("does not modify, replace, or relicense");
  });
});
