/**
 * cli/mcp-manifest.test.ts — onboarding driven by the adapter manifests.
 *
 * The property under test is the one U3 exists to establish: supporting a new agent CLI is a YAML
 * file, not an edit in four places. So the suite builds a fictitious adapter in a temp directory
 * and asserts it becomes fully onboardable — discovered, registered, verified and uninstallable —
 * without any code knowing its name.
 *
 * The rest pins the facts that were previously hardcoded, so a manifest edit that silently changes
 * how a real agent is registered fails here rather than on a user's machine.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  expandPath,
  fillArgs,
  findAgentSpec,
  mcpEntryFor,
  onboardableAgents,
  parseMcpBlock,
  readAgentMcpSpecs,
} from "./mcp-manifest.ts";

const REAL_ADAPTERS = join(import.meta.dir, "..", "harness", "adapters");
const temps: string[] = [];

function adapterDir(manifests: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ebrain-adapters-"));
  temps.push(dir);
  for (const [agent, yaml] of Object.entries(manifests)) {
    mkdirSync(join(dir, agent), { recursive: true });
    writeFileSync(join(dir, agent, "manifest.yaml"), yaml);
  }
  return dir;
}

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("a new agent is a YAML file", () => {
  const PI = `
agent: pi
class: light
mcp:
  register: "ebrain onboard pi"
  method: cli
  binary: pi
  add: ["mcp", "add", "{name}", "--", "{bridge}"]
  remove: ["mcp", "remove", "{name}"]
  config: ~/.pi/config.json
  format: json
  keys: [mcpServers]
`;

  test("is discovered, with its mechanism, without any code knowing its name", () => {
    const dir = adapterDir({ pi: PI });
    const spec = findAgentSpec("pi", dir, "/home/tester")!;
    expect(spec).not.toBeNull();
    expect(spec.method).toBe("cli");
    expect(spec.binary).toBe("pi");
    expect(spec.configPath).toBe("/home/tester/.pi/config.json");
    expect(onboardableAgents(readAgentMcpSpecs(dir, "/home/tester")).map((s) => s.agent)).toEqual(["pi"]);
  });

  test("its registration argv is built from the manifest", () => {
    const spec = findAgentSpec("pi", adapterDir({ pi: PI }), "/home/tester")!;
    expect(fillArgs(spec.addArgs, { name: "ebrain", bridge: "/opt/eBrain/scripts/ebrain-mcp-bridge" }))
      .toEqual(["mcp", "add", "ebrain", "--", "/opt/eBrain/scripts/ebrain-mcp-bridge"]);
  });

  test("a JSON-config agent declares where and in which shape", () => {
    const dir = adapterDir({
      nova: `
agent: nova
mcp:
  register: "ebrain onboard nova"
  method: json
  binary: nova
  config: ~/.config/nova/servers.json
  keys: [servers]
  entry: local-command
`,
    });
    const spec = findAgentSpec("nova", dir, "/home/tester")!;
    expect(spec.method).toBe("json");
    expect(spec.keys).toEqual(["servers"]);
    expect(spec.entryShape).toBe("local-command");
    expect(spec.configPath).toBe("/home/tester/.config/nova/servers.json");
  });
});

describe("parseMcpBlock", () => {
  test("no mcp block means no MCP surface, not a broken adapter", () => {
    expect(parseMcpBlock("x", { agent: "x" }).method).toBe("none");
    expect(parseMcpBlock("x", null).method).toBe("none");
  });

  test("an explicit method: none is honoured", () => {
    expect(parseMcpBlock("generic", { mcp: { register: null, method: "none" } }).method).toBe("none");
  });

  test("a manifest predating `method` still resolves to its real mechanism", () => {
    // Treating these as "none" on upgrade would silently unregister working agents.
    const cli = parseMcpBlock("old", { mcp: { register: "ebrain onboard old", add: ["mcp", "add", "{name}"] } });
    expect(cli.method).toBe("cli");
    const json = parseMcpBlock("old", { mcp: { register: "ebrain onboard old", config: "~/.old/mcp.json" } });
    expect(json.method).toBe("json");
    // Nothing to go on at all stays "none" rather than guessing a mechanism.
    expect(parseMcpBlock("old", { mcp: { register: "ebrain onboard old" } }).method).toBe("none");
  });

  test("defaults the server-map key to the format's convention", () => {
    expect(parseMcpBlock("a", { mcp: { method: "cli", format: "toml" } }).keys).toEqual(["mcp_servers"]);
    expect(parseMcpBlock("a", { mcp: { method: "cli" } }).keys).toEqual(["mcpServers"]);
  });

  test("malformed fields are dropped, not coerced", () => {
    const spec = parseMcpBlock("a", { mcp: { method: "cli", binary: 42, add: ["ok", 7], keys: "nope" } });
    expect(spec.binary).toBeNull();
    expect(spec.addArgs).toEqual([]); // a mixed array is not a valid argv
    expect(spec.keys).toEqual(["mcpServers"]);
  });
});

describe("placeholders", () => {
  test("only {name} and {bridge} are substituted", () => {
    // A manifest says WHICH arguments an agent wants, never how to compute them: there is no
    // expression language here for a malformed manifest to smuggle something through.
    expect(fillArgs(["{name}", "{bridge}", "{home}", "$HOME", "`id`"], { name: "ebrain", bridge: "/b" }))
      .toEqual(["ebrain", "/b", "{home}", "$HOME", "`id`"]);
  });

  test("expandPath handles ~ and $HOME only", () => {
    expect(expandPath("~/x", "/home/t")).toBe("/home/t/x");
    expect(expandPath("$HOME/x", "/home/t")).toBe("/home/t/x");
    expect(expandPath("/abs/x", "/home/t")).toBe("/abs/x");
    expect(expandPath("relative/x", "/home/t")).toBe("relative/x");
  });
});

describe("entry shapes", () => {
  test("command-args and local-command are written the way each agent expects", () => {
    const bridge = { command: "/opt/bridge", args: ["--stdio"] };
    expect(mcpEntryFor("command-args", bridge)).toEqual({ command: "/opt/bridge", args: ["--stdio"] });
    expect(mcpEntryFor("local-command", bridge)).toEqual({ type: "local", command: ["/opt/bridge", "--stdio"] });
  });
});

describe("the shipped adapters", () => {
  const specs = readAgentMcpSpecs(REAL_ADAPTERS, "/home/tester");

  test("every adapter declares a mechanism", () => {
    expect(specs.length).toBeGreaterThanOrEqual(6);
    for (const spec of specs) expect(["cli", "json", "none"]).toContain(spec.method);
  });

  test("the mechanisms match what onboarding previously hardcoded", () => {
    const by = Object.fromEntries(specs.map((spec) => [spec.agent, spec]));
    expect(by.claude!.method).toBe("cli");
    expect(by.codex!.method).toBe("cli");
    expect(by.gemini!.method).toBe("cli");
    expect(by.cursor!.method).toBe("json");
    expect(by.opencode!.method).toBe("json");
    expect(by.generic!.method).toBe("none");
    // Cursor's binary is `agent`, not `cursor` — the probe would silently skip it otherwise.
    expect(by.cursor!.binary).toBe("agent");
    // Codex keeps its servers in TOML under a different key.
    expect(by.codex!.format).toBe("toml");
    expect(by.codex!.keys).toEqual(["mcp_servers"]);
    // OpenCode's schema rejects a string `instructions`, taking our server down with it.
    expect(by.opencode!.repairs).toContain("instructions-array");
  });

  test("every onboardable adapter can also be verified and undone", () => {
    // An uninstall that knows less than the install leaves things behind.
    for (const spec of onboardableAgents(specs)) {
      expect(spec.configPath).not.toBeNull();
      if (spec.method === "cli") {
        expect(spec.binary).not.toBeNull();
        expect(spec.removeArgs.length).toBeGreaterThan(0);
      }
    }
  });
});
