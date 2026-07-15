/**
 * cli/isolation.ts — superficie única de los invariantes de aislamiento que el
 * CANAL COMPARTIDO del daemon (FASE D / ADR-004 criterio 4) debe preservar.
 *
 * Dos planos, ambos PUROS y testeables en CI (ver cli/isolation.test.ts):
 *   1. plano-sesión: `isClientPath` — ningún agente puede lanzar una sesión cuyo cwd
 *      resuelva bajo un repo de cliente (brisas/dekko). Es la puerta por la que el código
 *      de cliente NUNCA entra al brain vía una sesión. (SoT del denylist: cli/sessions.ts.)
 *   2. plano-source: `isClientSource` / `federatedSources` / `assertNoClientSources` —
 *      ningún repo de cliente puede aparecer como source federado del host compartido.
 *      Reproduce el filtro de discovery de `scripts/ebrain-q` (federated · !default · !cliente)
 *      como función pura, para que el host (D.4/D.6) pueda ENFORZARLo, no solo documentarlo
 *      (ADR-001 §Frontera brisas: brisas/dekko nunca son sources; ni el code-graph del Dev
 *      Brain — se registra por sub-path omitiéndolo).
 */
import { CLIENT_DENYLIST, isClientPath } from "./sessions.ts";

export { CLIENT_DENYLIST, isClientPath };

/**
 * Un nombre de source es de repo-cliente (jamás federable) si contiene un nombre del
 * denylist, case-insensitive. Espeja la semántica de `grep -vE 'brisas|dekko'` de ebrain-q.
 */
export function isClientSource(name: string): boolean {
  const n = name.toLowerCase();
  return CLIENT_DENYLIST.some((d) => n.includes(d.toLowerCase()));
}

/**
 * Filtro de discovery de sources como fn pura: de la salida cruda de `sources list`,
 * quedarse SOLO con los federados, no-'default', no-cliente. Mismo criterio que el
 * `awk '/federated/ && $1 != "default"' | grep -vE 'brisas|dekko'` de ebrain-q.
 */
export function federatedSources(rawSourcesList: string): string[] {
  return rawSourcesList
    .split("\n")
    .filter((l) => /federated/.test(l))
    .map((l) => l.trim().split(/\s+/)[0] ?? "")
    .filter((name) => name.length > 0 && name !== "default" && !isClientSource(name));
}

/**
 * Aserción de gate: ningún source de cliente puede aparecer NUNCA en un set federado.
 * Hoy la ejerce el CI test (cli/isolation.test.ts); cablearla al boot del host
 * (scripts/ebrain-brain, antes de exponer MCP) es la tarea D.5.4, PENDIENTE.
 * Auditoría Opus 2026-07-14: la enforcement en runtime del host aún NO está cableada
 * — el aislamiento vivo hoy se apoya en federación default-deny + fail-check de doctor.
 */
export function assertNoClientSources(sources: readonly string[]): void {
  const leaked = sources.filter(isClientSource);
  if (leaked.length > 0) {
    throw new Error(
      `aislamiento roto: sources de repo-cliente filtrados a la federación: ${leaked.join(", ")}`,
    );
  }
}
