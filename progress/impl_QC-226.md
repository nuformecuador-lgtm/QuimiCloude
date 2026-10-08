# impl QC-226 — tema-y-marca-base

## Fase 1 (T1, T2, T3) — frontend_dev, 2026-10-08

### Archivos

Copiados de `<raíz>/_trabajo/marca/` con `cp`, sin modificar; `cmp` contra el origen sin diferencias
en los 11:

- `public/brand/logo-horizontal-dark.svg`, `logo-vertical-dark.svg`, `isotipo.svg`, `isotipo-dark.svg` (de `svg/`)
- `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (de `web/`)
- `app/favicon.ico` (reemplaza), `app/icon.svg`, `app/apple-icon.png`, `app/opengraph-image.png` (de `web/`)

Creados:

- `app/opengraph-image.alt.txt` (`QuimiCloude`, sin salto de línea final)
- `tests/unit/brand/fonts.test.ts`
- `progress/impl_QC-226.md`

Modificados:

- `app/globals.css`: `:root`/`.dark` de color sustituidos por los de `tokens.css` (sin los comentarios
  hex), 16 entradas nuevas en el `@theme inline` existente, `--font-*` a Plex, `:root` de movimiento
  sin la regla global de `prefers-reduced-motion`.
- `app/layout.tsx`: `IBM_Plex_Sans`/`IBM_Plex_Mono` y `metadata` de D12.
- `tests/unit/theme/color-tokens.test.ts`: reescrito (ENMIENDA QC-226).
- `tests/unit/theme/theme-provider.test.tsx`: mock de `next/font/google` (ENMIENDA QC-226).

Dimensiones IHDR (leídas con node del chunk IHDR, bytes 16–23):

| Archivo | Ancho × alto |
| --- | --- |
| `app/apple-icon.png` | 180 × 180 |
| `app/opengraph-image.png` | 1200 × 630 |
| `public/icons/icon-192.png` | 192 × 192 |
| `public/icons/icon-512.png` | 512 × 512 |
| `public/icons/icon-maskable-512.png` | 512 × 512 |

### Contraste R5 (recalculado desde los oklch de `globals.css`)

Todos los pares llegan a su umbral. El más justo es `--input`/`--card` en claro: 3.219:1 (umbral 3).
Oscuro: `--input`/`--card` 3.661:1; `--muted-foreground`/`--muted` 4.663:1.

### Mapa R<n> → test (Fase 1)

| Requisito | Test |
| --- | --- |
| R1 | `tests/unit/theme/color-tokens.test.ts` > «R1 (ENMIENDA QC-226): declara en :root …», «R1, R2 … --chart-*», «R1, R2: no deja ningun color acromatico …», «R1, R2 … primario es petroleo …» |
| R2 | `color-tokens.test.ts` > «R2 (ENMIENDA QC-226): declara en .dark …» y los tres compartidos con R1 |
| R3 | `color-tokens.test.ts` > «R3: expone cada token de estado …» |
| R4 | `color-tokens.test.ts` > «R4 (ENMIENDA QC-226): declara --radius en 0.5rem» |
| R5 | `color-tokens.test.ts` > «R5 (ENMIENDA QC-226): en modo claro/oscuro …» |
| R6 | `color-tokens.test.ts` > «R6: declara en :root los tokens de duracion y de curva» |
| R7 | `tests/unit/brand/fonts.test.ts` > cuatro casos «R7: …» |
| R8 | `fonts.test.ts` > «R8: no carga Sora …», «R8: los SVG de marca traen el wordmark en trazos …» |
| R32 | `color-tokens.test.ts` > «R32: no declara movimiento fuera del bloque del login …» |
| R24 | Implementado en `app/layout.tsx`; su test (`tests/unit/brand/metadata-assets.test.ts`) es de T8 |

D16: los casos de QC-29 de `color-tokens.test.ts` tienen cada uno su equivalente (tablas, acromáticos,
hue/luminosidad del acento, radio, `--chart-*`, contraste), con «ENMIENDA QC-226» en el nombre o en
la cabecera. `theme-provider.test.tsx` solo cambia el mock, con su nota.

### Verificación (salida real)

- `pnpm run typecheck` → `tsc --noEmit`, exit 0.
- `pnpm run lint` → `✖ 7 problems (0 errors, 7 warnings)`; los 7 avisos son previos y están en
  archivos ajenos (`tests/unit/documentos/confirm-catalog-import.test.ts`,
  `tests/unit/pedidos/order-service.test.ts`, …).
- `pnpm exec vitest run tests/unit/theme/color-tokens.test.ts tests/unit/brand/fonts.test.ts tests/unit/theme/theme-provider.test.tsx`
  → `Test Files 3 passed (3)`, `Tests 24 passed (24)`.
- `pnpm exec vitest related --run app/globals.css app/layout.tsx <los 3 tests>` → `Test Files 3 passed (3)`, `Tests 24 passed (24)`.
- Extra: los 17 tests que leen `globals.css` o el layout como texto (`sidebar-panel`, `sidebar-ajuste`,
  `login-skin`, `private-header`, `theme-toggle`, convenciones…) → `17 passed`, `277 passed | 16 skipped`.

### Veredicto

Fase 1 hecha: kit versionado sin modificar, tokens y fuentes de la marca aplicados, y R1–R8, R32 con test en verde.
