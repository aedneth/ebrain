Command palette centrada: prompt \u203A + fuzzy filter (matches en teal bold) + lista con seleccion elevada.

```jsx
<CommandPalette query="lau" selected={0} items={[{label:'launch: nueva sesion', hint:'l'},{label:'sessions: attach', hint:'a'}]} />
```

- Overlay: centrar horizontal, ~30% desde arriba, scrim `--bg-void` 60%.
- Su borde teal ES el momento de acento de la vista mientras esta abierta.
