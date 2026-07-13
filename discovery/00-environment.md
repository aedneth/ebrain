# discovery/00-environment.md — Entorno y pins de vendor

> Generado en F0 (SPRINT 0.1.4 + 0.1.7). Base de la ingeniería inversa: todo reporte de discovery se lee contra estos SHAs exactos.

## Máquina

- **Host:** HP ProBook · Intel Celeron N4120 · **3.6 GiB RAM total**
- **OS:** Linux Pop!_OS (kernel 6.17.9-76061709-generic)
- **Disco (`~`):** 108 G total · **19 G libres** (83% usado) — suficiente para ambos clones (331 M)
- **RAM al momento del setup:** ~334 MiB disponibles ⚠ — confirma GUARDRAILS §9: máx 2 procesos pesados; embeddings/DB van a Supabase (F1+), nunca local.

## Prerrequisitos (SPRINT 0.1.4) — todos presentes

| Herramienta | Versión | Requisito | OK |
|---|---|---|---|
| bun  | 1.3.14  | ≥1.0 | ✓ |
| node | v20.20.1 | — | ✓ |
| git  | 2.34.1  | — | ✓ |
| jq   | 1.6     | — | ✓ |
| gh   | 2.92.0  | — | ✓ |

## Pins de vendor (SPRINT 0.1.7) — SOLO LECTURA

Clon directo de upstream (decisión de Eduardo, 2026-07-10). `vendor/` es gitignored y read-only para agentes; toda adaptación va a `overlay/`.

### vendor/gbrain
- **Remote:** https://github.com/garrytan/gbrain
- **SHA:** `a25209bbb2bacf1b88e06fd5282b27f1bf4a3e7a`
- **Branch:** `master` · **VERSION:** `0.42.58.0` · **commits:** 337
- **Último commit:** 2026-07-10T10:05:23+09:00 · **tag más cercano:** `eval-run-v0.35.1.0-baseline`
- **Tamaño:** 160 M
- **Top-level relevante:** `src/` (motor), `docs/`, `skills/`, `recipes/`, `templates/`, `tools/`, `evals/`, `gbrain.yml`, `INSTALL_FOR_AGENTS.md`, `DESIGN.md`, `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `package.json`, `bun.lock`

### vendor/gstack
- **Remote:** https://github.com/garrytan/gstack
- **SHA:** `7c9df1c568a9ea745508f679a329332b2c338063`
- **Branch:** `main` · **VERSION:** `1.60.1.0` · **commits:** 329
- **Último commit:** 2026-07-09T23:49:09-07:00 · **sin tags**
- **Tamaño:** 171 M
- **Skills presentes (dirs):** autoplan, review, qa, qa-only, ship, learn, retro, investigate, office-hours, plan-{ceo,eng,design,devex}-review, plan-tune, spec, careful, freeze, guard, unfreeze, cso, codex, canary, benchmark, benchmark-models, browse, scrape, design-{consultation,html,review,shotgun}, document-{generate,release}, make-pdf, health, landing-report, land-and-deploy, pair-agent, connect-chrome, open-gstack-browser, setup-gbrain, sync-gbrain, setup-deploy, setup-browser-cookies, skillify, context-{save,restore}, gstack-upgrade, hosts/, ios-* …
- **Docs clave:** `USING_GBRAIN_WITH_GSTACK.md`, `ETHOS.md`, `ARCHITECTURE.md`, `BROWSER.md`, `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SKILL.md`, `setup`, `bin/`

## Workspace creado (SPRINT 0.1.1)

```
~/eBrain/                 # raíz del repo (rama main, independiente; ignorado por el repo de $HOME)
├── CLAUDE.md             # maestro de agentes (movido desde docs/)
├── README.md             # (movido desde docs/)
├── .gitignore            # vendor/ *.env node_modules/ .gbrain/ spend.jsonl (+ *.pem *credentials*)
├── docs/                 # ULTRAPLAN ARCHITECTURE SPRINT ROUTING GUARDRAILS DESIGN KICKOFF-PROMPT + adr/
├── discovery/            # este archivo + 01..05 (reportes F0)
├── vendor/{gbrain,gstack}# clones read-only (gitignored)
├── overlay/              # adaptaciones CKIS (schema packs, deltas de skills)
├── cli/                  # wrapper ebrain (bun) — F4+
└── scripts/              # utilidades idempotentes
```

## Calibraciones aplicadas (el plan es vivo)

1. **Ruta canónica = `~/eBrain`** (no `/ebrain` raíz del FS). `~` es git work-tree → eBrain es repo anidado independiente; añadido `/eBrain/` a `~/.gitignore` para que el backup del home no lo entrelace. Registro de ebrain en el manifest de backup va en F2 (SPRINT 2.8).
2. **Deriva de taxonomía en los docs vs vault vivo:** los docs referencian `02-projects/`, `00-systems/ckis/`, `03-knowledge/`; el vault vivo usa **`03-projects/`, `01-systems/ckis/`, `05-knowledge/`**. Se usarán las rutas vivas al documentar en el vault (F1/F5).
3. **`docs/INSTALL.md`** (referido en SPRINT 0.2.1) no existe en gbrain; el equivalente es **`INSTALL_FOR_AGENTS.md`** en la raíz. Los workers de discovery lo usan.

━━━

## §F6 — Reverse engineering de TUIs (SPRINT-TUI 6.0.1)

Clones shallow (`--depth 1`, gitignored, read-only) capturados 2026-07-12 para el RE de referencia. Los reportes de RE viven en `discovery/tui/` (NO en `05-10` como decía el borrador del SPRINT: `05` ya lo ocupa `05-cost-estimate.md` de F0 → se agrupan en subcarpeta propia para no pisar F0).

| Repo | Ruta vendor | SHA | Stack de render | Código de UI |
|---|---|---|---|---|
| `sst/opencode` | `vendor/opencode` | `cf75036` | **TypeScript/bun** (sin archivos `.go` — migró de Go/bubbletea) | `packages/tui/` (+ `packages/ui`, `packages/session-ui`) |
| `openai/codex` | `vendor/codex` | `c888e8e` | **Rust / ratatui** | `codex-rs/tui/src/` |
| `google-gemini/gemini-cli` | `vendor/gemini-cli` | `f354eeb` (`0.52.0-nightly`) | **Ink / React** | `packages/cli/src/ui/` |
| `anthropics/claude-code` | (cerrada, sin clone) | n/a | Ink/React (público) | RE conductual |
| `cursor/cursor-agent` | (cerrada, sin clone) | n/a | n/a | RE conductual |

**Hallazgo temprano (pre-audit, a confirmar por el worker OpenCode):** opencode no tiene `.go` → refuerza ADR-003 D1 (el canon estético #1 de Eduardo corre en TS, no en Go/bubbletea). Si se confirma qué framework de render usa `packages/tui`, es insumo directo del GATE 6.0.8.
