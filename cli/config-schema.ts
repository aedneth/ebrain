/**
 * cli/config-schema.ts — the validated shape of routing.yaml.
 *
 * `routing.yaml` is a plain file the user is invited to edit, which makes it the one config most
 * likely to be wrong. Before this it was parsed by casting: `Bun.YAML.parse(text) as Cfg`, a lie
 * the type checker had no way to catch. A missing `capabilities` key surfaced hundreds of lines
 * later as "capacidad desconocida: general", and a typo in `budget.monthly_usd` turned the spend
 * cap into `NaN`, which compares false against every number — the cap silently stopped existing.
 *
 * So the config is parsed, not asserted, and the errors name the line the user has to fix.
 *
 * Two decisions worth stating:
 *
 *  1. **Unknown providers are allowed.** The schema validates the *shape*, and the registry fills
 *     in what it knows. An id it has never heard of passes as long as the config supplies the
 *     `base_url` and `key_env` the registry would otherwise have provided. OpenAI-compatible
 *     gateways appear faster than any bundled list, and eBrain must not be the reason one cannot
 *     be used.
 *  2. **A config without `provider.id` is not broken.** Every routing.yaml written before the
 *     registry existed describes one provider implicitly, through `base_url`. Those are matched
 *     back to their descriptor rather than rejected, so an upgrade needs no edit.
 */
import { z } from "zod";
import { findProvider, isValidProviderId, PROVIDERS, resolveProvider, type ProviderDescriptor } from "./providers.ts";

/** Model slugs and capability names: the id shape already used across profiles and targets. */
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,160}$/;

const ModelId = z.string().regex(SAFE_ID, "model ids may contain letters, digits and . _ - / : @");
const CapabilityName = z.string().regex(SAFE_ID, "capability names may contain letters, digits and . _ - / : @");

const BudgetSchema = z.object({
  monthly_usd: z.number().finite().nonnegative(),
  hard_stop: z.boolean(),
  log: z.string().min(1),
});

const ProviderSchema = z.object({
  /** Optional: inferred from `base_url` when a pre-registry config omits it. */
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/, "provider id must be a lowercase slug").optional(),
  base_url: z.string().url("provider.base_url must be an absolute URL").optional(),
  /** An env var NAME. The value is read at call time and never stored here. */
  key_env: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, "key_env must be an environment variable NAME").optional(),
  /** Provider-specific request extras, passed through as data. */
  provider_routing: z.record(z.string(), z.unknown()).optional(),
  /** Top-level request params merged into the body (max_tokens, temperature, …). */
  completion_defaults: z.record(z.string(), z.unknown()).optional(),
});

const ChainSchema = z.object({
  models: z.array(ModelId).min(1, "a capability needs at least one model"),
});

export const RoutingConfigSchema = z.object({
  budget: BudgetSchema,
  provider: ProviderSchema,
  capabilities: z.record(CapabilityName, ChainSchema).refine(
    (capabilities) => Object.keys(capabilities).length > 0,
    "capabilities cannot be empty",
  ),
  // Classification is optional: `--cap` alone is a complete way to use the router.
  classify: z.record(CapabilityName, z.array(z.string().min(1))).default({}),
  frontier: z.object({ auto_escalate: z.boolean() }).default({ auto_escalate: false }),
});

export type RoutingConfigInput = z.infer<typeof RoutingConfigSchema>;

export interface ResolvedRoutingConfig {
  budget: z.infer<typeof BudgetSchema>;
  provider: ProviderDescriptor;
  /** True when the id was not in the registry and the config supplied the endpoint itself. */
  providerKnown: boolean;
  providerRouting: Record<string, unknown>;
  completionDefaults: Record<string, unknown>;
  capabilities: Record<string, { models: string[] }>;
  classify: Record<string, string[]>;
  frontier: { auto_escalate: boolean };
}

export class RoutingConfigError extends Error {
  readonly issues: string[];
  constructor(path: string, issues: string[]) {
    super(`${path} is not valid:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "RoutingConfigError";
    this.issues = issues;
  }
}

/** Turn a zod failure into lines a user can act on: the YAML path, then what is wrong with it. */
function describe(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

/**
 * A config written before `provider.id` existed still names its provider — in `base_url`. Match it
 * back rather than defaulting to a hardcoded id, which would silently mislabel spend for anyone
 * who had already pointed their config somewhere else.
 */
export function inferProviderId(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  const normalise = (url: string) => url.replace(/\/+$/, "").toLowerCase();
  const target = normalise(baseUrl);
  const exact = PROVIDERS.find((provider) => normalise(provider.base_url) === target);
  if (exact) return exact.id;
  try {
    const host = new URL(baseUrl).host.toLowerCase();
    const byHost = PROVIDERS.find((provider) => new URL(provider.base_url).host.toLowerCase() === host);
    return byHost?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Validate and resolve. Throws `RoutingConfigError` with every problem at once — a user fixing
 * their config should not have to re-run to discover the second mistake.
 */
export function parseRoutingConfig(raw: unknown, path = "routing.yaml"): ResolvedRoutingConfig {
  const parsed = RoutingConfigSchema.safeParse(raw);
  if (!parsed.success) throw new RoutingConfigError(path, describe(parsed.error));
  const config = parsed.data;

  const declaredId = config.provider.id ?? inferProviderId(config.provider.base_url);
  if (!declaredId) {
    throw new RoutingConfigError(path, [
      `provider: could not tell which provider this is. Set 'provider.id' to one of: ${PROVIDERS.map((p) => p.id).join(", ")}, or to your own id plus 'base_url' and 'key_env'.`,
    ]);
  }
  if (!isValidProviderId(declaredId)) {
    throw new RoutingConfigError(path, ["provider.id must be a lowercase slug"]);
  }

  const resolved = resolveProvider(declaredId, {
    base_url: config.provider.base_url,
    key_env: config.provider.key_env,
  });
  if (resolved.missing.length > 0) {
    throw new RoutingConfigError(path, [
      `provider.id '${declaredId}' is not one eBrain ships defaults for, so the config must supply: ${resolved.missing.join(", ")}. Known ids: ${PROVIDERS.map((p) => p.id).join(", ")}.`,
    ]);
  }

  // Extras that the selected provider does not understand are a real problem — they are sent in
  // the request body — but not a fatal one: a provider may accept keys the registry has not
  // catalogued. Reporting is the caller's job; the resolved config just carries them faithfully.
  return {
    budget: config.budget,
    provider: resolved.provider,
    providerKnown: resolved.known,
    providerRouting: config.provider.provider_routing ?? {},
    completionDefaults: config.provider.completion_defaults ?? {},
    capabilities: Object.fromEntries(
      Object.entries(config.capabilities).map(([name, chain]) => [name, { models: [...chain.models] }]),
    ),
    classify: Object.fromEntries(Object.entries(config.classify).map(([name, words]) => [name, [...words]])),
    frontier: config.frontier,
  };
}

/**
 * Request-body keys the config sets that the selected provider is known NOT to understand.
 * Advisory only: `route.ts` leaves them out of the request and warns, so a config copied between
 * providers neither fails with an opaque 400 nor loses a setting in silence. An id the registry
 * has never heard of reports nothing here — there is no knowledge to contradict the config with,
 * so its extras are sent as written.
 */
export function unsupportedExtras(config: ResolvedRoutingConfig): string[] {
  const descriptor = findProvider(config.provider.id);
  if (!descriptor) return [];
  const known = new Set(descriptor.extra_body_keys);
  return Object.keys(config.providerRouting).length > 0 && !known.has("provider") ? ["provider"] : [];
}
