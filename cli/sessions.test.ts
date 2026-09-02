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

// Deny policy is operator configuration; this suite declares its own neutral fixture policy.
process.env.EBRAIN_DENIED_REPOS = "denied-alpha,denied-beta";
import { execSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync, chmodSync, mkdtempSync, symlinkSync, cpSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  sessionName, parseSessionName, isSafeToken, isClientPath, scrubSecrets, shellCommandFromArgv,
  listSessions, newSession, peekSession, sendToSession, killSession, resolveLaunch,
  parsePaneTable, SESSION_PREFIX,
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

test("shellCommandFromArgv serializa argv estructurado sin permitir control chars", () => {
  expect(shellCommandFromArgv(["opencode", "--model", "openrouter/deepseek/deepseek-v4-pro"])).toBe("'opencode' '--model' 'openrouter/deepseek/deepseek-v4-pro'");
  expect(shellCommandFromArgv(["echo", "it's literal"])).toBe("'echo' 'it'\\''s literal'");
  expect(() => shellCommandFromArgv(["opencode\nrm -rf /"])).toThrow("invalid launch argv");
});

// ── deny-list de cliente (aislamiento duro, CLAUDE.md) ──────────────────────
describe("isClientPath", () => {
  test("rechaza paths que resuelven bajo denied-alpha o denied-beta (segmento exacto)", () => {
    expect(isClientPath("/home/eduardo/repos/denied-alpha")).toBe(true);
    expect(isClientPath("/home/eduardo/repos/denied-alpha/sub/dir")).toBe(true);
    expect(isClientPath("/home/eduardo/work/denied-beta")).toBe(true);
    expect(isClientPath("/home/eduardo/work/DENIED-BETA/src")).toBe(true); // case-insensitive
  });
  test("permite paths propios, incl. los que solo CONTIENEN el nombre como substring de otra palabra", () => {
    expect(isClientPath("/home/eduardo/eBrain")).toBe(false);
    expect(isClientPath("/home/eduardo/repos/denied-alpha-notes")).toBe(false); // no es un segmento exacto
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

  // Un pane capturado es una VENTANA de N líneas: la llave puede cruzar cualquiera de sus dos
  // bordes. Redactar solo el marcador dejaba pasar el cuerpo base64 completo en 3 de las 4
  // posiciones posibles — incluida la que el marcador suelto decía cubrir.
  describe("llave PEM que cruza el borde de la ventana capturada", () => {
    const BEGIN = "-----BEGIN RSA PRIVATE KEY-----";
    const END = "-----END RSA PRIVATE KEY-----";
    const BODY = [
      "MIIEpAIBAAKCAQEAx7Vv9k2mQ1sK3nPqR8tYwZbC4dE5fG6hI7jK8lM9nO0pQ1rS",
      "2tU3vW4xY5zA6bC7dE8fG9hI0jK1lM2nO3pQ4rS5tU6vW7xY8zA9bC0dE1fG2hI3",
    ];

    test("BEGIN sin END: la llave no termina en la ventana → se redacta hasta el final", () => {
      const out = scrubSecrets([BEGIN, ...BODY].join("\n"));
      for (const line of BODY) expect(out).not.toContain(line);
      expect(out).toContain("[REDACTED PRIVATE KEY]");
    });

    test("END sin BEGIN: el caso REAL — `capture-pane -S -200` ancla abajo, así que la ventana corta ARRIBA", () => {
      const out = scrubSecrets([...BODY, END].join("\n"));
      for (const line of BODY) expect(out).not.toContain(line);
      expect(out).toContain("[REDACTED PRIVATE KEY]");
    });

    test("el output legítimo que PRECEDE a la llave sobrevive — solo se borra la corrida adyacente al marcador", () => {
      // Regresión cara: una regla anclada al inicio de la ventana cerraba la fuga y de paso
      // borraba todo el pane. `peek` es para leer lo que hizo el agente; devolver solo
      // "[REDACTED]" cambia una fuga por una herramienta inútil.
      const out = scrubSecrets(["[agent] compiling module 42", "[agent] tests passed", ...BODY, END].join("\n"));
      expect(out).toContain("compiling module 42");
      expect(out).toContain("tests passed");
      for (const line of BODY) expect(out).not.toContain(line);
    });

    test("la última línea corta del cuerpo no corta el barrido hacia atrás desde el END", () => {
      // Un cuerpo PEM real termina en una línea corta. Con un piso de 16 caracteres, el barrido
      // se detenía ahí y dejaba pasar todo el resto del cuerpo.
      const SHORT = "Zm9vYmFy";
      const out = scrubSecrets([...BODY, SHORT, END].join("\n"));
      expect(out).not.toContain(SHORT);
      for (const line of BODY) expect(out).not.toContain(line);
    });

    test("una llave dentro de un diff (líneas con prefijo '+') también se redacta", () => {
      const diff = ["+" + BEGIN, ...BODY.map((b) => "+" + b), "+" + END].join("\n");
      const out = scrubSecrets(diff);
      for (const line of BODY) expect(out).not.toContain(line);
    });

    test("el barrido es LINEAL — un scrubber que se cuelga con la entrada es un DoS en el camino de seguridad", () => {
      // La versión con regex era cuadrática: 200 líneas (el tamaño exacto de la ventana de
      // `capture-pane -S -200`) tardaban ~1 s, y la TUI hace peek hasta una vez por segundo.
      const big = Array.from({ length: 2000 }, (_, i) => `MIIEpAIBAAKCAQEAx7Vv9k2mQ1sK3nPqR8tYwZbC4dE5fG6hI7jK8lM9nO0pQ1rS${i}`).join("\n");
      const started = performance.now();
      scrubSecrets(big);
      expect(performance.now() - started).toBeLessThan(500);
    });

    // Estos controles son la mitad que importa: sin ellos, "arreglar" la fuga con una regla
    // base64 general pasa los tests y rompe el producto en silencio. `scrubSecrets(text) !== text`
    // se usa como VALIDADOR de entrada en episodes.ts y context.ts, así que sobre-redactar no
    // degrada `peek`: empieza a RECHAZAR texto legítimo.
    describe("no sobre-redacta", () => {
      const controls: Record<string, string> = {
        "un JWT": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop",
        "un hash sha256": "d41d8cd98f00b204e9800998ecf8427ed41d8cd98f00b204e9800998ecf8427e",
        "un hunk de diff con base64": "+++ b/x.ts\n+SGVsbG8gd29ybGQgdGhpcyBpcyBiYXNlNjQgcGF5bG9hZA==\n-QW5vdGhlciBiYXNlNjQgc3RyaW5nIGhlcmU=",
        "base64 suelto en un log": BODY.join("\n"),
        "un CERTIFICATE (material público, no es secreto)": `-----BEGIN CERTIFICATE-----\n${BODY.join("\n")}\n-----END CERTIFICATE-----`,
      };
      for (const [name, text] of Object.entries(controls)) {
        test(name, () => expect(scrubSecrets(text)).toBe(text));
      }
    });
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
  const r = await newSession("test", "cliente-test", { cwd: "/home/eduardo/repos/denied-alpha/sub" });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.type).toBe("deny-client");
});

test("gate F6.4.8: symlink a repo de cliente → deny-client (realpath, no solo segmento textual)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "ebr-symlink-"));
  try {
    const fakeClient = join(tmp, "denied-alpha");
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
    // launchArgv (not an interpolated launchCmd string): it goes through shellCommandFromArgv, which
    // quotes each token. Interpolating `bash ${FAKE_AGENT}` into a raw command breaks the instant the
    // checkout path contains a space (pass 6, F-T6) — sh splits `/tmp/weird path/...` in two and the
    // session dies before it starts. The spec's acceptance path is "arbitrary", which includes spaces.
    const r = await newSession("test", slug, { cwd: workDir, launchArgv: ["bash", FAKE_AGENT] });
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

// Pass 6, F-T6: a checkout at a path containing a space broke session management — five CLI and two
// TUI tests failed solely because of the space, because they interpolated the fake-agent path into a
// raw command string. The root fix is quoting (launchArgv), but the space must also be exercised
// where the test can control it, independent of where the suite happens to be cloned. This creates
// both the cwd AND the launched script under a spaced path and drives the full lifecycle.
d("F-T6 — session management survives a path with a space", () => {
  const suffix = `space-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `${SESSION_PREFIX}test-${suffix}`;
  let spacedDir = "";
  let spacedAgent = "";

  test("setup: crear un cwd y un fake-agent bajo una ruta con espacio", () => {
    spacedDir = join(tmpdir(), `ebrain has a space ${suffix}`);
    mkdirSync(spacedDir, { recursive: true });
    spacedAgent = join(spacedDir, "fake-agent.sh");
    cpSync(join(import.meta.dir, "..", "scripts", "fake-agent.sh"), spacedAgent);
    expect(existsSync(spacedAgent)).toBe(true);
    expect(spacedDir).toContain(" ");
  });

  test("new + list: la sesión arranca y aparece con su cwd espaciado intacto", async () => {
    const created = await newSession("test", suffix, { cwd: spacedDir, launchArgv: ["bash", spacedAgent] });
    expect(created.ok).toBe(true);
    const listed = await listSessions();
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const row = listed.sessions.find((s) => s.name === name);
      expect(row).toBeDefined();
      // The space must survive the round trip through tmux's format output and our parser.
      expect(row?.cwd).toBe(spacedDir);
    }
  });

  test("kill + teardown", async () => {
    await killSession(name, true).catch(() => {});
    if (spacedDir) rmSync(spacedDir, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});

// tmux knows whether the process inside a pane is still alive; `list` simply never asked, so a
// crashed agent's session looked byte-identical to a working one for as long as the pane lived.
describe("liveness de sesiones (huérfanas)", () => {
  test("distingue muerta, ociosa y viva", () => {
    const table = [
      "ebr-claude-dead|1|",
      "ebr-codex-idle|0|bash",
      "ebr-gemini-live|0|node",
      "ebr-mixed|1|",
      "ebr-mixed|0|python",
    ].join("\n");
    const live = parsePaneTable(table);

    expect(live.get("ebr-claude-dead")).toMatchObject({ dead: true, idle: true, panes: 1 });
    // Un pane en un shell: el agente se fue, la terminal quedó. Se REPORTA, nunca se mata sola.
    expect(live.get("ebr-codex-idle")).toMatchObject({ dead: false, idle: true });
    expect(live.get("ebr-gemini-live")).toMatchObject({ dead: false, idle: false });
    // Una sesión con un pane muerto y otro corriendo algo NO está muerta.
    expect(live.get("ebr-mixed")).toMatchObject({ dead: false, idle: false, panes: 2 });
  });

  test("una tabla vacía no inventa sesiones", () => {
    expect(parsePaneTable("").size).toBe(0);
    expect(parsePaneTable("\n\n").size).toBe(0);
  });
});
