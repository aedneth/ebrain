/**
 * cli/providers.ts — the provider registry.
 *
 * eBrain makes exactly one LLM HTTP call in the whole repo (`cli/route.ts`), and it speaks the
 * OpenAI-compatible `/chat/completions` shape. That is a much better position than it looked from
 * the outside: there is no vendor SDK to unpick, so supporting another provider is a question of
 * *configuration*, not of code. What actually blocked it was that the endpoint, the key NAME, the
 * request extras and the cost-reporting behaviour were spelled out inline for one provider.
 *
 * This module turns those four things into data. A descriptor answers, for one provider:
 *   - where to POST and which env var NAMES hold the credential,
 *   - whether the endpoint reports real USD per request, and where in the body it appears,
 *   - whether it does model failover itself when handed an array,
 *   - which non-standard request keys it understands.
 *
 * Everything here is a DEFAULT, not a constraint. `routing.yaml` may override `base_url` and
 * `key_env` for any provider, and an id that is not in this registry is still usable as long as
 * the config supplies those two — the registry then simply has nothing to add. That matters:
 * OpenAI-compatible gateways are written faster than any list can track them, and eBrain must
 * never be the reason a working endpoint cannot be used.
 *
 * No value in this file is a secret. Credentials appear only as env var NAMES.
 */
import { readFileSync } from "node:fs";

/** How trustworthy the spend number for this provider is. */
export type Metering =
  /** The response body carries real USD for the request. `ebrain cost` is exact. */
  | "reported"
  /** Tokens come back but no price. Spend is estimated from a conservative rate. */
  | "estimated"
  /** Runs locally; there is no per-request charge to meter. */
  | "local";

export interface ProviderDescriptor {
  id: string;
  label: string;
  /** OpenAI-compatible API root. The chat path is appended to it. */
  base_url: string;
  /** Env var NAMES that may hold the credential, best first. Empty for local servers. */
  key_env: string[];
  /** Appended to `base_url` for a completion. Universally `/chat/completions` so far. */
  chat_path: string;
  metering: Metering;
  /** Dotted path to real USD in the response body, when `metering` is "reported". */
  cost_path: string[] | null;
  /**
   * Whether the endpoint accepts `models: [...]` and performs the failover itself. When false,
   * eBrain walks the chain locally instead of handing the whole array over.
   */
  server_side_failover: boolean;
  /** Request-body keys beyond the OpenAI spec that this provider understands. */
  extra_body_keys: readonly string[];
  /** The memory engine's recipe id, when the engine can also drive this provider. */
  engine_recipe: string | null;
  /** Literal headers the endpoint wants. Never a credential. */
  headers?: Readonly<Record<string, string>>;
}

const OPENAI_COMPATIBLE = {
  chat_path: "/chat/completions",
  cost_path: null,
  server_side_failover: false,
  extra_body_keys: [] as const,
} satisfies Partial<ProviderDescriptor>;

/**
 * Known providers. Adding one is a data change: append a descriptor and it is immediately
 * selectable from `routing.yaml`, visible in `ebrain providers list`, and attributable in
 * `ebrain cost`.
 *
 * `engine_recipe` records the second, separate question — whether the *memory engine* (embedding
 * and extraction) can also use this provider, which depends on a recipe existing upstream. A
 * provider can be perfectly usable for routing while `engine_recipe` is null; the two lanes are
 * independent and `ebrain providers list` shows both columns so the difference is never a surprise.
 */
export const PROVIDERS: readonly ProviderDescriptor[] = [
  {
    ...OPENAI_COMPATIBLE,
    id: "openrouter",
    label: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    key_env: ["OPENROUTER_API_KEY"],
    // Returns real USD in `usage.cost`, but only when the request opts in with
    // `usage: {include: true}`. `route.ts` sets that for any provider whose cost_path is set.
    metering: "reported",
    cost_path: ["usage", "cost"],
    server_side_failover: true,
    extra_body_keys: ["provider", "transforms", "route"],
    engine_recipe: "openrouter",
    headers: { "HTTP-Referer": "https://github.com/aedneth/ebrain", "X-Title": "ebrain-route" },
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "openai",
    label: "OpenAI",
    base_url: "https://api.openai.com/v1",
    key_env: ["OPENAI_API_KEY"],
    metering: "estimated",
    engine_recipe: "openai",
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "anthropic",
    label: "Anthropic",
    base_url: "https://api.anthropic.com/v1",
    key_env: ["ANTHROPIC_API_KEY"],
    metering: "estimated",
    engine_recipe: "anthropic",
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "google",
    label: "Google Gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    key_env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    metering: "estimated",
    engine_recipe: "google",
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "groq",
    label: "Groq",
    base_url: "https://api.groq.com/openai/v1",
    key_env: ["GROQ_API_KEY"],
    metering: "estimated",
    engine_recipe: "groq",
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "deepseek",
    label: "DeepSeek",
    base_url: "https://api.deepseek.com/v1",
    key_env: ["DEEPSEEK_API_KEY"],
    metering: "estimated",
    engine_recipe: "deepseek",
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "mistral",
    label: "Mistral",
    base_url: "https://api.mistral.ai/v1",
    key_env: ["MISTRAL_API_KEY"],
    metering: "estimated",
    // No engine recipe upstream: usable for routing today, not yet for the memory engine.
    engine_recipe: null,
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "xai",
    label: "xAI",
    base_url: "https://api.x.ai/v1",
    key_env: ["XAI_API_KEY"],
    metering: "estimated",
    engine_recipe: null,
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "together",
    label: "Together AI",
    base_url: "https://api.together.xyz/v1",
    key_env: ["TOGETHER_API_KEY"],
    metering: "estimated",
    engine_recipe: "together",
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "dashscope",
    label: "Alibaba DashScope",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    key_env: ["DASHSCOPE_API_KEY"],
    metering: "estimated",
    engine_recipe: "dashscope",
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "zhipu",
    label: "Zhipu AI",
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    key_env: ["ZHIPUAI_API_KEY"],
    metering: "estimated",
    engine_recipe: "zhipu",
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "minimax",
    label: "MiniMax",
    base_url: "https://api.minimax.chat/v1",
    key_env: ["MINIMAX_API_KEY"],
    metering: "estimated",
    engine_recipe: "minimax",
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "litellm-proxy",
    label: "LiteLLM proxy",
    // A self-hosted gateway in front of anything. The default assumes the standard local port;
    // override `base_url` to point at wherever yours runs.
    base_url: "http://127.0.0.1:4000/v1",
    key_env: ["LITELLM_API_KEY"],
    metering: "estimated",
    engine_recipe: "litellm-proxy",
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "ollama",
    label: "Ollama (local)",
    base_url: "http://127.0.0.1:11434/v1",
    key_env: [],
    metering: "local",
    engine_recipe: "ollama",
  },
  {
    ...OPENAI_COMPATIBLE,
    id: "llama-server",
    label: "llama.cpp server (local)",
    base_url: "http://127.0.0.1:8080/v1",
    key_env: [],
    metering: "local",
    engine_recipe: "llama-server",
  },
];

const BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

/** A provider id is a lowercase slug. The same shape the adapter and profile ids already use. */
export const PROVIDER_ID = /^[a-z][a-z0-9-]{0,63}$/;

export function isValidProviderId(id: unknown): id is string {
  return typeof id === "string" && PROVIDER_ID.test(id);
}

/** The descriptor for a known id, or null. An unknown-but-valid id is not an error — see below. */
export function findProvider(id: string): ProviderDescriptor | null {
  return BY_ID.get(id) ?? null;
}

export function providerIds(): string[] {
  return PROVIDERS.map((provider) => provider.id);
}

/**
 * The descriptor eBrain will actually use, after config overrides.
 *
 * An id with no descriptor is deliberately allowed: any OpenAI-compatible endpoint works, and new
 * gateways appear faster than this registry can track them. The cost of that permissiveness is
 * that eBrain knows nothing about the endpoint, so it must be told where to POST and which env
 * var holds the key — which is exactly what `requiredOverrides` reports back to the caller.
 */
export function resolveProvider(
  id: string,
  overrides: { base_url?: string; key_env?: string } = {},
): { provider: ProviderDescriptor; known: boolean; missing: string[] } {
  const known = findProvider(id);
  const base_url = overrides.base_url ?? known?.base_url ?? "";
  const key_env = overrides.key_env ?? known?.key_env[0] ?? "";
  const missing: string[] = [];
  if (!base_url) missing.push("base_url");
  // A local server legitimately needs no credential; only demand one when the registry does not
  // already say this provider runs without keys.
  if (!key_env && known?.metering !== "local") missing.push("key_env");
  return {
    provider: {
      ...(known ?? {
        ...OPENAI_COMPATIBLE,
        id,
        label: id,
        base_url: "",
        key_env: [],
        metering: "estimated" as const,
        engine_recipe: null,
      }),
      id,
      base_url,
      key_env: key_env ? [key_env] : (known?.key_env ?? []),
    },
    known: known !== null,
    missing,
  };
}

/** The full endpoint a completion is POSTed to. */
export function completionsUrl(provider: Pick<ProviderDescriptor, "base_url" | "chat_path">): string {
  return `${provider.base_url.replace(/\/+$/, "")}${provider.chat_path}`;
}

/** Read a dotted path out of a response body without trusting any level of it. */
export function readCost(body: unknown, path: readonly string[] | null): number | null {
  if (!path || path.length === 0) return null;
  let cursor: unknown = body;
  for (const key of path) {
    if (typeof cursor !== "object" || cursor === null || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "number" && Number.isFinite(cursor) && cursor >= 0 ? cursor : null;
}

/**
 * Whether eBrain can meter this provider exactly. `ebrain cost` uses this to label a lane rather
 * than quietly presenting an estimate as though it were a bill.
 */
export function providerStatusFor(id: string): "metered" | "estimated" | "local" | "untracked" {
  const provider = findProvider(id);
  if (!provider) return "untracked";
  if (provider.metering === "reported") return "metered";
  return provider.metering;
}

/**
 * One row per provider, for `ebrain providers list`.
 *
 * `credential` is a BOOLEAN. Whether a key is configured is exactly the fact a user needs; the
 * value is not, and this row is printed, logged and piped into JSON. It is never read here.
 */
export interface ProviderRow {
  id: string;
  label: string;
  base_url: string;
  key_env: string | null;
  credential: "present" | "missing" | "not-required";
  routing: true;
  memory_engine: boolean;
  metering: Metering;
}

/**
 * Which credential NAMES are configured, as a set of names — never values.
 *
 * The process environment is only half the answer. eBrain keeps provider keys in the config
 * dotenv, and the CLI dispatcher runs from a neutral working directory precisely so a stray
 * `.env` belonging to some other project cannot be auto-loaded. The cost of that correct choice
 * is that a bare `ebrain providers list` saw an empty environment and reported every key missing.
 *
 * So presence is answered from both places. The dotenv is scanned for a non-empty assignment to
 * the NAME and nothing else: the value is never parsed out, never returned, never printed. This
 * is the same question `doctor` already answers the same way.
 */
export function configuredKeyNames(
  env: NodeJS.ProcessEnv = process.env,
  dotenvPath?: string,
): Set<string> {
  const present = new Set<string>();
  for (const provider of PROVIDERS) {
    for (const name of provider.key_env) {
      if ((env[name] ?? "").length > 0) present.add(name);
    }
  }
  const path = dotenvPath ?? `${env.XDG_CONFIG_HOME || `${env.HOME ?? ""}/.config`}/ebrain/.env`;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return present;
  }
  const wanted = new Set(PROVIDERS.flatMap((provider) => provider.key_env));
  for (const line of text.split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, name, rest] = match;
    if (!wanted.has(name!)) continue;
    // Presence only: is there anything after the '=' once quotes and comments are set aside.
    const value = rest!.trim().replace(/^(['"])(.*)\1\s*$/, "$2");
    if (value.length > 0 && !value.startsWith("#")) present.add(name!);
  }
  return present;
}

export function providerRows(env: NodeJS.ProcessEnv = process.env, configured?: Set<string>): ProviderRow[] {
  const present = configured ?? configuredKeyNames(env);
  return PROVIDERS.map((provider) => {
    const name = provider.key_env.find((candidate) => present.has(candidate)) ?? provider.key_env[0] ?? null;
    const credential = provider.key_env.length === 0
      ? ("not-required" as const)
      : provider.key_env.some((candidate) => present.has(candidate))
        ? ("present" as const)
        : ("missing" as const);
    return {
      id: provider.id,
      label: provider.label,
      base_url: provider.base_url,
      key_env: name,
      credential,
      // Every descriptor here speaks the OpenAI-compatible shape `route.ts` uses, so all of them
      // work for routing. The memory engine is the narrower lane: it needs a recipe upstream.
      routing: true,
      memory_engine: provider.engine_recipe !== null,
      metering: provider.metering,
    };
  });
}

function printRows(rows: ProviderRow[]): void {
  const mark = (value: boolean) => (value ? "yes" : "no ");
  const credential = { present: "set     ", missing: "not set ", "not-required": "n/a     " };
  console.log("  provider        routing  memory  credential  endpoint");
  for (const row of rows) {
    console.log(
      `  ${row.id.padEnd(15)} ${mark(row.routing)}      ${mark(row.memory_engine)}     ${credential[row.credential]}    ${row.base_url}`,
    );
  }
  console.log("\n  routing     = usable by 'ebrain route' today (any OpenAI-compatible endpoint is)");
  console.log("  memory      = the memory engine can also embed and extract with it");
  console.log("  credential  = whether the environment variable is set. The value is never read here.");
  console.log("\n  Any endpoint not listed still works: set provider.id, base_url and key_env in routing.yaml.");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const command = argv.find((arg) => !arg.startsWith("--")) ?? "list";

  if (command === "list") {
    const rows = providerRows();
    if (json) console.log(JSON.stringify({ schema_version: 1, providers: rows }, null, 2));
    else printRows(rows);
    return;
  }

  if (command === "show") {
    const id = argv.filter((arg) => !arg.startsWith("--"))[1];
    const provider = id ? findProvider(id) : null;
    if (!provider) {
      console.error(`error: unknown provider '${id ?? "(missing)"}'. Known: ${providerIds().join(", ")}`);
      process.exit(2);
    }
    console.log(JSON.stringify(provider, null, 2));
    return;
  }

  console.error(`error: unknown subcommand '${command}' (expected: list, show)`);
  process.exit(2);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`ebrain providers: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
