---
type: adr
id: ADR-001
title: Topología de brains — hub de federación único (1 brain · N sources)
project: ebrain
status: accepted
date: 2026-07-11
deciders: [Eduardo (frontera), Opus (arquitectura)]
related: [ULTRAPLAN.md, ARCHITECTURE.md, GUARDRAILS.md, discovery/02-gbrain-federation.md, discovery/04-connection-contract.md]
supersedes: []
---

# ADR-001 — Topología de brains: hub de federación único

## Contexto

ebrain es el **indexador único de TODAS las capas de conocimiento** de Eduardo, con búsqueda cross-source e instantánea (decisión explícita de Eduardo, 2026-07-11: *"si eBrain será todo el indexador de los múltiples brain lo ideal es cross-source, pero debe ser instantáneo… toma la mejor decisión escalable y sostenible"*). Las capas a federar son más de las que el SPRINT original contemplaba:

- **second-brain** — vault personal (`~/Documents/Second Brain`) — F1, ya indexado (861 pág).
- **company-brain** — Korvex OS (`~/Documents/Company Brain`, 163 `.md`).
- **dev-brain** — índice de conocimiento de código, poblado por graphify (`~/Documents/Dev Brain`, 2610 `.md`). Contiene `code-graph/` de korvex, korvex-crm **y brisas-del-golfo**.
- **per-project `.brain/`** — salidas graphify por-repo (CLI-suite: flowclock/magnus/recmp3/sapientia/streamnet, museum-of-us).
- **repos de código** (`--strategy code`) — CLI-suite presente en la máquina.

gbrain ofrece dos ejes ortogonales (`discovery/02-gbrain-federation.md §brains-sources`): **brains** (qué DB, vía mounts) y **sources** (qué repo dentro de un brain). La decisión era: ¿1 brain con N sources, o N brains montados?

## Decisión

**1 brain (1 DB) · N sources.** Un solo motor PGLite local (migrable lossless a Supabase cuando Pro) con cada capa registrada como un `source`. Añadir una capa nueva = `gbrain sources add`. Cero re-arquitectura.

Se **descartan los mounts** (N brains) porque:
1. Fragmentarían el índice → matarían justo el cross-source instantáneo que es el requisito central.
2. mounts es más nuevo (HTTP MCP mounts todavía en "PR 2" upstream — `brain-registry.ts:9-11`) = inmadurez.
3. En F2 no hay MCP remoto multi-token que justifique la separación física por-DB.

### Mecanismo de cross-source (empírico, pin a25209b) — CORREGIDO 2026-07-11

Validado end-to-end vía sonda MCP JSON-RPC + CLI. **El cross-source nativo NO funciona en este pin** — es una v1 limitation confirmada, no solo un detalle del CLI:

- **Per-source SÍ funciona** (CLI y MCP): `query --source company-brain` y `mcp__ebrain__query {source_id:"company-brain"}` devuelven resultados con relevancia correcta. Embeddings OK en contexto MCP (sin 400).
- **Cross-source (`all_sources`/`__all__`) NO funciona**:
  - CLI: `--source __all__` cae al `default` vacío (regex `[a-z0-9-]{1,32}` rechaza `_`).
  - MCP: `{all_sources:true}` y `{source_id:"__all__"}` → **`[]`** (probado en vivo). El `wantsAll` de `operations.ts:478` existe pero aguas abajo la enumeración multi-source colapsa a `['default']` — exactamente lo que advierte `relational-recall.ts:73-74`: *"multi-source enumeration under `__all__` is a v1 limitation"*.
- **Solución (overlay ebrain):** `~/.config/ebrain/ebrain-q` — fan-out que consulta cada source federado del knowledge layer y mergea por score numérico. **Este es el valor que ebrain añade sobre gbrain**: entrega el cross-source instantáneo que el motor no tiene en v1. Validado: `ebrain-q "korvex pricing"` mezcla second-brain + company-brain ordenados por score. Se retira/reemplaza por nativo cuando upstream levante la limitación (o al migrar a un pin más nuevo).
- **Para agentes vía MCP:** hasta que el nativo funcione, un agente que quiera cross-source debe (a) llamar `query` por-source y mergear, o (b) el guidance block los orienta a usar `ebrain-q` por CLI. La interfaz MCP sirve per-source hoy.

### Modelo de aislamiento personal ⊥ Korvex (GUARDRAILS §3)

Triple defensa, en orden de fuerza:

1. **Caller-scope** (`operations.ts:397-531`): un caller **remoto** NUNCA recibe cross-source por defecto ni bajo `__all__` más allá de sus **grants de token**. → un token que solo concede `company-brain` ve solo Korvex aunque pida `__all__`. Esta es la garantía dura para la fase de MCP remoto (diferida).
2. **`.gbrain-source` pinning** (SPRINT 2.5): un agente trabajando DENTRO de un repo Korvex queda pineado a ese source → sus queries por defecto scopean a Korvex, no a lo personal. Vale incluso local.
3. **Wikilink scoping #972**: `global_basename` scoped por `sourceId` → un `[[nota]]` ambiguo en second-brain NUNCA resuelve contra company-brain. Aislamiento de motor.

En F2 el MCP es **stdio local** (solo sesiones del propio Eduardo, `takesHoldersAllowList:['world']`) → sin callers no confiables. La **isolación dura por token OAuth acotado** es **requisito bloqueante para exponer MCP remoto** (diferida). Test adversarial en SPRINT 2.2 valida el gate. **Validado 2026-07-11:** una query personal scopeada a `--source company-brain` devolvió cero notas personales; misma query a `--source second-brain` sí las trae → el scoping por source aísla correctamente.

### Política de `federated` por source

`federated: true` = entra al **pool de búsqueda cross-source por defecto**; `federated: false` = solo con `--source` explícito. Dado que (a) Eduardo prioriza unificación cross-source, (b) en F2 no hay callers remotos, y (c) el aislamiento remoto lo hará el token-scope (no el flag), la política es:

| Source | federated | Razón |
|---|---|---|
| second-brain | **true** | Capa de conocimiento unificada; entra al pool cross-source de Eduardo (caller local). |
| company-brain | **true** | Idem. Aislamiento Korvex-context por `.gbrain-source` pinning + token-scope remoto (no por el flag). |
| dev-brain (outputs graphify) | **true** | Conocimiento (destilado, no código crudo); parte de la búsqueda unificada. |
| code sources (`--strategy code`) | **false** | Los chunks de código contaminarían queries de conocimiento; se consultan por tools de código (`code_def/refs/...`) o `--source` explícito / pin. |

**Cuando entre el MCP remoto:** revisar esta tabla — si algún token debe ver solo Korvex, su grant lo acota aunque los sources sean federados. El flag `federated` NO es la frontera de seguridad; el token-scope sí.

### Frontera brisas-del-golfo (GUARDRAILS §2 — hard)

brisas-del-golfo = **deny total**. Matiz descubierto en F2: el Dev Brain contiene `code-graph/brisas-del-golfo/` (grafo destilado del código de brisas, ya commiteado). Como `git ls-files --cached` lista archivos **trackeados** sin honrar `.gitignore`/`.git/info/exclude` (`import.ts:529-538,591`), **ningún git-ignore lo excluiría**. Por tanto:

- **dev-brain NO se registra como source de repo-completo.** Se registra por **sub-path**, apuntando sources a los subdirectorios deseados y **omitiendo por completo `code-graph/brisas-del-golfo/`**. Ningún archivo de brisas se lee ni se embebe.
- Alternativa (registro completo + borrado post-sync) queda **descartada**: haría que brisas entre transitoriamente a la DB y consuma embeddings → viola "nunca se lee para indexar".
- El resto del `code-graph` (korvex, korvex-crm) SÍ es conocimiento propio de Eduardo y entra (read-only). korvex-web/korvex-crm no están clonados en la máquina → su inteligencia de código llega vía el Dev Brain, sin clonar los repos.
- **Decisión abierta para Eduardo:** si algún día quiere el grafo de código de brisas (no datos de cliente, solo estructura) dentro de ebrain, es una decisión explícita con alcance definido (GUARDRAILS §3), no el default.

## Consecuencias

**Positivas:**
- Un solo índice → cross-source real e instantáneo para Eduardo (su requisito).
- Escalable: cada capa nueva es un `sources add`. Dev Brain, per-project `.brain`, repos futuros entran sin tocar la arquitectura.
- Reversible: migrable a mounts o a Supabase después sin pérdida (`gbrain migrate`).
- Aislamiento personal⊥Korvex garantizado por caller-scope + `federated:false` + wikilink-scoping (#972), triple defensa.

**Negativas / a vigilar:**
- El aislamiento remoto duro depende de tokens OAuth acotados → **requisito bloqueante para exponer MCP remoto** (no en F2). Hasta entonces, MCP = stdio local únicamente.
- Registro sub-path de Dev Brain es más verboso que un source único, y hay que re-verificar la exclusión de brisas en cada re-sync (post-verify: `search "brisas"` con `--source dev-brain*` → cero resultados de código de brisas).
- PGLite es single-writer (~50K páginas) → suficiente para el corpus actual (~4-5K páginas proyectadas); Supabase cuando escale.

## Verificación (criterios de aceptación)

1. `sources list` muestra second-brain + company-brain (+ dev-brain sub-paths) todos `federated:false`. ✅ cuando aplique.
2. Test adversarial SPRINT 2.2: un `query` que simule caller remoto/scoped a company-brain NO devuelve páginas de second-brain personales; un `query` local sin `--source` SÍ cruza. 
3. `search "brisas"` restringido a los sources de dev-brain → **cero** páginas provenientes de `code-graph/brisas-del-golfo/`.
4. secret-scan post-ingesta de cada source → cero secretos.
