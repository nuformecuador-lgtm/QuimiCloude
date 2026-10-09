# QC-226 — tema-y-marca-base · tasks.md

Leyenda: `[P]` = puede ir en paralelo con las otras `[P]` de la misma fase. «Dep.» = tasks que
tienen que estar hechas antes. Cada task acaba con `pnpm run typecheck`, `pnpm run lint` y
`pnpm exec vitest related --run <archivos tocados>` en verde.

## Fase 1 — recursos y tokens

- [x] **T1 [P] — Versionar el kit.** Copiar sin modificar a `public/brand/`
  `logo-horizontal-dark.svg`, `logo-vertical-dark.svg`, `isotipo.svg` e `isotipo-dark.svg`. A
  `public/icons/`, `icon-192.png`, `icon-512.png` e `icon-maskable-512.png`. A `app/`,
  `favicon.ico` (reemplaza), `icon.svg`, `apple-icon.png` y `opengraph-image.png`, y crear
  `opengraph-image.alt.txt` con `QuimiCloude`. Anotar en `progress/impl_QC-226.md` las
  dimensiones IHDR de `apple-icon.png` y de `opengraph-image.png`.
  *Hecho:* los archivos están, y `cmp` contra `_trabajo/marca/` no da diferencias.
- [x] **T2 [P] — Tokens y fuentes en `globals.css`** (R1–R6, R32). Sustituir `:root`/`.dark` de
  color, añadir las 16 entradas a `@theme inline`, `--radius: 0.5rem`, el `:root` de movimiento
  sin la regla global, y reenganchar `--font-*` a Plex. Limpiar los comentarios de las líneas
  tocadas.
  *Hecho:* `color-tokens.test.ts` reescrito (T10) y en verde.
- [x] **T3 — Fuentes y metadatos en `app/layout.tsx`** (R7, R8, R24). Plex Sans y Plex Mono con
  sus pesos; `metadata` con el `title` y la `description` de D12. Dep.: T2.
  *Hecho:* `tests/unit/brand/fonts.test.ts` en verde y `theme-provider.test.tsx` actualizado.

## Fase 2 — marca

- [x] **T4 — `components/shared/brand-logo.tsx`** (R15, R30). Dep.: T1.
  *Hecho:* `tests/unit/brand/brand-logo.test.tsx` en verde: proporción por variante, `src`
  correcto, `tone="auto"` con las dos imágenes y sus clases `dark:`, y sin clases de fondo,
  sombra ni borde.
- [x] **T5 [P] — Barra lateral** (R9–R13, R34). En `app-sidebar.tsx`, el logo horizontal o el
  isotipo en el enlace de marca, sin textos visibles. En `private-nav.ts`, retirar
  `BRAND_TAGLINE` y `BRAND_SHORT_LABEL`. En `globals.css`, las paradas de D5, el ítem activo de
  R11 sin tocar la barra `::before`, y las reglas del rail para el `<img>`. Dep.: T2, T4.
  *Hecho:* `app-sidebar`, `sidebar-desktop`, `sidebar-mobile`, `sidebar-ajuste` y
  `sidebar-panel` actualizados (T10) y en verde.
- [x] **T6 [P] — Encabezado privado** (R14). El isotipo `tone="auto"` dentro del `md:hidden` de
  `app/(private)/layout.tsx`. Dep.: T4.
  *Hecho:* `tests/unit/theme/private-header.test.tsx` en verde con el caso nuevo, y
  `private-layout.test.tsx` en verde sin editarlo.

## Fase 3 — login y metadatos

- [x] **T7 — Login** (R16–R23). En `page.tsx`, el `h1` con el logo vertical y `className="dark"`
  en el `main`. `login-background.tsx` pasa a las tres moléculas. En `globals.css`, el bloque del
  login reescrito (`design.md > 6`). Dep.: T2, T4.
  *Hecho:* `login-skin.test.tsx` actualizado y en verde; `login-form.test.tsx` en verde, con solo
  el caso de las líneas 375-381 enmendado (D21); `pnpm exec playwright test e2e/login-skin.spec.ts e2e/login.spec.ts` en verde en
  Chromium y WebKit.
- [x] **T8 [P] — Manifest y limpieza de `public/`** (R25–R29). Crear `app/manifest.ts` y borrar
  `public/file.svg`, `globe.svg` y `window.svg`. `next.svg`, `vercel.svg` y `app/page.tsx` no se
  tocan (D17). Comprobar en el preview de Vercel la URL absoluta de `og:image`. Dep.: T1.
  *Hecho:* `tests/unit/brand/metadata-assets.test.ts` y `e2e/brand-assets.spec.ts` en verde.

## Fase 4 — enmiendas y cierre

- [x] **T9 [P] — Enmiendas a los specs cerrados.** Añadir las notas
  `> ENMIENDA DEL 2026-10-08 (QC-226)` de `design.md > 8` en QC-29, QC-30, QC-13 y
  `11-layout-privado-con-sidebar`.
  *Hecho:* cada requisito de la tabla de `design.md > 8` tiene su nota y nada del texto original
  se borra.
- [x] **T10 — Tests de specs cerrados (D16).** Va repartida en T2, T3, T5 y T7: cada caso que
  cambia lleva la referencia a la enmienda en su nombre o en un comentario corto, y ningún caso
  se borra sin sustituirlo por su equivalente.
  *Hecho:* el reviewer contrasta el diff de `tests/` con la tabla de `design.md > 8`.
- [x] **T11 — Cierre.** `./init.sh` en verde. Rellenar en `progress/impl_QC-226.md` el mapa
  `R<n> → test` de `design.md > 9`. Dep.: todas.

## Archivos esperados

- `app/globals.css`
- `app/layout.tsx`
- `app/manifest.ts`
- `app/favicon.ico`
- `app/icon.svg`
- `app/apple-icon.png`
- `app/opengraph-image.png`
- `app/opengraph-image.alt.txt`
- `app/(private)/layout.tsx`
- `app/(public)/login/page.tsx`
- `app/(public)/login/components/login-background.tsx`
- `components/shared/brand-logo.tsx`
- `components/private/app-sidebar.tsx`
- `lib/shared/navigation/private-nav.ts`
- `public/brand/logo-horizontal-dark.svg`
- `public/brand/logo-vertical-dark.svg`
- `public/brand/isotipo.svg`
- `public/brand/isotipo-dark.svg`
- `public/icons/icon-192.png`
- `public/icons/icon-512.png`
- `public/icons/icon-maskable-512.png`
- `public/file.svg`
- `public/globe.svg`
- `public/window.svg`
- `tests/unit/theme/color-tokens.test.ts`
- `tests/unit/theme/theme-provider.test.tsx`
- `tests/unit/theme/sidebar-panel.test.tsx`
- `tests/unit/theme/private-header.test.tsx`
- `tests/unit/login-skin.test.tsx`
- `tests/unit/login-form.test.tsx`
- `tests/unit/app-sidebar.test.tsx`
- `tests/unit/sidebar-desktop.test.tsx`
- `tests/unit/sidebar-mobile.test.tsx`
- `tests/unit/sidebar-ajuste.test.tsx`
- `tests/unit/brand/brand-logo.test.tsx`
- `tests/unit/brand/fonts.test.ts`
- `tests/unit/brand/metadata-assets.test.ts`
- `e2e/login-skin.spec.ts`
- `e2e/brand-assets.spec.ts`
- `specs/QC-29-tema-claro-oscuro/requirements.md`
- `specs/QC-30-rediseno-login/requirements.md`
- `specs/11-layout-privado-con-sidebar/requirements.md`
- `specs/QC-13-guardia-de-sesion-en-navegacion/requirements.md`
- `progress/impl_QC-226.md`
