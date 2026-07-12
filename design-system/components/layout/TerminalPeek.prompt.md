Frame para mirar el output de otra sesion (peek tmux): borde siempre dim, contenido en texto secundario.

```jsx
<TerminalPeek title="peek \u00B7 ebr-claude-korvex" live height="16em">
{"$ claude --resume\\n> analizando workspace..."}
</TerminalPeek>
```

- Nunca recibe foco visual teal: es contenido ajeno, siempre `--border-1` / `--text-2`.
