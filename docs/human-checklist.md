---
type: checklist
project: ebrain
created: 2026-07-12
status: active
tags: [ebrain, human-in-the-loop, checklist, f5, hardening]
related: [SPRINT.md, f5-success-criteria.md, hermes-evaluation.md]
---

# ebrain — Checklist humano (acciones que solo Eduardo ejecuta)

> Todo lo human-in-the-loop se difirió a este punto (acuerdo de Eduardo). ebrain está **funcional y completo** sin esto; son acciones de **gasto/seguridad/timing MCP-idle** que requieren tu mano. Ordenadas por prioridad. Al cerrar cada una, marcá el checkbox y (si aplica) cerrá **D-16** en el DRIFT de Company Brain.

## 🔴 P1 — dinero y seguridad (hacer primero)

- [ ] **1. OpenRouter hard-cap.** En el dashboard de OpenRouter (openrouter.ai → Settings/Keys):
  - Desactivá **auto-recharge** (el balance cargado = techo real).
  - Poné un **límite por-key ≤ $10/mo** sobre `OPENROUTER_API_KEY`.
  - *Por qué:* `route.ts` tiene cap local, pero el gasto de **gbrain** (`think`/`dream`) NO entra al ledger local — su único cap real es el server-side de OpenRouter. Este paso cierra ese hueco.

- [ ] **2. Test vivo del hook-trust** (próxima sesión `codex` o `gemini`): pedile explícitamente `cat ~/.config/ebrain/.env` (o cualquier archivo de credenciales). **Debe negarse** (el guard `pre_tool_use` → deny+exit2). Si lo lee → el hook no está disparando en ese agente; avisame.

## 🟡 P2 — dream cycle (F5.1 · requiere MCP idle = sin sesión de agente viva)

> El dream y `gbrain config` chocan con el lock de PGLite si hay un MCP `serve` vivo. Cerrá toda sesión de agente (Claude Code / Codex / etc.) antes de correr esto. El script aborta limpio ("DIFERIDO") si detecta un serve — no se rompe nada si te olvidás.

- [ ] **3a. Preview sin gasto:** `bash ~/eBrain/scripts/dream-cycle --dry-run`
- [ ] **3b. Corrida supervisada real:** `bash ~/eBrain/scripts/dream-cycle` — mirá `~/.config/ebrain/dream.log` y el audit `~/.gbrain/audit/` (dream-budget JSONL). Confirmá que el gasto es razonable.
- [ ] **3c. Habilitar el timer nocturno** (03:30, catch-up al boot):
  ```bash
  cp ~/eBrain/scripts/systemd/ebrain-dream.{service,timer} ~/.config/systemd/user/
  systemctl --user daemon-reload && systemctl --user enable --now ebrain-dream.timer
  systemctl --user list-timers ebrain-dream.timer
  ```

## 🟢 P3 — cabos de gobernanza del harness

- [ ] **4. MUST#4 — humo real de Codex.** Abrí una sesión `codex` real en un repo con `.brain/`, trabajá algo, cerrala. Verificá que dejó rastro: `ls ~/eBrain/../<repo>/.brain/sessions/*codex* 2>/dev/null` o el índice de Dev Brain. **Si NO hay session log** → `subagent_stop` no dispara al cierre plano → hay que cablear un fallback git post-commit (avisame y lo hago).

- [ ] **5. Cablear `hooks.json` de gemini.** Es el único rojo de `ebrain harness doctor gemini`: el formato de hooks de gemini-cli no está verificado. Corré una sesión `gemini`, verificá su formato real de hooks, y avisame para cablear `~/.gemini/hooks.json` (o confirmá que gemini-cli no soporta hooks → queda como clase no-hook, gobernado por MCP+normas).

- [ ] **6. (Opcional) Verificar expiry de créditos Codex** ($2500 hackatón) — para planear el burn. Solo si querés el dato; no bloquea nada.

━━━

**Cuando termines P1+P2:** ebrain queda en régimen operativo pleno (routing capado + consolidación nocturna corriendo). P3 son hardening de gobernanza, no bloquean el uso diario. Cerrá **D-16** en `Company Brain/01-systems/ledger/DRIFT.md` a medida que avances.

## F6 — TUI acceptance

> **G56-R2 reconciliation (2026-07-16):** these five items ARE the pending human half of the F6 gate.
> Maker corrections G56-F1..F8 + R1 have landed with tests (see `CHANGELOG.md`), but this checklist
> stays **unchecked**: automated evidence cannot substitute visual, real-adapter write-back, first-use
> and daily-driver acceptance. Do not mark the F6 gate accepted without both these boxes AND the
> independent GPT-5.6-sol re-audit. Source of truth for gate status: the banner in `SPRINT-TUI.md`.

- [ ] **F6a. Visual acceptance.** Compare Home, Sessions, Launch, Memory, Routing and Doctor against the vendored mockups in `design-system/ui_kits/ebrain/` at 80x24 and a normal desktop terminal. Record any clipping or unclear control.
- [ ] **F6b. Real adapter write-back.** Launch one real Claude or Codex session from Launch, complete a small task, close it, then confirm the session log is present and available through Memory/search.
- [ ] **F6c. OpenRouter first use.** In Launch press `w`, approve the one-time profile initialization, select a profile/target/capability/cwd, review the plan, then cancel before launch if no paid run is intended.
- [ ] **F6d. Daily-driver friction.** Use `ebrain` for one workday (`ebrain ui` remains an alias). Note missing CLI controls, terminology, latency, or navigation friction in an issue or follow-up document.
- [ ] **F6e. Final audit package.** Provide `docs/f6-success-criteria.md`, `docs/TUI-EDGE-CASES.md`, `docs/TUI-CLI-COVERAGE.md`, test output and this checklist to GPT-5.6-sol. Do not mark the gate accepted without its independent verdict.
