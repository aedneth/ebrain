/**
 * Tests de fleet.ts — funciones puras sobre fixtures de directorio (sin tocar los adapters reales,
 * salvo un smoke test final contra harness/adapters/ de verdad). `bun test cli/fleet.test.ts`.
 */
import { test, expect } from "bun:test";
import { listAdapters, readClass, doctorOk } from "./fleet.ts";
import { mkdirSync, writeFileSync, rmSync, chmodSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function freshDir(): string {
  const d = join(tmpdir(), `ebrain-fleet-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(d, { recursive: true });
  return d;
}

test("listAdapters: solo cuenta subdirs con manifest.yaml, ordenado alfabético", () => {
  const dir = freshDir();
  mkdirSync(join(dir, "zeta"), { recursive: true });
  writeFileSync(join(dir, "zeta", "manifest.yaml"), "agent: zeta\n");
  mkdirSync(join(dir, "alpha"), { recursive: true });
  writeFileSync(join(dir, "alpha", "manifest.yaml"), "agent: alpha\n");
  mkdirSync(join(dir, "sin-manifest"), { recursive: true }); // sin manifest.yaml → no cuenta
  writeFileSync(join(dir, "archivo-suelto.txt"), "x"); // no es directorio → no cuenta

  expect(listAdapters(dir)).toEqual(["alpha", "zeta"]);
  rmSync(dir, { recursive: true, force: true });
});

test("listAdapters: directorio inexistente → []", () => {
  expect(listAdapters(join(tmpdir(), "no-existe-jamas-adapters"))).toEqual([]);
});

test("readClass: heavy/light declarados, ausente → unknown, YAML corrupto → unknown", async () => {
  const dir = freshDir();
  mkdirSync(join(dir, "h"), { recursive: true });
  writeFileSync(join(dir, "h", "manifest.yaml"), "agent: h\nclass: heavy\n");
  mkdirSync(join(dir, "l"), { recursive: true });
  writeFileSync(join(dir, "l", "manifest.yaml"), "agent: l\nclass: light\n");
  mkdirSync(join(dir, "sin-clase"), { recursive: true });
  writeFileSync(join(dir, "sin-clase", "manifest.yaml"), "agent: sin-clase\n");
  mkdirSync(join(dir, "invalida"), { recursive: true });
  writeFileSync(join(dir, "invalida", "manifest.yaml"), "agent: invalida\nclass: medium\n"); // valor no reconocido

  expect(await readClass("h", dir)).toBe("heavy");
  expect(await readClass("l", dir)).toBe("light");
  expect(await readClass("sin-clase", dir)).toBe("unknown");
  expect(await readClass("invalida", dir)).toBe("unknown");
  expect(await readClass("no-existe", dir)).toBe("unknown");
  rmSync(dir, { recursive: true, force: true });
});

test("doctorOk: rc=0 del script → true, rc!=0 → false", () => {
  const dir = freshDir();
  const okScript = join(dir, "ok.sh");
  writeFileSync(okScript, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(okScript, 0o755);
  const failScript = join(dir, "fail.sh");
  writeFileSync(failScript, "#!/usr/bin/env bash\nexit 1\n");
  chmodSync(failScript, 0o755);

  expect(doctorOk("any-agent", okScript)).toBe(true);
  expect(doctorOk("any-agent", failScript)).toBe(false);
  rmSync(dir, { recursive: true, force: true });
});

test("smoke: los 6 adapters reales del harness declaran class heavy|light (nunca unknown)", async () => {
  const names = listAdapters();
  expect(names.sort()).toEqual(["claude", "codex", "cursor", "gemini", "generic", "opencode"]);
  const heavy = ["claude", "codex", "cursor", "opencode"];
  const light = ["gemini", "generic"];
  for (const n of names) {
    const cls = await readClass(n);
    expect(cls).not.toBe("unknown");
    if (heavy.includes(n)) expect(cls).toBe("heavy");
    if (light.includes(n)) expect(cls).toBe("light");
  }
});
