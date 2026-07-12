Tabla TUI: header dim + separador hairline \u2500 + filas planas; seleccion = fondo `--surface-2`.

```jsx
<Table
  columns={[{key:'hora',label:'hora',width:7},{key:'agente',label:'agente',width:12},{key:'costo',label:'costo',width:8,align:'right'}]}
  rows={[{hora:'14:32',agente:<Badge agent="claude"/>,costo:'$0.42'}]}
  selected={0}
/>
```

- Celdas pueden ser ReactNode (badges, texto coloreado). Alinear numeros a la derecha.
