#!/usr/bin/env bun
/**
 * ebrain profiles -- local execution profiles governed by the user (ADR-005 / F6.6.2).
 *
 * Profiles intentionally hold only model IDs, fallback ordering and evidence provenance. They
 * never hold credentials, provider billing, benchmark-derived ranks, or an automatic default.
 */
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const HOME = homedir();
const CONFIG_DIR = process.env.EBRAIN_CONFIG_DIR || join(HOME, ".config", "ebrain");
const STORE_PATH = process.env.EBRAIN_PROFILE_STORE || join(CONFIG_DIR, "execution-profiles.json");
const ROUTING_PATH = process.env.EBRAIN_ROUTING_CONFIG || join(CONFIG_DIR, "routing.yaml");
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,160}$/;
const SAFE_PROFILE_ID = /^[a-z][a-z0-9-]{0,63}$/;

export interface ProfileEvidence { source: string; as_of: string }
export interface CatalogEntry { id: string; source: string; as_of: string }
export interface ExecutionProfile {
  id: string;
  label: string;
  provider: "openrouter";
  capabilities: Record<string, string[]>;
  evidence: ProfileEvidence;
}
export interface ProfileStore { schema_version: 1; catalog: CatalogEntry[]; profiles: ExecutionProfile[] }
export interface ProfileSummary {
  id: string;
  label: string;
  provider: "openrouter";
  capabilities: string[];
  models: number;
  evidence: ProfileEvidence;
}

interface RoutingConfig { capabilities?: Record<string, { models?: unknown }>; provider?: { completion_defaults?: { max_tokens?: unknown } } }

function die(message: string, code = 1): never {
  console.error(`error: ${message}`);
  process.exit(code);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOnly(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function validIso(value: string): boolean { return Number.isFinite(Date.parse(value)); }
function validId(value: unknown): value is string { return typeof value === "string" && SAFE_ID.test(value); }

function parseEvidence(value: unknown): ProfileEvidence {
  if (!isRecord(value) || !hasOnly(value, ["source", "as_of"]) || typeof value.source !== "string" || !validIso(String(value.as_of))) {
    throw new Error("evidence debe contener source y as_of ISO");
  }
  return { source: value.source, as_of: String(value.as_of) };
}

function parseCapabilities(value: unknown): Record<string, string[]> {
  if (!isRecord(value) || Object.keys(value).length === 0) throw new Error("capabilities no puede estar vacio");
  const capabilities: Record<string, string[]> = {};
  for (const [capability, models] of Object.entries(value)) {
    if (!SAFE_ID.test(capability) || !Array.isArray(models) || models.length === 0 || !models.every(validId)) {
      throw new Error(`capability/modelos invalidos: ${capability}`);
    }
    capabilities[capability] = [...models];
  }
  return capabilities;
}

function parseProfile(value: unknown): ExecutionProfile {
  if (!isRecord(value) || !hasOnly(value, ["id", "label", "provider", "capabilities", "evidence"])) throw new Error("perfil tiene campos desconocidos");
  if (typeof value.id !== "string" || !SAFE_PROFILE_ID.test(value.id)) throw new Error("id de perfil invalido");
  if (typeof value.label !== "string" || value.label.trim().length < 1 || value.label.length > 120) throw new Error("label de perfil invalido");
  if (value.provider !== "openrouter") throw new Error("provider de perfil no soportado");
  return {
    id: value.id,
    label: value.label.trim(),
    provider: "openrouter",
    capabilities: parseCapabilities(value.capabilities),
    evidence: parseEvidence(value.evidence),
  };
}

/** Strict parser: unknown fields are rejected so a credential can never be silently retained. */
export function parseProfileStore(value: unknown): ProfileStore {
  if (!isRecord(value) || !hasOnly(value, ["schema_version", "catalog", "profiles"]) || value.schema_version !== 1) {
    throw new Error("store de perfiles invalido (schema_version=1 requerido)");
  }
  if (!Array.isArray(value.catalog) || !Array.isArray(value.profiles)) throw new Error("catalog/profiles deben ser arrays");
  const catalog = value.catalog.map((entry): CatalogEntry => {
    if (!isRecord(entry) || !hasOnly(entry, ["id", "source", "as_of"]) || !validId(entry.id) || typeof entry.source !== "string" || !validIso(String(entry.as_of))) {
      throw new Error("entrada de catalogo invalida");
    }
    return { id: entry.id, source: entry.source, as_of: String(entry.as_of) };
  });
  const profiles = value.profiles.map(parseProfile);
  const ids = new Set<string>();
  for (const profile of profiles) {
    if (ids.has(profile.id)) throw new Error(`perfil duplicado: ${profile.id}`);
    ids.add(profile.id);
  }
  const catalogIds = new Set(catalog.map((entry) => entry.id));
  for (const profile of profiles) for (const models of Object.values(profile.capabilities)) for (const model of models) {
    if (!catalogIds.has(model)) throw new Error(`modelo de perfil no existe en catalogo: ${model}`);
  }
  return { schema_version: 1, catalog, profiles };
}

export function summarizeProfiles(store: ProfileStore): ProfileSummary[] {
  return store.profiles.map((profile) => ({
    id: profile.id,
    label: profile.label,
    provider: profile.provider,
    capabilities: Object.keys(profile.capabilities).sort(),
    models: new Set(Object.values(profile.capabilities).flat()).size,
    evidence: profile.evidence,
  }));
}

export function addCatalogEntry(store: ProfileStore, entry: CatalogEntry): ProfileStore {
  if (!validId(entry.id) || !entry.source.trim() || !validIso(entry.as_of)) throw new Error("entrada de catalogo invalida");
  if (store.catalog.some((candidate) => candidate.id === entry.id)) throw new Error(`modelo ya existe en catalogo: ${entry.id}`);
  return parseProfileStore({ ...store, catalog: [...store.catalog, entry] });
}

export function addExecutionProfile(store: ProfileStore, profile: ExecutionProfile): ProfileStore {
  if (store.profiles.some((candidate) => candidate.id === profile.id)) throw new Error(`perfil ya existe: ${profile.id}`);
  return parseProfileStore({ ...store, profiles: [...store.profiles, profile] });
}

export function migrateRoutingConfig(config: RoutingConfig, now = new Date().toISOString()): ProfileStore {
  const capabilities: Record<string, string[]> = {};
  for (const [capability, def] of Object.entries(config.capabilities ?? {})) {
    const models = Array.isArray(def?.models) ? def.models.filter(validId) : [];
    if (models.length > 0) capabilities[capability] = models;
  }
  if (Object.keys(capabilities).length === 0) throw new Error("routing.yaml no contiene capabilities con modelos validos");
  const modelIds = [...new Set(Object.values(capabilities).flat())].sort();
  return {
    schema_version: 1,
    catalog: modelIds.map((id) => ({ id, source: "local-routing.yaml", as_of: now })),
    profiles: [{
      id: "legacy-openrouter",
      label: "Migrated OpenRouter routing",
      provider: "openrouter",
      capabilities,
      evidence: { source: "local-routing.yaml", as_of: now },
    }],
  };
}

export async function readProfileStore(path = STORE_PATH): Promise<ProfileStore | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return parseProfileStore(JSON.parse(await file.text()));
  } catch (error) {
    throw new Error(`store de perfiles invalido: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function writeProfileStore(store: ProfileStore, path = STORE_PATH): Promise<void> {
  const parsed = parseProfileStore(store);
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
  await chmod(path, 0o600);
}

async function loadRoutingConfig(path = ROUTING_PATH): Promise<RoutingConfig> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`routing.yaml no existe en ${path}`);
  return (Bun as unknown as { YAML: { parse: (text: string) => RoutingConfig } }).YAML.parse(await file.text());
}

function parseArgs(argv: string[]): { command: string; rest: string[]; json: boolean; yes: boolean } {
  const [command = "list", ...raw] = argv;
  return { command, rest: raw.filter((arg) => arg !== "--json" && arg !== "--yes"), json: raw.includes("--json"), yes: raw.includes("--yes") };
}

function flagValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  return typeof value === "string" && !value.startsWith("--") ? value : null;
}
function flagValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && typeof args[index + 1] === "string" && !args[index + 1]!.startsWith("--")) values.push(args[index + 1]!);
  }
  return values;
}
function parseCap(value: string): [string, string[]] {
  const index = value.indexOf("=");
  const capability = index > 0 ? value.slice(0, index) : "";
  const models = index > 0 ? value.slice(index + 1).split(",").map((model) => model.trim()).filter(Boolean) : [];
  if (!SAFE_ID.test(capability) || models.length === 0 || !models.every((model) => SAFE_ID.test(model))) {
    throw new Error(`--cap invalido: ${value} (esperado capability=model,model)`);
  }
  return [capability, models];
}

function print(value: unknown, json: boolean): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "init") {
    if (!args.yes) die("profiles init escribe configuracion local; confirma con --yes");
    if (await readProfileStore()) die("el store de perfiles ya existe; no se sobreescribe automaticamente");
    const store = migrateRoutingConfig(await loadRoutingConfig());
    await writeProfileStore(store);
    print({ ok: true, initialized: true, profiles: summarizeProfiles(store) }, args.json);
    return;
  }
  const store = await readProfileStore();
  if (!store) {
    if (args.command === "list") {
      print({ schema_version: 1, initialized: false, profiles: [] }, args.json);
      return;
    }
    die("no existe un store de perfiles; corre 'ebrain profiles init --yes' y edita su configuracion local");
  }
  if (args.command === "list") {
    print({ schema_version: 1, initialized: true, profiles: summarizeProfiles(store) }, args.json);
    return;
  }
  if (args.command === "show") {
    const id = args.rest[0];
    const profile = store.profiles.find((candidate) => candidate.id === id);
    if (!profile) die(`perfil no encontrado: ${id ?? "(falta id)"}`, 2);
    print(profile, args.json);
    return;
  }
  if (args.command === "catalog-add") {
    if (!args.yes) die("catalog-add escribe configuracion local; confirma con --yes");
    const id = flagValue(args.rest, "--id");
    const source = flagValue(args.rest, "--source");
    const asOf = flagValue(args.rest, "--as-of");
    if (!id || !source || !asOf) die("uso: ebrain profiles catalog-add --id provider/model --source URL-o-nota --as-of ISO --yes [--json]");
    const next = addCatalogEntry(store, { id, source, as_of: asOf });
    await writeProfileStore(next);
    print({ ok: true, entry: next.catalog.find((entry) => entry.id === id) }, args.json);
    return;
  }
  if (args.command === "create") {
    if (!args.yes) die("profiles create escribe configuracion local; confirma con --yes");
    const id = flagValue(args.rest, "--id");
    const label = flagValue(args.rest, "--label");
    const caps = flagValues(args.rest, "--cap");
    if (!id || !label || caps.length === 0) die("uso: ebrain profiles create --id ID --label LABEL --cap capability=model,model [--cap ...] --yes [--json]");
    const capabilities = Object.fromEntries(caps.map(parseCap));
    const profile: ExecutionProfile = {
      id,
      label,
      provider: "openrouter",
      capabilities,
      evidence: { source: "user-profile", as_of: new Date().toISOString() },
    };
    const next = addExecutionProfile(store, profile);
    await writeProfileStore(next);
    print({ ok: true, profile: next.profiles.find((candidate) => candidate.id === id) }, args.json);
    return;
  }
  if (args.command === "validate") {
    print({ ok: true, schema_version: store.schema_version, profiles: store.profiles.length, catalog: store.catalog.length }, args.json);
    return;
  }
  die("uso: ebrain profiles <list|show ID|validate|init --yes|catalog-add ... --yes|create ... --yes> [--json]");
}

if (import.meta.main) main().catch((error) => die(error instanceof Error ? error.message : String(error)));
