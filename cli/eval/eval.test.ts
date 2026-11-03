import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cargarCasos, estadoDeRuta, indiceDelCorpus, normalizar } from "./casos.ts";
import { validar } from "./validar.ts";
import { evaluarCaso, percentil, techoDeGasto, topKDocumentos } from "./runner.ts";

const raiz = mkdtempSync(join(tmpdir(), "ebrain-eval-"));
afterAll(() => rmSync(raiz, { recursive: true, force: true }));
const escribir = (rel: string, texto: string) => {
  mkdirSync(join(raiz, rel, ".."), { recursive: true });
  writeFileSync(join(raiz, rel), texto);
};
escribir("04-strategy/OFERTA-CANONICA.md", "---\nstatus: active\n---\n# Canon v4\n");
escribir("12-archive/OFERTA-v3.md", "# Canon v3\n");
escribir("00-inbox/borrador.md", "---\nstatus: superseded\nsuperseded_by: 04-strategy/OFERTA-CANONICA.md\n---\n# Borrador\n");
escribir("docs/guia-b.md", "# Guía B\n\n> **Descartada el 2026-10-10.** Se usa la guía A.\n");
escribir("04-strategy/plan-viejo.md", "# Plan con las 3 capas que se suman\n");
escribir("07-clients/x/record.md", "# Cliente\n");

const yaml = (casos: string) =>
  `version: 1\ncorpus:\n  raiz: ${raiz}\n  excluir: ["07-clients/"]\n  retirado:\n    prefijos: ["12-archive/"]\n    estados: [superseded, historical]\n  top_k: 5\ncasos:\n${casos}`;

const base = cargarCasos(yaml(`  - id: A1
    consulta: "¿cuánto cuesta?"
    vigente: [04-strategy/OFERTA-CANONICA.md]
    retiradas: [12-archive/OFERTA-v3.md, 00-inbox/borrador.md, docs/guia-b.md]
    contradice: [04-strategy/plan-viejo.md]
    fuente: prueba
    confirmado: true
`));

describe("la regla de lo retirado", () => {
  test("reconoce el archivo, el estado, superseded_by y el banner; lo vivo queda vigente", () => {
    const c = base.corpus;
    expect(estadoDeRuta(c, "04-strategy/OFERTA-CANONICA.md")).toBe("vigente");
    expect(estadoDeRuta(c, "12-archive/OFERTA-v3.md")).toBe("retirada");
    expect(estadoDeRuta(c, "00-inbox/borrador.md")).toBe("retirada");
    expect(estadoDeRuta(c, "docs/guia-b.md")).toBe("retirada");
    expect(estadoDeRuta(c, "04-strategy/plan-viejo.md")).toBe("vigente");
    expect(estadoDeRuta(c, "no/existe.md")).toBe("inexistente");
    expect(estadoDeRuta(c, "07-clients/x/record.md")).toBe("excluida");
    expect(estadoDeRuta(c, join(raiz, "04-strategy/OFERTA-CANONICA.md"))).toBe("externa");
    expect(estadoDeRuta(c, "/no/existe/memoria.md")).toBe("inexistente");
  });

  test("el índice del corpus no incluye lo excluido", () => {
    const idx = indiceDelCorpus(base.corpus);
    expect([...idx.values()].some((r) => r.startsWith("07-clients/"))).toBe(false);
    expect(idx.get(normalizar("04-strategy/OFERTA-CANONICA.md"))).toBe("04-strategy/OFERTA-CANONICA.md");
  });

  test("normalizar iguala la URI de qmd, el slug de gbrain y la ruta del árbol", () => {
    const n = normalizar("04-strategy/modelo-y-oferta/OFERTA-CANONICA.md");
    expect(normalizar("qmd://company-brain/04-strategy/modelo-y-oferta/OFERTA-CANONICA.md")).toBe(n);
    expect(normalizar("04-strategy/modelo-y-oferta/oferta-canonica")).toBe(n);
    expect(normalizar("qmd://korvex/04-strategy/modelo-y-oferta/OFERTA-CANONICA.md?index=e2con")).toBe(n);
    expect(normalizar("11-platform/brain/decisions/x.md")).toBe(normalizar("11-platform/.brain/decisions/x.md"));
  });
});

describe("el validador", () => {
  test("un caso bien formado pasa y la deriva sin marcar sale como aviso", () => {
    const h = validar(base, [], 1, 50);
    expect(h.filter((x) => x.nivel === "error")).toEqual([]);
    expect(h.some((x) => x.nivel === "aviso" && x.mensaje.includes("plan-viejo.md"))).toBe(true);
  });

  test("falla si una retirada está viva, si la vigente no existe, si hay id repetido o un cliente", () => {
    const a = cargarCasos(yaml(`  - id: B1
    consulta: "precio de acme"
    vigente: [no/existe.md]
    retiradas: [04-strategy/plan-viejo.md]
    fuente: prueba
  - id: B1
    consulta: "otra"
    vigente: [07-clients/x/record.md]
    fuente: prueba
`));
    const msgs = validar(a, ["acme"], 1, 50).filter((x) => x.nivel === "error").map((x) => x.mensaje);
    expect(msgs.some((m) => m.startsWith("vigente inexistente"))).toBe(true);
    expect(msgs.some((m) => m.includes("la regla la ve vigente"))).toBe(true);
    expect(msgs).toContain("id repetido");
    expect(msgs.some((m) => m.startsWith("vigente excluida"))).toBe(true);
    expect(msgs).toContain("menciona un repo denegado (cliente)");
  });

  test("falla si el total queda fuera del rango pedido", () => {
    expect(validar(base, [], 30, 50).some((x) => x.id === "*" && x.nivel === "error")).toBe(true);
  });
});

describe("el runner", () => {
  const idx = indiceDelCorpus(base.corpus);
  const estado = (rel: string) => estadoDeRuta(base.corpus, rel);

  test("mide acierto, rango y los tres tipos de fuga", () => {
    const top = topKDocumentos([
      { ruta: "qmd://company-brain/12-archive/OFERTA-v3.md", fragmento: "v3" },
      { ruta: "qmd://company-brain/12-archive/OFERTA-v3.md", fragmento: "v3 otra vez" },
      { ruta: "company-brain/ruta-de-antes-del-pivote", fragmento: "viejo" },
      { ruta: "04-strategy/plan-viejo", fragmento: "3 capas" },
      { ruta: "04-strategy/oferta-canonica", fragmento: "canon" },
    ], 5);
    const ev = evaluarCaso(base.casos[0], top, idx, estado, { bytesCrudos: 100, ms: 7 });
    expect(top.length).toBe(4);
    expect(ev.acierto).toBe(true);
    expect(ev.rango).toBe(4);
    expect(ev.fugaRetirada).toEqual(["12-archive/OFERTA-v3.md"]);
    expect(ev.fugaObsoleta).toEqual(["company-brain/ruta-de-antes-del-pivote"]);
    expect(ev.fugaSinMarcar).toEqual(["04-strategy/plan-viejo.md"]);
  });

  test("un resultado de clientes no es fuga ni obsoleto, y no guarda su ruta", () => {
    const top = [{ ruta: "qmd://company-brain/07-clients/x/record.md", fragmento: "cliente" }];
    const ev = evaluarCaso(base.casos[0], top, idx, estado, { bytesCrudos: 1, ms: 1 }, ["12-archive/"], ["07-clients/"]);
    expect(ev.excluidas).toBe(1);
    expect(ev.fugaObsoleta).toEqual([]);
    expect(ev.devueltas).toEqual(["<excluida>"]);
  });

  test("lo que viene de 12-archive y ya no existe es fuga retirada y obsoleta a la vez", () => {
    const top = [{ ruta: "12-archive/web-copy-drafts/borrador", fragmento: "viejo" }];
    const ev = evaluarCaso(base.casos[0], top, idx, estado, { bytesCrudos: 1, ms: 1 }, ["12-archive/"], ["07-clients/"]);
    expect(ev.fugaRetirada.length).toBe(1);
    expect(ev.fugaObsoleta.length).toBe(1);
  });

  test("el techo de gasto cuenta bytes como tokens y suma el reranker", () => {
    const t = techoDeGasto(["ab", "ñ"], 3, 0.0003);
    expect(t.tokens_techo).toBe((2 + 2) * 3);
    expect(t.llamadas).toBe(6);
    expect(t.total_usd).toBeCloseTo((12 * 0.13) / 1e6 + 6 * 0.0003, 10);
  });

  test("percentil 95", () => {
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 95)).toBe(100);
    expect(percentil([], 95)).toBe(0);
  });
});
