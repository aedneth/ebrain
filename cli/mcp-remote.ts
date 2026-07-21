import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { resolveEbrainHome } from "./ebrain-home.ts";
import { mcpUrl, DEFAULT_PORT, redactSecrets, runProcess } from "./mcp-token.ts";

export const GBRAIN_REMOTE_CLIENT_SECRET_ENV = "GBRAIN_REMOTE_CLIENT_SECRET";
export const GBRAIN_REMOTE_CLIENT_ID_ENV = "GBRAIN_REMOTE_CLIENT_ID";
export const REMOTE_CLIENT_STORE_BASENAME = "remote-client.env";
export const DEFAULT_REMOTE_CLIENT_NAME = "ebrain-local-cli";
export const DEFAULT_THIN_HOME_BASENAME = "gbrain-thin";

export interface RemoteClientStorePaths {
  configDir: string;
  secretFile: string;
  thinHome: string;
  thinConfigFile: string;
}

export interface RemoteClient {
  clientId: string;
  clientSecret: string;
}

export interface SourceLike {
  id: string;
  name?: string | null;
  local_path?: string | null;
  federated?: boolean;
}

export interface RemoteCliConfigResult {
  client: RemoteClient;
  sourceId: string;
  federatedRead: string[];
  secretFile: string;
  thinConfigFile: string;
  created: boolean;
}

export function remoteClientStorePaths(configDir = join(homedir(), ".config", "ebrain")): RemoteClientStorePaths {
  const thinHome = join(configDir, DEFAULT_THIN_HOME_BASENAME);
  return {
    configDir,
    secretFile: join(configDir, REMOTE_CLIENT_STORE_BASENAME),
    thinHome,
    thinConfigFile: join(thinHome, ".gbrain", "config.json"),
  };
}

export function isValidOAuthClientId(value: string): boolean {
  return /^gbrain_cl_[A-Za-z0-9._~-]{16,}$/.test(value);
}

export function isValidOAuthClientSecret(value: string): boolean {
  return /^gbrain_cs_[A-Za-z0-9._~-]{16,}$/.test(value);
}

function unquoteEnvValue(raw: string): string {
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

export function parseRemoteClientEnv(content: string): RemoteClient | null {
  let clientId = "";
  let clientSecret = "";
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const id = line.match(new RegExp(`^(?:export\\s+)?${GBRAIN_REMOTE_CLIENT_ID_ENV}=(.*)$`));
    if (id) clientId = unquoteEnvValue(id[1]);
    const secret = line.match(new RegExp(`^(?:export\\s+)?${GBRAIN_REMOTE_CLIENT_SECRET_ENV}=(.*)$`));
    if (secret) clientSecret = unquoteEnvValue(secret[1]);
  }
  return isValidOAuthClientId(clientId) && isValidOAuthClientSecret(clientSecret)
    ? { clientId, clientSecret }
    : null;
}

export function readRemoteClientFile(secretFile = remoteClientStorePaths().secretFile): RemoteClient | null {
  if (!existsSync(secretFile)) return null;
  try {
    return parseRemoteClientEnv(readFileSync(secretFile, "utf8"));
  } catch {
    return null;
  }
}

export function writeRemoteClientFile(client: RemoteClient, secretFile = remoteClientStorePaths().secretFile): void {
  if (!isValidOAuthClientId(client.clientId)) throw new Error("refusing to store invalid OAuth client id shape");
  if (!isValidOAuthClientSecret(client.clientSecret)) throw new Error("refusing to store invalid OAuth client secret shape");
  mkdirSync(dirname(secretFile), { recursive: true, mode: 0o700 });
  const tmp = `${secretFile}.tmp-${process.pid}`;
  const body = [
    "# ebrain local CLI OAuth client for gbrain thin-client operations.",
    "# Source this file from wrappers; never print its contents.",
    `${GBRAIN_REMOTE_CLIENT_ID_ENV}=${client.clientId}`,
    `${GBRAIN_REMOTE_CLIENT_SECRET_ENV}=${client.clientSecret}`,
    "",
  ].join("\n");
  writeFileSync(tmp, body, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, secretFile);
  chmodSync(secretFile, 0o600);
}

export function extractRegisteredOAuthClient(output: string): RemoteClient | null {
  const clientId = output.match(/Client ID:\s+(gbrain_cl_[A-Za-z0-9._~-]+)/)?.[1] ?? "";
  const clientSecret = output.match(/Client Secret:\s+(gbrain_cs_[A-Za-z0-9._~-]+)/)?.[1] ?? "";
  return isValidOAuthClientId(clientId) && isValidOAuthClientSecret(clientSecret)
    ? { clientId, clientSecret }
    : null;
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    throw new Error(`invalid JSON in ${path}; refusing to rewrite it`);
  }
}

export function writeThinClientConfig(opts: {
  thinConfigFile?: string;
  clientId: string;
  issuerUrl: string;
  mcpUrl: string;
}): void {
  if (!isValidOAuthClientId(opts.clientId)) throw new Error("invalid OAuth client id shape");
  const file = opts.thinConfigFile ?? remoteClientStorePaths().thinConfigFile;
  const current = readJsonObject(file);
  const next = {
    ...current,
    engine: typeof current.engine === "string" ? current.engine : "postgres",
    remote_mcp: {
      issuer_url: opts.issuerUrl.replace(/\/+$/, ""),
      mcp_url: opts.mcpUrl,
      oauth_client_id: opts.clientId,
    },
  };
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function selectRemoteWriteSource(sources: readonly SourceLike[]): string {
  if (sources.some((s) => s.id === "agent-memory")) return "agent-memory";
  if (sources.some((s) => s.id === "default")) return "default";
  return sources[0]?.id || "default";
}

export function selectFederatedReadSources(sources: readonly SourceLike[], writeSource: string): string[] {
  const out = new Set<string>();
  for (const source of sources) {
    if (source.federated === true && source.id && source.id !== "default") out.add(source.id);
  }
  out.add(writeSource);
  return [...out].filter(Boolean);
}

export async function registerOAuthClient(opts: {
  ebrainHome: string;
  name?: string;
  sourceId: string;
  federatedRead: readonly string[];
  scopes?: string;
  cwd?: string;
  timeoutMs?: number;
}): Promise<RemoteClient> {
  const bunBin = process.env.BUN_BIN || process.execPath || "bun";
  const cli = join(opts.ebrainHome, "vendor", "gbrain", "src", "cli.ts");
  const baseName = opts.name || process.env.EBRAIN_REMOTE_CLIENT_NAME || DEFAULT_REMOTE_CLIENT_NAME;
  const attempts = [baseName, `${baseName}-${Date.now().toString(36)}`];
  const scopes = opts.scopes ?? "read write admin";
  const federated = opts.federatedRead.filter(Boolean).join(",");
  let last = "";
  for (const name of attempts) {
    const args = [
      bunBin,
      "run",
      cli,
      "auth",
      "register-client",
      name,
      "--grant-types",
      "client_credentials",
      "--scopes",
      scopes,
      "--source",
      opts.sourceId,
      "--token-endpoint-auth-method",
      "client_secret_post",
    ];
    if (federated) args.push("--federated-read", federated);
    const res = await runProcess(args, { cwd: opts.cwd, timeoutMs: opts.timeoutMs ?? 20_000 });
    const output = `${res.stdout}\n${res.stderr}`;
    const client = extractRegisteredOAuthClient(output);
    if (res.code === 0 && client) return client;
    last = output;
    if (!/already exists|duplicate|unique/i.test(output) && !res.timedOut) break;
  }
  throw new Error(`could not register ebrain CLI OAuth client: ${redactSecrets(last).trim() || "no output"}`);
}

export async function ensureRemoteCliConfig(opts: {
  configDir?: string;
  ebrainHome?: string;
  sources: readonly SourceLike[];
  baseUrl?: string;
  port?: number;
  cwd?: string;
}): Promise<RemoteCliConfigResult> {
  const configDir = opts.configDir ?? join(homedir(), ".config", "ebrain");
  const paths = remoteClientStorePaths(configDir);
  const sourceId = selectRemoteWriteSource(opts.sources);
  const federatedRead = selectFederatedReadSources(opts.sources, sourceId);
  const issuerUrl = opts.baseUrl ?? `http://127.0.0.1:${opts.port ?? Number(process.env.EBRAIN_BRAIN_PORT || DEFAULT_PORT)}`;
  const url = mcpUrl(opts.port ?? Number(process.env.EBRAIN_BRAIN_PORT || DEFAULT_PORT));

  let client = readRemoteClientFile(paths.secretFile);
  let created = false;
  if (!client) {
    client = await registerOAuthClient({
      ebrainHome: opts.ebrainHome ?? resolveEbrainHome(),
      sourceId,
      federatedRead,
      cwd: opts.cwd ?? join(configDir, "wd"),
    });
    writeRemoteClientFile(client, paths.secretFile);
    created = true;
  }
  writeThinClientConfig({ thinConfigFile: paths.thinConfigFile, clientId: client.clientId, issuerUrl, mcpUrl: url });
  return { client, sourceId, federatedRead, secretFile: paths.secretFile, thinConfigFile: paths.thinConfigFile, created };
}
