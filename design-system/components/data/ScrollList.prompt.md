Lista navegable con marcador \u25B8 en la fila seleccionada y scrollbar de caracteres (\u2588 sobre \u2591).

```jsx
<ScrollList items={sessions} selected={1} height={6} renderItem={(s) => <SessionCard {...s} />} />
```

- El marcador \u25B8 es teal: en una vista, la lista enfocada es el momento de acento.
