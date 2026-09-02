#!/usr/bin/env bun
/**
 * ebrain fleet — estado de salud + clase RAM de los adapters del harness (SPRINT-TUI 6.1.4).
 * Envuelve `install.sh --doctor <agent>` (el MISMO chequeo que corre doctor.sh y
 * `ebrain harness doctor` por adapter — cero lógica de negocio nueva, solo agregación) y le suma
 * la clase RAM (`class: heavy|light`) declarada en cada manifest.yaml — insumo del gobernador de
 * RAM (F6.4.6: "un heavy a la vez" en el Celeron de 4GB). heavy = codex/claude/cursor/opencode;
 * light = gemini/generic.
 *
 * Uso:
 *   ebrain fleet --json     # {agents:[{name,ok,class}]}
 *   ebrain fleet            # texto plano
 */
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HOME = homedir();
// An installed instance exports EBRAIN_HOME; running from source falls back to this file's own
// checkout, NOT to "$HOME/eBrain". Defaulting to a developer home checkout is the defect that broke
// task-profile rules in CI and the published quickstart in the F7-F12 audit — a source user who
// cloned anywhere else silently got no adapters at all. Same pattern as cli/task-profile.ts.
const EBRAIN_HOME = process.env.EBRAIN_HOME || join(import.meta.dir, "..");
const ADAPTERS_DIR = join(EBRAIN_HOME, "harness", "adapters");
const INSTALL_SH = join(EBRAIN_HOME, "harness", "core", "install.sh");

export type AgentClass = "heavy" | "light" | "unknown";
export interface AgentStatus { name: string; ok: boolean; class: AgentClass }

// Un adapter = un subdirectorio de ADAPTERS_DIR con manifest.yaml (mismo criterio que
// `all_agents()` en install.sh/doctor.sh — no duplica una lista hardcodeada de nombres).
export function listAdapters(dir = ADAPTERS_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "manifest.yaml")))
    .map((d) => d.name)
    .sort();
}

// class ausente/inválida en el manifest → "unknown" (fail-visible, no asume heavy ni light).
export async function readClass(agent: string, dir = ADAPTERS_DIR): Promise<AgentClass> {
  const manifestPath = join(dir, agent, "manifest.yaml");
  const f = Bun.file(manifestPath);
  if (!(await f.exists())) return "unknown";
  try {
    const doc = (Bun as unknown as { YAML: { parse: (s: string) => Record<string, unknown> } }).YAML.parse(await f.text());
    return doc?.class === "heavy" || doc?.class === "light" ? (doc.class as AgentClass) : "unknown";
  } catch {
    return "unknown";
  }
}

// rc=0 de `install.sh --doctor <agent>` → ok. Mismo criterio que doctor.sh usa para "adapter $a".
// Async (Bun.spawn, no spawnSync) para que main() pueda correr los 6 doctors EN PARALELO: son
// independientes y I/O-bound (cada uno probea su propio agente — codex ~5.5s, gemini ~4.3s dominan;
// secuencial ⇒ ~15s). En paralelo el total ≈ max(adapter) ≈ ≤6s (SPRINT-TUI 6.1.8 perf).
// EBRAIN_CONTRACT_TESTED=1: el contrato es un chequeo GLOBAL (competencia de `ebrain doctor`, que lo
// corre 1× autoritativo), no per-adapter — fleet lo saltea en las 6 spawns (contract-test.sh sale 0).
// Env spread completo: Bun REEMPLAZA el entorno si se pasa `env`, así que preservamos PATH/HOME/etc.
export async function doctorOk(agent: string, installSh = INSTALL_SH): Promise<boolean> {
  const proc = Bun.spawn(["bash", installSh, "--doctor", agent], {
    stdout: "ignore",
    stderr: "ignore",
    env: { ...process.env, EBRAIN_CONTRACT_TESTED: "1" },
  });
  return (await proc.exited) === 0;
}

async function main() {
  const json = process.argv.includes("--json");
  const agents = listAdapters();
  // Paralelo: Promise.all preserva el orden de `agents` (ya sorted). Los 6 spawns concurrentes son
  // probes livianos (no agentes pesados) → seguro en el Celeron de 4GB.
  const results: AgentStatus[] = await Promise.all(
    agents.map(async (name) => {
      const [cls, ok] = await Promise.all([readClass(name), doctorOk(name)]);
      return { name, ok, class: cls } as AgentStatus;
    }),
  );

  if (json) {
    console.log(JSON.stringify({ agents: results }, null, 2));
    return;
  }

  console.log("ebrain fleet");
  for (const a of results) {
    console.log(`  ${a.ok ? "ok  " : "warn"}  ${a.name.padEnd(10)} class=${a.class}`);
  }
}

if (import.meta.main) main().catch((e) => { console.error(`✗ ${e?.message ?? e}`); process.exit(1); });
