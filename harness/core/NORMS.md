# Normas del harness ebrain (fuente única, cross-agente)

> **Este es el canon.** Estas normas gobiernan a TODO agente de Eduardo por igual — Claude Code,
> Codex, Gemini, Cursor, Hermes. No las edites en `CLAUDE.md` / `AGENTS.md`: esos archivos reciben
> este texto renderizado dentro de un bloque `ebrain-norms` por `ebrain norms render`. Editá acá,
> re-renderizá, y la divergencia entre agentes desaparece.

## Memoria unificada (ebrain es el bus)
- **Buscá antes de asumir.** `ebrain q "<pregunta>"` busca en la memoria cross-source (Second Brain +
  Company Brain + agent-memory); `qmd search` es el respaldo local. No des por conectado el MCP `ebrain`:
  `ebrain harness doctor` dice si lo está en este proyecto. Lo que importa para el turno llega por los
  hooks del agente, no por que te acuerdes de consultar.
- **Recordá lo durable.** Cuando aprendas algo que una sesión futura perdería tiempo re-descubriendo
  (un fix, un gotcha, una decisión y su *por qué*, un dato de proyecto, una preferencia), guardalo con
  `ebrain remember "<learning>"`. Es memoria agéntica permanente y cross-agente. Una cosa por llamada,
  auto-contenida, en su idioma original. No guardes secretos ni trivialidades (la primitiva los rechaza).
- Estructura de código: graphify / Dev Brain (el grafo se reconstruye solo por git-hook).
- Fallback de búsqueda cero-costo/offline: `qmd search "<término>"`.

## SEGURIDAD — SECRETOS (regla dura, sin excepciones)
- **NUNCA** leas/muestres/`cat`/`grep`/`head`/`tail` de dotenv/`.env.*` ni de archivos de credenciales
  (`*.pem`, `*.key`, `id_rsa`, credenciales, `.npmrc`, `.netrc`). Tratalos como si no existieran.
- **NUNCA** hagas dump del entorno completo (`printenv`/`env` pelado) — enviaría secretos al proveedor.
- **NUNCA** incluyas API keys/passwords/tokens/secretos en logs, resúmenes, commits, PRs o prompts.
  Referite por su NOMBRE (`OPENROUTER_API_KEY`), nunca por su valor. Verificá presencia con
  `test -n "${VAR:-}" && echo set`, nunca imprimas el valor.
- Asegurá `.env*` en `.gitignore`; `git add <archivos>` específico, **nunca** `git add -A`/`.` cerca de env.
- Esto lo enforcea técnicamente el guard canónico del harness (`guard-secrets.sh`); estas líneas son refuerzo.

## REPOS DE CLIENTE (aislamiento duro)
- Los repos listados en tu deny-policy (`$XDG_CONFIG_HOME/ebrain/denied-repos`) son **código de
  cliente**. NUNCA los exfiltres, NUNCA los pushees a un
  remote que no sea el suyo, NUNCA cruces su código a otros proyectos ni a la memoria de ebrain
  (son `deny` en la federación de knowledge, en `remember` y en el sweep de sesiones).
- No abras un agente full-access en un directorio **padre** que los contenga; trabajá en el repo específico.

## Disciplina de trabajo (SOP CKIS)
- Trabajo serio = pipeline spec-driven: contexto → plan → implementar → review → gate → ship.
- **Quien construye no aprueba:** lo que un agente constructor produce, **lo audita otro agente**
  antes de merge. Ningún agente se auto-aprueba en cambios de alto riesgo (arquitectura,
  migraciones, releases). Qué agente hace de revisor es tu decisión; que no sea el mismo, no.
- Commit por fase con mensaje descriptivo. **Nunca** commitees `.brain/`, `.claude/`, backups ni secretos.
- Los cambios estructurales dejan **rastro narrativo**: el log de sesión lo escribe el hook Stop del
  proyecto donde exista (en Korvex, `02-daily/logs/`), pero además dejá entrada en el CHANGELOG del proyecto y, si aprendiste algo
  reutilizable, un `ebrain remember`. El driver primario no trabaja sin dejar huella.
- Acciones irreversibles o hacia afuera (deploy, push, borrado): confirmá primero salvo autorización durable.

## RAM / concurrencia (laptop 4 GB)
- **Un agente interactivo a la vez.** No corras dos agentes vivos en paralelo. Revisor y constructor
  se pasan la posta por archivos (plan → el constructor ejecuta → el revisor audita), no en
  sesiones simultáneas.

## Modelos / routing
- **Nunca auto-escales a un modelo frontier.** Eso lo invoca Eduardo a mano.

## Gobernanza bajo full-access
- Los agentes corren con permisos abiertos (`danger-full-access` / `skip-permissions`) en directorios
  aislados **por diseño**. El control NO son gates de aprobación: es aislamiento por directorio + los hooks
  del harness (guard de secretos, inyección de contexto, write-back) + estas normas + la memoria de ebrain.
