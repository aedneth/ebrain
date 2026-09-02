/**
 * cli/config-bootstrap.ts — materialise the user config a fresh install needs.
 *
 * Why this exists. `routing.yaml` was read by four call sites and written by none. A clone that
 * had never been Eduardo's machine got `routing.yaml no existe en …` from `ebrain route`, a throw
 * from `ebrain profiles init`, and a `doctor` line that told the user `ebrain up` would create it
 * — which nothing did. The template shipped in the repo is the missing half of that sentence, and
 * this module is what makes the sentence true.
 *
 * Two rules shape it.
 *
 *  1. **Never overwrite.** The moment a config exists it belongs to the user, edits and all. A
 *     bootstrap that clobbers a tuned routing table on every `ebrain up` is worse than no
 *     bootstrap at all, so an existing file is reported as `kept` and left byte-for-byte alone.
 *  2. **Report what happened.** `created` and `kept` are different facts and the caller prints
 *     them differently: a first install should say where its new config landed, and a hundredth
 *     `ebrain up` should stay quiet.
 *
 * The copy is atomic (temp + rename) and lands at 0600 inside a 0700 directory, matching how
 * `profiles.ts` and the token store already treat everything under ~/.config/ebrain.
 */
import { existsSync, mkdirSync, chmodSync, copyFileSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveEbrainHome } from "./ebrain-home.ts";

export type BootstrapAction = "created" | "kept" | "template-missing";

export interface BootstrapItem {
  /** The file as the user knows it, e.g. "routing.yaml". */
  name: string;
  /** Absolute path in the user's config directory. */
  target: string;
  /** Absolute path of the shipped template it came from. */
  source: string;
  action: BootstrapAction;
  /** One line the caller can print verbatim. */
  detail: string;
}

interface DefaultSpec {
  name: string;
  /** Path of the template, relative to the checkout root. */
  template: string;
  /** What the file is for, in the first person plural the CLI already uses. */
  purpose: string;
}

/**
 * The configs an install is entitled to start with. Adding one here is the whole change: the plan,
 * the apply path and the `ebrain up` output all read from this list.
 */
export const CONFIG_DEFAULTS: readonly DefaultSpec[] = [
  {
    name: "routing.yaml",
    template: join("config", "routing.default.yaml"),
    purpose: "model routing, capability chains and the monthly spend cap",
  },
];

export interface BootstrapOptions {
  /** Defaults to ~/.config/ebrain. */
  configDir?: string;
  /** Defaults to the resolved checkout. */
  ebrainHome?: string;
}

function configDirOf(opts: BootstrapOptions): string {
  if (opts.configDir) return opts.configDir;
  const base = process.env.EBRAIN_CONFIG_DIR;
  if (base) return base;
  const xdg = process.env.XDG_CONFIG_HOME;
  return join(xdg || join(homedir(), ".config"), "ebrain");
}

/** What `materialiseDefaults` would do, without doing it. Used by the plan output and by tests. */
export function bootstrapPlan(opts: BootstrapOptions = {}): BootstrapItem[] {
  const configDir = configDirOf(opts);
  const home = opts.ebrainHome ?? resolveEbrainHome();
  return CONFIG_DEFAULTS.map((spec) => {
    const target = join(configDir, spec.name);
    const source = join(home, spec.template);
    if (existsSync(target)) {
      return { name: spec.name, target, source, action: "kept" as const, detail: `${spec.name} already exists — left untouched (${target})` };
    }
    if (!existsSync(source)) {
      // A checkout missing its own template is a packaging bug, not a user error. Say which file
      // is absent rather than failing `ebrain up` over a config the user never asked about.
      return { name: spec.name, target, source, action: "template-missing" as const, detail: `no template shipped at ${source} — ${spec.name} was not created` };
    }
    return { name: spec.name, target, source, action: "created" as const, detail: `created ${spec.name} from the shipped default — ${spec.purpose} (${target})` };
  });
}

/**
 * Create every default that is missing. Idempotent: a second call reports `kept` for everything
 * and writes nothing.
 */
export function materialiseDefaults(opts: BootstrapOptions = {}): BootstrapItem[] {
  const plan = bootstrapPlan(opts);
  const configDir = configDirOf(opts);
  const creating = plan.filter((item) => item.action === "created");
  if (creating.length > 0) {
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
    chmodSync(configDir, 0o700);
  }
  const applied: BootstrapItem[] = [];
  for (const item of plan) {
    if (item.action !== "created") { applied.push(item); continue; }
    const temp = `${item.target}.ebrain-tmp-${process.pid}`;
    try {
      copyFileSync(item.source, temp);
      chmodSync(temp, 0o600);
      // `renameSync` is the atomic step, but it would happily replace a file that appeared while
      // we were copying — two `ebrain up` runs racing, or the user writing their own. Re-check
      // and stand down; "never overwrite" has to hold under concurrency too, not just in the plan.
      if (existsSync(item.target)) {
        rmSync(temp, { force: true });
        applied.push({ ...item, action: "kept", detail: `${item.name} already exists — left untouched (${item.target})` });
        continue;
      }
      renameSync(temp, item.target);
      applied.push(item);
    } catch (error) {
      rmSync(temp, { force: true });
      throw new Error(`could not create ${item.target}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return applied;
}
