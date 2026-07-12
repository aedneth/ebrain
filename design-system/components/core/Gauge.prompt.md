Gauge horizontal de caracteres (\u2588\u2593\u2591) para RAM, spend y caps de routing.

```jsx
<Gauge label="spend" value={2.1} max={10} width={24} suffix="$2.1/$10" />
<Gauge label="ram" value={3.2} max={4} tone="auto" suffix="3.2/4G" />
```

- `tone="auto"`: neutro, warn a partir de 75%, error a partir de 90%.
- Fallback ASCII: `#` lleno, `=` parcial, `.` vacio.
