Wordmark pixel-block de ebrain: "e" en teal, "brain" en blanco, construido con medios bloques desde una matriz de 5 filas.

```jsx
<Wordmark />                 {/* grande, para HOME */}
<Wordmark variant="compact" />{/* "ebrain" 1 linea, barra superior */}
<Wordmark ascii />           {/* fallback ASCII puro */}
```

- La matriz exacta esta exportada como `WORDMARK_MATRIX` (5 filas por letra, `#`/`.`).
- Render de bloques: par de filas -> `\u2588` (ambas), `\u2580` (superior), `\u2584` (inferior).
- Nunca escalar con font-size distinto dentro de una vista TUI; es el UNICO elemento multi-tamano permitido.
