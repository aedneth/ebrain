/** An install-class command with HOME empty or unset must fail instead of resolving to the real home. */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
function run(cmd: string[], vars: Record<string, string>) {
  const r = Bun.spawnSync(cmd, { env: { PATH: process.env.PATH ?? "", ...vars }, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, err: r.stderr.toString() };
}
describe("HOME guard", () => {
  for (const [label, vars] of [["empty", { HOME: "" }], ["relative", { HOME: "rel" }], ["unset", {}]] as const) {
    test(`ebrain harness install refuses a ${label} HOME`, () => {
      const r = run(["bash", join(ROOT, "cli/ebrain"), "harness", "install", "antigravity"], vars);
      expect(r.code).not.toBe(0);
      expect(r.err).toMatch(/HOME/);
    });
    test(`the core installer, the wirers and the public installer refuse a ${label} HOME`, () => {
      expect(run(["bash", join(ROOT, "harness/core/install.sh"), "antigravity"], vars).code).not.toBe(0);
      expect(run(["bun", join(ROOT, "cli/hooks-wire.ts"), "antigravity", "--apply"], vars).code).not.toBe(0);
      expect(run(["bun", join(ROOT, "cli/hermes-wire.ts"), "--apply"], vars).code).not.toBe(0);
      expect(run(["sh", join(ROOT, "scripts/install.sh"), "--from-source"], vars).code).not.toBe(0);
    });
  }
});
