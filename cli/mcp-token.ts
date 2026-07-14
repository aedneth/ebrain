import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, renameSync, rmSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

export const EBRAIN_MCP_TOKEN_ENV = "EBRAIN_MCP_TOKEN";
export const TOKEN_STORE_BASENAME = "mcp-token.env";
export const DEFAULT_TOKEN_NAME = "ebrain-local-agent";
export const DEFAULT_PORT = 8541;

export interface TokenStorePaths {
  configDir: string;
  tokenFile: string;
}

export type TokenSource = "env" | "store" | "minted-auth-create" | "minted-admin";

export interface TokenResult {
  token: string;
  source: TokenSource;
}

export function ebrainConfigDir(home = homedir()): string {
  return join(home, ".config", "ebrain");
}

export function tokenStorePaths(configDir = ebrainConfigDir()): TokenStorePaths {
  return { configDir, tokenFile: join(configDir, TOKEN_STORE_BASENAME) };
}

export function mcpUrl(port = Number(process.env.EBRAIN_BRAIN_PORT || DEFAULT_PORT)): string {
  return `http://127.0.0.1:${port}/mcp`;
}

export function healthUrl(port = Number(process.env.EBRAIN_BRAIN_PORT || DEFAULT_PORT)): string {
  return `http://127.0.0.1:${port}/health`;
}

export function isValidMcpToken(token: string): boolean {
  return /^gbrain_[A-Za-z0-9._~+/-]{32,}$/.test(token);
}

function unquoteEnvValue(raw: string): string {
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

export function parseTokenEnv(content: string): string | null {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?EBRAIN_MCP_TOKEN=(.*)$/);
    if (!match) continue;
    const token = unquoteEnvValue(match[1]);
    return isValidMcpToken(token) ? token : null;
  }
  return null;
}

export function readTokenFile(tokenFile = tokenStorePaths().tokenFile): string | null {
  if (!existsSync(tokenFile)) return null;
  try {
    return parseTokenEnv(readFileSync(tokenFile, "utf8"));
  } catch {
    return null;
  }
}

export function writeTokenFile(token: string, tokenFile = tokenStorePaths().tokenFile): void {
  if (!isValidMcpToken(token)) throw new Error("refusing to store invalid EBRAIN_MCP_TOKEN shape");
  mkdirSync(dirname(tokenFile), { recursive: true, mode: 0o700 });
  const tmp = `${tokenFile}.tmp-${process.pid}`;
  const body = [
    "# ebrain local MCP bearer token.",
    "# This file is sourceable by ebrain launchers; never print its contents.",
    `EBRAIN_MCP_TOKEN=${token}`,
    "",
  ].join("\n");
  writeFileSync(tmp, body, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, tokenFile);
  chmodSync(tokenFile, 0o600);
}

export function redactSecrets(text: string, known: readonly string[] = []): string {
  let out = text;
  for (const secret of known) {
    if (secret) out = out.split(secret).join("[REDACTED]");
  }
  out = out.replace(/\bgbrain_[A-Za-z0-9._~+/-]{20,}\b/g, "[REDACTED]");
  out = out.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
  out = out.replace(/Authorization[:=]\s*\S+(?:\s+\S+)?/gi, "Authorization=[REDACTED]");
  return out;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export async function runProcess(
  argv: string[],
  opts: { cwd?: string; env?: Record<string, string | undefined>; timeoutMs?: number } = {},
): Promise<RunResult> {
  const proc = Bun.spawn(argv, {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
  let timedOut = false;
  const timer = opts.timeoutMs
    ? setTimeout(() => {
      timedOut = true;
      try { proc.kill(); } catch { /* best effort */ }
    }, opts.timeoutMs)
    : undefined;
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (timer) clearTimeout(timer);
  return { code: timedOut ? 124 : code, stdout, stderr, timedOut };
}

export function extractCreatedToken(output: string): string | null {
  const match = output.match(/\bgbrain_[A-Za-z0-9._~+/-]{32,}\b/);
  return match?.[0] && isValidMcpToken(match[0]) ? match[0] : null;
}

export async function mintWithAuthCreate(opts: {
  ebrainHome: string;
  name?: string;
  cwd?: string;
  timeoutMs?: number;
}): Promise<string> {
  const bunBin = process.env.BUN_BIN || process.execPath || "bun";
  const cli = join(opts.ebrainHome, "vendor", "gbrain", "src", "cli.ts");
  const baseName = opts.name || process.env.EBRAIN_MCP_TOKEN_NAME || DEFAULT_TOKEN_NAME;
  const attempts = [baseName, `${baseName}-${Date.now().toString(36)}`];
  let last = "";
  for (const name of attempts) {
    const res = await runProcess(
      [bunBin, "run", cli, "auth", "create", name],
      { cwd: opts.cwd, timeoutMs: opts.timeoutMs ?? 20_000 },
    );
    const token = extractCreatedToken(`${res.stdout}\n${res.stderr}`);
    if (res.code === 0 && token) return token;
    last = `${res.stdout}\n${res.stderr}`;
    if (!/already exists|duplicate|unique/i.test(last) && !res.timedOut) break;
  }
  throw new Error(`could not mint EBRAIN_MCP_TOKEN with gbrain auth create: ${redactSecrets(last).trim() || "no output"}`);
}

function cookieFromSetCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const first = setCookie.split(",").find((part) => /gbrain_admin=/.test(part)) ?? setCookie;
  const match = first.match(/\bgbrain_admin=[^;,\s]+/);
  return match?.[0] ?? null;
}

async function fetchTextSafe(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export async function mintWithAdminApi(opts: {
  baseUrl: string;
  bootstrapToken: string;
  name?: string;
  timeoutMs?: number;
}): Promise<string> {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const name = opts.name || process.env.EBRAIN_MCP_TOKEN_NAME || DEFAULT_TOKEN_NAME;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const login = await fetch(`${base}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: opts.bootstrapToken }),
      signal: controller.signal,
    });
    if (!login.ok) {
      const body = redactSecrets(await fetchTextSafe(login), [opts.bootstrapToken]);
      throw new Error(`admin login failed (${login.status}): ${body}`);
    }
    const cookie = cookieFromSetCookie(login.headers.get("set-cookie"));
    if (!cookie) throw new Error("admin login did not return an admin cookie");

    const attempts = [name, `${name}-${Date.now().toString(36)}`];
    let last = "";
    for (const attempt of attempts) {
      const create = await fetch(`${base}/admin/api/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": cookie },
        body: JSON.stringify({ name: attempt }),
        signal: controller.signal,
      });
      const raw = await fetchTextSafe(create);
      if (create.ok) {
        try {
          const parsed = JSON.parse(raw) as { token?: unknown };
          if (typeof parsed.token === "string" && isValidMcpToken(parsed.token)) return parsed.token;
        } catch { /* handled below */ }
        throw new Error("admin api-key response did not contain a valid token");
      }
      last = raw;
      if (!/already exists|duplicate|unique/i.test(raw)) break;
    }
    throw new Error(`admin api-key creation failed: ${redactSecrets(last, [opts.bootstrapToken]).trim() || "no output"}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureToken(opts: {
  configDir?: string;
  ebrainHome?: string;
  mode: "boot" | "up";
  allowAuthCreate?: boolean;
  allowAdminMint?: boolean;
  baseUrl?: string;
  timeoutMs?: number;
}): Promise<TokenResult> {
  const paths = tokenStorePaths(opts.configDir);
  const envToken = process.env.EBRAIN_MCP_TOKEN;
  if (envToken && isValidMcpToken(envToken)) {
    writeTokenFile(envToken, paths.tokenFile);
    return { token: envToken, source: "env" };
  }
  const stored = readTokenFile(paths.tokenFile);
  if (stored) return { token: stored, source: "store" };

  if (opts.allowAdminMint && process.env.GBRAIN_ADMIN_BOOTSTRAP_TOKEN) {
    const token = await mintWithAdminApi({
      baseUrl: opts.baseUrl ?? `http://127.0.0.1:${process.env.EBRAIN_BRAIN_PORT || DEFAULT_PORT}`,
      bootstrapToken: process.env.GBRAIN_ADMIN_BOOTSTRAP_TOKEN,
      timeoutMs: opts.timeoutMs,
    });
    writeTokenFile(token, paths.tokenFile);
    return { token, source: "minted-admin" };
  }

  if (opts.mode === "boot" || opts.allowAuthCreate) {
    const token = await mintWithAuthCreate({
      ebrainHome: opts.ebrainHome ?? process.env.EBRAIN_HOME ?? join(homedir(), "eBrain"),
      cwd: join(paths.configDir, "wd"),
      timeoutMs: opts.timeoutMs,
    });
    writeTokenFile(token, paths.tokenFile);
    return { token, source: "minted-auth-create" };
  }

  throw new Error(`missing ${EBRAIN_MCP_TOKEN_ENV}; run 'ebrain up' before onboarding agents`);
}

export async function healthCheck(url: string, timeoutMs = 3_000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function toolsListSmoke(url: string, token: string, timeoutMs = 10_000): Promise<{ ok: true; tools: number } | { ok: false; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: controller.signal,
    });
    const body = await fetchTextSafe(res);
    if (!res.ok) return { ok: false, message: `tools/list returned HTTP ${res.status}: ${redactSecrets(body, [token])}` };
    const jsonLine = body.split(/\r?\n/).find((line) => line.trim().startsWith("{")) ?? body;
    try {
      const parsed = JSON.parse(jsonLine) as { result?: { tools?: unknown[] } };
      const tools = Array.isArray(parsed.result?.tools) ? parsed.result.tools.length : 0;
      return { ok: true, tools };
    } catch {
      return { ok: true, tools: 0 };
    }
  } catch (e) {
    return { ok: false, message: redactSecrets(e instanceof Error ? e.message : String(e), [token]) };
  } finally {
    clearTimeout(timer);
  }
}

export function removeTokenFileForTests(tokenFile: string): void {
  try { rmSync(tokenFile, { force: true }); } catch { /* ignore */ }
}
