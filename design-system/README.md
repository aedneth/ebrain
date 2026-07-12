# design-system/ — ebrain TUI (vendored, read-only)

Acá aterriza el **export de Claude Design** del design system de la TUI ebrain
(tokens JSON + mockups HTML de las 7 pantallas + wordmark pixel-block).

- **Fuente:** brief en `docs/prompts/CLAUDE-DESIGN-BRIEF.md` (§1 campos, §2 prompt, §3 checklist de iteración).
- **Flujo:** Claude Design → iterar §3 → export zip → descomprimir ACÁ → commit → `scripts/design-sync-tui` → `tui/src/theme.ts`.
- **Regla:** este directorio es **vendored y read-only** — nunca editar el export a mano; los ajustes se hacen en Claude Design y se re-exporta, o se resuelven en la capa `theme.ts` (design-sync). Mismo patrón que busnet/dekko.
- **Rol en gates:** los mockups son la referencia de aceptación visual de los gates F6.3–F6.7 (SPRINT-TUI).

Estado: **vacío a la espera del export** (paso humano 6.2.1 del SPRINT-TUI).
