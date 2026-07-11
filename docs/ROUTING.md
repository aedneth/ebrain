---
type: routing-spec
project: ebrain
created: 2026-07-08
modified: 2026-07-08
status: proposed
tags: [ebrain, routing, openrouter, hermes, modelos-chinos, claude-code, codex, cursor, gemini]
related: [ULTRAPLAN.md, ARCHITECTURE.md, SPRINT.md, GUARDRAILS.md]
sources-verified: 2026-07-08 (github.com/NousResearch/hermes-agent, hermes-agent.nousresearch.com/docs, openrouter.ai/docs)
---

# ROUTING — Capa de ejecución de inteligencia de ebrain

Implementación completa del AI Execution Layer (Company Brain Part VII) sobre los recursos REALES de Eduardo: suscripción Claude Pro (Claude Code = driver default), créditos Codex (OpenAI), créditos Cursor (Composer), gemini-cli free tier, y el stack chino vía OpenRouter, orquestable con Hermes. Principios: capacidades sobre vendors · barato por default · frontier solo manual · sin black box · doble cap de gasto.

## 1. Arquitectura de 3 tiers (el mapa completo)

```
┌──────────────────────────────────────────────────────────────────────┐
│ TIER 0 · FRONTIER INTERACTIVO (activos que YA pagás — no tocan cap)  │
│                                                                      │
│  Claude Code (Claude Pro) ──► DRIVER DEFAULT de proyectos serios     │
│    Opus = orquestador/auditor · Sonnet = workers · MCP → ebrain      │
│  Codex (créditos OpenAI) ──► worker paralelo de código / 2ª opinión  │
│    invocado vía skill /codex de gstack con specs cerradas            │
│  Cursor Composer (créditos) ──► autocomplete + edits inline en editor│
│    consumo pasivo; JAMÁS razonamiento agéntico (drena créditos)      │
│  gemini-cli (free tier) ──► ingesta masiva / resúmenes batch /       │
│    contexto gigante GRATIS; primera opción para tareas desechables   │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ delega lo barato/batch hacia abajo
┌──────────────────────────▼───────────────────────────────────────────┐
│ TIER 1 · STACK CHINO RUTEADO (OpenRouter · 1 key · hard cap)         │
│                                                                      │
│  ebrain route ──► clasifica por CAPACIDAD → modelo ganador + fallback│
│  coding→DeepSeek V4 · agentic→Kimi K2.6 · web/design→GLM-5.2 ·       │
│  long-context+reasoning→MiniMax M3 · general→Qwen3.7 Max             │
│  También consumido por: jobs de gbrain (dream cycle, judges) y Hermes│
└──────────────────────────┬───────────────────────────────────────────┘
┌──────────────────────────▼───────────────────────────────────────────┐
│ TIER 2 · RUNTIME AUTÓNOMO 24/7 (Hermes — opt-in, post-F4)            │
│                                                                      │
│  Hermes gateway sobre OpenRouter (provider_routing nativo)           │
│  Hábitat recomendado: VPS $5 o serverless (Modal/Daytona), NO la     │
│  laptop de 4 GB · acceso por Telegram/CLI · crons + subagentes       │
└──────────────────────────────────────────────────────────────────────┘
```

Regla de oro que ordena los tres tiers: **lo interactivo y crítico arriba (ya está pagado), lo batch y programático al medio (centavos), lo autónomo y desatendido abajo (daemon barato)**. Frontier nunca se invoca automáticamente desde Tier 1 ni Tier 2.

## 2. Tier 0 — Los activos existentes, cada uno en su mejor rol

| Recurso | Mejor capacidad | Rol asignado | Anti-patrón (prohibido) |
|---|---|---|---|
| **Claude Code (Pro)** | Razonamiento arquitectónico, orquestación agéntica, auditoría | Driver default de TODO proyecto serio (incluido el build de ebrain). Opus planifica/audita, Sonnet implementa. Con MCP de ebrain conectado, cada sesión consulta la memoria unificada en vez de re-leer disco → el plan Pro rinde más | Gastarlo en batch masivo o tareas descartables |
| **Codex (créditos OpenAI)** | Generación de código acotada, segunda opinión | Worker paralelo despachado desde Claude Code vía skill `/codex` de gstack (ya existe upstream): specs cerradas, tareas atómicas, resultado auditado por Opus | Dejarlo orquestar (no es el director); tareas abiertas que queman créditos |
| **Cursor Composer (créditos)** | Autocomplete inline, edits quirúrgicos en editor | Ghost text y ediciones rápidas mientras Eduardo edita a mano | Prompts agénticos largos; razonamiento — cada crédito de Composer usado en "pensar" es un desperdicio |
| **gemini-cli (free tier)** | Ventana de contexto gigante, costo cero | Ingesta masiva inicial, resúmenes de logs/repos/transcripciones, clasificación batch, borradores descartables. Primera opción SIEMPRE que la tarea tolere free-tier (rate limits diarios) | Depender de él para pipelines críticos (los límites del free tier cambian sin aviso) |

**Advertencia de ToS (input honesto):** Hermes incluye un proxy local OpenAI-compatible que expone providers OAuth (Claude Pro, ChatGPT Pro) como endpoints para Codex/Aider/Cline. Existe, pero **no lo uses**: rutear una suscripción por proxy hacia herramientas de terceros puede violar los términos del provider y arriesgar la cuenta. Cada suscripción se usa en su herramienta nativa; el ahorro real viene del Tier 1, no de exprimir suscripciones por caminos grises.

## 3. Tier 1 — El stack chino por capacidad (tu guía, canónica)

### 3.1 Mapa de capacidades (directiva de Eduardo — THE STACK)

| Capacidad | Modelo ganador | Slug (verificar en F4) | ~Precio/M input | Por qué gana |
|---|---|---|---|---|
| `coding` | DeepSeek V4 | `deepseek/deepseek-v4-pro` | ~$0.28 | Coding competitivo a fracción del costo |
| `agentic` | Kimi K2.6 | `moonshotai/kimi-k2.6` | ~$0.60 | Tool-use sostenido, miles de llamadas secuenciales |
| `web_design` | GLM-5.2 | `z-ai/glm-5.2` | ~$1.40 | #1 Design Arena; web/UI + math |
| `long_context` + `reasoning` | MiniMax M3 | `minimax/minimax-m3` | ~$0.30 | 1M de contexto + razonamiento experto (GPQA) |
| `general` | Qwen3.7 Max | `qwen/qwen3.7-max` | ~$1.20 | All-rounder más fuerte; default cuando nada matchea |

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

### 3.4 `ebrain route` — contrato de implementación

```yaml
# ~/.config/ebrain/routing.yaml  (plain file, editable — no black box)
budget:
  monthly_usd: 10          # cap local (además del hard cap en la key)
  hard_stop: true          # aborta ANTES de llamar si se excede
  log: ~/.config/ebrain/spend.jsonl
provider:
  base_url: https://openrouter.ai/api/v1
  key_env: OPENROUTER_API_KEY
  request_defaults:
    provider: { data_collection: deny }
capabilities:            # slugs se fijan en F4 tras verificación + benchmark
  coding:       { models: [<deepseek-v4>, <fallback>, <floor>] }
  agentic:      { models: [<kimi-k2.6>, <fallback>, <floor>] }
  web_design:   { models: [<glm-5.2-o-kimi>, <fallback>, <floor>] }
  long_context: { models: [<minimax-m3-o-glm>, <fallback>, <floor>] }
  terminal:     { models: [<qwen3.7-max>, <fallback>, <floor>] }
  general:      { models: [<qwen3.7-max>, <fallback>, <floor>] }
frontier:
  auto_escalate: false     # ley; también hardcodeado en el código
```

Comportamiento del CLI (`cli/route.ts`, bun, ≤300 líneas):
1. Clasifica: `--cap` explícito gana; si no, keywords simples; si ambiguo → `general`. Sin router-LLM en el MVP (costo/latencia; evolución posible si el rule-based falla en uso real).
2. Llama con array `models` completo (el fallback lo ejecuta OpenRouter, no un loop local).
3. Loguea SIEMPRE: `{ts, cap, model_usado, tokens_in, tokens_out, usd}` → `spend.jsonl`; imprime `model=… cost=$… tokens=…` al final de cada corrida (el costo visible es diseño).
4. Aborta con mensaje claro si el cap mensual local está excedido.

### 3.5 Quién consume Tier 1

| Consumidor | Perfil | Notas |
|---|---|---|
| `ebrain route` (CLI/scripts) | según tarea | one-shots programáticos, pipelines |
| gbrain (dream cycle, judges, brainstorm, `think`) | `general`/`long_context` con `:floor` | mantenimiento nocturno barato; presupuesto por corrida |
| Hermes (Tier 2) | su propio `provider_routing` apuntando a los mismos slugs | una sola fuente de verdad de modelos: el registry de F4 |
| Claude Code (delegación) | vía `ebrain route` como comando bash | cuando Opus decide que una subtarea no amerita tokens frontier |

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
¿La tarea es interactiva y el resultado importa?        → Claude Code (Tier 0)
¿Es edición puntual mientras escribís en el editor?      → Cursor Composer
¿Es código acotado paralelizable con spec cerrada?       → /codex (créditos)
¿Es batch/masivo y el free tier alcanza?                 → gemini-cli
¿Es programático/batch y merece un modelo específico?    → ebrain route --cap <x>
¿Debe correr sola, programada, o desde el teléfono?      → Hermes (VPS) sobre Tier 1
¿De verdad necesita frontier y nada más sirve?           → manual, vos lo invocás
```

## 6. Gobernanza de gasto (resumen ejecutable)

1. Hard cap en la key de OpenRouter (lado servidor) el día que se crea — antes del primer request.
2. Cap mensual local en `routing.yaml` con `hard_stop` — aborta antes de llamar.
3. `max_price` por request como techo fino en jobs batch.
4. Key de embeddings separada con su propio límite (provider directo, no OpenRouter).
5. `spend.jsonl` = fuente de verdad local; `ebrain status` muestra gasto del mes; revisión en cada gate de fase.
6. Hermes y gbrain heredan la MISMA key con el MISMO cap — un solo grifo que cerrar.

## 7. Qué queda explícitamente fuera (y por qué)

- **LiteLLM proxy local:** innecesario — OpenRouter ya es el gateway y la laptop no sobra RAM para un proxy. Reevaluar solo si aparece un segundo host.
- **Router semántico/LLM-director:** sobre-ingeniería para un solo usuario; el rule-based + `--cap` cubre el 95%. El 5% restante lo resolvés vos con el flag.
- **Auto-escalado a frontier:** prohibido por diseño (doble candado: config + código).
- **MoA de Hermes con modelos frontier:** existe como feature; usarlo solo con modelos abiertos si algún día se usa.
