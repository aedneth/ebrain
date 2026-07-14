---
type: adr
id: ADR-004
title: Daemon compartido HTTP-MCP (dueño único del lock PGLite)
status: proposed
recommendation: DEFER
created: 2026-07-14
program: F6 — TUI
sprint_task: 6.4.7
related: [ADR-001-brain-topology.md, ADR-002-unified-harness.md, ADR-003-tui-stack.md, ../hermes-evaluation.md]
---

# ADR-004 — Daemon compartido HTTP-MCP (dueño único del lock PGLite)

> Spike de F6.4.7. **Recomendación: DEFER.** No se implementa en F6 salvo GO explícito de Eduardo.
> ADR-003 §Corolario delegó acá la pregunta del lock; esto la responde con una decisión argumentada.

## Contexto

El motor de ebrain es **PGLite local con un único escritor** (un solo proceso puede tener el lock del
archivo a la vez). Hoy conviven varios consumidores de la memoria:

- el **servidor MCP** de ebrain (Claude Code, Codex, etc. vía stdio) — hoy el dueño de facto del lock,
- las llamadas **cortas y lock-aware** de la CLI (`status`/`doctor`/`memory`/`q`) y de la **TUI** (F6):
  si hay un `serve` vivo, degradan a caché/último-conocido con aviso, **nunca compiten por el lock**
  (patrón ratificado en ADR-003 §Corolario + F5),
- el **dream cycle 03:30** (job batch que reindexa/consolida — necesita el lock en exclusiva),
- a futuro, **N sesiones agénticas** lanzadas desde la TUI (F6.4), cada una potencialmente queriendo
  consultar la memoria.

El patrón actual (stdio-MCP por sesión + lock-aware degradado) **funciona** para el modo real de uso
(un agente interactivo pesado a la vez — norma del Celeron 4GB, ver gobernador RAM F6.4.6). La pregunta
de este ADR: ¿conviene un **daemon HTTP-MCP compartido**, dueño único del lock, al que todos (TUI + N
agentes + dream) se conecten por HTTP, resolviendo el lock de raíz y habilitando concurrencia real?

## Opciones

- **A — Status quo (stdio-MCP por sesión + lock-aware).** Cada agente levanta su propio MCP stdio; la
  TUI/CLI hacen llamadas cortas y degradan si el lock está tomado. Cero infra nueva.
- **B — Daemon HTTP-MCP compartido.** Un solo proceso larga-vida es dueño del lock PGLite y expone MCP
  sobre HTTP; TUI, agentes y dream hablan HTTP con él. Resuelve el lock, habilita fan-out concurrente.
- **C — Híbrido.** Daemon compartido SOLO para lecturas (query/search/think); el dream y las escrituras
  siguen tomando el lock en exclusiva por ventana (coordinado por el daemon).

## Los tres criterios del spike

1. **¿`gbrain serve` HTTP es estable y battle-tested hoy?**
   No con evidencia propia. La superficie HTTP de gbrain no está probada bajo nuestra carga (fan-out de
   varios agentes + dream) en el Celeron. Adoptar B nos haría **co-mantenedores** de esa superficie —
   mismo riesgo que llevó a **DIFERIR Hermes** (ver `hermes-evaluation.md`: "MCP stdio→remoto amnésico",
   allow-list no battle-tested, RAM 4GB). El paralelismo es fuerte: un daemon HTTP siempre-vivo es
   exactamente la clase de componente que la restricción de RAM y la falta de un caso 24/7 desaconsejan hoy.

2. **¿Cuánto cuesta migrar el wiring MCP de los 6 agentes?**
   Alto y con regresión de aislamiento. Hoy cada adapter arranca su MCP stdio con su env del harness
   (ADR-002). Mover a HTTP implica: endpoint compartido, autenticación/allow-list por agente, y —crítico—
   preservar el **default-deny de federación** (ADR-001) y el **aislamiento de repos de cliente**
   (brisas/dekko) a través de un canal compartido. Un daemon compartido es una **nueva superficie de
   cruce** que hay que blindar; el modelo stdio-por-sesión tiene ese aislamiento gratis (proceso separado).

3. **¿Qué pasa con el dream 03:30?**
   Es el caso que MÁS se beneficiaría (hoy el dream necesita que nadie más tenga el lock), pero también
   el más delicado: un daemon tendría que serializar la ventana de escritura del dream contra las lecturas
   en vuelo. En A/C el dream simplemente corre cuando la laptop está idle (03:30) — cero coordinación. El
   beneficio del daemon aquí es real pero marginal frente a su costo.

## Decisión recomendada — **DEFER**

Mantener **Opción A** (status quo lock-aware) por toda F6. El daemon compartido (B/C) es una apuesta
arquitectónica mayor cuyo valor **no está activado** por el modo de uso real actual (un heavy a la vez →
casi nunca hay contención concurrente de lock que justifique la infra). Adoptarlo ahora repetiría el
error que ADR sobre Hermes ya identificó: sumar un servicio HTTP siempre-vivo sin un caso 24/7 y sin la
superficie battle-tested, en una laptop de 4GB.

## Condiciones de GO (cuándo revisitar)

Revisitar a **GO (B o C)** cuando se cumplan, juntas:

1. Un caso real de **≥2 agentes concurrentes consultando la memoria a la vez** de forma sostenida (no el
   modo actual de un heavy a la vez) — evidencia de contención de lock que degrada la UX.
2. `gbrain serve` HTTP con **allow-list y auth battle-tested** (mismo listón que se le pide a Hermes),
   o un shim propio mínimo auditado.
3. Un **presupuesto de RAM** que tolere un daemon residente (hoy el gobernador pelea por cada MB).
4. Un plan de migración que **preserve** el default-deny de federación (ADR-001) y el aislamiento de
   repos de cliente **a través del canal compartido**, con test que lo verifique.

Mientras tanto, la deuda queda **registrada y acotada**: la TUI y la CLI ya son lock-aware; ningún panel
se cuelga si el lock está tomado (F6.5.5 lo hace explícito con banner + caché).

## Consecuencias

- **+** Cero infra nueva en F6; se respeta la restricción de RAM y el principio "no auto-escalar servicios".
- **+** El aislamiento (federación default-deny + repos de cliente) sigue siendo gratis por proceso.
- **−** El dream 03:30 sigue dependiendo de la ventana idle (aceptable — es cuando corre).
- **−** Si en el futuro el uso concurrente crece, habrá que retomar esta migración (por eso las
  condiciones de GO quedan escritas).

## Ratificación

- **Estado:** PROPUESTO — recomendación **DEFER**. Pendiente de ratificación de Eduardo (fork
  DEFER-vs-GO, **no auto-aprobado**, consistente con el patrón de ADR-003).
- Si Eduardo ratifica DEFER: se anota en el checklist humano F6 (6.4.7) y ebrain sigue con Opción A.
  Si Eduardo elige GO: se abre una fase dedicada (fuera de F6) con los 4 criterios de GO como gates.
