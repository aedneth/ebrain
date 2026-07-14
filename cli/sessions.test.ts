/**
 * Tests de sessions.ts (SPRINT-TUI 6.1.6). Dos capas:
 *   1. Unit tests de funciones puras (naming, deny-list de cliente, scrubber de secretos, gating
 *      --yes) — sin tocar tmux, corren siempre.
 *   2. E2E real contra tmux + scripts/fake-agent.sh: new→list→peek→send→kill. **Se SALTEA
 *      limpiamente (no falla) si tmux no está disponible en el entorno de test** (spec 6.1.6).
 *
 * `bun test cli/sessions.test.ts`.
 */
import { test, expect, describe } from "bun:test";
import { execSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync, chmodSync, mkdtempSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  sessionName, parseSessionName, isSafeToken, isClientPath, scrubSecrets,
  listSessions, newSession, peekSession, sendToSession, killSession, resolveLaunch,
  SESSION_PREFIX,
} from "./sessions.ts";

// ── naming ───────────────────────────────────────────────────────────────
describe("sessionName / parseSessionName", () => {
  test("naming convention ebr-<agente>-<slug>", () => {
    expect(sessionName("claude", "korvex")).toBe("ebr-claude-korvex");
  });
  test("parseSessionName invierte sessionName", () => {
    expect(parseSessionName("ebr-claude-korvex")).toEqual({ agent: "claude", slug: "korvex" });
  });
  test("slug con guiones se preserva completo (split en el PRIMER '-' tras el agente)", () => {
    expect(parseSessionName("ebr-codex-batch-job-1")).toEqual({ agent: "codex", slug: "batch-job-1" });
  });
  test("nombre sin prefijo ebr- → null", () => {
    expect(parseSessionName("tmux-otra-cosa")).toBeNull();
  });
  test("nombre incompleto (sin slug) → null", () => {
    expect(parseSessionName("ebr-soloagente")).toBeNull();
  });
});

test("isSafeToken: solo [a-zA-Z0-9_-], rechaza espacios/slashes/shell-metacaracteres", () => {
  expect(isSafeToken("claude")).toBe(true);
  expect(isSafeToken("batch-job_1")).toBe(true);
  expect(isSafeToken("../etc/passwd")).toBe(false);
  expect(isSafeToken("rm -rf")).toBe(false);
  expect(isSafeToken("")).toBe(false);
});

// ── deny-list de cliente (aislamiento duro, CLAUDE.md) ──────────────────────
describe("isClientPath", () => {
  test("rechaza paths que resuelven bajo brisas-del-golfo o dekko (segmento exacto)", () => {
    expect(isClientPath("/home/eduardo/repos/brisas-del-golfo")).toBe(true);
    expect(isClientPath("/home/eduardo/repos/brisas-del-golfo/sub/dir")).toBe(true);
    expect(isClientPath("/home/eduardo/work/dekko")).toBe(true);
    expect(isClientPath("/home/eduardo/work/DEKKO/src")).toBe(true); // case-insensitive
  });
  test("permite paths propios, incl. los que solo CONTIENEN el nombre como substring de otra palabra", () => {
    expect(isClientPath("/home/eduardo/eBrain")).toBe(false);
    expect(isClientPath("/home/eduardo/repos/brisas-del-golfo-notes")).toBe(false); // no es un segmento exacto
    expect(isClientPath("/home/eduardo/second-brain")).toBe(false);
  });
});

// ── scrubber de secretos (hard requirement — cero secreto crudo sale de peek) ──────────────
describe("scrubSecrets", () => {
  test("redacta VALOR de asignaciones KEY=valor cuando el nombre matchea forma de secreto", () => {
    const raw = "$ export OPENROUTER_API_KEY=sk-or-v1-abcd1234efgh5678ijkl9012mnop3456\n$ echo done\ndone";
    const out = scrubSecrets(raw);
    expect(out).not.toContain("abcd1234efgh5678ijkl9012mnop3456");
    expect(out).toContain("OPENROUTER_API_KEY=[REDACTED]");
    expect(out).toContain("echo done"); // el resto del pane queda intacto
  });
  test("redacta formas de token conocidas (sk-ant-, ghp_, AKIA, Bearer) dondequiera que aparezcan", () => {
    const raw = [
      "ANTHROPIC_API_KEY: sk-ant-api03-FAKEFAKEFAKEFAKEFAKE1234567890",
      "Authorization: Bearer ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      "aws key AKIAABCDEFGHIJKLMNOP suelto en el output",
    ].join("\n");
    const out = scrubSecrets(raw);
    expect(out).not.toContain("FAKEFAKEFAKEFAKEFAKE1234567890");
    expect(out).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    expect(out).not.toContain("AKIAABCDEFGHIJKLMNOP");
    expect(out).toContain("[REDACTED]");
  });
  test("texto sin nada sensible pasa intacto", () => {
    const raw = "fake-agent: listo (AGENT_NAME=test)\n[fake-agent 10:00:00] tick";
    expect(scrubSecrets(raw)).toBe(raw);
  });
  test("gate F6.4.8: cierra fugas antes no cubiertas (SECRET_KEY=, sk-proj- suelto, bloque PEM)", () => {
    // sufijo `_KEY` genérico (Django/Flask/Rails) — antes fugaba porque KEY solo no era alternante
    const sk = scrubSecrets("SECRET_KEY=django-insecure-abc123xyz");
    expect(sk).toContain("SECRET_KEY=[REDACTED]");
    expect(sk).not.toContain("django-insecure-abc123xyz");
    expect(scrubSecrets("ENCRYPTION_KEY: hunter2secretvalue")).toContain("[REDACTED]");
    // sk-proj- SUELTO (sin name=): lo agarra la forma de token, que antes se rompía en el guion
    const proj = scrubSecrets("el pane imprime sk-proj-Ab12Cd34Ef56Gh78Ij90Kl al pasar");
    expect(proj).not.toContain("sk-proj-Ab12Cd34Ef56Gh78Ij90Kl");
    expect(proj).toContain("[REDACTED]");
    // bloque PEM de llave privada volcado al pane
    const pem = scrubSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAbase64blob\n-----END RSA PRIVATE KEY-----");
    expect(pem).not.toContain("MIIEpAIBAAKCAQEAbase64blob");
    expect(pem).toContain("[REDACTED PRIVATE KEY]");
  });
});

// ── gating --yes (send/kill NUNCA mutan sin --yes — se puede probar sin tmux: el short-circuit
// pasa ANTES de llamar a tmuxRaw) ────────────────────────────────────────────────────────────
describe("send/kill exigen --yes explícito (sin excepción)", () => {
  test("sendToSession sin --yes: se rehúsa, dice qué haría, NO llama a tmux", async () => {
    const r = await sendToSession("ebr-noexiste-xyz", "hola", false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.type).toBe("confirm-required");
      expect(r.would).toEqual({ name: "ebr-noexiste-xyz", text: "hola" });
    }
  });
  test("killSession sin --yes: se rehúsa, dice qué mataría, NO llama a tmux", async () => {
    const r = await killSession("ebr-noexiste-xyz", false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.type).toBe("confirm-required");
      expect(r.would).toEqual({ name: "ebr-noexiste-xyz" });
    }
  });
});

// ── deny-list también en newSession (integración con isClientPath) ─────────
test("newSession: cwd bajo repo de cliente → deny-client, nunca llega a crear la sesión tmux", async () => {
  const r = await newSession("test", "cliente-test", { cwd: "/home/eduardo/repos/brisas-del-golfo/sub" });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.type).toBe("deny-client");
});

test("gate F6.4.8: symlink a repo de cliente → deny-client (realpath, no solo segmento textual)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "ebr-symlink-"));
  try {
    const fakeClient = join(tmp, "brisas-del-golfo");
    mkdirSync(fakeClient);
    const link = join(tmp, "atajo-bdg"); // el nombre del link NO delata al cliente
    symlinkSync(fakeClient, link);
    expect(isClientPath(link)).toBe(false); // el chequeo textual del link solo no alcanza
    // newSession debe denegar igual: realpathSync resuelve el symlink al repo de cliente real.
    const r = await newSession("test", "symlinktest", { cwd: link, launchCmd: "bash -c :" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe("deny-client");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("newSession: agente/slug con caracteres inseguros → bad-agent, nunca llega a tmux", async () => {
  const r = await newSession("../evil", "x", {});
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.type).toBe("bad-agent");
});

// ── resolveLaunch: lee launch:+env: del manifest real de un adapter ─────────
test("resolveLaunch: adapter real (claude) declara launch+env; adapter inexistente → null", async () => {
  const claude = await resolveLaunch("claude");
  expect(claude?.cmd).toBeTruthy();
  expect(claude?.env.AGENT_NAME).toBe("claude");
  expect(await resolveLaunch("no-existe-jamas")).toBeNull();
});

// ── E2E real contra tmux (skip limpio si tmux no está disponible) ──────────
function tmuxAvailable(): boolean {
  try { execSync("tmux -V", { stdio: "ignore" }); return true; } catch { return false; }
}

const d = tmuxAvailable() ? describe : describe.skip;

d("E2E — new→list→peek→send→kill contra scripts/fake-agent.sh (tmux real)", () => {
  const FAKE_AGENT = join(import.meta.dir, "..", "scripts", "fake-agent.sh");
  const slug = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `${SESSION_PREFIX}test-${slug}`;
  let workDir = "";

  test("setup: cwd de trabajo temporal (no repo de cliente)", () => {
    workDir = join(tmpdir(), `ebrain-sessions-e2e-${slug}`);
    mkdirSync(workDir, { recursive: true });
    expect(isClientPath(workDir)).toBe(false);
  });

  test("new: crea la sesión con el fake-agent (launchCmd override, NO manifest real)", async () => {
    const r = await newSession("test", slug, { cwd: workDir, launchCmd: `bash ${FAKE_AGENT}` });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session.name).toBe(name);
      expect(r.session.agent).toBe("test");
    }
  });

  test("list: la sesión aparece con naming ebr-test-<slug>", async () => {
    const r = await listSessions();
    expect(r.ok).toBe(true);
    if (r.ok) {
      const row = r.sessions.find((s) => s.name === name);
      expect(row).toBeDefined();
      expect(row?.agent).toBe("test");
      expect(row?.slug).toBe(slug);
      expect(row?.attached).toBe(false);
    }
  });

  test("peek: ve el banner del fake-agent, scrubbeado (aunque no haya nada que redactar acá)", async () => {
    await Bun.sleep(400); // deja al fake-agent imprimir el banner
    const r = await peekSession(name, 50);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("fake-agent: listo");
  });

  test("send: sin --yes se rehúsa; con --yes manda el texto y el fake-agent lo ecoa", async () => {
    const refused = await sendToSession(name, "hola-e2e", false);
    expect(refused.ok).toBe(false);

    const sent = await sendToSession(name, "hola-e2e", true);
    expect(sent.ok).toBe(true);

    await Bun.sleep(600); // el loop del fake-agent lee stdin con timeout 1s
    const peeked = await peekSession(name, 50);
    expect(peeked.ok).toBe(true);
    if (peeked.ok) expect(peeked.text).toContain("recibí: hola-e2e");
  });

  test("kill: sin --yes se rehúsa; con --yes mata la sesión y desaparece de list", async () => {
    const refused = await killSession(name, false);
    expect(refused.ok).toBe(false);

    const killed = await killSession(name, true);
    expect(killed.ok).toBe(true);

    const r = await listSessions();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sessions.some((s) => s.name === name)).toBe(false);
  });

  test("teardown: limpia el workDir + garantiza que la sesión no sobrevivió al test", async () => {
    // Cinturón y tirantes: si algún assert de arriba falló antes del kill, esto no deja el
    // proceso zombie corriendo entre corridas de `bun test`.
    await killSession(name, true).catch(() => {});
    rmSync(workDir, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});
