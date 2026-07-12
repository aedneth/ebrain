Panel TUI con borde box-drawing (\u256D\u2500\u256E) y titulo en el borde; el contenedor base de toda vista.

```jsx
<Panel title="sessions" focus height="12em">...</Panel>
<Panel title="confirmar" dialog>...</Panel>
```

- `focus` -> borde `--accent` + titulo bold (estado blur: borde `--border-1`, titulo `--text-2`).
- `dialog` -> esquinas rectas `\u250C\u2510` (solo modales).
- Sin sombras ni radius: profundidad por tono (`bg="var(--surface-1)"`).
