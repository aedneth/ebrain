import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gastoDelMes, proyectar, rutaVisible, sanearFrontmatter, seleccionar, topeDeEstaCorrida, type Config, type Fuente } from "./memoria.ts";
import { engineHome } from "./engine-home.ts";

const base = mkdtempSync(join(tmpdir(), "ebrain-memoria-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));
const raiz = join(base, "brain");
const escribir = (rel: string, texto: string) => {
  mkdirSync(dirname(join(raiz, rel)), { recursive: true });
  writeFileSync(join(raiz, rel), texto);
};
escribir("04-strategy/canon.md", "---\nstatus: active\ntags: [#canon, #oferta]\n---\n# Canon\n");
escribir("12-archive/viejo.md", "# Viejo\n");
escribir("00-inbox/borrador.md", "---\nstatus: superseded\n---\n# Borrador\n");
escribir("docs/guia-b.md", "# Guía\n\n> **Descartada el 2026-10-10.** Se usa otra.\n");
escribir("02-daily/logs/hoy.md", "# Ruido\n");
escribir("07-clients/x/record.md", "# Cliente\n");
escribir("11-platform/.brain/decisions/d.md", "# Decisión\n");
escribir("09-marketing/videos/core/build/nota.md", "# Nota\n");
escribir("06-sales/menciona.md", "# Trabajo para acme\n");

const fuente: Fuente = { id: "brain", raiz, excluir: ["^02-daily/"], podar: ["07-clients"] };
const config: Config = {
  corpus: join(base, "corpus"), fuentes: [fuente], denegados: "acme",
  retirado: { prefijos: ["12-archive/"], estados: ["superseded", "historical"] },
  llave: join(base, "no-existe"), topeCorridaUsd: 0.02, topeMensualUsd: 2,
};

describe("the projection", () => {
  test("keeps what is live and leaves out the archive, retired docs, noise and pruned directories", () => {
    const rutas = seleccionar(fuente, config).map((x) => x.rel);
    expect(rutas).toContain("04-strategy/canon.md");
    expect(rutas).toContain("11-platform/.brain/decisions/d.md");
    for (const fuera of ["12-archive/viejo.md", "00-inbox/borrador.md", "docs/guia-b.md", "02-daily/logs/hoy.md", "07-clients/x/record.md"]) {
      expect(rutas).not.toContain(fuera);
    }
  });

  test("the denied-text rule applies only to the sources that ask for it", () => {
    expect(seleccionar(fuente, config).map((x) => x.rel)).toContain("06-sales/menciona.md");
    expect(seleccionar({ ...fuente, denegadosEnContenido: true }, config).map((x) => x.rel)).not.toContain("06-sales/menciona.md");
  });

  test("hidden and build-named segments get a visible name", () => {
    expect(rutaVisible("11-platform/.brain/decisions/d.md")).toBe("11-platform/brain/decisions/d.md");
    expect(rutaVisible("09-marketing/videos/core/build/nota.md")).toBe("09-marketing/videos/core/build_/nota.md");
  });

  test("hash tags are quoted so the engine does not reject the document", () => {
    expect(sanearFrontmatter("---\ntags: [#canon, #oferta]\n---\n# X\n")).toBe('---\ntags: ["#canon", "#oferta"]\n---\n# X\n');
    const limpio = "---\ntags: [canon, oferta]\ntitle: x\n---\n# X\n";
    expect(sanearFrontmatter(limpio)).toBe(limpio);
    expect(sanearFrontmatter("# Sin frontmatter [#a]\n")).toBe("# Sin frontmatter [#a]\n");
  });

  test("a second run changes nothing, and a deleted document leaves the corpus", () => {
    const uno = proyectar(fuente, config);
    expect(uno.cambios).toBeGreaterThan(0);
    expect(readFileSync(join(uno.dir, "04-strategy/canon.md"), "utf8")).toContain('"#canon"');
    expect(proyectar(fuente, config).cambios).toBe(0);
    rmSync(join(raiz, "06-sales/menciona.md"));
    const tres = proyectar(fuente, config);
    expect(tres.cambios).toBe(1);
    expect(existsSync(join(tres.dir, "06-sales/menciona.md"))).toBe(false);
  });
});

describe("the spend caps", () => {
  test("the month sums the ledger's actual spend, only that month, and survives a torn line", () => {
    const audit = join(base, "audit");
    mkdirSync(audit);
    writeFileSync(join(audit, "budget-2026-W44.jsonl"), [
      JSON.stringify({ ts: "2026-10-31T23:00:00Z", event: "record", actual_cost_usd: 5 }),
      JSON.stringify({ ts: "2026-11-01T01:00:00Z", event: "record", actual_cost_usd: 0.5 }),
    ].join("\n"));
    writeFileSync(join(audit, "budget-2026-W45.jsonl"), [
      JSON.stringify({ ts: "2026-11-03T01:00:00Z", event: "reserve", projected_cost_usd: 9 }),
      JSON.stringify({ ts: "2026-11-03T01:00:01Z", event: "record", actual_cost_usd: 0.25 }),
      '{"ts":"2026-11-03T01:00:02Z","actual_cost_usd":',
    ].join("\n"));
    expect(gastoDelMes(audit, "2026-11")).toBeCloseTo(0.75, 10);
    expect(gastoDelMes(audit, "2026-10")).toBeCloseTo(5, 10);
    expect(gastoDelMes(join(base, "no-existe"), "2026-11")).toBe(0);
  });

  test("a run never spends more than the run cap, nor more than the month leaves; at the cap it skips", () => {
    expect(topeDeEstaCorrida(0.5, 0.02, 2)).toBe(0.02);
    expect(topeDeEstaCorrida(1.99, 0.02, 2)).toBeCloseTo(0.01, 10);
    expect(topeDeEstaCorrida(2, 0.02, 2)).toBe(0);
    expect(topeDeEstaCorrida(2.5, 0.02, 2)).toBe(0);
  });
});

describe("the engine home", () => {
  test("GBRAIN_HOME wins, then the pointer, then HOME", () => {
    const home = join(base, "home");
    mkdirSync(join(home, ".config", "ebrain"), { recursive: true });
    expect(engineHome({ HOME: home })).toBe(home);
    writeFileSync(join(home, ".config", "ebrain", "engine-home"), "/data/brain\n");
    expect(engineHome({ HOME: home })).toBe("/data/brain");
    expect(engineHome({ HOME: home, GBRAIN_HOME: "/x" })).toBe("/x");
  });
});
