# ebrain — micro-interacciones (spec, sin animación real)

Instrumento de precisión: los cambios de estado son legibles, discretos y de duración corta. Nada rebota. Sin easing decorativo — la terminal cambia de frame, no "anima".

## 1. Transición de foco entre paneles
- **Disparador:** `tab` / `shift+tab`, o click.
- **Cambio:** el panel que pierde foco vuelve borde `--border-1` + título `--text-2` normal; el que gana pasa a borde `--accent` + título `--text-1` bold.
- **Duración:** instantáneo (1 frame). Opcional: 1 frame intermedio en `--accent-dim` para sugerir dirección.
- **Regla:** exactamente un panel con borde teal a la vez (el momento de acento de la vista).

## 2. Spinner durante doctor re-run
- **Disparador:** tecla `r` en doctor.
- **Estado:** aparece `Spinner` braille (⠋⠙⠹…) a ~80 ms/frame con label "re-ejecutando checks…"; la lista de checks se atenúa a `--text-3`.
- **Fin:** al resolver, el spinner desaparece y cada check aparece con su glifo/tono final (✓ ! ✗). Sin fade: swap directo.
- **Fallback ASCII:** `| / - \\`.

## 3. Gauge que se llena
- **Disparador:** actualización de spend/ram.
- **Cambio:** la barra crece en pasos de **una celda entera** (nunca medio bloque en tránsito). Umbrales cambian el color al cruzarlos: neutro → `--warn` (≥75%) → `--error` (≥90%).
- **Cadencia:** ~1 celda / 60 ms hasta el valor objetivo. Discreto, no continuo.

## 4. Toast que entra y expira
- **Entrada:** aparece en la esquina inferior derecha (1 celda de margen), caja recta en el color del tono. Sin slide: aparición directa.
- **Vida:** ok 3 s · warn 5 s · error persiste hasta acción o `esc`.
- **Salida:** desaparece en 1 frame. Si hay varios, se apilan hacia arriba, el más nuevo abajo.

## 5. Palette que filtra al tipear
- **Apertura:** `/` — overlay centrado (~30% desde arriba) sobre scrim `--bg-void` al 60%, borde teal.
- **Filtrado:** cada tecla re-filtra por fuzzy match; los caracteres coincidentes se resaltan en `--accent` bold dentro de cada label. La selección salta al primer resultado.
- **Navegación:** ↑↓ mueve la selección (fondo `--surface-2`); `enter` ejecuta; `esc` cierra sin animación.

## Principios transversales
- Cambios en **frames enteros de celda**, nunca sub-píxel.
- El foco/selección se comunica por **tono + peso + fondo**, no por movimiento.
- Reducir a lo mínimo: si un cambio no aporta información, no ocurre.
