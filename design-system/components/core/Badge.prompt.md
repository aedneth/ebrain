Badge de agente (punto \u25CF + nombre en su color categorico) o de tono semantico.

```jsx
<Badge agent="claude" />
<Badge agent="gemini" label="ebr-gem-web" />
<Badge tone="ok" label="UP" solid />
<Badge agent="codex" disabled />
```

- 8 agentes: claude, codex, gemini, opencode, cursor, route, generic, free.
- `solid` invierte (fondo color, texto void) \u2014 usar con moderacion.
- disabled -> gris `--text-3`.
