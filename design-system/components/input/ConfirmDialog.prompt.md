Modal de confirmacion: caja recta \u250C\u2510 sobre `--surface-2`; acciones como teclas, no botones.

```jsx
<ConfirmDialog danger title="kill session" message="terminar ebr-claude-korvex? El agente pierde su contexto." confirmKey="y" confirmLabel="kill" />
```

- `danger` -> borde + [y] en `--error`. Centrar sobre la vista con un scrim de `--bg-void` al 60%.
