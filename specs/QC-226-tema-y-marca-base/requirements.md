# QC-226 — tema-y-marca-base · requirements.md

> **Zona:** `frontend` · **Complejidad:** `medium` · **Rama:** `feature/QC-226-tema-y-marca-base`
>
> Historia del spec: el 2026-10-08 `spec_author` devolvió BLOQUEADO porque esta ficha chocaba con
> decisiones cerradas de QC-29, QC-30 y QC-11. El humano respondió ese mismo día, con el lienzo
> `/design` «Degradados y movimiento de marca» (copia en `<raíz>/_trabajo/marca/lienzo/`). Las
> respuestas están en `progress/features/QC-226.md > Decisiones` y aquí como
> `## Decisiones cerradas`.

## Alcance

Aplicar la identidad de la guía de marca v1 (paleta «Verde Petróleo», isotipo «Molécula Q») a la
base de la app, sin rehacer componentes. Fuentes: la guía y el kit generado a partir de ella
(`<raíz>/_trabajo/marca/`: `tokens.css`, `guia-de-marca.html`, `svg/`, `web/`), más el lienzo
(`lienzo/Main.dc.html`, opción A; `lienzo/Login.dc.html`, opción C). Esta feature versiona los
archivos del kit que usa la app.

**Entra:**
- Tokens de color en `app/globals.css`, claro y oscuro: los de shadcn (incluidos los `--chart-*`),
  los de estado, los de la barra lateral y `--radius`. Los tokens de movimiento solo se declaran.
- Tipografía: IBM Plex Sans e IBM Plex Mono en lugar de Geist.
- Panel lateral: degradado en petróleo y el ítem activo en el azul de acento.
- Marca: el logo horizontal en la barra lateral, el isotipo en el rail y en el encabezado angosto,
  y el logo vertical en el login.
- Login: se retiran las burbujas y entra el fondo «Moléculas», con vidrio oscuro y la entrada única
  de la tarjeta.
- Iconos y metadatos: favicon, icon, apple-icon, iconos PWA, manifest, imagen OG, y el título y la
  descripción de la app.

**No entra:**
- Restyling de componentes (badges, tablas, botones, inputs, texto de los ítems inactivos): QC-227.
- Movimiento de la app (entrada de pantalla, ítem que se desliza, botones, tarjetas, toasts,
  diálogos) y el bloque global de `prefers-reduced-motion`: QC-228.
- Editar `components/ui/`.
- La barra de acento del ítem activo (QC-227, D18) y qué hacer con la ruta `/` (otra ficha, D17).

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién y cuándo | Enmienda a | Cubierta por |
| --- | --- | --- | --- | --- |
| D1 | Fuente: guía v1 + kit + lienzo. Se versionan solo los archivos del kit que usa la app; el resto se queda en `_trabajo/` | humano, 2026-10-08 | — | R27, R30 |
| D2 | Paleta «Verde Petróleo»: los valores de `tokens.css` tal cual, en los dos modos, con los `--chart-*`, los de estado y `--sidebar-muted-foreground` | humano, 2026-10-08 (ficha) | QC-29 D6, D7, D10, R1–R4, R6, R25 | R1, R2, R3, R5 |
| D3 | `--radius: 0.5rem` | humano, 2026-10-08 | QC-29 R5; QC-30 R20 (radio de 10 px) | R4 |
| D4 | IBM Plex Sans (UI) e IBM Plex Mono (datos) por `next/font/google`. Sora solo dentro del logo SVG, que lleva el wordmark en trazos | humano, 2026-10-08 (ficha) | QC-30 D10, R20 (Geist) | R7, R8 |
| D5 | Panel lateral, opción A «Profundidad»: claro `linear-gradient(166deg, #0A4A47 0%, #003634 38%, #002828 70%, #021E1E 100%)`; oscuro `linear-gradient(166deg, #0B2F2F 0%, #062222 42%, #031515 100%)`. Estático. Se mantienen las medidas del panel flotante | humano, 2026-10-08 (lienzo) | QC-29 R18 (paradas) | R9, R10 |
| D6 | Ítem activo de la barra en el azul de acento, con los valores del lienzo A | humano, 2026-10-08 (lienzo) | — | R11 |
| D7 | Barra lateral: logo horizontal en modo expandido. En el rail de 78 px, el isotipo sustituye a «QC». Los textos visibles `BRAND_LABEL` y `BRAND_TAGLINE` se retiran; la marca queda como nombre accesible | humano, 2026-10-08 | QC-11 D7, R24 | R12, R13, R15 |
| D8 | Viewport angosto: isotipo en el encabezado privado; logo horizontal en el `Sheet` móvil | humano, 2026-10-08 | — | R12, R14 |
| D9 | Login: el logo **vertical** sustituye al título de texto; se conserva un `h1` accesible | humano, 2026-10-08 | QC-30 D3, R1 (título de texto) | R16 |
| D10 | Login, opción C «Moléculas»: fondo petróleo en los dos temas, 3 isotipos que flotan y giran (22–30 s), vidrio oscuro con los tokens nuevos y entrada única de la tarjeta en 300 ms. Las burbujas salen. Con movimiento reducido se detiene, con una regla local del login. Aceptado al aprobar el spec: con movimiento reducido la tarjeta solo hace un fundido, sin desplazamiento, y el modo oscuro se aplica con un ámbito `.dark` en el `main` (`design.md > 6`) | humano, 2026-10-08 (lienzo y aprobación del spec) | QC-30 D8, D9, D12, R9, R12, R14, R21, R22 (burbujas), R26 (E2E de burbujas) | R17–R23 |
| D11 | Enmienda a la §08 de la guía: se permite movimiento ambiental en bucle **solo detrás del contenido**, con ciclos ≥ 20 s, sin rebotes y quieto con movimiento reducido | humano, 2026-10-08 | guía §08 | R19, R22 |
| D12 | Metadatos: title «QuimiCloude»; description «ERP para planta, almacén, ventas y administración». Manifest: `name` y `short_name` «QuimiCloude», `start_url` `/`, `display` `standalone`, `theme_color` `#02605A`, `background_color` `#F7FBFC` | humano, 2026-10-08 | — | R24, R25, R26, R28 |
| D13 | Se borran de `public/` los SVG de la plantilla de Next que nadie usa (acotada por D17) | humano, 2026-10-08 | — | R29 |
| D14 | No entran el bloque global de `prefers-reduced-motion` ni ningún movimiento de la app fuera del login (QC-228). Los tokens `--dur-*` y `--ease-*` solo se declaran | humano, 2026-10-08 | — | R6, R32 |
| D15 | Sin dependencias nuevas | humano, 2026-10-08 (ficha) | — | R31 |
| D16 | Los tests de specs cerrados que esta ficha rompe (color-tokens, theme-provider, sidebar-panel, login-skin y los de la marca de la barra) **se actualizan** como enmienda, con nota en cada caso; no se borran sin más | humano, 2026-10-08 | — | `tasks.md > T10` (proceso, no conducta del sistema) |
| D17 | `public/next.svg` y `public/vercel.svg` **se quedan**, porque los usa `app/page.tsx`. Solo se borran `file.svg`, `globe.svg` y `window.svg`. Qué hacer con `/` es de otra ficha | humano, 2026-10-08 (aprobación del spec) | — | R29 |
| D18 | La barra de acento de 3 px con halo (`::before`) del ítem activo **no se toca** aquí: se decide en QC-227 | humano, 2026-10-08 (aprobación del spec) | — | R11 |
| D19 | Se **retiran** las constantes `BRAND_TAGLINE` y `BRAND_SHORT_LABEL`. El nombre accesible de la marca sigue siendo `BRAND_LABEL` («QuimiCloude»). El lema vive en la `description` de los metadatos y en la imagen OG | humano, 2026-10-08 (aprobación del spec) | QC-13 R7; QC-11 D7 | R12, R13, R34 |
| D20 | La tarjeta del login se mantiene en 400 px de ancho máximo y 28 px de padding (QC-30), no en los 320 px del lienzo | humano, 2026-10-08 (aprobación del spec) | — | R23 |
| D21 | Opción A: el caso de `tests/unit/login-form.test.tsx:375-381`, que exige `[data-slot="card-title"]` con el texto «QuimiCloude», **se enmienda** igual que en D16. Pasa a exigir un `h1` cuyo nombre accesible es «QuimiCloude», que sale del `alt` del logo vertical | humano, 2026-10-08 | QC-30 R1 (test de QC-7) | R16, R23 |
| D22 | QC-29 R25 **sigue vigente**: el par `--sidebar-foreground`/`--sidebar` cumple AA de texto en los dos modos | humano, 2026-10-08 | — (se mantiene QC-29 R25) | R5 |

## Requisitos (EARS)

«El sistema» es la app web: `app/globals.css`, los layouts raíz, privado y público, la barra
lateral privada, la pantalla de login y los archivos de metadatos que sirve Next.

### Tokens

**R1.** El sistema DEBE declarar en `:root` de `app/globals.css` los tokens del modo claro con
exactamente los valores del `:root` de `tokens.css` del kit: los 26 de shadcn (`--background` …
`--sidebar-ring`), `--chart-1` … `--chart-5`, los de estado (`--destructive-foreground`,
`--success`, `--success-foreground`, `--success-subtle`, `--success-text`, `--warning`,
`--warning-foreground`, `--warning-subtle`, `--warning-text`, `--destructive-subtle`,
`--destructive-text`, `--info`, `--info-foreground`, `--info-subtle`, `--info-text`) y
`--sidebar-muted-foreground`.

**R2.** El sistema DEBE declarar en `.dark` de `app/globals.css` los mismos tokens de R1, con
exactamente los valores del `.dark` de `tokens.css`.

**R3.** El sistema DEBE exponer cada token nuevo de R1 (los de estado y
`--sidebar-muted-foreground`) como color utilizable de Tailwind, con su entrada
`--color-<token>: var(--<token>)` en `@theme inline`.

**R4.** El sistema DEBE declarar `--radius: 0.5rem`.

**R5.** El sistema DEBE alcanzar, en los dos modos y con los valores de R1 y R2, al menos
`4.5:1` de contraste WCAG en estos pares de texto: `--foreground`/`--background`,
`--card-foreground`/`--card`, `--muted-foreground`/`--card`, `--muted-foreground`/`--muted`,
`--primary-foreground`/`--primary`, `--primary`/`--card`, `--secondary-foreground`/`--secondary`,
`--destructive-foreground`/`--destructive`, `--{success,warning,destructive,info}-text` sobre su
`-subtle`, `--sidebar-foreground`/`--sidebar` (D22) y `--sidebar-muted-foreground`/`--sidebar`.
También DEBE alcanzar al menos `3:1` en
los pares de interfaz `--input`/`--card` y `--ring`/`--card`.

**R6.** El sistema DEBE declarar en `:root` `--dur-instant: 100ms`, `--dur-fast: 150ms`,
`--dur-base: 200ms`, `--dur-slow: 300ms`, `--ease-standard: cubic-bezier(0.2, 0, 0, 1)`,
`--ease-enter: cubic-bezier(0, 0, 0.2, 1)` y `--ease-exit: cubic-bezier(0.4, 0, 1, 1)`.

### Tipografía

**R7.** El sistema DEBE cargar IBM Plex Sans (pesos 400, 500 y 600) e IBM Plex Mono (pesos 400 y
500) con `next/font/google`, y DEBE resolver `--font-sans` y `--font-heading` a Plex Sans y
`--font-mono` a Plex Mono. NO DEBE quedar ninguna referencia a Geist en `app/layout.tsx` ni en
`app/globals.css`.

**R8.** El sistema NO DEBE cargar la fuente Sora ni declararla en ninguna `font-family`: el
wordmark llega ya en trazos dentro de los SVG del logo.

### Panel lateral

**R9.** El sistema DEBE declarar `--sidebar-panel-gradient` con el degradado claro de D5 en
`:root` y el oscuro de D5 en `.dark`. El panel lateral DEBE seguir pintándolo como fondo, sin
animación ni transición.

**R10.** El sistema DEBE conservar las medidas del panel flotante: radio de 22 px, margen
exterior de 18 px, 272 px de ancho expandido y 78 px en modo icono, e ítems de al menos 44 px.

**R11.** MIENTRAS un ítem de la barra lateral es el activo, el sistema DEBE pintarlo con el
fondo `linear-gradient(90deg, <--sidebar-primary al 26 %>, <--sidebar-primary al 5 %>)`, un
anillo interior de 1 px de `--sidebar-primary` al 32 % y el texto en blanco con peso 600. La
regla de la barra de acento del borde izquierdo (`::before`) DEBE quedar sin cambios (D18).

### Marca en la zona privada

**R12.** MIENTRAS la barra lateral está expandida, en escritorio y en el `Sheet` móvil, el
sistema DEBE mostrar en el enlace de marca el logo horizontal en su versión para fondo oscuro, a
28 px de alto. NO DEBE mostrar los textos visibles `BRAND_LABEL` ni `BRAND_TAGLINE`, y el nombre
accesible del enlace DEBE seguir siendo `BRAND_LABEL`.

**R13.** MIENTRAS la barra lateral está en modo icono, el sistema DEBE mostrar en el enlace de
marca el isotipo en su versión para fondo oscuro, a 32 px, en lugar de la marca corta de texto
(«QC»). El nombre accesible del enlace DEBE seguir siendo `BRAND_LABEL`.

**R14.** MIENTRAS el viewport es angosto, el sistema DEBE mostrar en el encabezado privado el
isotipo, al menos a 24 px, con nombre accesible `BRAND_LABEL`: la versión clara con el tema
claro y la oscura con el tema oscuro. MIENTRAS el viewport es ancho, NO DEBE mostrarlo.

**R15.** El sistema DEBE pintar cada logo e isotipo con la proporción de su `viewBox`, sin
estirarlo ni comprimirlo, y NO DEBE añadirle fondo, sombra, brillo ni contorno.

### Login

**R16.** El sistema DEBE presentar en la cabecera de la tarjeta de login un único `h1` cuyo
nombre accesible sea `BRAND_LABEL` y que contenga el logo vertical en su versión para fondo
oscuro, sin título de texto visible.

**R17.** El sistema DEBE pintar la pantalla de login con los tokens del modo oscuro en los dos
temas de la app, sobre el fondo
`radial-gradient(90% 60% at 20% 0%, rgba(72,204,191,.22), rgba(72,204,191,0) 60%), linear-gradient(166deg, #004141 0%, #002828 55%, #031515 100%)`.

**R18.** El sistema DEBE pintar bajo la tarjeta **exactamente tres** isotipos decorativos, con
los tamaños (150, 110 y 190 px), posiciones, trazos y opacidades (0.22, 0.18 y 0.14) de
`Login.dc.html > C`. Los DEBE ocultar a las tecnologías de asistencia y dejarlos sin nodos
enfocables y sin captar el puntero. NO DEBE quedar marcado ni CSS de las burbujas de QC-30.

**R19.** MIENTRAS no hay preferencia de movimiento reducido, el sistema DEBE animar cada
isotipo de R18 con `translateY(-36px) rotate(24deg)`, ciclos de 22 s, 30 s y 26 s
(`alternate`, `alternate-reverse` y `alternate`), curva `cubic-bezier(0.2, 0, 0, 1)` y en
bucle. Ningún ciclo DEBE bajar de 20 s.

**R20.** DONDE el navegador soporta el desenfoque de fondo, el sistema DEBE pintar la tarjeta
de login con el fondo `rgba(18,26,28,.72)`, la sombra
`0 0 0 1px rgba(72,204,191,.16), inset 0 1px 0 rgba(230,241,241,.10), 0 34px 70px -24px rgba(0,0,0,.8)`
y `blur(14px)`, declarado con y sin prefijo `-webkit-`. SI no lo soporta, O el usuario pide
transparencia reducida, ENTONCES el sistema DEBE pintarla opaca con `--card`, conservando la
sombra.

**R21.** CUANDO se abre la pantalla de login, el sistema DEBE hacer entrar la tarjeta **una
sola vez**, de `opacity: 0; translateY(12px)` a su estado final, en `var(--dur-slow)` con
`var(--ease-enter)`.

**R22.** MIENTRAS el sistema operativo pide movimiento reducido, el sistema DEBE mostrar los
isotipos de R18 visibles y quietos, y DEBE mostrar la tarjeta sin desplazamiento: como mucho un
fundido de 150 ms. La regla DEBE estar acotada a la pantalla de login.

**R23.** El sistema DEBE conservar de QC-30 la mecánica del formulario (R2–R8), el único `main`
(R15), las medidas 44/400/18/28 px (R16, R17) y el enlace de recuperación fuera del `<form>`
(R1). Las pruebas que ya lo cubren DEBEN seguir verdes sin editar sus aserciones de
comportamiento. La única excepción es el caso de `tests/unit/login-form.test.tsx:375-381`:
deja de exigir `[data-slot="card-title"]` con el texto «QuimiCloude» y pasa a exigir el `h1`
de R16 con nombre accesible «QuimiCloude» (D21).

### Iconos y metadatos

**R24.** El sistema DEBE declarar como metadatos raíz el título `QuimiCloude` y la descripción
`ERP para planta, almacén, ventas y administración`.

**R25.** El sistema DEBE servir por las convenciones de archivo de Next el `favicon.ico`, el
`icon.svg` (el favicon simplificado, que cambia de color con `prefers-color-scheme`), el
`apple-icon.png` y el `opengraph-image.png` del kit. El `<head>` de cualquier página DEBE
enlazarlos (`rel="icon"`, `rel="apple-touch-icon"` y `og:image`).

**R26.** El sistema DEBE servir un manifest con los valores de D12 y tres iconos: 192×192 y
512×512 con `purpose: any`, y 512×512 con `purpose: maskable`. El `<head>` DEBE enlazarlo con
`rel="manifest"`.

**R27.** El sistema DEBE servir cada icono PNG con las dimensiones que declara el manifest o su
nombre de archivo.

**R28.** CUANDO un navegador sin sesión pide el manifest, un icono o la imagen OG, el sistema
DEBE responder con el recurso (2xx) y NO DEBE redirigir al login.

**R29.** El sistema NO DEBE contener `public/file.svg`, `public/globe.svg` ni
`public/window.svg`, y DEBE conservar `public/next.svg` y `public/vercel.svg`, que usa
`app/page.tsx` (D17).

**R30.** El sistema DEBE servir los logos e isotipos desde archivos SVG versionados en el repo
y copiados del kit sin modificar.

### Negativos

**R31.** El sistema NO DEBE añadir entradas a `dependencies` ni a `devDependencies` de
`package.json`.

**R32.** El sistema NO DEBE declarar en `app/globals.css` reglas de movimiento fuera del bloque
del login: ni la regla global de `prefers-reduced-motion` de `tokens.css`, ni `@keyframes`,
`animation` o `transition` nuevas para otros elementos.

**R33.** El sistema NO DEBE modificar ningún archivo de `components/ui/`.

**R34.** El sistema NO DEBE exportar `BRAND_TAGLINE` ni `BRAND_SHORT_LABEL` desde
`lib/shared/navigation/private-nav.ts`, y ningún archivo de producción DEBE referenciarlas
(D19). `BRAND_LABEL` se conserva con el valor `QuimiCloude`.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas` tiene al menos un `R<n>` en su columna «Cubierta por». D16
es una regla de proceso (cómo se tocan los tests), no una conducta del sistema; la cubre la task
T10 y la verifica el reviewer.

## Preguntas abiertas

Ninguna. Las cuatro que quedaban se cerraron al aprobar el spec (2026-10-08): son D17–D20.
