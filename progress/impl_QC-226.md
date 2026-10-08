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

## T8 y T9 — frontend_dev, 2026-10-08

### Archivos

Creados:

- `app/manifest.ts`: `MetadataRoute.Manifest` con los valores de D12 y los tres iconos de R26.
  Sin `description` (D12 no la fija para el manifest) y sin `metadataBase` en ningún sitio.
- `tests/unit/brand/metadata-assets.test.ts`
- `e2e/brand-assets.spec.ts`

Borrados (sin `git add`): `public/file.svg`, `public/globe.svg`, `public/window.svg`. `next.svg`,
`vercel.svg` y `app/page.tsx` intactos (D17).

Modificados:

- `tests/guards/guard-identificador-de-request.test.ts`: `brand-assets.spec.ts` dado de alta en
  `E2E_ESPERADOS`. Sin eso la guardia «no hay ningún archivo nuevo en e2e/» se ponía roja.
- T9, solo inserciones (`git diff --stat`: 83 líneas añadidas, 0 borradas):
  - `specs/QC-29-tema-claro-oscuro/requirements.md`: notas tras la tabla de decisiones (D6, D7,
    D10), tras R2 (R1, R2), R3, R4, R5, R6, R25 y R18.
  - `specs/QC-30-rediseno-login/requirements.md`: notas tras R1, R9, R12, R14, R20, R21, R22, R26
    y tras la tabla de decisiones (D3, D8, D9, D10, D12, numeradas como en «Cobertura de las
    decisiones cerradas»).
  - `specs/11-layout-privado-con-sidebar/requirements.md`: notas tras R24 y tras la tabla de
    decisiones (D7).
  - `specs/QC-13-guardia-de-sesion-en-navegacion/requirements.md`: nota tras R7.

### Mapa R<n> → test (T8)

| Requisito | Test |
| --- | --- |
| R24 | `tests/unit/brand/metadata-assets.test.ts` > «R24: el root layout declara el titulo y la descripcion de la app», «R24: el root layout no fija metadataBase» |
| R25 | `metadata-assets.test.ts` > «R25: existe %s» (×4), «R25: el icon.svg cambia de color con prefers-color-scheme», «R25: la imagen OG trae su texto alternativo»; `e2e/brand-assets.spec.ts` > «R25, R26: enlaza icon, apple-touch-icon y manifest», «R25, R28: declara og:image …» |
| R26 | `metadata-assets.test.ts` > «R26: declara los valores …», «R26: declara los iconos 192 y 512 …», «R26, R27: cada icono del manifest existe …»; `brand-assets.spec.ts` > «R26: el manifest servido trae los valores y los tres iconos», «R25, R26: enlaza …» |
| R27 | `metadata-assets.test.ts` > «R27: %s es un PNG de %ix%i» (×5, firma PNG + chunk IHDR), «R26, R27: …» |
| R28 | `brand-assets.spec.ts` > «R28: GET %s responde 2xx sin redirigir al login» (×4: manifest, icon.svg, apple-icon.png, icons/icon-192.png), «R25, R28: declara og:image y su URL responde 2xx …» |
| R29 | `metadata-assets.test.ts` > «R29: no existe %s» (×3), «R29: conserva %s, que usa app/page.tsx» (×2) |
| R30 | `metadata-assets.test.ts` > «R30: %s es un SVG con viewBox de %s» (horizontal 227×48, vertical 127×76, isotipos 47×47) |

### Verificación (salida real)

- `pnpm run typecheck` → `tsc --noEmit`, exit 0. (Una primera pasada dio 2 `TS2305` en
  `sidebar-ajuste.test.tsx` y `sidebar-desktop.test.tsx` por `BRAND_TAGLINE`/`BRAND_SHORT_LABEL`:
  eran del trabajo en curso de T5, ajeno; al repetir, exit 0.)
- `pnpm run lint` → `✖ 7 problems (0 errors, 7 warnings)`, los 7 previos y ajenos.
  `pnpm exec eslint app/manifest.ts tests/unit/brand/metadata-assets.test.ts e2e/brand-assets.spec.ts tests/guards/guard-identificador-de-request.test.ts` → sin problemas.
- `pnpm exec vitest run tests/unit/brand/metadata-assets.test.ts` → `Test Files 1 passed (1)`, `Tests 25 passed (25)`.
- `pnpm exec vitest related --run app/manifest.ts tests/unit/brand/metadata-assets.test.ts` → `Test Files 1 passed (1)`, `Tests 25 passed (25)`.
- `pnpm exec vitest run guard` → `Test Files 56 passed (56)`, `Tests 744 passed | 11 skipped (755)`.
- `pnpm exec playwright test e2e/brand-assets.spec.ts` → `14 passed (20.3s)` (7 casos × chromium y
  webkit). Corrió sin `.env` en el worktree: el spec no toca la base de datos.

### Pendiente

- **Comprobar en el preview de Vercel la URL absoluta de `og:image`** (T8, `design.md > 7` y
  riesgo de §12). No se puede hacer desde el worktree; en local (`next dev`) el E2E solo afirma que
  la URL termina en `/opengraph-image.png` y que responde 2xx.

### Veredicto

T8 y T9 hechas: manifest y limpieza de `public/` con R24–R30 en verde (unitario y E2E en Chromium y WebKit), y las enmiendas añadidas sin borrar texto; queda la comprobación del preview de Vercel.

## Fase 2 (T4, T5, T6 y su parte de T10) — frontend_dev, 2026-10-08

### Archivos

Creados:

- `components/shared/brand-logo.tsx`: `BrandLogo` (`next/image` con `unoptimized`, ancho desde la tabla de `viewBox`, `tone="auto"` con `dark:hidden` / `hidden dark:block`).
- `tests/unit/brand/brand-logo.test.tsx`

Modificados:

- `components/private/app-sidebar.tsx`: el enlace de marca pinta el logo horizontal (28 px) o el isotipo en modo icono (32 px), con `alt=""`; fuera el símbolo provisional, `private-brand-mark/-short/-long/-tagline` y `FlaskConicalIcon`.
- `lib/shared/navigation/private-nav.ts`: fuera `BRAND_TAGLINE` y `BRAND_SHORT_LABEL`; docblock de `BRAND_LABEL` limpio.
- `app/globals.css`: paradas de D5 en `--sidebar-panel-gradient` (claro y oscuro), ítem activo de R11 (26 %/5 %, anillo 32 %, `color: #fff`, `font-weight: 600`; `::before` intacto), regla del rail `[data-collapsible='icon'] [data-testid='private-brand-link'] img` (32 px, sin `border-radius`) en lugar de la de `private-brand-mark`. Comentarios de esas reglas limpiados.
- `app/(private)/layout.tsx`: `<BrandLogo variant="isotipo" tone="auto" height={28} alt={BRAND_LABEL} />` dentro del `md:hidden`; el contenedor pasa a `flex items-center gap-2 md:hidden` para que el isotipo quede en línea con el control (el preflight pinta los `<img>` como `block`).
- Tests (D16, cada caso cambiado con «ENMIENDA QC-226»): `tests/unit/app-sidebar.test.tsx`, `sidebar-desktop.test.tsx`, `sidebar-mobile.test.tsx`, `sidebar-ajuste.test.tsx`, `tests/unit/theme/sidebar-panel.test.tsx`, `tests/unit/theme/private-header.test.tsx` (caso nuevo). `private-layout.test.tsx` sin editar.

Nota de tipo: `BrandLogoProps` es una unión; `tone="auto"` solo se admite con `variant="isotipo"`, porque en el repo solo está la versión clara del isotipo (no la de los logos completos).

### Mapa R<n> → test (Fase 2)

| Requisito | Test |
| --- | --- |
| R9 | `tests/unit/theme/sidebar-panel.test.tsx` > «R9: pinta el panel flotante con radio 22px y el degradado …» (ENMIENDA QC-226), «R9: el degradado del panel es estatico, sin animacion ni transicion» |
| R10 | `sidebar-panel.test.tsx` > «usa 272px …», «da al menos 44px …» y `sidebar-ajuste.test.tsx` > «en modo icono el boton se fuerza a 44px …», sin cambios y en verde |
| R11 | `tests/unit/sidebar-ajuste.test.tsx` > «R11: el activo lleva el degradado al 26-5 %, el anillo al 32 % y el texto blanco en 600», «R11: la barra de acento del borde izquierdo queda como estaba» |
| R12 | `tests/unit/app-sidebar.test.tsx` > «R12: expandida, la marca pinta el logo horizontal oscuro a 28px sin texto visible»; `sidebar-ajuste.test.tsx` > «R12, R15: la marca es el logo horizontal …»; `sidebar-mobile.test.tsx` > «en viewport angosto no se aplica el modo icono» (ENMIENDA QC-226); `brand-logo.test.tsx` > «R12, R13: con alt vacio …» |
| R13 | `app-sidebar.test.tsx` > «R13: en modo icono, la marca pinta el isotipo oscuro a 32px …»; `sidebar-ajuste.test.tsx` > «R13: en modo icono la marca es solo el isotipo …», «R13: en modo icono el isotipo de la marca mide 32px, sin radio de esquina»; `sidebar-desktop.test.tsx` > «activar el control alterna a modo icono …» (ENMIENDA QC-226) |
| R14 | `tests/unit/theme/private-header.test.tsx` > «R14: en viewport angosto muestra el isotipo con la version de cada tema, y en ancho no»; `brand-logo.test.tsx` > «R14, R15: el isotipo con tone="auto" …» |
| R15 | `tests/unit/brand/brand-logo.test.tsx` > «R15, R30: $variant sobre fondo oscuro pinta $src con la proporcion de su viewBox» (×3), «R15: el logo horizontal a 28 px sale a 132 px …», «R15: no anade fondo, sombra, brillo ni contorno …» |
| R30 | `brand-logo.test.tsx` > «R15, R30: …» (×3), «R30: sirve el SVG tal cual, sin pasar por el optimizador» (la igualdad byte a byte con el kit es de `metadata-assets.test.ts`, T8) |
| R34 | `brand-logo.test.tsx` > «R34: private-nav no exporta BRAND_TAGLINE ni BRAND_SHORT_LABEL …», «R34: ningun archivo de app/, components/ ni lib/ nombra …» |

D16, caso por caso: `app-sidebar` (el «R4» deja de afirmar `private-brand-long`; sus dos casos equivalentes son R12 y R13), `sidebar-desktop` (cuatro aserciones `brandLong/brandShort` → `src` del `<img>`), `sidebar-mobile` (marca larga → logo horizontal dentro del `Sheet`), `sidebar-ajuste` («simbolo y bajada» → R12/R15; «simbolo con las iniciales» → R13), `sidebar-panel` (regex de las paradas). Ningún caso borrado sin equivalente.

### Verificación (salida real)

- `pnpm run typecheck` → `tsc --noEmit`, exit 0.
- `pnpm run lint` → `ESLint: 0 errors, 7 warnings in 2 files` (los 7 previos, en `confirm-catalog-import.test.ts` y `order-service.test.ts`).
- `pnpm exec vitest run tests/unit/brand/ tests/unit/app-sidebar.test.tsx tests/unit/sidebar-desktop.test.tsx tests/unit/sidebar-mobile.test.tsx tests/unit/sidebar-ajuste.test.tsx tests/unit/theme/ tests/unit/private-layout.test.tsx tests/unit/login-skin.test.tsx` → `Test Files 18 passed (18)`, `Tests 173 passed (173)`.
- `pnpm exec vitest related --run <5 archivos de producción + 7 tests>` → `Test Files 1 failed | 90 passed (91)`, `Tests 1 failed | 1407 passed | 20 skipped`. El rojo es `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx > '/pedidos' se sirve con el permiso …`: `TypeError … reading 'status'` en `app/(private)/pedidos/page.tsx:96` (`loadFormCatalogs`). Ninguno de los archivos de esta tanda está en esa traza ni el test nombra la marca; no lo verifiqué contra la base.

### Veredicto

Fase 2 hecha: logo e isotipo en barra, rail y encabezado, R9–R15, R30 y R34 con test en verde; un rojo ajeno en `pantallas-exigen-permiso` por confirmar contra la base.

## T7 — Login (parcial: R16 BLOQUEADO) — frontend_dev, 2026-10-08

### Bloqueo: R16 contra `tests/unit/login-form.test.tsx`

`tests/unit/login-form.test.tsx:375-381` («muestra la marca del producto como titulo de la tarjeta»)
exige `document.querySelector('[data-slot="card-title"]')` con `textContent` `QuimiCloude`. R16 y
`design.md > 6` sustituyen `CardTitle` por un `<h1>` cuyo nombre sale del `alt` del logo (sin texto),
así que ese caso se pone rojo. La consigna de T7 dice que ese archivo no se edita y queda verde, y
`design.md > 8` no lo lista entre los tests que se enmiendan (D16). No se resolvió: `page.tsx` conserva
`<CardTitle>QuimiCloude</CardTitle>` y R16 no tiene test todavía. Opciones para el humano/leader:

- **A (recomendada):** enmendar ese caso como D16 («ENMIENDA QC-226»: un único `h1` con nombre
  `BRAND_LABEL` y el `<img>` del logo vertical) y añadir `login-form.test.tsx` a la tabla de `design.md > 8`.
- **B:** `<h1 data-slot="card-title">` con `<BrandLogo … alt="" />` y un `<span className="sr-only">`
  con `QuimiCloude`. Deja el test verde sin editarlo, pero contradice `design.md > 6`
  (`alt={BRAND_LABEL}`, «no hace falta texto oculto») y finge un `CardTitle` solo para el test.

### Archivos

- `app/(public)/login/page.tsx`: `className="dark"` en el `<main data-login="screen">`; limpiado el
  docblock que hablaba de burbujas. **Sin** el `h1` (bloqueo de arriba).
- `app/(public)/login/components/login-background.tsx`: tres `<svg data-login="molecule">` con los
  polígonos, trazos y colores de `Login.dc.html` 72–85; sin `style`, sin `width`/`height`,
  `aria-hidden` en la capa. Server Component.
- `app/globals.css`: bloque del login reescrito en su sitio (final del archivo), delimitadores
  `Pantalla de login — INICIO` / `— FIN`, sin `@layer`, contiguo. Variables `--login-*` en
  `[data-login='screen']`, `color-scheme: dark` y fondo de R17, medidas sin cambios, base opaca +
  `@supports` con `blur(14px)` y `-webkit-`, transparencia reducida, entrada `login-card-enter`,
  moléculas con tamaño, posición, opacidad y ciclo del lienzo, y `@media (prefers-reduced-motion:
  reduce)` acotado con `login-card-fade 150ms linear both`. Nada tocado fuera del bloque.
- `tests/unit/login-skin.test.tsx`: actualizado («ENMIENDA QC-226» en el nombre de cada caso cambiado).
- `e2e/login-skin.spec.ts`: los dos casos de burbujas sustituidos y dos casos nuevos (R17, R21).

### D16, caso por caso (`login-skin`)

| Caso anterior | Equivalente |
| --- | --- |
| encierra todo lo de QC-30 entre sus delimitadores | R32: encierra todo lo del login… (delimitadores nuevos, `--login-`, keyframes nuevas) |
| fuera de toda capa | R23: declara el bloque del login fuera de toda capa |
| prefijo `-webkit-` (22px) | R20: blur(14px) con y sin prefijo, también en la condición |
| base opaca y vidrio en `@supports` | R20: base opaca y `--login-card-glass` dentro de `@supports` (+ caso de orden) |
| exactamente tres burbujas | R18: exactamente tres moléculas |
| burbujas desaparecen con movimiento reducido | R22: moléculas quietas y visibles, tarjeta con fundido (+ fundido solo opacidad, + regla acotada) |
| retardos negativos y ciclos 17/18/19 | R19: ciclos 22/30/26, dirección y curva, ninguno < 20 s |
| solo variables `--qc30-` | R17: solo variables `--login-` salvo `--card-spacing` |
| valores móviles/escritorio de las burbujas | R18: tamaño, posición y opacidad de cada molécula |
| valores del insumo en los dos modos | R17, R20: fondo, vidrio y sombra en un solo juego (+ `color-scheme: dark`) |
| filo y brillo en la sombra, también con transparencia reducida | R20: `box-shadow: var(--login-card-shadow)` en las dos ramas |
| opacidad, deriva, recorrido y escala de cada burbuja | R19: keyframes `translateY(-36px) rotate(24deg)` |
| capa sin puntero y bajo la tarjeta | R18: capa de moléculas sin puntero, z-index 1/2 |
| (nivel 2) tres burbujas decorativas | R18: tres moléculas decorativas (+ sin `style`, + polígonos y colores) |
| (nivel 2) capa hermana antes de la tarjeta | R18: capa de moléculas hermana y antes |
| (E2E) oculta las burbujas con movimiento reducido | R22: moléculas visibles con `animation-name: none`; la tarjeta usa `login-card-fade`, sin `transform`, y acaba en opacity 1 |
| (E2E) pinta las tres burbujas | R18, R19: tres moléculas con `animation-name`, duración, dirección e iteraciones |

Sin cambios: medidas 44/400/18/28 (texto y E2E), panel flotante, radio/anillo/tipografía, `main`
único, enlace fuera del `<form>`, primitivas intactas, `min-h-svh`. Ningún caso borrado sin equivalente.

### Mapa R<n> → test (T7)

| Requisito | Test |
| --- | --- |
| R16 | **sin test: bloqueado** (ver arriba) |
| R17 | `login-skin.test.tsx` > «R17 (ENMIENDA QC-226): el main lleva el ambito oscuro…», «…solo declara variables propias con prefijo --login-…», «R17, R20…: fondo petroleo, vidrio y sombra…», «R17…: color-scheme oscuro»; `e2e/login-skin.spec.ts` > «R17 (ENMIENDA QC-226): con el tema claro de la app, el login resuelve los tokens oscuros» |
| R18 | `login-skin.test.tsx` > «R18…: no deja marcado ni CSS de las burbujas…», «…exactamente tres moleculas», «…tamano, posicion y opacidad…», «…capa de moleculas sin capturar el puntero…», nivel 2 «…tres moleculas como capa decorativa…», «…sin style en linea…», «…poligonos y trazos del lienzo…», «…hermana de la tarjeta…»; E2E «R18, R19…» |
| R19 | `login-skin.test.tsx` > «R19…: ciclos de 22, 30 y 26 s…», «R19…: flotan 36 px y giran 24 grados…»; E2E «R18, R19…» |
| R20 | `login-skin.test.tsx` > «R20…: blur(14px) con y sin prefijo…», «…opaca como base y el vidrio solo dentro de @supports», «…transparencia reducida va despues del @supports…», «…conserva la sombra…», «R17, R20…» |
| R21 | `login-skin.test.tsx` > «R21 (ENMIENDA QC-226): la tarjeta entra una vez…»; E2E «R21…: la tarjeta entra una vez y acaba con opacidad 1» |
| R22 | `login-skin.test.tsx` > tres casos «R22 (ENMIENDA QC-226)…»; E2E «R22…: con movimiento reducido deja las tres moleculas visibles y quietas» |
| R23 | `login-form.test.tsx` sin editar (verde porque el bloqueo sigue sin resolver); `login-skin.test.tsx`: medidas, `main` único y enlace fuera del form; E2E: medidas 44/400/16 px; `e2e/login.spec.ts` sin editar (no corre por entorno, abajo) |
| R32 | `color-tokens.test.ts` > «R32: …» sigue verde con los delimitadores nuevos; `login-skin.test.tsx` > «R32 (ENMIENDA QC-226)…» |

### Verificación (salida real)

- `pnpm run typecheck` → `tsc --noEmit`, exit 0, sin errores.
- `pnpm run lint` → `ESLint: 0 errors, 7 warnings in 2 files` (los 7 previos, en `confirm-catalog-import.test.ts` y `order-service.test.ts`).
- `pnpm exec vitest run tests/unit/login-skin.test.tsx tests/unit/login-form.test.tsx tests/unit/theme/color-tokens.test.ts` → `Test Files 3 passed (3)`, `Tests 72 passed (72)` (35 de ellos en login-skin).
- `pnpm exec vitest related --run "app/(public)/login/page.tsx" "app/(public)/login/components/login-background.tsx" app/globals.css tests/unit/login-skin.test.tsx` → `Test Files 6 passed (6)`, `Tests 100 passed (100)`.
- `pnpm exec playwright test e2e/login-skin.spec.ts` → `14 passed (15.9s)` (7 casos × chromium y webkit).
- `pnpm exec playwright test e2e/login-skin.spec.ts e2e/login.spec.ts` → `10 failed`, `14 passed`. Los 10 rojos son los 5 casos de `e2e/login.spec.ts` en los 2 motores, todos con
  `PrismaClientInitializationError: Invalid prisma.role.findMany() invocation … error: Environment variable not found: DATABASE_URL.` (`e2e/login.spec.ts:242`). No hay `.env` en el worktree y no se copió el de la raíz, así que esos casos quedan sin verificar.

### Veredicto

T7 parcial: fondo de moléculas, ámbito oscuro, vidrio, entrada y movimiento reducido hechos y en verde (unitarios y E2E en los dos motores). R16 (el `h1` con el logo) queda bloqueado porque choca con `login-form.test.tsx`, y `e2e/login.spec.ts` no corre sin `DATABASE_URL`.

## T7 — R16 (D21) y par de D22 en R5 — frontend_dev, 2026-10-08

El bloqueo de arriba se resuelve con D21 (opción A, decisión humana). D22 mantiene QC-29 R25.

### Archivos

- `app/(public)/login/page.tsx`: `CardTitle` sustituido por `<h1>` con
  `<BrandLogo variant="vertical" tone="on-dark" height={79} alt={BRAND_LABEL} />`; sin texto oculto;
  import de `CardTitle` retirado; `BRAND_LABEL` importado de `lib/shared/navigation/private-nav`.
- `tests/unit/login-form.test.tsx`: **solo** el caso «muestra la marca del producto como titulo de la
  tarjeta (ENMIENDA QC-226 (D21))»: ahora `getByRole('heading', { level: 1, name: 'QuimiCloude' })`.
  Resto del archivo intacto.
- `tests/unit/login-skin.test.tsx`: caso nuevo de R16 (nivel 2) e import de `BRAND_LABEL`.
- `tests/unit/theme/color-tokens.test.ts`: par `['sidebar-foreground', 'sidebar']` añadido a
  `TEXT_PAIRS` (lo recorren los dos casos `it.each` de R5, claro y oscuro). Ningún token tocado.
  Ratios con la conversión del test: claro 13.66:1, oscuro 16.24:1.

### Mapa R<n> → test (completa el de T7)

| Requisito | Test |
| --- | --- |
| R16 | `login-skin.test.tsx` > «R16: la cabecera de la tarjeta es un unico h1 con el logo vertical oscuro y sin texto visible»; `login-form.test.tsx` > «muestra la marca del producto como titulo de la tarjeta (ENMIENDA QC-226 (D21))» |
| R5 (par de D22) | `color-tokens.test.ts` > «R5 (ENMIENDA QC-226): en modo claro…» y «…en modo oscuro los pares de texto llegan a 4.5:1…» (`sidebar-foreground/sidebar` en `TEXT_PAIRS`) |
| R23 | `login-form.test.tsx` en verde con solo el caso de D21 enmendado |

### Verificación (salida real)

- `pnpm run typecheck` → `tsc --noEmit`, exit 0.
- `pnpm run lint` → `✖ 7 problems (0 errors, 7 warnings)` (los 7 previos, en `confirm-catalog-import.test.ts` y `order-service.test.ts`).
- `pnpm exec vitest run tests/unit/login-form.test.tsx tests/unit/login-skin.test.tsx tests/unit/theme/color-tokens.test.ts tests/unit/brand` → `Test Files 6 passed (6)`, `Tests 114 passed (114)`.
- `pnpm exec playwright test e2e/login-skin.spec.ts` → `14 passed (23.5s)` (7 casos × chromium y webkit). El servidor avisa de que `/brand/logo-vertical-dark.svg` es el LCP y sugiere `loading="eager"`: solo aviso, no se toca `BrandLogo` (fuera del encargo).
- `e2e/login.spec.ts` no se corrió aquí (lo corre el leader).

### Veredicto

T7 completo en lo que toca a frontend_dev: R16 con el `h1` del logo y su test, D21 aplicado en el único caso permitido, y el par de D22 en verde en los dos modos.
