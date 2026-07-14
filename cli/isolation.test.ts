/**
 * cli/isolation.test.ts — FASE D.5, el GATE DE AISLAMIENTO (ADR-004 criterio 4).
 *
 * Verifica que la migración al canal compartido HTTP-MCP PRESERVA:
 *   (a) el aislamiento de repos de cliente (brisas/dekko) — plano-sesión + plano-source,
 *   (b) el default-deny de federación (ADR-001) — un source entra solo si es federado y
 *       explícito; jamás un repo de cliente.
 * Todo PURO / offline (sin host, sin tmux, sin engine) — corre en la suite CI.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLIENT_DENYLIST,
  isClientPath,
  isClientSource,
  federatedSources,
  assertNoClientSources,
} from "./isolation.ts";

describe("D.5 gate — denylist integrity (SoT en el que confía el canal compartido)", () => {
  test("CLIENT_DENYLIST no está vacío y contiene los dos repos de cliente", () => {
    expect(CLIENT_DENYLIST.length).toBeGreaterThan(0);
    expect(CLIENT_DENYLIST).toContain("brisas-del-golfo");
    expect(CLIENT_DENYLIST).toContain("dekko");
  });
});

describe("D.5 gate — plano-sesión: ninguna sesión puede lanzar en un repo de cliente", () => {
  test("isClientPath bloquea las formas literal / subpath / case, y NO nombres parciales", () => {
    expect(isClientPath("/home/e/repos/brisas-del-golfo")).toBe(true);
    expect(isClientPath("/home/e/repos/brisas-del-golfo/src/api")).toBe(true);
    expect(isClientPath("/home/e/work/dekko")).toBe(true);
    expect(isClientPath("/home/e/work/DEKKO/x")).toBe(true); // case-insensitive
    // no-cliente:
    expect(isClientPath("/home/e/eBrain")).toBe(false);
    expect(isClientPath("/home/e/repos/brisas-del-golfo-notes")).toBe(false); // segmento no exacto
    expect(isClientPath("/home/e/second-brain")).toBe(false);
  });

  test("CIERRA el gap F6.4.8: un symlink de nombre inocente que RESUELVE a un repo de cliente se deniega", () => {
    const base = mkdtempSync(join(tmpdir(), "ebr-iso-"));
    try {
      const clientDir = join(base, "brisas-del-golfo");
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
    expect(isClientSource("brisas-del-golfo")).toBe(true);
    expect(isClientSource("code-graph/brisas-del-golfo")).toBe(true); // el vector del Dev Brain (ADR-001 §Frontera)
    expect(isClientSource("DEKKO")).toBe(true);
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
      "brisas-del-golfo federated  999 pages",        // un cliente colado → DEBE excluirse
      "some-local      local       12 pages",         // no-federado → excluido
    ].join("\n");
    const got = federatedSources(raw);
    expect(got).toEqual(["second-brain", "company-brain", "agent-memory"]);
    expect(got).not.toContain("default");
    expect(got).not.toContain("brisas-del-golfo");
  });

  test("assertNoClientSources: verde con sources limpios, TIRA si un cliente se cuela", () => {
    expect(() => assertNoClientSources(["second-brain", "company-brain", "agent-memory"])).not.toThrow();
    expect(() => assertNoClientSources(["second-brain", "brisas-del-golfo"])).toThrow(/aislamiento roto/);
    expect(() => assertNoClientSources(["dev-brain", "code-graph/dekko"])).toThrow(/dekko/);
  });
});
