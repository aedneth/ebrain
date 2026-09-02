/**
 * Tests de spend.ts — funciones puras sobre un ledger fixture (sin red, sin routing.yaml real).
 * `bun test cli/spend.test.ts`.
 */
import { test, expect } from "bun:test";
import { spendByCapability, resolveEngineAuditDir } from "./spend.ts";
import { monthKey } from "./route.ts";
import { tmpdir } from "os";
import { join } from "path";

async function writeFixture(lines: string[]): Promise<string> {
  const path = join(tmpdir(), `ebrain-spend-cap-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  await Bun.write(path, lines.join("\n") + "\n");
  return path;
}

test("spendByCapability: agrega MTD y conteo por cap, ignora otro mes y líneas corruptas", async () => {
  const mk = monthKey();
  const other = mk.startsWith("2026-07") ? "2026-06" : "2020-01";
  const path = await writeFixture([
    `{"ts":"${mk}-05T10:00:00Z","cap":"coding","usd":0.10}`,
    `{"ts":"${mk}-06T10:00:00Z","cap":"coding","usd":0.05}`,
    `{"ts":"${mk}-06T11:00:00Z","cap":"web_design","usd":0.02}`,
    `{"ts":"${other}-06T10:00:00Z","cap":"coding","usd":9.99}`,   // otro mes: no cuenta
    `basura no-json`,                                            // corrupta: se ignora
    `{"ts":"${mk}-07T10:00:00Z","cap":"reasoning","usd":0.03}`,
  ]);
  const rows = await spendByCapability(path, ["coding", "web_design", "reasoning", "terminal"]);
  const byName = Object.fromEntries(rows.map((r) => [r.capability, r]));

  expect(byName.coding.mtd).toBeCloseTo(0.15, 6);
  expect(byName.coding.routes).toBe(2);
  expect(byName.web_design.mtd).toBeCloseTo(0.02, 6);
  expect(byName.reasoning.mtd).toBeCloseTo(0.03, 6);
  // capacidad conocida sin uso este mes → 0, no ausente (para que el gauge la muestre en 0)
  expect(byName.terminal.mtd).toBe(0);
  expect(byName.terminal.routes).toBe(0);
});

test("spendByCapability: un cap del ledger que NO está en knownCapabilities se agrega igual (nunca se descarta gasto real)", async () => {
  const mk = monthKey();
  const path = await writeFixture([
    `{"ts":"${mk}-05T10:00:00Z","cap":"agentic","usd":0.20}`,
  ]);
  const rows = await spendByCapability(path, ["coding"]); // "agentic" no está declarada
  const byName = Object.fromEntries(rows.map((r) => [r.capability, r]));
  expect(byName.agentic).toBeDefined();
  expect(byName.agentic.mtd).toBeCloseTo(0.20, 6);
  expect(byName.coding.mtd).toBe(0);
});

test("spendByCapability: ledger inexistente → todas las capacidades conocidas en 0", async () => {
  const rows = await spendByCapability(join(tmpdir(), "no-existe-jamas-spend.jsonl"), ["coding", "terminal"]);
  expect(rows.every((r) => r.mtd === 0 && r.routes === 0)).toBe(true);
  expect(rows.length).toBe(2);
});

test("spendByCapability: ignora líneas sin 'cap' o sin 'usd' numérico", async () => {
  const mk = monthKey();
  const path = await writeFixture([
    `{"ts":"${mk}-05T10:00:00Z","usd":0.10}`,               // sin cap
    `{"ts":"${mk}-05T10:00:00Z","cap":"coding","usd":"x"}`, // usd no-numérico
  ]);
  const rows = await spendByCapability(path, ["coding"]);
  expect(rows[0].mtd).toBe(0);
  expect(rows[0].routes).toBe(0);
});

test("spendByCapability: ordena descendente por mtd", async () => {
  const mk = monthKey();
  const path = await writeFixture([
    `{"ts":"${mk}-05T10:00:00Z","cap":"low","usd":0.01}`,
    `{"ts":"${mk}-05T10:00:00Z","cap":"high","usd":0.50}`,
  ]);
  const rows = await spendByCapability(path, ["low", "high"]);
  expect(rows[0].capability).toBe("high");
  expect(rows[1].capability).toBe("low");
});

// ── resolveEngineAuditDir (memory-ootb: fold the engine lane into ebrain spend) ────────────────
// Mirrors cli/embedder-detect.ts's resolveConfigPath convention: GBRAIN_HOME is a *parent*
// directory, `.gbrain` is always appended. Uses an injected env object throughout — never reads
// or touches the real process.env / real ~/.gbrain.

test("resolveEngineAuditDir: GBRAIN_HOME set → <GBRAIN_HOME>/.gbrain/audit", () => {
  const dir = resolveEngineAuditDir({ GBRAIN_HOME: "/srv/thin-gbrain", HOME: "/home/someone" });
  expect(dir).toBe(join("/srv/thin-gbrain", ".gbrain", "audit"));
});

test("resolveEngineAuditDir: no GBRAIN_HOME → falls back to <HOME>/.gbrain/audit", () => {
  const dir = resolveEngineAuditDir({ HOME: "/home/someone" });
  expect(dir).toBe(join("/home/someone", ".gbrain", "audit"));
});

test("resolveEngineAuditDir: blank GBRAIN_HOME is treated as unset, falls back to HOME", () => {
  const dir = resolveEngineAuditDir({ GBRAIN_HOME: "  ", HOME: "/home/someone" });
  expect(dir).toBe(join("/home/someone", ".gbrain", "audit"));
});
