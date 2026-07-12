Spinner de caracteres braille (\u280B\u2819\u2839...) a 80ms, con fallback ASCII `|/-\\`.

```jsx
<Spinner label="re-ejecutando doctor..." />
<Spinner ascii label="fallback" color="var(--text-2)" />
```

- Color default teal (cuenta como el momento de acento si la vista ya tiene uno: bajarlo a `var(--text-2)`).
