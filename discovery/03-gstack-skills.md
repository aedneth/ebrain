# 03 — gstack: Skills, Anatomy, Memory, Hosts, Secret Scanner

Read-only reverse-engineering pass over `~/eBrain/vendor/gstack` (pinned SHA
`7c9df1c568a9ea745508f679a329332b2c338063`, `VERSION` = v1.60.1.0, confirmed via
`git log -1` at session start). All paths below are relative to
`vendor/gstack/` unless stated otherwise. No files under `vendor/` were
modified; no installers, CLIs, or `./setup` were executed.

---

## §overview

gstack is Garry Tan's (YC President & CEO) personal Claude Code workflow layer,
open-sourced as "the software factory" he uses to ship at ~810x his 2013 LOC
pace (`README.md:9`). It bills itself as turning Claude Code into "a virtual
engineering team" — 23 specialist skills + 8 power tools, MIT-licensed, all
Markdown (`README.md:23`).

**Philosophy (`ETHOS.md`)**, injected into every workflow skill's preamble
(`ETHOS.md:4`): three tenets —

1. **Boil the Ocean** (`ETHOS.md:34-61`) — AI made completeness cheap; "ship the
   shortcut" is legacy thinking. Do the complete implementation when the
   marginal cost is minutes, not weeks.
2. **Search Before Building** (`ETHOS.md:64-112`) — three layers of knowledge
   (tried-and-true / new-and-popular / first-principles); search before
   designing from scratch.
3. **User Sovereignty** (`ETHOS.md:115-147`) — "AI models recommend. Users
   decide." Cross-model agreement is a signal, never a mandate; the skill must
   present + ask, never act unilaterally on a scope-changing recommendation.

**What it provides**, per `README.md`'s skill table (`README.md:179-247`):

- **Workflow skills** mapping to a sprint lifecycle "Think → Plan → Build →
  Review → Test → Ship → Reflect" (`README.md:175`): `/office-hours`,
  `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`,
  `/plan-devex-review`, `/design-consultation`, `/review`, `/investigate`,
  `/design-review`, `/devex-review`, `/design-shotgun`, `/design-html`, `/qa`,
  `/qa-only`, `/pair-agent`, `/cso`, `/ship`, `/land-and-deploy`, `/canary`,
  `/benchmark`, `/document-release`, `/document-generate`, `/retro`, `/browse`,
  `/autoplan`, `/spec`, `/learn`, `/make-pdf`, `/diagram`.
- **Power tools** (`README.md:221-236`): `/codex`, `/careful`, `/freeze`,
  `/guard`, `/unfreeze`, `/open-gstack-browser`, `/setup-deploy`,
  `/setup-gbrain`, `/sync-gbrain`, `/gstack-upgrade`, plus iOS live-device QA
  (`/ios-qa`, `/ios-fix`, `/ios-design-review`, `/ios-clean`, `/ios-sync`).
- **A browser binary**: a compiled Bun executable (`~58MB`,
  `ARCHITECTURE.md:42`) running a long-lived headless-Chromium daemon over
  localhost HTTP (`ARCHITECTURE.md:9-36`), built on `playwright ^1.58.2` +
  `puppeteer-core ^24.40.0` (`package.json:57-58`).
- **A design CLI** (`$D`, `design/` dir, referenced throughout
  `SKILL.md.tmpl` resolvers) for `/design-shotgun` / `/design-html` mockup and
  HTML generation.
- **Relation to Claude Code**: gstack installs as a Claude Code *skill package*
  under `~/.claude/skills/gstack/` (or vendored per-repo), with each individual
  skill exposed as its own top-level directory under `~/.claude/skills/<name>/`
  containing a symlinked `SKILL.md` back into the gstack checkout (mechanism in
  §skill-anatomy). It is Claude-Code-native but also targets 9 other agent
  hosts (§hosts).

---

## §skill-anatomy

### Directory layout

Each skill is a top-level directory in the gstack repo, e.g. `office-hours/`,
`review/`, `autoplan/` (`ls` at repo root). Minimum shape:

```
<skill-name>/
  SKILL.md          # committed, auto-generated — what Claude Code reads
  SKILL.md.tmpl     # human-written source (prose + {{PLACEHOLDER}} tokens)
```

Richer skills add:
- `sections/` — carved-out sub-files for large skills (`office-hours/sections/`,
  wired into `~/.claude/skills/<name>/sections` by `setup:576-578`).
- Reference/asset files read at runtime, e.g. `review/checklist.md`,
  `review/design-checklist.md`, `review/greptile-triage.md`,
  `review/TODOS-format.md`, `review/specialists/` (`ls review/`).

`autoplan/` is the simplest observed shape: just `SKILL.md` +
`SKILL.md.tmpl` (100KB generated file, no side assets) — it's a pure
orchestration skill that reads and re-runs the CEO/design/eng/DX review skills
from disk (per its own description).

### SKILL.md.tmpl → SKILL.md generation

`ARCHITECTURE.md:249-313` documents the template pipeline:

```
SKILL.md.tmpl  (human-written prose + placeholders)
      ↓  gen-skill-docs.ts (reads source code metadata)
SKILL.md       (committed, auto-generated)
```

Placeholders (`{{COMMAND_REFERENCE}}`, `{{PREAMBLE}}`, `{{QA_METHODOLOGY}}`,
`{{GBRAIN_CONTEXT_LOAD}}`, `{{REDACT_TAXONOMY_TABLE}}`, etc.,
`ARCHITECTURE.md:267-283`) are filled from source at **build time, not runtime**
(`ARCHITECTURE.md:297-304`) — because Claude reads `SKILL.md` directly at skill
invocation with no build step available. CI validates freshness via
`gen:skill-docs --dry-run` + `git diff --exit-code`
(`ARCHITECTURE.md:302`). **Consequence for the CKIS overlay: never hand-edit a
vendored `SKILL.md` — edits get silently clobbered on the next `git pull` +
`./setup`, since the file is a build artifact, not a source file.**

### SKILL.md frontmatter format

Confirmed fields, from `gstack/SKILL.md:1-15` (router skill) and
`office-hours/SKILL.md:1-35`:

```yaml
name: office-hours              # canonical skill id; setup reads this for the symlink name
preamble-tier: 3                # 1/2/3 — controls how much of the shared preamble runs
version: 2.0.0
description: YC Office Hours — two modes. (gstack)
allowed-tools:                  # tool allowlist Claude Code enforces for this skill
  - Bash
  - Read
  - Grep
  - Glob
  - Write
  - Edit
  - AskUserQuestion
  - WebSearch
triggers:                       # natural-language phrases that route into this skill
  - brainstorm this
  - is this worth building
  - help me think through
  - office hours
gbrain:                         # optional — only present on brain-aware skills
  schema: 1
  context_queries:
    - id: prior-sessions
      kind: list
      filter: {type: ceo-plan, tags_contains: "repo:{repo_slug}"}
      sort: updated_at_desc
      limit: 5
      render_as: "## Prior office-hours sessions in this repo"
```

`preamble-tier` values observed: `1` (router `gstack/SKILL.md:2`), `2`
(`learn/SKILL.md:2`, `context-save/SKILL.md:2`), `3` (`office-hours/SKILL.md:2`
— the more interactive/expensive skills get the fuller preamble). Voice
triggers (speech-to-text aliases) are a separate, host-stripped field — the
Claude host config explicitly strips `voice-triggers` in frontmatter
(`hosts/claude.ts:16`).

### Preamble mechanics (shared by every skill body)

Every `SKILL.md` opens with a `## Preamble (run first)` bash block
(`gstack/SKILL.md:27-139`, byte-identical pattern in `learn/SKILL.md:29-...`,
`context-save/SKILL.md`, `ship/SKILL.md`). It: runs an update check
(`gstack-update-check`), touches a session-tracking file under
`~/.gstack/sessions/$PPID`, reads config via `gstack-config get <key>`, detects
plan-mode/headless/Conductor context, loads project learnings from
`~/.gstack/projects/$SLUG/learnings.jsonl`, and fires local + opt-in remote
telemetry. This is generated from `{{PREAMBLE}}` per `ARCHITECTURE.md:287-295`.

### Installation / symlink mechanism (`./setup`, Claude host)

The exact mechanism, `setup:540-587` (`link_claude_skill_dirs`):

1. For every `<gstack_dir>/*/SKILL.md` found (i.e. every skill directory in the
   gstack repo), read the frontmatter `name:` field (`setup:550`); fall back to
   the directory name if absent.
2. Apply the `gstack-` prefix unless `--no-prefix` was passed
   (`setup:553-560`) — default is prefixed off per current README ("Your
   choice is remembered for future upgrades", `README.md:465-467`).
3. **Create a real directory** at `<skills_dir>/<link_name>/` (NOT a symlinked
   directory — `setup:568`, comment at `setup:535-537` explains this is
   specifically so Claude Code discovers it as a top-level skill rather than
   nested under `gstack/`, which would otherwise get auto-prefixed).
4. Inside that real directory, **symlink only `SKILL.md`** back into the
   gstack checkout: `_link_or_copy "$gstack_dir/$dir_name/SKILL.md"
   "$target/SKILL.md"` (`setup:571`).
5. If the skill has a `sections/` subdir, symlink/copy that too
   (`setup:576-578`) so runtime `Read sections/<name>.md` calls resolve.
6. On Windows without Developer Mode, `_link_or_copy` (`setup:43-58`) falls
   back from `ln -snf` to `cp -R`/`cp -f` — real copies that go stale after
   `git pull` until `./setup` is re-run (`README.md:471-473`).

For Claude specifically, `<skills_dir>` = `$(dirname
"$INSTALL_GSTACK_DIR")` = `~/.claude/skills/` when gstack itself lives at
`~/.claude/skills/gstack/` (`setup:19`, confirmed by `hosts/claude.ts:9-11`:
`globalRoot: '.claude/skills/gstack'`). Additionally, because Claude Code
skips the repo-shaped `~/.claude/skills/gstack/` directory itself when building
the slash-command list, `link_claude_root_skill_alias` (`setup:593-607`)
creates a thin separate wrapper `~/.claude/skills/_gstack-command/` whose
frontmatter `name:` stays `gstack`, purely so `/gstack` autocompletes.

`cleanup_old_claude_symlinks` (`setup:612-...`) additionally removes
stale un-prefixed entries when migrating naming schemes, verifying the
target really points back into `gstack/` before deleting (never deletes
directories it didn't create).

---

## §skill-triage

Legend: **ADOPTAR** = use as-is; **ADAPTAR** = keep but wrap with a CKIS
overlay (branding, SOP gate, or scope restriction); **OMITIR** = do not
install/enable for ebrain.

| Skill | Qué hace | Veredicto | Razón CKIS |
|---|---|---|---|
| office-hours | YC-branded product interrogation, 6 forcing questions + builder-mode design thinking (`README.md:181`) | ADAPTAR | Útil como disparador de claridad, pero la voz "YC Office Hours" (`office-hours/SKILL.md:4`) choca con la identidad Korvex/CKIS — el overlay debe re-etiquetar la voz, no la lógica. |
| autoplan | Corre CEO→design→eng→DX review en secuencia con auto-decisiones (`README.md:206`) | ADAPTAR | Motor de auto-decisión útil, pero "6 decision principles" son de Garry Tan, no SOPs de Eduardo — el overlay debe sustituir/objetar esos principios antes de dejarlo decidir solo. |
| plan-eng-review | Bloquea arquitectura, diagramas ASCII, edge cases, tests (`README.md:183`) | ADOPTAR | Genérico, sin choque de marca; encaja directo en el flujo de planificación de proyectos de Korvex. |
| plan-ceo-review | Reto de scope en 4 modos (expansión/reducción) (`README.md:182`) | ADOPTAR | Complementa bien la disciplina de scope que ya pide `.claude/CLAUDE.md` ("Simplicity First"); el principio de User Sovereignty (`ETHOS.md:115`) ya es compatible con "el usuario decide". |
| plan-design-review | QA de diseño en fase de plan, detecta AI slop (`README.md:184`) | ADAPTAR | Debe leer el Korvex Design System real antes de opinar (ver memoria `feedback_korvex_design_system_first`) — sin overlay, propondría paletas genéricas fuera de marca. |
| plan-devex-review | Revisión interactiva de DX con personas, TTHW (`README.md:185`) | ADOPTAR | Sin choque evidente; útil para CLIs/productos de Korvex orientados a desarrolladores. |
| review | Staff-engineer PR review, auto-fix de bugs obvios (`README.md:187`) | ADOPTAR | Núcleo genérico de calidad de código, sin dependencia de marca ni de Chromium. |
| investigate | Debugging sistemático, root-cause, congela el módulo bajo investigación (`README.md:188`) | ADOPTAR | Metodología agnóstica y compatible con "Read before edit" de CKIS. |
| qa | QA end-to-end con browser real, fix + regresión (`README.md:193`) | ADAPTAR | Lógica de test/fix es válida, pero depende 100% del daemon Chromium — condicionar a hardware disponible (ver §hallazgos). |
| qa-only | Igual que /qa pero solo reporta, no arregla (`README.md:194`) | ADAPTAR | Mismo condicionamiento de Chromium que /qa. |
| ship | Sync, tests, coverage audit, push, abre PR; squashea WIPs (`README.md:197`, `ship/SKILL.md:1138-1184`) | ADOPTAR | Flujo de release genérico; el squash de `WIP:` commits es compatible con higiene de git de Eduardo. |
| land-and-deploy | Merge + espera CI/deploy + verifica salud en prod (`README.md:198`) | ADOPTAR | Encaja con el pipeline de despliegue de korvex-web/brisas-del-golfo; sin choque de marca. |
| retro | Retro semanal con desglose por persona (`README.md:203`) | ADOPTAR | Eduardo trabaja solo/equipo chico en Korvex — el desglose por persona es opcional, no dañino. |
| learn | Gestiona memoria de sesión (`README.md:208`) | ADOPTAR | Complementa (no reemplaza) Dev Brain/CKIS — es memoria por-proyecto vía `~/.gstack/projects/$SLUG/learnings.jsonl` (ver §memory), capa distinta de la de Eduardo. |
| spec | Convierte intención vaga en spec ejecutable, gate de calidad Codex (`README.md:207`) | ADOPTAR | Útil para transformar brain-dumps de Eduardo en specs — ya pasa por el redact-engine antes de archivar (`CLAUDE.md:454-456`). |
| careful | Advierte antes de comandos destructivos (`README.md:226`) | ADOPTAR | Refuerza, no contradice, el "No deletion without confirmation" ya exigido por CKIS. |
| freeze | Restringe ediciones a un directorio (`README.md:227`) | ADOPTAR | Útil en debugging; sin choque. |
| unfreeze | Quita el freeze (`README.md:229`) | ADOPTAR | Trivial, complemento directo de freeze. |
| guard | careful + freeze combinados (`README.md:228`) | ADOPTAR | Mismo razonamiento que sus componentes. |
| document-release | Actualiza README/ARCHITECTURE/CLAUDE.md/CHANGELOG post-ship (`README.md:201`) | ADAPTAR | Debe respetar la regla CKIS "actualizar CHANGELOG.md" en el formato específico del vault/proyecto, no el formato genérico de gstack. |
| document-generate | Genera docs desde cero con Diataxis (`README.md:202`) | ADOPTAR | Framework agnóstico de marca; útil para documentación técnica de Korvex. |
| cso | Auditoría de seguridad infra-first, OWASP+STRIDE, scanner de secretos de skills (`README.md:196`) | ADOPTAR | Alto valor y ya alineado con la regla dura de "NUNCA secretos" de Eduardo — ver §secret-scanner. |
| codex | Segunda opinión vía OpenAI Codex CLI (`README.md:225`) | ADAPTAR | Requiere que `codex` CLI esté instalado y autenticado (dependencia externa no confirmada en este entorno) — condicionar a disponibilidad, no bloquear el resto del stack si falta. |
| setup-gbrain | Onboarding de GBrain (memoria persistente vía Supabase/PGLite) (`README.md:232`, `390-425`) | OMITIR (por ahora) | Eduardo ya tiene una arquitectura de 3 capas (`.brain/` + Dev Brain + CKIS, ver memoria `project_per_project_brain_arch`) — instalar GBrain en paralelo duplica la capa de memoria persistente sin necesidad clara; requiere decisión explícita de Eduardo antes de activar. |
| sync-gbrain | Reindexar código en GBrain + escribe bloque en CLAUDE.md (`README.md:233`) | OMITIR (por ahora) | Depende de setup-gbrain; mismo razonamiento — además escribiría en CLAUDE.md de cada proyecto, lo cual choca con "No vault restructuring sin confirmación". |
| health | Dashboard de calidad de código (linter, tests, dead code) (`README.md`, `health/SKILL.md`) | ADOPTAR | Envuelve herramientas ya existentes del proyecto; no impone dependencias nuevas pesadas. |
| benchmark | Regresión de performance vía el daemon browse (Core Web Vitals) (`README.md`) | ADAPTAR (OPT-IN hardware) | Depende del daemon Chromium — ver nota de hardware en §hallazgos. |
| benchmark-models | Compara Claude/GPT/Gemini lado a lado (latencia, costo, calidad) (`README.md:244`) | ADAPTAR | No depende de Chromium, pero sí de credenciales/costo de múltiples proveedores — condicionar a que Eduardo apruebe gasto de API antes de correrlo. |

**OPT-IN por hardware** (Chromium headless vía Playwright — máquina de
referencia tiene 3.6 GiB RAM total, **138 MiB libres y swap 7.6/7.6 GiB casi
lleno** en el momento de este análisis, ver §hallazgos):

| Skill | Qué hace | Veredicto | Razón CKIS |
|---|---|---|---|
| browse | Motor headless Chromium, ~100ms/comando tras arranque (`README.md:204`, `ARCHITECTURE.md:9-36`) | OPT-IN | Base de todos los skills de browser; el daemon + Chromium cache ya ocupan 622 MiB en disco en esta máquina — activar solo bajo demanda explícita. |
| design-shotgun | Genera 4-6 mockups vía GPT Image + browser de comparación (`README.md:191`) | OPT-IN | Doble costo: Chromium + llamadas a API de imagen (costo externo) — no automático. |
| design-review | Audita visualmente un sitio vivo y corrige (`README.md:189`) | OPT-IN | Mismo daemon Chromium que /browse. |
| open-gstack-browser (alias: connect-chrome, symlink confirmado en `ls` raíz: `connect-chrome -> open-gstack-browser`) | Lanza Chromium con sidebar, stealth anti-bot (`README.md:230`) | OPT-IN | Chromium con extensión — más pesado que headless puro. |
| scrape | Extrae datos de una página vía primitivas `$B` (`README.md`) | OPT-IN | Mismo daemon. |
| canary | Monitoreo post-deploy con capturas periódicas (`README.md:199`) | OPT-IN | Corre el daemon continuamente en background — riesgo de RAM sostenido en esta máquina. |
| pair-agent | Comparte el browser headed con otro agente (OpenClaw/Hermes/Codex) vía túnel ngrok (`README.md:195`, `ARCHITECTURE.md:88-121`) | OPT-IN | Chromium headed + superficie de red expuesta (túnel) — máximo cuidado en máquina con RAM ya saturada. |

Nota adicional de hardware: el clasificador de seguridad del sidebar (L4,
`browse/src/security-classifier.ts`) carga un modelo ONNX de 22MB por defecto,
con un ensemble opcional DeBERTa-v3 de **721MB**
(`ARCHITECTURE.md:168,178`) — solo relevante si se activa `/open-gstack-browser`
o el sidebar, y solo bajo `GSTACK_SECURITY_ENSEMBLE=deberta` explícito.

---

## §memory

### `/learn` — per-project learnings

State file: `${GSTACK_HOME:-$HOME/.gstack}/projects/${SLUG}/learnings.jsonl`
(`learn/SKILL.md:99`, `bin/gstack-learnings-log:88`, `bin/gstack-learnings-search:28`).
`GSTACK_HOME` defaults to `~/.gstack` (confirmed by `bin/gstack-paths:20-27`,
which resolves `GSTACK_STATE_ROOT` in priority order: `GSTACK_HOME` env var →
`CLAUDE_PLUGIN_DATA` [only when `CLAUDE_PLUGIN_ROOT` matches `*gstack*`,
`bin/gstack-paths:24-28`] → `$HOME/.gstack` → local `.gstack`). `SLUG` is
derived per-project by `bin/gstack-slug`. Format: one JSON object per line,
written via `bin/gstack-learnings-log` (`--skill`, `--type`, `--key`,
`--insight`, `--confidence`, `--source`), read with confidence decay by
`bin/gstack-learnings-search` (which also searches sibling projects'
`learnings.jsonl` files, `bin/gstack-learnings-search:39`).

### Checkpoint mode (`context-save` / `context-restore`)

Two independent mechanisms:

**1. Explicit checkpoints (`/context-save`, `/context-save <title>`).**
Writes a markdown file to
`"$GSTACK_STATE_ROOT/projects/$SLUG/checkpoints/${TIMESTAMP}-${TITLE_SLUG}.md"`
(`context-save/SKILL.md:875-897`; the directory is literally named
`checkpoints/`, not `contexts/` — "legacy path kept so existing saved files
remain loadable", `context-save/SKILL.md:899-900`). Frontmatter fields include
`status`, `branch`, `timestamp`, `session_duration_s`, `files_modified`
(`context-save/SKILL.md:907-914`). Filename collision handling appends a
random 4-char suffix rather than overwriting (`context-save/SKILL.md:886-893`)
— saves are append-only. Title is sanitized bash-side (`a-z0-9.-` allowlist,
`context-save/SKILL.md:870-884`) specifically to block shell-metacharacter
injection from a user-supplied title.

**2. Continuous checkpoint mode (opt-in, `gstack-config set checkpoint_mode
continuous`).** When enabled, skills auto-commit completed logical units to
git with a `WIP:` prefix plus a structured `[gstack-context]` body
(`README.md:249-251`, `context-save/SKILL.md:679-686`). `/ship` detects these
via `git log <base>..HEAD --grep="^WIP:"` and **filter-squashes** them before
opening the PR, preserving non-WIP commits so `git bisect` stays clean
(`ship/SKILL.md:1138-1184`). Push of WIP commits is opt-in separately via
`checkpoint_push=true` (default local-only, `README.md:251`).

Config for both lives in `~/.gstack/config.yaml` (`bin/gstack-config:2,18`:
`CONFIG_FILE="$STATE_DIR/config.yaml"`), never committed to a project repo.

### Sync to a private repo (Artifacts sync / GBrain memory sync)

Distinct from `/setup-gbrain`'s vector-DB brain (which is a separate system,
see §skill-triage OMITIR note): gstack itself can push its own state
(learnings, CEO plans, design docs, retros, developer profile) to a private
git repo at `$GSTACK_HOME` (i.e. `~/.gstack/` becomes a git working tree,
`bin/gstack-brain-sync:22` `GSTACK_HOME="${GSTACK_HOME:-$HOME/.gstack}"`).
Modes: `off` / `artifacts-only` / `full` (`gstack/SKILL.md:428-445`,
"privacy stop-gate" prompt). Sync cadence and state files:
`.brain-queue.jsonl`, `.brain-allowlist`, `.brain-privacy-map.json`,
`.brain-skip.txt`, `.brain-sync-status.json`, `.brain-last-push`,
`.brain-sync.lock`, `.brain-discover-cursor` — all under `$GSTACK_HOME`
(`bin/gstack-brain-sync:23-30`).

**Secret scanner in the sync path.** Before committing, `gstack-brain-sync`
runs `git -C "$GSTACK_HOME" diff --cached | secret_scan_stdin`
(`bin/gstack-brain-sync:268`). If the scan hits, the commit is unstaged
(`git reset HEAD`) and the sync is blocked, writing a loud status
(`bin/gstack-brain-sync:269-276`). This is a **second, simpler, embedded
scanner** — not the same engine as `lib/redact-patterns.ts` (see
§secret-scanner) — defined inline as a Python one-liner
(`bin/gstack-brain-sync:81-96`) covering: AWS access keys (`AKIA...`), GitHub
tokens (`gh[pousr]_...` / `github_pat_...`), OpenAI keys (`sk-...`), PEM
blocks, JWTs, and a generic `"authorization"/"api_key"/"token"/"secret"/
"password": "<value>"` JSON-embedded-credential pattern
(`bin/gstack-brain-sync:84-96`).

---

## §hosts

`./setup --host <name>` targets one of 10 registered hosts, defined as
`HostConfig` objects in `hosts/*.ts` and aggregated in `hosts/index.ts:9-21`
(`claude`, `codex`, `factory`, `kiro`, `opencode`, `slate`, `cursor`,
`openclaw`, `hermes`, `gbrain`). Each config controls (per `hosts/claude.ts`,
`hosts/codex.ts`, `hosts/cursor.ts`, `hosts/hermes.ts`, `hosts/gbrain.ts`):

- **`globalRoot` / `localSkillRoot`** — install target, e.g. Claude
  `.claude/skills/gstack` (`hosts/claude.ts:9-10`), Codex
  `.codex/skills/gstack` global / `.agents/skills/gstack` local
  (`hosts/codex.ts:11-12`), Cursor `.cursor/skills/gstack`
  (`hosts/cursor.ts:8-9`), Hermes `.hermes/skills/gstack`
  (`hosts/hermes.ts:8-9`), GBrain `.gbrain/skills/gstack`
  (`hosts/gbrain.ts:15-16`). Matches the README's install table
  (`README.md:114-123`).
- **`frontmatter.mode`** — Claude uses `denylist` (strip only `sensitive`,
  `voice-triggers`; keep everything else, `hosts/claude.ts:15-17`); every
  other host uses `allowlist` (keep only `name`/`description`[/`triggers` for
  gbrain], strip everything else, e.g. `hosts/codex.ts:15-18`,
  `hosts/gbrain.ts:20-23`). This means non-Claude hosts get a **much thinner**
  SKILL.md — no `allowed-tools`, no `gbrain:` block (except gbrain host
  itself), no full triggers list unless gbrain.
- **`pathRewrites`** — rewrites literal path strings inside generated docs so
  a skill written for Claude's `~/.claude/skills/gstack` reads correctly on
  another host, e.g. Codex rewrites `.claude/skills` → `.agents/skills`
  (`hosts/codex.ts:26-31`); Hermes/GBrain additionally rewrite `CLAUDE.md` →
  `AGENTS.md` (`hosts/hermes.ts:29`, `hosts/gbrain.ts:31`).
- **`toolRewrites`** — non-Claude Code hosts don't have "the Bash tool" /
  "the Read tool" etc., so generated docs get their tool vocabulary swapped:
  Hermes maps `Bash→terminal tool`, `Write/Edit→patch tool`, `Agent→
  delegate_task` (`hosts/hermes.ts:31-41`); GBrain maps `Bash→exec tool`,
  `Agent→sessions_spawn` (`hosts/gbrain.ts:33-43`). Claude has no
  `toolRewrites` (its own vocabulary is canonical).
- **`suppressedResolvers`** — non-Claude hosts can't invoke Codex CLI
  recursively or orchestrate sub-reviews, so Codex/Cursor/Hermes/GBrain all
  suppress `DESIGN_OUTSIDE_VOICES`, `ADVERSARIAL_STEP`,
  `CODEX_SECOND_OPINION`, `CODEX_PLAN_REVIEW`, `REVIEW_ARMY`
  (`hosts/codex.ts:33-40`, `hosts/hermes.ts:44-51`). GBrain and Hermes
  **do not** suppress `GBRAIN_CONTEXT_LOAD`/`GBRAIN_SAVE_RESULTS` — they're
  the two hosts that get brain-first context lookup and save-to-brain
  behavior (`hosts/gbrain.ts:52-58` explicit comment; `hosts/hermes.ts:53-57`).
  Claude and Cursor suppress both gbrain resolvers (`hosts/claude.ts:27`,
  `hosts/cursor.ts:23`) unless GBrain is separately configured as an MCP
  server.
- **`install.linkingStrategy`** — Claude uses `real-dir-symlink` (the
  mechanism in §skill-anatomy); every other host uses `symlink-generated`
  (`hosts/codex.ts:52-55`, `hosts/cursor.ts:35-38`) — generated per-host
  metadata files, not the raw repo SKILL.md.
- **`coAuthorTrailer`** — per-host git commit trailer, e.g. `Co-Authored-By:
  Claude Opus 4.7 <noreply@anthropic.com>` (`hosts/claude.ts:41`),
  `Co-Authored-By: OpenAI Codex <noreply@openai.com>` (`hosts/codex.ts:59`),
  `Co-Authored-By: Hermes Agent <agent@nousresearch.com>`
  (`hosts/hermes.ts:64`), `Co-Authored-By: GBrain Agent <agent@gbrain.dev>`
  (`hosts/gbrain.ts:69`).
- **`boundaryInstruction`** — Codex additionally gets an explicit instruction
  baked into its generated docs to never read/execute Claude's skill files
  under `~/.claude/`/`.claude/skills/` — "They contain bash scripts and prompt
  templates that will waste your time" (`hosts/codex.ts:60`). This is the
  clearest signal that hosts are meant to be **mutually blind** to each
  other's skill trees by design.
- **Multi-agent support** — `README.md:104-125` documents 8 external hosts
  (OpenAI Codex CLI, OpenCode, Cursor, Factory Droid, Slate, Kiro, Hermes,
  GBrain) reachable via `./setup --host <name>`; OpenClaw is handled
  differently — it spawns Claude Code sessions via ACP rather than getting its
  own skill install, so `./setup --host openclaw` just prints integration
  instructions and exits (`setup` lines around the `openclaw)` case,
  confirmed in the flag-parsing block read at `setup:105-120`).

---

## §secret-scanner

Two distinct scanners exist in this codebase — important to not conflate them
in the ebrain GUARDRAILS design.

### 1. The primary engine: `lib/redact-patterns.ts` + `lib/redact-engine.ts`

Single source of truth (`lib/redact-patterns.ts:1-30`), a 3-tier taxonomy:

- **HIGH (blocks)** — genuinely-secret credentials: AWS access key
  `AKIA[0-9A-Z]{16}` (`lib/redact-patterns.ts:186`); AWS secret key (40-char
  base64-ish, requires `aws_secret_access_key` within 100 chars,
  `:189-196`); GitHub PAT `ghp_`, OAuth `gho_`, server `ghs_`, fine-grained
  `github_pat_` (`:198-224`); GitLab `gl(pat|ptt|dt)-` (`:226-233`);
  HuggingFace `hf_` (`:235-240`); npm `npm_` (`:242-247`); DigitalOcean
  `dop_v1_` (`:249-254`); GCP service-account JSON private key, proximity-gated
  on `"private_key_id"` (`:256-266`); Anthropic `sk-ant-` (`:268-273`); OpenAI
  `sk-(proj|svcacct|admin)-...` or bare `sk-[A-Za-z0-9]{32,}` (`:275-285`);
  SendGrid `SG.xxx.yyy` (`:287-292`); Stripe live secret `sk_live_`
  (`:294-299`); Slack token `xox[baprs]-` and Slack webhook URL (`:301-313`);
  Discord webhook URL (`:315-320`); Twilio auth token (32 hex, proximity-gated
  on an `AC[a-f0-9]{32}` SID, `:322-329`); PEM private key block
  `-----BEGIN ... PRIVATE KEY-----` (`:331-336`); DB URL with embedded
  password (`:338-349`); and any HTTP(S) URL with embedded basic-auth
  credentials (`:351-361`) — both of the last two validated to reject
  placeholder passwords (`${VAR}`, `changeme`, etc.).
- **MEDIUM (confirm via AskUserQuestion)** — high-false-positive
  credential-shaped patterns deliberately demoted so the gate "doesn't cry
  wolf" (`lib/redact-patterns.ts:14-20,363`): Stripe publishable `pk_live_`,
  Google `AIza...` API key, JWTs, env-style `KEY|TOKEN|SECRET|PASSWORD=` (gated
  on Shannon entropy ≥3.0 bits/char to skip `FOO_KEY=changeme`,
  `:390-396`), and `Bearer <token>` headers (same entropy gate,
  `:398-412`). Also PII (email, phone E.164, SSN, credit card w/ Luhn
  checksum, public IPv4, crypto wallet) and internal-leak signals (`*.internal
  /.corp/.local/.prod/.staging` hostnames, localhost URLs with a path) and
  legal/damaging content (NDA/confidentiality markers, named-criticism near a
  capitalized two-word name) — `:414-510`.
- **LOW (surface only)** — absolute paths under `/Users|/home`, `TODO(owner)`
  markers (`:512-526`).

Design invariants stated in the file header (`:9-24`): three tiers, no
wholesale MEDIUM→HIGH promotion on public repos (public repos get sterner
per-finding confirmation instead of auto-block), every regex must be
linear-time (ReDoS-safe, enforced by `test/redact-pattern-lint.test.ts`), and
placeholder suppression operates per-matched-span, never per-line
(`isPlaceholderSpan`, `:141-175`).

**Where it runs** (per the file's own doc-comment, `lib/redact-patterns.ts:1-7`,
corroborated by `CLAUDE.md:436-472`):
- CLI: `bin/gstack-redact` — reads stdin or `--from-file`, exit codes `0`
  clean / `2` MEDIUM / `3` HIGH (`bin/gstack-redact:16-30`). Max input 1 MiB
  by default, fails closed above that (`bin/gstack-redact:23,30`).
- **Pre-push git hook**: `bin/gstack-redact-prepush`, installed/uninstalled
  via `gstack-redact install-prepush-hook` (`bin/gstack-redact:44-93`
  installer, chains any pre-existing hook into `pre-push.local`). Scans only
  the **added lines** of the ref range being pushed
  (`bin/gstack-redact-prepush:9-20`); HIGH blocks the push (exit 1) for public
  *and* private repos, MEDIUM only warns, `GSTACK_REDACT_PREPUSH=skip` is an
  explicit escape valve (`bin/gstack-redact-prepush:17-25`). Explicitly **not**
  history-scanning, binary/LFS/submodule-aware, or airtight — "a determined
  user can always bypass it" (`lib/redact-patterns.ts` header comment, echoed
  verbatim in `CLAUDE.md:438-443`).
- **Skill-generated docs**: `/spec`, `/ship`, `/cso`, `/document-release`,
  `/document-generate` all get their redaction-invocation blocks generated
  from this same engine via `scripts/resolvers/redact-doc.ts`
  (`{{REDACT_TAXONOMY_TABLE}}`, `{{REDACT_INVOCATION_BLOCK:<sink>}}`,
  `CLAUDE.md:454-456`) — "so they never drift from the engine."
- **Scan-at-sink discipline**: skills must scan the exact bytes about to be
  sent (write to temp file, scan that file, pass the same file to `gh`/`git`)
  — never scan a string then re-render it, which reopens a scan-vs-send gap
  (`CLAUDE.md:457-459`).
- Config: `redact_repo_visibility` (public/private/unknown, stored locally in
  `~/.gstack`, never committed) and `redact_prepush_hook`
  (`CLAUDE.md:468-470`). **No config key exists to disable HIGH blocking** —
  explicitly by design (`CLAUDE.md:470`).
- Audit trail: `/spec`'s semantic pass appends a content-free record
  (category + body sha256, no actual text) to
  `~/.gstack/security/semantic-reviews.jsonl` mode 0600 (`CLAUDE.md:471-472`).

### 2. The embedded scanner in `bin/gstack-brain-sync`

A separate, simpler inline Python regex scanner (`bin/gstack-brain-sync:82-96`,
detailed in §memory above) gating commits into the `~/.gstack` artifacts
private-repo sync. Covers AWS keys, GitHub tokens, OpenAI keys, PEM blocks,
JWTs, and JSON-embedded auth fields — a strict subset of tier-1's HIGH
patterns, hardcoded separately rather than importing `lib/redact-patterns.ts`.
**This is a gap worth flagging**: the brain-sync path does not get Stripe,
Slack, Discord, GitLab, DB-URL-with-password, or any of the MEDIUM/PII
coverage that the main engine has. If ebrain's overlay relies on "gstack
scans before any git push," it must know this scanner is weaker than the
pre-push hook's.

---

## §hallazgos-que-cambian-el-plan

1. **RAM is not a theoretical concern — it's live right now.** `free -h` on
   this machine during this session showed **3.6 GiB total RAM, 138 MiB
   free, and swap at 7.6/7.6 GiB (100% full)**. The `~/.cache/ms-playwright`
   directory already occupies 622 MiB on disk from a prior install. Any
   Chromium-daemon skill (`/browse`, `/qa`, `/qa-only`, `/design-review`,
   `/design-shotgun`, `/open-gstack-browser`, `/scrape`, `/canary`,
   `/pair-agent`, `/benchmark`) risks OOM or severe thrash on this box, not
   just "should be opt-in as a policy" — it may simply not run reliably.
   Recommend the CKIS overlay gate these behind an explicit
   `AskUserQuestion`-style confirmation ("this will start a persistent
   Chromium daemon — proceed?") rather than silent auto-invocation, and
   consider they may need to run on a different machine entirely.

2. **`SKILL.md` is a build artifact, not a source file.** The overlay must
   never hand-edit a skill's `SKILL.md` directly — it's regenerated from
   `SKILL.md.tmpl` by `gen-skill-docs.ts` and any manual edit is silently lost
   on the next `git pull` + `./setup` (`ARCHITECTURE.md:249-304`). If CKIS
   needs to inject SOP text into a skill's behavior, the only durable
   mechanisms are: (a) a sibling CLAUDE.md `## gstack` / `## Skill routing`
   section that the skill's own preamble reads (pattern already used by
   gstack itself, `gstack/SKILL.md:255-294`), or (b) a wrapper skill that
   invokes the gstack skill and layers CKIS checks before/after — not editing
   vendor files.

3. **`office-hours` and `autoplan`'s "6 decision principles" carry Garry
   Tan/YC framing baked into the workflow, not just cosmetic text.** These
   are opinionated business-thinking frameworks (YC-style forcing questions,
   auto-decision principles) that may conflict with Eduardo's own SOPs (e.g.
   Korvex's "contrast with data, don't validate" pricing discipline, memory
   `feedback_pricing_contrast_with_data`). The overlay should treat these as
   ADAPTAR, not ADOPTAR — review the actual decision principles text in
   `autoplan/SKILL.md` before enabling auto-decision mode unattended.

4. **`setup-gbrain`/`sync-gbrain` would install a second, parallel persistent
   memory system.** Eduardo already runs a documented 3-layer memory stack
   (`.brain/` + Dev Brain + CKIS, per memory
   `project_per_project_brain_arch`). GBrain (Supabase/PGLite vector DB) is a
   distinct product from gstack's own `/learn` + artifacts-sync (which is
   file-based, project-scoped, git-backed). Installing both risks duplicate,
   possibly conflicting, "where does knowledge live" answers. Recommend
   surfacing this as an explicit decision to Eduardo rather than auto-enabling
   either GBrain path.

5. **Host mutual-blindness is enforced by design, not accident** — Codex's
   `boundaryInstruction` (`hosts/codex.ts:60`) explicitly tells Codex sessions
   to ignore `~/.claude/` entirely. If ebrain's overlay wants Claude Code and
   Codex CLI to share any state, it must build that bridge itself — gstack's
   own host architecture intentionally keeps them from reading each other's
   skill trees.

6. **The brain-sync secret scanner is materially weaker than the pre-push
   scanner** (see §secret-scanner, gap noted above). If the CKIS GUARDRAILS
   language implies "gstack blocks secrets before any git push," that's only
   fully true for the `bin/gstack-redact-prepush` path — the `~/.gstack`
   artifacts-sync path uses a narrower hardcoded pattern set. Worth being
   precise about this distinction in ebrain's own GUARDRAILS doc so it doesn't
   overstate coverage.

7. **No conflicts found with the hard "no secrets" rule itself** — if
   anything, gstack's redaction engine (§secret-scanner) is stricter than
   what was assumed going in (3-tier taxonomy, entropy gating, Luhn/proximity
   validation, fail-closed size caps, ReDoS linting). It is a reasonable
   input/reference for hardening ebrain's own scanner, not just prior art to
   replace.

---

**Evidence density**: every factual claim above cites a `path:line` inside
`vendor/gstack/`. No `.env`, `*.pem`, credential, or key content was read or
reproduced at any point in this pass.
