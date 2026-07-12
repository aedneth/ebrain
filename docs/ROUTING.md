---
type: routing-spec
project: ebrain
created: 2026-07-08
modified: 2026-07-11
status: active
tags: [ebrain, routing, openrouter, hermes, modelos-chinos, codex, claude-code, cursor, gemini]
related: [ULTRAPLAN.md, ARCHITECTURE.md, SPRINT.md, GUARDRAILS.md, model-registry.md]
sources-verified: 2026-07-08 (hermes-agent, openrouter.ai/docs); model-registry live 2026-07-11
resource-reality: 2026-07-11 (Codex $2500 = cerebro/primario · OpenRouter $10/mo · Cursor $50+CLI)
---

# ROUTING — Capa de ejecución de inteligencia de ebrain

Implementación completa del AI Execution Layer (Company Brain Part VII) sobre los recursos REALES de Eduardo: suscripción Claude Pro (Claude Code = driver default), créditos Codex (OpenAI), créditos Cursor (Composer), gemini-cli free tier, y el stack chino vía OpenRouter, orquestable con Hermes. Principios: capacidades sobre vendors · barato por default · frontier solo manual · sin black box · doble cap de gasto.

## 1. Arquitectura de 3 tiers (el mapa completo)

> **Realidad de recursos 2026-07-11 (reescribe el Tier 0):** Codex tiene **$2500** de créditos (hackatón) + API OpenAI → es el **cerebro / driver primario diario**, usado agresivamente como se usaba Claude Code. **Claude Code baja a segundo — el agente de confianza:** Opus orquesta/audita, Sonnet workers, y es el dueño de TODO el trabajo vault/CKIS. El **stack chino (Tier 1)** se rutea tan bien que puede **construir proyectos enteros**, cada modelo en su máxima capacidad, capado a $10/mo.

```
┌──────────────────────────────────────────────────────────────────────┐
│ TIER 0 · AGENTES INTERACTIVOS (créditos + suscripciones — no tocan cap)│
│                                                                      │
│  Codex (codex-cli · $2500) ──► CEREBRO / DRIVER PRIMARIO             │
│    constructor diario agresivo: features, refactors, tests, debug,   │
│    sesiones agénticas largas de código · mejor calidad/precio        │
│  Claude Code (Claude Pro) ──► DIRECTOR + AUDITOR (2º, de confianza)  │
│    Opus orquesta/audita (revisa diffs de Codex: maker≠checker) ·     │
│    Sonnet workers · dueño de TODO vault/CKIS/skills/MCP              │
│  Cursor ($50 + CLI + modelos Anthropic) ──► edición quirúrgica       │
│    autocomplete/edits inline · CLI para micro-tareas · Anthropic     │
│  gemini-cli (free tier) ──► batch / contexto gigante GRATIS          │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ delega lo programático/batch/autónomo hacia abajo
┌──────────────────────────▼───────────────────────────────────────────┐
│ TIER 1 · STACK CHINO RUTEADO (OpenRouter · 1 key · cap $10/mo)        │
│                                                                      │
│  ebrain route ──► clasifica por CAPACIDAD → ganador (máx capacidad) + │
│  fallback + floor. Constructor COMPLETO: coding→DeepSeek V4 ·         │
│  agentic→Kimi K2.6 · web/design→GLM-5.2 · reasoning/long→MiniMax M3 · │
│  terminal/general→Qwen3.7 Max. Carril programático/batch/one-shot +   │
│  jobs de gbrain (dream/judges/think) + Hermes. NO es agente interactivo│
└──────────────────────────┬───────────────────────────────────────────┘
┌──────────────────────────▼───────────────────────────────────────────┐
│ TIER 2 · RUNTIME AUTÓNOMO 24/7 (Hermes — opt-in, post-F4)            │
│                                                                      │
│  Hermes gateway sobre OpenRouter (provider_routing nativo) → maneja   │
│  el stack chino como constructor autónomo de proyectos enteros       │
│  Hábitat: VPS $5 o serverless (Modal/Daytona), NO la laptop 4 GB ·   │
│  Telegram/CLI · crons + subagentes                                   │
└──────────────────────────────────────────────────────────────────────┘
```

Regla de oro nueva: **quien construye (Codex, créditos) ≠ quien audita (Opus, Pro).** El maker≠checker del SOP sobrevive **invertido**: antes Codex era la 2ª opinión de Claude; ahora **Claude es la 2ª opinión de Codex**. Lo interactivo/crítico arriba (ya pagado), lo programático/batch/autónomo abajo (centavos, capado). Frontier nunca se auto-invoca desde Tier 1 ni Tier 2 — solo Eduardo, a mano.

## 2. Tier 0 — Los agentes interactivos, cada uno en su mejor rol (jerarquía 2026-07-11)

| Recurso | Rol nuevo | Default para | Anti-patrón (prohibido) |
|---|---|---|---|
| **Codex (codex-cli · $2500)** | **CEREBRO / DRIVER PRIMARIO** — el constructor diario agresivo | Feature coding, refactors, tests, debugging, sesiones agénticas largas de código. Mejor calidad/precio; créditos abundantes | Orquestar la arquitectura del sistema; trabajo de vault/CKIS; correr full-auto donde viven repos de cliente; quemar créditos sin ledger |
| **Claude Code (Pro)** | **DIRECTOR + AUDITOR** (2º, de confianza) — Opus planifica/audita, Sonnet workers | Arquitectura, ADRs, gates `[AUDIT_PASS]`, **review de los diffs de Codex** (maker≠checker), TODO el trabajo vault/CKIS (skills, MCP, hooks viven acá), razonamiento de alto riesgo | Implementación masiva de código (eso ya lo paga Codex); correr en paralelo VIVO con Codex (RAM 4 GB) |
| **Cursor ($50 + CLI + Anthropic)** | Canal de edición quirúrgica | Autocomplete + edits inline en el editor; CLI para micro-tareas acotadas; acceso puntual a modelos Anthropic sin gastar sesión Pro | Loops agénticos (matan los $50 en días); scope > 1 archivo |
| **gemini-cli (free tier)** | Batch / contexto masivo gratis | Digestión de repos/transcripts, clasificación batch, borradores desechables — primera opción si tolera free-tier | Pipelines críticos o programados (rate limits sin SLA) |

### 2.1 Gobernanza del cerebro Codex

Codex pasó de "worker ocasional" a **cerebro** — y era el agente MENOS gobernado (los guardrails CKIS son per-harness de Claude Code). **Realidad del flujo (Eduardo):** corre `codex --sandbox danger-full-access` en directorios de trabajo aislados, igual que `claude --dangerously-skip-permissions`. Como el gate de aprobación está desactivado por diseño, el control NO son los permisos de Codex sino:

- **Aislamiento por directorio (control primario):** `brisas-del-golfo` y `dekko-floors` (cliente) están en disco — Codex trabaja en el repo específico, nunca en un padre que los contenga. (Riesgo confirmado: `~/.codex/config.toml` ya tenía `dekko-floors` como proyecto trusteado.)
- **Hooks (control DURO, `overlay/codex-harness/`) [IMPLEMENTADO 2026-07-11]** — bajo full-access el `AGENTS.md` es blando; el candado técnico son hooks (Codex los soporta Claude-compatible: `~/.codex/hooks/hooks.json`). Instalados: `block-secret-read.sh` (`pre_tool_use`: bloquea leer `.env`/credenciales/`printenv` al contexto — deny+exit2, probado) + `session-context.sh` (`session_start`: inyecta contexto ebrain/normas). `codex doctor` verde.
- **`~/.codex/AGENTS.md` global [IMPLEMENTADO 2026-07-11]** — normas blandas que espejan el `~/.claude/CLAUDE.md`: secretos, repos de cliente = deny, SOP + maker≠checker, rastro narrativo, regla de RAM.
- **MCP ebrain en codex-cli [IMPLEMENTADO 2026-07-11]** (`codex mcp add ebrain -- ~/.config/ebrain/gbrain-mcp`) → misma memoria unificada + 75 skills federadas que Claude Code.
- **Ledger + expiry [PENDIENTE, acción Eduardo]:** los $2500 de hackatón suelen **expirar** → verificar fecha. Burn-rate semanal. Reversión: si mueren, los roles vuelven al spec 2026-07-08 (Claude Code re-primario).
- **Rastro narrativo:** impuesto vía AGENTS.md; graphify ya captura los commits de Codex por git-hook.

> Esto ES la ejecución de SPRINT 2.6b (auditoría multi-agente) — materializada en 4.6. MCP + AGENTS.md hechos; falta expiry/ledger (Eduardo) + `/codex` op-check + tier0-playbook.

**Advertencia de ToS (input honesto):** Hermes incluye un proxy local OpenAI-compatible que expone providers OAuth (Claude Pro, ChatGPT Pro) como endpoints para Codex/Aider/Cline. Existe, pero **no lo uses**: rutear una suscripción por proxy hacia herramientas de terceros puede violar los términos del provider y arriesgar la cuenta. Cada suscripción se usa en su herramienta nativa; el ahorro real viene del Tier 1, no de exprimir suscripciones por caminos grises.

## 3. Tier 1 — El stack chino por capacidad (constructor completo ruteado)

> **Scope (2026-07-11):** el coding INTERACTIVO diario vive en Codex (cerebro, Tier 0). Este carril es **programático / batch / jobs de gbrain / autónomo (Hermes)** — y, ruteado por capacidad, el stack chino puede **construir proyectos enteros** (cada modelo en su máxima capacidad). El ganador de cada capacidad es el modelo MÁS fuerte en ese eje, no el más barato (los baratos son fallback/floor). **Slugs y precios verificados en vivo → `docs/model-registry.md`** (esta tabla 3.1 es la hipótesis/capacidad; el registry es la verdad).

### 3.1 Mapa de capacidades (directiva de Eduardo — THE STACK)

| Capacidad | Modelo ganador (máx capacidad) | Slug (verificado — model-registry.md) | Por qué gana |
|---|---|---|---|
| `coding` | DeepSeek V4 Pro | `deepseek/deepseek-v4-pro` | Coding competitivo, 1M ctx, a fracción del costo |
| `agentic` | Kimi K2.6 | `moonshotai/kimi-k2.6` | Tool-use sostenido, miles de llamadas — clave para proyectos enteros |
| `web_design` | GLM-5.2 | `z-ai/glm-5.2` | #1 Design Arena; web/UI + math; ahora 1M ctx |
| `reasoning` | MiniMax M3 | `minimax/minimax-m3` | Razonamiento experto (GPQA); disputa vs DeepSeek → 4.5 |
| `long_context` | MiniMax M3 | `minimax/minimax-m3` | 1M de contexto real, multimodal |
| `terminal` | Qwen3.7 Max | `qwen/qwen3.7-max` | Terminal-Bench; ejecución/bash |
| `general` | Qwen3.7 Max | `qwen/qwen3.7-max` | All-rounder más fuerte; default cuando nada matchea |

### 3.2 Categorías en disputa (resolver con benchmark, no con opinión)

Tus dos documentos fuente asignan distinto en tres categorías. Se adopta THE STACK como primario y se resuelve la disputa en F4 con `gstack-model-benchmark` sobre tareas REALES tuyas:

| Categoría | THE STACK dice | La conversación Gemini dice | Resolución |
|---|---|---|---|
| Web/UI/design | GLM-5.2 | Kimi K2.6 ("sentido estético") | Benchmark: 2 componentes reales Next.js+Tailwind del design system Korvex |
| Razonamiento profundo | MiniMax M3 | DeepSeek V4 (thinking) | Benchmark: 1 problema de arquitectura ebrain real |
| Terminal/bash/ejecución | (no asigna) | Qwen3.7 Max (Terminal-Bench) | Agregar capacidad `terminal` → candidato Qwen; benchmark con un script CKIS real |
| Contexto masivo | MiniMax M3 (1M) | GLM-5.2 (IndexShare 1M) | Benchmark: digerir un repo completo; gana el que menos degrada |

El `routing.yaml` resultante de F4 es la verdad; esta tabla es la hipótesis inicial. Los slugs y precios son post-conocimiento-base → **verificación en vivo obligatoria** contra openrouter.ai/models antes de fijar config (SPRINT 4.1).

### 3.3 Mecánica OpenRouter (verificada 2026-07-08)

- **Endpoint:** OpenAI-compatible, `https://openrouter.ai/api/v1`; el modelo es un string de config.
- **Fallback a nivel de modelo:** array `models` en orden de prioridad por request; se dispara ante downtime, rate limit, error de longitud de contexto y flags de moderación. Patrón por capacidad: `[ganador, fallback_barato, floor]` — el **floor** (último de la lista) es el modelo abierto barato más confiable del registry; si él también falla, vuelve el error (no hay retry infinito).
- **Failover a nivel de provider:** automático por default (`allow_fallbacks: true`) dentro del mismo modelo; providers con outages recientes se despriorizan. Requests fallidas no se cobran (zero-completion insurance; monitorear el activity log por edge cases de 429).
- **Atajos de una línea:** sufijo `:floor` al slug = provider más barato; `:nitro` = mayor throughput. Default de ebrain: `:floor` en jobs batch, slug limpio en interactivo.
- **Objeto `provider` por request** (defensa en profundidad): `data_collection: "deny"` (privacidad — obligatorio cuando el prompt contiene contexto Korvex/vault), `max_price` como techo por request (cinturón extra al cap), `sort: "price"` para batch.
- **Fallback NUNCA a frontier:** la cadena termina en un modelo abierto. Claude/GPT/Gemini premium jamás aparecen en un array `models` de Tier 1.
- **Embeddings: OpenRouter NO ofrece API de embeddings.** Los embeddings de gbrain (ingesta, búsqueda) van por provider directo barato (Gemini embeddings o OpenAI small) con su propia key y su propio límite. Solo las llamadas LLM de gbrain (dream cycle, judges, `think`) rutean por OpenRouter.

### 3.4 `ebrain route` — implementado (as-built, `cli/route.ts` + `routing.yaml`)

Construido y probado en F4 (commit F4-core). Estructura real de `routing.yaml`: `budget{monthly_usd,hard_stop,log}` · `provider{base_url,key_env,provider_routing{data_collection:deny,max_price},completion_defaults{max_tokens:8192}}` · `capabilities{coding,agentic,web_design,reasoning,long_context,terminal,general}` cada una `[ganador,fallback,floor]` · `classify{}` (keywords) · `frontier.auto_escalate:false`. Slugs verificados en `model-registry.md`.

Comportamiento del CLI (`cli/route.ts`, bun, ~230 líneas):
1. Clasifica: `--cap` explícito gana; si no, keywords; **empate al tope o cero → `general`** (spec). Sin router-LLM (rule-based cubre el 95%).
2. Llama con array `models` completo (failover server-side de OpenRouter). Flag **`--floor`** appendea `:floor` a slugs limpios (batch/jobs baratos); `:free`/suffixed intactos.
3. Loguea SIEMPRE `{ts, src, cap, model, tokens_in, tokens_out, usd}` (+`usd_estimated` si OpenRouter no devolvió cost → estimación conservadora, nunca $0 silencioso) → `spend.jsonl` (append real, concurrency-safe); imprime `model=… cost=$…`.
4. Aborta (exit 3) si el cap mensual local está excedido — **antes** de llamar. Doble candado frontier (regex hardcode hermético + `frontier.auto_escalate`). Timeout de fetch 120s → si OpenRouter cae, Tier 0 (Codex/Claude) es el fallback manual.

### 3.5 Quién consume Tier 1

| Consumidor | Perfil | Notas |
|---|---|---|
| `ebrain route` (CLI/scripts) | según tarea | one-shots programáticos, pipelines |
| gbrain (dream cycle, judges, brainstorm, `think`) | `general`/`long_context` con `--floor` | mantenimiento nocturno barato; presupuesto por corrida (4.8) |
| Hermes (Tier 2) | su propio `provider_routing` apuntando a los mismos slugs | una sola fuente de verdad de modelos: el registry F4 |
| Codex / Claude Code (delegación) | vía `ebrain route` como comando bash | cuando el cerebro (Codex) o el director (Opus) decide que una subtarea barata no amerita créditos/tokens interactivos |

## 4. Tier 2 — Hermes (input exacto basado en investigación, 2026-07-08)

### 4.1 Qué es realmente

Hermes-agent (NousResearch) verificado: runtime Python ≥3.11 instalado con uv (instalador trae Node, ripgrep, ffmpeg), con TUI, gateway multiplataforma (Telegram, Discord, Slack, WhatsApp, Signal, email — 20+ superficies desde un proceso), loop de auto-aprendizaje (crea y mejora skills desde la experiencia, memoria FTS5 entre sesiones, modelado del usuario), subagentes en background, crons en lenguaje natural, cliente MCP con OAuth 2.1, y **6 backends de terminal: local, Docker, SSH, Daytona, Singularity, Modal** — los serverless hibernan en idle y cuestan casi nada. Soporte OpenRouter de primera clase: `provider_routing` en `config.yaml` (sort, only/ignore providers, data retention) inyectado como `extra_body.provider`, y cambio de modelo con `hermes model` sin tocar código. Desarrollo MUY activo (release "Foundation": instalación debloated, MoA como modelo seleccionable, gateway scale-to-zero).

### 4.2 Veredicto para tu caso (esto es lo que me pediste)

**Hermes NO es el bus central de ebrain — el bus es el MCP de gbrain.** Confundir esos roles duplicaría memoria y crearía dos cerebros. Hermes es la **capa de ejecución autónoma 24/7**: el proceso que sigue trabajando cuando cerraste la laptop.

**Dónde correrlo:** NO en el ProBook. Un gateway Python siempre-encendido + sesiones + posibles subagentes compite con Claude Code y los syncs por 4 GB de RAM. Las opciones correctas, en orden:
1. **VPS de $5/mes** (el caso de uso que Hermes publicita: "run it on a $5 VPS… talk to it from Telegram while it works on a cloud VM"). Systemd + auto-restart; cero dependencia de que tu laptop esté despierta — resuelve de raíz el STEP 5 de tu plan original sin `pmset` ni hacks de suspensión.
2. **Modal/Daytona serverless** (backend nativo de Hermes): hiberna en idle, costo cercano a cero, ideal si el uso es esporádico.
3. Laptop solo para **probarlo** (sesiones cortas, gateway apagado al terminar).

**Conexión con ebrain:** Hermes es cliente MCP → se conecta al MCP de ebrain igual que Claude Code (cuando ebrain exponga HTTP con OAuth 2.1; mientras el MCP sea stdio-local, Hermes en VPS trabaja sin memoria ebrain o con acceso vía SSH backend a la laptop — limitación aceptada del MVP). Su config de modelos apunta a OpenRouter con los mismos slugs del registry F4: **un solo registro de modelos, tres consumidores**.

**Trabajos que le pertenecen a Hermes (y a nadie más):**
- Crons desatendidos: briefing matinal desde el brain, chequeo de drift, reportes de gasto semanal, monitoreo de repos.
- Tareas largas de bajo valor por token: ingestas nocturnas, clasificación batch, research de fondo — todo sobre Tier 1.
- Interfaz por Telegram: pedirle cosas al sistema desde el teléfono sin abrir una terminal.

**Guardrails específicos de Hermes** (features verificadas, activarlas): `skills.write_approval: true` y `memory.write_approval: true` (todo write de skill/memoria queda staged para tu aprobación — crítico en un daemon autónomo), `max_concurrent_sessions` bajo, venv FUERA del source tree (el propio CONTRIBUTING advierte que el agente puede borrarse su runtime con un comando relativo), y la misma ley de dinero: su provider es la key OpenRouter con hard cap.

**Timing:** opt-in POST-F4 (tarea SPRINT 4.8 = evaluación; adopción real = decisión de Eduardo con costo VPS sobre la mesa). No es prerequisito de nada: ebrain funciona completo sin Hermes; Hermes lo vuelve 24/7.

## 5. Árbol de decisión diario (imprimible)

```
¿Es construir código (feature, fix, refactor, tests)?     → Codex ($2500 — el default/cerebro)
¿Es planificar, arquitectura, gate o auditar un diff?     → Claude Code (Opus)
¿Es trabajo de vault / CKIS / conocimiento / skills?      → Claude Code (Sonnet workers)
¿Es edición puntual mientras editás en el editor?         → Cursor (inline; CLI para micro-edits)
¿Es batch / contexto gigante y descartable?               → gemini-cli (gratis)
¿Es programático, scheduled, o un one-shot sin sesión?    → ebrain route --cap <x> ($10/mes)
¿Un proyecto entero autónomo con el stack chino?          → Hermes (VPS) sobre Tier 1 ruteado
¿De verdad necesita frontier fuera de estos carriles?     → manual, vos lo invocás
```

- **Regla de RAM (4 GB):** UN agente interactivo a la vez. Opus↔Codex se pasan la posta **por archivos** (plan → Codex ejecuta → Opus audita), **nunca dos sesiones vivas en paralelo**.
- **Regla de auditoría:** lo que Codex construye, Opus lo revisa antes de merge (maker≠checker, invertido).

## 6. Gobernanza de gasto (resumen ejecutable)

1. Hard cap en la key de OpenRouter (lado servidor) el día que se crea — antes del primer request. **Acción abierta (Eduardo): confirmar auto-recharge OFF** (así el balance cargado = techo real) + límite per-key en el dashboard.
2. Cap mensual local en `routing.yaml` con `hard_stop` — aborta antes de llamar. **Nota operativa:** con $5 cargados y `monthly_usd:10`, OpenRouter 429ea antes de que el hard-stop local muerda → bajá el cap al crédito cargado si querés el aborto local limpio; subilo a 10 al hacer top-up.
3. `max_price` por request (`provider.max_price`) + **`max_tokens:8192` default** (`completion_defaults`) — techo fino que corta loops caros (Kimi out $3.41/M, Qwen-Max $3.75/M).
4. Key de embeddings separada con su propio límite (provider directo, no OpenRouter).
5. `spend.jsonl` (campo `src`: route/gbrain/hermes) = fuente de verdad local; `ebrain status` muestra gasto del mes; revisión en cada gate de fase.
6. Hermes y gbrain heredan la MISMA key con el MISMO cap — un solo grifo que cerrar (sub-keys por consumidor = hardening 4.8).
7. **Ledger de créditos Codex semanal** (el pool $2500 no tiene telemetría hoy; §2.1) + expiry verificado.
8. **Cursor ($50): solo edición interactiva** — nunca loops agénticos (los drena en días).
9. **4 medidores** (spend.jsonl · dashboard OpenAI · créditos Codex · créditos Cursor) → `ebrain status` los unifica (5.2, adelantado a crítico).

## 7. Qué queda explícitamente fuera (y por qué)

- **LiteLLM proxy local:** innecesario — OpenRouter ya es el gateway y la laptop no sobra RAM para un proxy. Reevaluar solo si aparece un segundo host.
- **Router semántico/LLM-director:** sobre-ingeniería para un solo usuario; el rule-based + `--cap` cubre el 95%. El 5% restante lo resolvés vos con el flag.
- **Auto-escalado a frontier:** prohibido por diseño (doble candado: config + código).
- **MoA de Hermes con modelos frontier:** existe como feature; usarlo solo con modelos abiertos si algún día se usa.
