/**
 * cli/isolation.test.ts — FASE D.5, el GATE DE AISLAMIENTO (ADR-004 criterio 4).
 *
 * Verifica que la migración al canal compartido HTTP-MCP PRESERVA:
 *   (a) el aislamiento de repos de cliente (denied repositories) — plano-sesión + plano-source,
 *   (b) el default-deny de federación (ADR-001) — un source entra solo si es federado y
 *       explícito; jamás un repo de cliente.
 * Todo PURO / offline (sin host, sin tmux, sin engine) — corre en la suite CI.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clientDenylist,
  isClientPath,
  isClientSource,
  isClientSourceRecord,
  federatedSources,
  assertNoClientSources,
} from "./isolation.ts";

// The deny policy is operator configuration, so this suite declares its own neutral fixture policy
// instead of depending on whatever the machine running CI happens to have configured.
process.env.EBRAIN_DENIED_REPOS = "denied-alpha,denied-beta";

describe("D.5 gate — deny policy integrity (the SoT the shared channel trusts)", () => {
  test("the configured policy is loaded and contains the fixture entries", () => {
    expect(clientDenylist().length).toBeGreaterThan(0);
    expect(clientDenylist()).toContain("denied-alpha");
    expect(clientDenylist()).toContain("denied-beta");
  });

  test("an empty policy denies NOTHING — it must never degrade into denying everything", () => {
    const saved = process.env.EBRAIN_DENIED_REPOS;
    process.env.EBRAIN_DENIED_REPOS = "";
    try {
      expect(clientDenylist()).toEqual([]);
      expect(isClientPath("/home/e/repos/anything")).toBe(false);
      expect(isClientSource("anything")).toBe(false);
      expect(() => assertNoClientSources(["anything", "second-brain"])).not.toThrow();
    } finally {
      process.env.EBRAIN_DENIED_REPOS = saved;
    }
  });

  test("a malformed policy entry fails closed instead of silently shrinking the policy", () => {
    const saved = process.env.EBRAIN_DENIED_REPOS;
    process.env.EBRAIN_DENIED_REPOS = "denied-alpha,../escape";
    try {
      expect(() => clientDenylist()).toThrow(/invalid deny entry/);
    } finally {
      process.env.EBRAIN_DENIED_REPOS = saved;
    }
  });
});

describe("D.5 gate — plano-sesión: ninguna sesión puede lanzar en un repo de cliente", () => {
  test("isClientPath bloquea las formas literal / subpath / case, y NO nombres parciales", () => {
    expect(isClientPath("/home/e/repos/denied-alpha")).toBe(true);
    expect(isClientPath("/home/e/repos/denied-alpha/src/api")).toBe(true);
    expect(isClientPath("/home/e/work/denied-beta")).toBe(true);
    expect(isClientPath("/home/e/work/DENIED-BETA/x")).toBe(true); // case-insensitive
    // no-cliente:
    expect(isClientPath("/home/e/eBrain")).toBe(false);
    expect(isClientPath("/home/e/repos/denied-alpha-notes")).toBe(false); // segmento no exacto
    expect(isClientPath("/home/e/second-brain")).toBe(false);
  });

  test("CIERRA el gap F6.4.8: un symlink de nombre inocente que RESUELVE a un repo de cliente se deniega", () => {
    const base = mkdtempSync(join(tmpdir(), "ebr-iso-"));
    try {
      const clientDir = join(base, "denied-alpha");
      mkdirSync(clientDir);
      const link = join(base, "innocent-name");
      symlinkSync(clientDir, link);
      // El nombre literal del link NO delata al cliente…
      expect(isClientPath(link)).toBe(false);
      // …pero al resolver el symlink (lo que hace newSession con realpathSync) SÍ se deniega.
      expect(isClientPath(realpathSync(link))).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("D.5 gate — plano-source: ningún repo de cliente es un source federado del host", () => {
  test("isClientSource deniega nombres de source de cliente (substring, case-insensitive)", () => {
    expect(isClientSource("denied-alpha")).toBe(true);
    expect(isClientSource("code-graph/denied-alpha")).toBe(true); // el vector del Dev Brain (ADR-001 §Frontera)
    expect(isClientSource("DENIED-BETA")).toBe(true);
    // sources legítimos del knowledge layer:
    expect(isClientSource("second-brain")).toBe(false);
    expect(isClientSource("company-brain")).toBe(false);
    expect(isClientSource("agent-memory")).toBe(false);
    expect(isClientSource("dev-brain")).toBe(false);
  });

  test("federatedSources reproduce el filtro de ebrain-q: federado · !default · !cliente", () => {
    const raw = [
      "second-brain    federated   1234 pages",
      "company-brain   federated   567 pages",
      "default         federated   0 pages",         // 'default' se excluye
      "agent-memory    federated   89 pages",
      "denied-alpha federated  999 pages",        // un cliente colado → DEBE excluirse
      "some-local      local       12 pages",         // no-federado → excluido
    ].join("\n");
    const got = federatedSources(raw);
    expect(got).toEqual(["second-brain", "company-brain", "agent-memory"]);
    expect(got).not.toContain("default");
    expect(got).not.toContain("denied-alpha");
  });

  test("isClientSourceRecord deniega por CUALQUIER campo de identidad (id, name o local_path)", () => {
    // G56-F5: un source con id inocente puede delatarse por su display name o su local_path.
    expect(isClientSourceRecord({ id: "clean" })).toBe(false);
    expect(isClientSourceRecord({ id: "denied-alpha" })).toBe(true);            // por id
    expect(isClientSourceRecord({ id: "cust-1", name: "DENIED-BETA client" })).toBe(true); // por name
    expect(isClientSourceRecord({ id: "cust-2", path: "/home/e/repos/denied-alpha" })).toBe(true); // por path
    expect(isClientSourceRecord({ id: "cust-3", path: "/home/e/work/denied-beta/src" })).toBe(true); // subpath
    // campos no-string se ignoran sin romper:
    expect(isClientSourceRecord({ id: 123, name: null, path: undefined })).toBe(false);
  });

  test("assertNoClientSources: verde con sources limpios, TIRA si un cliente se cuela", () => {
    expect(() => assertNoClientSources(["second-brain", "company-brain", "agent-memory"])).not.toThrow();
    expect(() => assertNoClientSources(["second-brain", "denied-alpha"])).toThrow(/isolation broken/);
    // The message must report a COUNT and never echo the denied identifier back to the operator.
    expect(() => assertNoClientSources(["dev-brain", "code-graph/denied-beta"])).toThrow(/1 denied source/);
    expect(() => assertNoClientSources(["dev-brain", "code-graph/denied-beta"])).not.toThrow(/denied-beta/);
  });
});
