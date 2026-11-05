#!/usr/bin/env bun
/**
 * cli/hermes-wire.ts — wire eBrain into Hermes Agent, and ask Hermes itself whether it took.
 *
 *   bun cli/hermes-wire.ts [--apply]
 *
 * Hermes keeps shell hooks in ~/.hermes/config.yaml (`hooks.pre_tool_call`) and loads memory providers from
 * ~/.hermes/plugins/<name>. Three rules, same as the JSON agents:
 *  - never rewrite a YAML file we do not own: the hook block is appended only when the file has no `hooks:` key;
 *    otherwise the exact lines to add are printed and the check stays red;
 *  - the provider is switched on with Hermes' own `hermes config set`, which writes its config its own way;
 *  - the verdict is Hermes': `hermes hooks list` must show the guard, with its consent status.
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveEbrainHome } from "./ebrain-home.ts";

const HOME = process.env.HOME || homedir();
const HERMES_HOME = process.env.HERMES_HOME || join(HOME, ".hermes");
const CONFIG = join(HERMES_HOME, "config.yaml");
const PLUGIN_DIR = join(HERMES_HOME, "plugins", "ebrain");
const GUARD = join(HERMES_HOME, "hooks", "ebrain-guard.sh");
const SRC = (home: string) => join(home, "harness", "adapters", "hermes", "plugin");

export const hookBlock = (command: string): string =>
  `hooks:\n  pre_tool_call:\n    - command: "bash ${command}"\n      timeout: 8\n`;

export type HooksState = "present" | "absent-key" | "other-hooks";

/** Is our guard in the file's `hooks.pre_tool_call`, is the key missing, or does the user have hooks of their own? */
export function hooksState(yamlText: string, command: string): HooksState {
  let doc: any;
  try { doc = (Bun as any).YAML.parse(yamlText); } catch { return "other-hooks"; }
  const hooks = doc?.hooks;
  if (hooks == null) return "absent-key";
  const list = Array.isArray(hooks?.pre_tool_call) ? hooks.pre_tool_call : [];
  return list.some((h: any) => typeof h?.command === "string" && h.command.includes(command)) ? "present" : "other-hooks";
}

function hermes(args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("hermes", args, { encoding: "utf8", timeout: 30000, env: { ...process.env, HERMES_HOME } });
  if (r.error) return { ok: false, out: "hermes is not on PATH" };
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function installPlugin(ebrainHome: string): void {
  mkdirSync(PLUGIN_DIR, { recursive: true });
  for (const f of readdirSync(SRC(ebrainHome))) {
    if (f.startsWith("__pycache__")) continue;
    const text = readFileSync(join(SRC(ebrainHome), f), "utf8").replaceAll("__EBRAIN_HOME__", ebrainHome);
    writeFileSync(join(PLUGIN_DIR, f), text);
  }
}

function main(): void {
  if (!process.env.HOME || !process.env.HOME.startsWith("/")) {
    console.error(`HOME is empty or not an absolute path ('${process.env.HOME ?? ""}'); refusing to touch any agent config`);
    process.exit(2);
  }
  const apply = process.argv.includes("--apply");
  const ebrainHome = resolveEbrainHome();
  let red = false;
  const say = (m: string) => console.log(`  ${m}`);

  if (apply) {
    installPlugin(ebrainHome);
    say(`plugin ✓ ${PLUGIN_DIR}`);
  } else if (!existsSync(join(PLUGIN_DIR, "__init__.py"))) {
    say(`plugin ✗ ${PLUGIN_DIR} missing — run 'ebrain harness install hermes'`);
    red = true;
  } else say(`plugin ✓ ${PLUGIN_DIR}`);

  // hook block
  const text = existsSync(CONFIG) ? readFileSync(CONFIG, "utf8") : "";
  let state = hooksState(text, GUARD);
  if (apply && state === "absent-key") {
    if (existsSync(CONFIG) && !existsSync(`${CONFIG}.ebrain-backup`)) copyFileSync(CONFIG, `${CONFIG}.ebrain-backup`);
    mkdirSync(dirname(CONFIG), { recursive: true });
    appendFileSync(CONFIG, `${text && !text.endsWith("\n") ? "\n" : ""}${hookBlock(GUARD)}`);
    state = hooksState(readFileSync(CONFIG, "utf8"), GUARD);
    say(`hook ✓ guard WIRED into ${CONFIG}`);
  } else if (state === "present") say(`hook ✓ guard wired in ${CONFIG}`);
  else if (state === "absent-key") { say(`hook ✗ guard not wired — run 'ebrain harness install hermes'`); red = true; }
  else { say(`hook ✗ ${CONFIG} already has hooks of its own; add this under hooks.pre_tool_call:\n${hookBlock(GUARD).split("\n").slice(2).map((l) => `      ${l}`).join("\n")}`); red = true; }

  // memory provider
  let doc: any = {};
  try { doc = (Bun as any).YAML.parse(text) ?? {}; } catch { /* reported above */ }
  if (doc?.memory?.provider === "ebrain") say("memory ✓ memory.provider is ebrain");
  else if (apply) {
    const r = hermes(["config", "set", "memory.provider", "ebrain"]);
    say(r.ok ? "memory ✓ memory.provider set to ebrain (hermes config set)" : `memory ⚠ run: hermes config set memory.provider ebrain  (${r.out.trim().split("\n")[0]})`);
    if (!r.ok) red = true;
  } else { say("memory ✗ memory.provider is not ebrain — run 'ebrain harness install hermes'"); red = true; }

  // Hermes' own verdict on the hook: does it load it, and is it consented?
  const listed = hermes(["hooks", "list"]);
  if (!listed.ok) say(`hermes ⚠ cannot ask Hermes (${listed.out.trim().split("\n")[0]}); the checks above read its config only`);
  else if (!listed.out.includes("ebrain-guard.sh")) { say("hermes ✗ `hermes hooks list` does not show the eBrain guard"); red = true; }
  else {
    say("hermes ✓ `hermes hooks list` shows the eBrain guard");
    if (/not allowlisted/i.test(listed.out)) {
      if (doc?.hooks_auto_accept === true) say("hermes · the guard is not allowlisted yet; hooks_auto_accept is true, so Hermes allowlists it on first use");
      else { say("hermes ✗ the guard is listed but not allowlisted, so Hermes will not run it: approve it on first use or set hooks_auto_accept: true"); red = true; }
    }
  }
  process.exit(red ? 1 : 0);
}

if (import.meta.main) main();
