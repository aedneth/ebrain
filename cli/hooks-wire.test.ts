/**
 * cli/hooks-wire.test.ts — wiring hooks into a config file eBrain does not own.
 *
 * The gap being closed is a security one: the secret guard was written to disk and then left
 * unwired behind a manual JSON edit, in a state indistinguishable from a working install after the
 * first scroll. Writing into someone's config is the right fix and also the dangerous one, so the
 * tests here are mostly about restraint — other people's hooks survive, ours are never duplicated,
 * and an unparseable file is reported rather than replaced.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  hookCommand,
  mergeHookConfig,
  parseHooksBlock,
  readJson,
  wireAgent,
  wrapperSpellings,
  writeJson,
  type HooksSpec,
} from "./hooks-wire.ts";

const temps: string[] = [];
function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "ebrain-hooks-"));
  temps.push(dir);
  return dir;
}
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const NESTED: HooksSpec = {
  agent: "claude",
  format: "claude-json",
  configPath: null,
  hooksDir: "/home/t/.claude/hooks",
  events: { pre_tool_use: "PreToolUse" },
  root: "hooks",
  wrappers: [{ file: "guard.sh", core: "guard-secrets.sh", event: "pre_tool_use", matcher: "Bash" }],
};

const FLAT: HooksSpec = {
  ...NESTED,
  agent: "codex",
  root: null,
  events: { pre_tool_use: "pre_tool_use", stop: "subagent_stop" },
  wrappers: [
    { file: "guard.sh", core: "guard-secrets.sh", event: "pre_tool_use", matcher: "" },
    { file: "log.sh", core: "log-session.sh", event: "stop", matcher: "" },
  ],
};

describe("mergeHookConfig", () => {
  test("wires a hook into an empty config, under the nesting the manifest declares", () => {
    const { next, added } = mergeHookConfig({}, NESTED);
    expect(added).toEqual(["guard.sh"]);
    expect(next).toEqual({
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "bash /home/t/.claude/hooks/guard.sh" }] }],
      },
    });
  });

  test("puts events at the root when no nesting key is declared", () => {
    const { next, added } = mergeHookConfig({}, FLAT);
    expect(added).toEqual(["guard.sh", "log.sh"]);
    expect(Object.keys(next).sort()).toEqual(["pre_tool_use", "subagent_stop"]);
  });

  test("never disturbs hooks that are not ours", () => {
    const mine = { matcher: "Write", hooks: [{ type: "command", command: "/usr/local/bin/my-own-hook" }] };
    const current = { hooks: { PreToolUse: [mine], SessionStart: [mine] }, theme: "dark" };
    const { next } = mergeHookConfig(current, NESTED);
    const hooks = next.hooks as Record<string, unknown[]>;
    expect(hooks.PreToolUse[0]).toEqual(mine);   // still first, untouched
    expect(hooks.PreToolUse).toHaveLength(2);
    expect(hooks.SessionStart).toEqual([mine]);  // an event we never mention is left alone
    expect(next.theme).toBe("dark");             // and so is everything else in the file
  });

  test("is idempotent", () => {
    const once = mergeHookConfig({}, NESTED);
    const twice = mergeHookConfig(once.next, NESTED);
    expect(twice.added).toEqual([]);
    expect(twice.present).toEqual(["guard.sh"]);
    expect(twice.next).toEqual(once.next);
  });

  test("recognises a hook the user wired themselves, however they spelled the command", () => {
    // Matching on the exact command string would append a second invocation of the same guard on
    // every install, and the user would run it twice per tool call.
    for (const command of [
      "/home/t/.claude/hooks/guard.sh",
      "bash /home/t/.claude/hooks/guard.sh",
      "sh -c '/home/t/.claude/hooks/guard.sh --verbose'",
    ]) {
      const current = { hooks: { PreToolUse: [{ matcher: "", hooks: [{ type: "command", command }] }] } };
      const { added, present } = mergeHookConfig(current, NESTED);
      expect(added).toEqual([]);
      expect(present).toEqual(["guard.sh"]);
    }
  });

  test("recognises a hook the user wired by a home-relative path, too", () => {
    // Hook commands run through a shell, so `~/…` and `$HOME/…` are working hooks. Calling them
    // "not wired" would append the expanded path next to them on every install.
    for (const command of [
      "~/.claude/hooks/guard.sh",
      "bash $HOME/.claude/hooks/guard.sh",
      "${HOME}/.claude/hooks/guard.sh --verbose",
    ]) {
      const current = { hooks: { PreToolUse: [{ matcher: "", hooks: [{ type: "command", command }] }] } };
      const { added, present } = mergeHookConfig(current, NESTED, "/home/t");
      expect(added).toEqual([]);
      expect(present).toEqual(["guard.sh"]);
    }
    // The same spelling under a different home names a different file.
    const elsewhere = { hooks: { PreToolUse: [{ matcher: "", hooks: [{ type: "command", command: "~/.claude/hooks/guard.sh" }] }] } };
    expect(mergeHookConfig(elsewhere, NESTED, "/home/someone-else").added).toEqual(["guard.sh"]);
  });

  test("wrapperSpellings offers home-relative forms only for a path under that home", () => {
    expect(wrapperSpellings("/home/t/.claude/hooks/guard.sh", "/home/t/")).toEqual([
      "/home/t/.claude/hooks/guard.sh",
      "~/.claude/hooks/guard.sh",
      "$HOME/.claude/hooks/guard.sh",
      "${HOME}/.claude/hooks/guard.sh",
    ]);
    expect(wrapperSpellings("/opt/hooks/guard.sh", "/home/t")).toEqual(["/opt/hooks/guard.sh"]);
    // `/home/tt` is not under `/home/t`: a prefix match on the string would say it was.
    expect(wrapperSpellings("/home/tt/hooks/guard.sh", "/home/t")).toEqual(["/home/tt/hooks/guard.sh"]);
  });

  test("a wrapper with no runtime event is reported, not invented", () => {
    // The generic adapter's `manual` and `git-post-commit` wrappers are invoked directly; there is
    // no event to wire them to, and inventing one would put a hook where nothing fires it.
    const spec: HooksSpec = { ...FLAT, events: {}, wrappers: [{ file: "x.sh", core: "c.sh", event: "manual", matcher: "" }] };
    const { added, unmapped, next } = mergeHookConfig({}, spec);
    expect(added).toEqual([]);
    expect(unmapped).toEqual(["x.sh"]);
    expect(next).toEqual({});
  });

  test("a malformed event value is replaced rather than crashing on it", () => {
    const { next, added } = mergeHookConfig({ hooks: { PreToolUse: "not-an-array" } }, NESTED);
    expect(added).toEqual(["guard.sh"]);
    expect(Array.isArray((next.hooks as Record<string, unknown>).PreToolUse)).toBe(true);
  });
});

describe("parseHooksBlock", () => {
  test("reads the block a real manifest declares", () => {
    const spec = parseHooksBlock("claude", {
      hooks: {
        config: "~/.claude/settings.json",
        format: "claude-json",
        root: "hooks",
        dir: "~/.claude/hooks",
        events: { pre_tool_use: "PreToolUse" },
        wrappers: [{ file: "g.sh", core: "guard-secrets.sh", event: "pre_tool_use", matcher: "Bash" }],
      },
    }, "/home/t");
    expect(spec.configPath).toBe("/home/t/.claude/settings.json");
    expect(spec.hooksDir).toBe("/home/t/.claude/hooks");
    expect(spec.root).toBe("hooks");
    expect(spec.wrappers[0]!.matcher).toBe("Bash");
  });

  test("a no-hook adapter is 'none', and an unknown format is not guessed at", () => {
    expect(parseHooksBlock("cursor", { hooks: { config: null, format: "none" } }).format).toBe("none");
    expect(parseHooksBlock("x", { hooks: { format: "some-future-format", config: "~/x" } }).format).toBe("none");
    expect(parseHooksBlock("x", {}).format).toBe("none");
  });

  test("a matcher defaults to every tool call", () => {
    const spec = parseHooksBlock("x", {
      hooks: { format: "claude-json", dir: "~/h", events: { e: "E" }, wrappers: [{ file: "a.sh", core: "c.sh", event: "e" }] },
    }, "/home/t");
    expect(spec.wrappers[0]!.matcher).toBe("");
  });
});

describe("wireAgent", () => {
  test("applies, backs up once, and is idempotent on disk", () => {
    const dir = sandbox();
    const config = join(dir, "settings.json");
    writeFileSync(config, JSON.stringify({ theme: "dark" }, null, 2));
    const spec = { ...NESTED, configPath: config, hooksDir: join(dir, "hooks") };

    const first = wireAgent(spec, true);
    expect(first.applied).toBe(true);
    expect(first.added).toEqual(["guard.sh"]);
    expect(existsSync(`${config}.ebrain-backup`)).toBe(true);
    expect(JSON.parse(readFileSync(`${config}.ebrain-backup`, "utf8"))).toEqual({ theme: "dark" });

    const second = wireAgent(spec, true);
    expect(second.applied).toBe(false);
    expect(second.present).toEqual(["guard.sh"]);
    // The backup must still be the ORIGINAL, not a copy of our own first write.
    expect(JSON.parse(readFileSync(`${config}.ebrain-backup`, "utf8"))).toEqual({ theme: "dark" });
  });

  test("without --apply it reports and changes nothing", () => {
    const dir = sandbox();
    const config = join(dir, "settings.json");
    writeFileSync(config, "{}");
    const report = wireAgent({ ...NESTED, configPath: config, hooksDir: join(dir, "hooks") }, false);
    expect(report.applied).toBe(false);
    expect(report.added).toEqual(["guard.sh"]);
    expect(readFileSync(config, "utf8")).toBe("{}");
  });

  test("an unparseable config is reported, never replaced", () => {
    const dir = sandbox();
    const config = join(dir, "settings.json");
    writeFileSync(config, "{ this is not json");
    const report = wireAgent({ ...NESTED, configPath: config, hooksDir: join(dir, "hooks") }, true);
    expect(report.error).toBeDefined();
    expect(report.applied).toBe(false);
    expect(readFileSync(config, "utf8")).toBe("{ this is not json");
  });

  test("a JSON array is refused — it is not a config object", () => {
    const dir = sandbox();
    const config = join(dir, "settings.json");
    writeFileSync(config, "[1,2,3]");
    const report = wireAgent({ ...NESTED, configPath: config, hooksDir: join(dir, "hooks") }, true);
    expect(report.error).toContain("not a JSON object");
    expect(readFileSync(config, "utf8")).toBe("[1,2,3]");
  });
});

describe("writeJson", () => {
  test("writes through a symlink rather than replacing it", () => {
    // Plenty of people keep these configs linked into a dotfiles repo; replacing the link would
    // silently detach them from their own config.
    const dir = sandbox();
    const real = join(dir, "real.json");
    const link = join(dir, "link.json");
    writeFileSync(real, JSON.stringify({ a: 1 }));
    symlinkSync(real, link);

    writeJson(link, { a: 2 });

    expect(JSON.parse(readFileSync(real, "utf8"))).toEqual({ a: 2 });
    expect(readJson(link)).toEqual({ a: 2 });
  });

  test("creates the directory when the config does not exist yet", () => {
    const dir = sandbox();
    const config = join(dir, "nested", "deeper", "settings.json");
    writeJson(config, { ok: true });
    expect(readJson(config)).toEqual({ ok: true });
  });
});

describe("hookCommand", () => {
  test("runs the wrapper through bash, so a lost exec bit does not disable the guard", () => {
    expect(hookCommand("/h/guard.sh")).toBe("bash /h/guard.sh");
  });
});
