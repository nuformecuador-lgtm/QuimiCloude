# QC-226 — tema-y-marca-base · design.md

> Esta ficha cambia la piel: no tiene **modelo de datos**. No hay tablas, RLS, migraciones,
> Server Actions ni route handlers nuevos. Los valores (colores, degradados, tiempos, tamaños)
> salen del kit y del lienzo, que se citan por archivo. Aquí no se recalculan.

## Lo que ya existe

Términos buscados: `globals.css`, `Geist`, `sidebar-panel-gradient`, `qc30-login`, `--radius`,
`BRAND_SHORT_LABEL`, `private-brand`, `favicon`, `manifest`, `metadata`. Se buscaron en el
board (QC-226/227/228), en `specs/` y en el grafo y el código.

| Apareció | Qué se hace |
| --- | --- |
| **QC-29** (`specs/QC-29-tema-claro-oscuro/`): tokens agua/naranja, `--radius` de 0.625rem, degradado del panel, medidas del panel y el mecanismo de tema | Se **reutiliza** el mecanismo (cookie, script, `ThemeProvider`, `@custom-variant dark`) sin tocarlo. Se **enmiendan** los valores (D2, D3, D5). Las medidas se conservan (R10) |
| **QC-30** (`specs/QC-30-rediseno-login/`): piel del login (vidrio, burbujas, medidas de ámbito, `data-login`) | Se **reutiliza** el ámbito `[data-login='screen']`, la base opaca con `@supports` y las medidas. Se **sustituyen** las burbujas por las moléculas y se recolorea el vidrio (D10) |
| **QC-11** (`specs/11-layout-privado-con-sidebar/`): marca larga/corta, `private-brand-*` | Se **enmienda** D7/R24: el logo y el isotipo sustituyen a los textos (D7) |
| Bloque del ítem activo (`feature/fix-ajuste-sidebar`, sin ficha) en `globals.css` | Se **reutiliza**: solo cambian los porcentajes y el texto (R11). La barra `::before` no se toca (pregunta abierta 2) |
| `middleware.ts` (`matcher`) y `decideRouteAccess` (`PRIVATE_ROUTE_PREFIXES`) | Se **reutilizan**: `.svg`, `.png` e `.ico` quedan fuera del `matcher`, y `/manifest.webmanifest` no es un prefijo privado. R28 lo verifica; no hace falta tocar nada |
| `app/favicon.ico` y los SVG de plantilla en `public/` | Se sustituye el favicon y se borran los SVG (D13, pregunta abierta 1) |
| QC-227 y QC-228 en el board | Sin solape: consumen los tokens que deja esta ficha. Lo que les toca está en `requirements.md > No entra` |

No hay ningún componente de logo previo: el símbolo de `app-sidebar.tsx` era provisional («hasta
que haya identidad visual»).

## 1. Archivos

| Archivo | Cambio |
| --- | --- |
| `app/globals.css` | Tokens (`:root`/`.dark`), `@theme inline`, fuentes, movimiento, degradado del panel, ítem activo, marca en el rail y el bloque del login reescrito (§6) |
| `app/layout.tsx` | Plex en lugar de Geist; `metadata` con `title` y `description` |
| `app/manifest.ts` | **nuevo**: `MetadataRoute.Manifest` |
| `app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png`, `app/opengraph-image.png`, `app/opengraph-image.alt.txt` | Copiados de `_trabajo/marca/web/` (el `.ico` se reemplaza). El texto alternativo es `QuimiCloude` |
| `public/brand/{logo-horizontal-dark,logo-vertical-dark,isotipo,isotipo-dark}.svg` | **nuevos**, copiados de `_trabajo/marca/svg/` sin modificar |
| `public/icons/{icon-192,icon-512,icon-maskable-512}.png` | **nuevos**, copiados de `_trabajo/marca/web/` |
| `public/{file,globe,window}.svg` | **se borran** (`next.svg` y `vercel.svg`: pregunta abierta 1) |
| `components/shared/brand-logo.tsx` | **nuevo**: `BrandLogo` (§4) |
| `components/private/app-sidebar.tsx` | El enlace de marca pinta el logo o el isotipo |
| `app/(private)/layout.tsx` | Isotipo en el encabezado, solo en viewport angosto. Sigue siendo Server Component |
| `app/(public)/login/page.tsx` | `h1` con el logo vertical; el `main` lleva el ámbito oscuro |
| `app/(public)/login/components/login-background.tsx` | Tres isotipos decorativos en lugar de tres burbujas |
| `lib/shared/navigation/private-nav.ts` | Solo los docblocks de `BRAND_*`, que hoy dicen «no hay identidad visual» |

`BrandLogo` va en `components/shared/` porque lo usan tres rutas distintas (la barra, el
encabezado privado y el login). Cumple el umbral de «dos features con la misma API» de
`docs/architecture.md > Regla: sin sobre-ingeniería`.

## 2. Tokens (R1–R6)

- `:root` y `.dark` se **sustituyen enteros** por los bloques de `tokens.css` (sus líneas 2–103).
  Los comentarios hex por token no se copian, porque no explican ningún porqué. El primer par
  `:root`/`.dark` sigue siendo el de los tokens de color: `color-tokens.test.ts` lo recorta así.
- `@theme inline` gana las 16 entradas de `tokens.css` (líneas 105–122), dentro del bloque
  `@theme inline` que ya existe. No se crea un segundo bloque.
- Los tokens de movimiento (líneas 125–133 de `tokens.css`) van en un `:root` propio. **No se
  copia** el bloque `@media (prefers-reduced-motion)` de las líneas 134–141 (D14, R32): es de
  QC-228.
- **Contraste (R5).** La guía declara AA para 41 pares. El test lo **recalcula** desde el CSS
  (oklch → sRGB → luminancia relativa WCAG) para que un retoque futuro de un token no lo rompa en
  silencio. La conversión vive en el test, no en producción, igual que en QC-29 §9. El par
  `--input`/`--card` en claro tiene poco margen (3.22:1 según la guía). Si la conversión desde los
  oklch redondeados diera menos de 3, el implementer **para y lo reporta**: no se ajusta el token.

## 3. Tipografía (R7, R8)

```ts
const plexSans = IBM_Plex_Sans({ variable: '--font-plex-sans', subsets: ['latin'], weight: ['400', '500', '600'] });
const plexMono = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['400', '500'] });
```

- Plex no es una fuente variable, así que `next/font/google` exige `weight`. Los pesos son los
  de la guía §07.
- En `@theme inline`: `--font-sans` y `--font-heading` a `var(--font-plex-sans)`, y
  `--font-mono` a `var(--font-plex-mono)`. El comentario de esas líneas, que explica el arreglo
  de la referencia circular de `shadcn init`, sigue siendo cierto. Se reescribe sin citar Geist.
- Las cifras tabulares en tablas son de QC-227. Plex Mono ya tiene ancho fijo por diseño.
- Sora no se carga (R8): los SVG del kit traen el wordmark convertido en `path`.

## 4. Logos: archivos y componente (R12–R16, R30)

**Dónde viven.** Los logos son recursos que se pintan dentro de la UI, no metadatos del documento.
Por eso van en `public/brand/` y se sirven tal cual. Los archivos de metadatos van en `app/`
(§7).

**Qué variantes.** La guía §05 dice que en fondo oscuro va la versión oscura.

| Sitio | Fondo | Archivo |
| --- | --- | --- |
| Barra expandida y `Sheet` móvil | petróleo (`--sidebar`) en los dos temas | `logo-horizontal-dark.svg` |
| Rail de 78 px | petróleo | `isotipo-dark.svg` |
| Encabezado privado (angosto) | `--background`: claro u oscuro | `isotipo.svg` / `isotipo-dark.svg` |
| Login | petróleo en los dos temas (D10) | `logo-vertical-dark.svg` |

**`BrandLogo`** (`components/shared/brand-logo.tsx`). No lleva `'use client'`: no tiene estado.

```ts
type BrandLogoProps = {
  readonly variant: 'horizontal' | 'vertical' | 'isotipo';
  readonly tone: 'on-dark' | 'auto';  // auto: claro con tema claro, oscuro con tema oscuro
  readonly height: number;            // px; el ancho sale del viewBox (R15)
  readonly alt: string;               // '' cuando el nombre lo da el contenedor
};
```

- Pinta `next/image` con `unoptimized`: los SVG se sirven tal cual, sin pasar por el optimizador
  ni por `dangerouslyAllowSVG`. Así evita también la regla de lint `no-img-element`.
- El ancho se calcula con una tabla de `viewBox` por archivo, dentro del componente: horizontal
  227×48, vertical 127×76, isotipo 47×47. Así queda fijo y R15 se puede probar.
- `tone="auto"` pinta **las dos** imágenes y alterna su visibilidad con `dark:hidden` /
  `hidden dark:block`. Es la técnica del icono de `ThemeToggle` (QC-29 §5): el HTML del servidor
  y el del cliente coinciden, así que no hay mismatch de hidratación ni parpadeo.
- Sin clases de fondo, sombra ni borde (R15). El cuadro con degradado y sombra del símbolo
  provisional se retira.

**Tamaños.** El horizontal va a 28 px de alto, ≈ 132 px de ancho. Es la medida del lienzo A y
supera el mínimo de 112 px de la guía §03. El isotipo del rail va a 32 px, como el símbolo
actual. El del encabezado va a 28 px, por encima del mínimo de 24 px. El vertical del login va a
79 px de alto, ≈ 132 px de ancho, como en el lienzo C; el mínimo es 80 px de ancho.

## 5. Zona privada

**Barra (R12, R13).** El `SidebarMenuButton` de marca conserva `aria-label={BRAND_LABEL}`,
`data-testid="private-brand-link"` y su destino. Dentro va
`<BrandLogo variant="horizontal" tone="on-dark" height={28} alt="" />`, o el isotipo si
`isIconMode`. Las imágenes llevan `alt=""` porque el nombre lo da el enlace: un `alt` repetido
haría que el lector lo anunciara dos veces. Se retiran `private-brand-long`, `-short`, `-tagline`
y `-mark`. Las reglas de `globals.css` sobre `private-brand-mark` en modo icono se reescriben
para el `<img>` del isotipo: 32 px, sin `border-radius`.

**Ítem activo (R11).** En la regla `[data-slot='sidebar-menu-button'][data-active]` ya existente
cambian los porcentajes: `color-mix(... 26%)` → `5%` en el fondo, `32%` en el anillo, y se añaden
`color: #fff; font-weight: 600`. Sobre `--sidebar-primary` (`#80C5FF`), son exactamente los
`rgba(128,197,255,.26/.05/.32)` del lienzo A. Se expresan sobre el token y no en hex para que un
retoque del acento llegue solo. La barra `::before` no se toca (pregunta abierta 2).

**Panel (R9, R10).** Solo cambian las dos declaraciones de `--sidebar-panel-gradient`. Las
reglas de radio, alto de ítem y modo icono no cambian.

**Encabezado (R14).** Dentro del `<div className="md:hidden">` que ya envuelve a
`SidebarToggle` va
`<BrandLogo variant="isotipo" tone="auto" height={28} alt={BRAND_LABEL} />`. No es un enlace: así
no añade un destino táctil más ni repite el nombre del enlace de la barra, que en móvil está
cerrada.

## 6. Login (R16–R23)

**Ámbito oscuro (R17).** El `<main data-login="screen">` gana `className="dark"` y
`color-scheme: dark`. Como los tokens se declaran en `.dark` y la variante es
`&:is(.dark *)`, todo lo que hay dentro del `main` resuelve los tokens oscuros. Eso incluye
tarjeta, campos, botón, anillo de foco y las utilidades `dark:` de los primitivos, y no hace
falta tocar `components/ui/` ni `login-form.tsx`. Los valores coinciden con los del lienzo C:
botón `#48CCBF`, borde de campo `#697476` y texto `#F7FBFC`. El script de tema solo toca
`<html>`, así que no interfiere. El `Toaster` del layout público queda **fuera** del `main` y
sigue el tema del usuario.

**Logo (R16).** `CardTitle` se sustituye por un `<h1>` que envuelve
`<BrandLogo variant="vertical" tone="on-dark" height={79} alt={BRAND_LABEL} />`. El nombre
accesible del `h1` sale del `alt`: no hace falta texto oculto.

**Bloque CSS.** El bloque del login se reescribe en el mismo sitio, al final del archivo, y
sigue siendo contiguo y sin `@layer` (QC-30 R18, R24). Sus comentarios se limpian según
`docs/conventions.md > Comentarios`: los delimitadores dejan de citar la ficha
(`/* ══ Pantalla de login — INICIO ══ */`). Las variables pasan de `--qc30-login-*` a `--login-*`
y la `@keyframes` de las burbujas desaparece. El contenido, en orden:

1. Variables `--login-*`, un solo juego, porque el login es oscuro en los dos temas: el fondo de
   R17 y el vidrio, la sombra y el borde del pie de R20. El pie, que el lienzo no dibuja, va con
   fondo transparente y borde `rgba(72,204,191,.16)`, el mismo color del filo de la tarjeta. Es
   una decisión propia y blanda, como en QC-30 §6: el test no la afirma por valor.
2. Medidas de ámbito: sin cambios.
3. Tarjeta: base opaca con `var(--card)` y `@supports` con el vidrio de R20, con `blur(14px)` del
   lienzo en lugar del `blur(22px) saturate(150%)` de QC-30. Transparencia reducida → base opaca.
4. Entrada (R21): `animation: login-card-enter var(--dur-slow) var(--ease-enter) both`, una
   iteración.
5. Moléculas (R18, R19): capa `[data-login='molecules']` y tres `[data-login-index]`. Cada una
   lleva `width`/`height`, posición y opacidad del lienzo, y
   `animation: login-molecule-float <22|30|26>s cubic-bezier(0.2,0,0,1) infinite <alternate|alternate-reverse|alternate>`.
6. `@media (prefers-reduced-motion: reduce)` (R22), acotado a `[data-login='screen']`. Pone
   `animation: none` en las moléculas, que quedan **visibles** en su posición inicial, y en la
   tarjeta deja `login-card-fade 150ms linear both`, una `@keyframes` solo de opacidad.

**Discrepancia documentada.** El lienzo C, en movimiento reducido, reutiliza la entrada **con**
desplazamiento a 150 ms. La guía §08 dice que con movimiento reducido «los desplazamientos y
escalados se eliminan y solo queda, como mucho, un fundido corto». Manda la guía, porque es la
norma y el lienzo es una maqueta. Por eso existe la segunda `@keyframes`.

**Marcado (`login-background.tsx`).** Sigue siendo Server Component y marcado puro. Es un
`<div data-login="molecules" aria-hidden="true">` con tres `<svg>` de los polígonos y trazos de
`Login.dc.html` líneas 72–85, con sus colores (`#48CCBF`, `#9FE3DA`, `#80C5FF`). No lleva
`style` en línea: tamaños, posiciones y opacidades van en el CSS, por el mismo motivo que en
QC-30 §5.

**Movimiento ambiental (D11).** Las moléculas cumplen la enmienda de la §08: están detrás de la
tarjeta (`z-index` 1 contra 2), los ciclos son ≥ 22 s, la curva es estándar, sin rebote, y se
quedan quietas con movimiento reducido.

## 7. Iconos y metadatos (R24–R28)

Convenciones de archivo de Next 16, leídas en
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`:

- `favicon.ico` solo puede vivir en la raíz de `app/`. `icon.svg` y `apple-icon.png` van en
  `app/`, y Next emite los `<link>` con su tipo y su tamaño.
- `opengraph-image.png` y `opengraph-image.alt.txt` van en `app/`. Next emite `og:image` y sus
  dimensiones. **No se fija `metadataBase`**, para no meter una URL de entorno en el código
  (`docs/architecture.md > Principios 4`). Sin él, Next construye la URL absoluta con su
  respaldo de despliegue. Comprobar qué URL sale en el preview de Vercel es parte de T8.
- `app/manifest.ts` exporta un `MetadataRoute.Manifest` con los valores de D12. Next lo sirve en
  `/manifest.webmanifest` y emite el `<link rel="manifest">`. Los iconos PWA no tienen convención
  propia: van en `public/icons/` y el manifest los referencia (`/icons/icon-192.png`…).
- `metadata` del root layout: `title: 'QuimiCloude'` y la `description` de D12. El login conserva
  su `title` propio («Iniciar sesión · QuimiCloude»).

**Acceso sin sesión (R28).** Ya funciona: el `matcher` de `middleware.ts` excluye `.svg`, `.png`
e `.ico`, y `/manifest.webmanifest` no está bajo `PRIVATE_ROUTE_PREFIXES`, así que
`decideRouteAccess` lo deja pasar. Se prueba en E2E, porque un cambio futuro del `matcher` lo
rompería en silencio.

## 8. Enmiendas a specs cerrados

Cada spec cerrado recibe una nota fechada `> ENMIENDA DEL 2026-10-08 (QC-226)` junto al requisito
afectado. Es el mismo formato que QC-29 R14. El texto original no se borra.

| Spec | Requisitos | Qué dice la nota |
| --- | --- | --- |
| `specs/QC-29-tema-claro-oscuro/requirements.md` | D6, D7, D10, R1–R6, R18, R25 | Paleta, radio, `--chart-*` y paradas del degradado sustituidos por QC-226 D2, D3 y D5. Las medidas de R18–R20 siguen |
| `specs/QC-30-rediseno-login/requirements.md` | D3, D8, D9, D10, D12, R1, R9, R12, R14, R20, R21, R22, R26 | Título → logo vertical; burbujas → moléculas; vidrio recoloreado; Geist → Plex; radio de 8 px |
| `specs/11-layout-privado-con-sidebar/requirements.md` | D7, R24 | La versión corta pasa a ser el isotipo; la larga, el logo horizontal |

Y los tests (D16), caso por caso, con la nota en el nombre o en un comentario corto:

| Test | Cambio |
| --- | --- |
| `tests/unit/theme/color-tokens.test.ts` | Tablas esperadas de `tokens.css`, hue y radio nuevos, tokens de estado y contraste de R5 |
| `tests/unit/theme/theme-provider.test.tsx` | El mock de `next/font/google` pasa a `IBM_Plex_Sans`/`IBM_Plex_Mono` |
| `tests/unit/theme/sidebar-panel.test.tsx` | Las regex de las paradas pasan a las de D5 |
| `tests/unit/login-skin.test.tsx` | Burbujas → moléculas, `--qc30-*` → `--login-*`, delimitadores nuevos y valores de R20 |
| `tests/unit/app-sidebar.test.tsx`, `sidebar-desktop.test.tsx`, `sidebar-mobile.test.tsx`, `sidebar-ajuste.test.tsx` | Los `private-brand-long/short/tagline/mark` pasan a afirmar el `<img>` del logo o del isotipo. El nombre accesible `BRAND_LABEL` no cambia |
| `e2e/login-skin.spec.ts` | La comprobación de «sin burbujas con movimiento reducido» pasa a «moléculas quietas y visibles» |

## 9. Verificación

| Requisito | Test |
| --- | --- |
| R1–R6, R32 | `tests/unit/theme/color-tokens.test.ts`: lee `globals.css` como texto (patrón de QC-29 §9) |
| R7, R8 | `tests/unit/brand/fonts.test.ts`: texto de `app/layout.tsx` y de `globals.css` |
| R9, R10 | `tests/unit/theme/sidebar-panel.test.tsx` (regex nuevas) y los tests de medidas que ya existen, en verde |
| R11 | `tests/unit/sidebar-ajuste.test.tsx`: texto de la regla del ítem activo |
| R12, R13, R15 | `tests/unit/brand/brand-logo.test.tsx` (proporción, `src`, `alt`, sin clases de fondo o sombra) y `tests/unit/app-sidebar.test.tsx` (expandido e icono) |
| R14 | `tests/unit/theme/private-header.test.tsx` (isotipo dentro de `md:hidden`, las dos variantes) |
| R16–R22 | `tests/unit/login-skin.test.tsx` (marcado y CSS) y `e2e/login-skin.spec.ts`, en Chromium y WebKit. El E2E cubre los tokens oscuros computados en el tema claro, las tres moléculas con `animation-name` y duración, la tarjeta que acaba en `opacity: 1`, y con `reducedMotion: 'reduce'` `animation-name: none` en las moléculas, que siguen visibles |
| R23 | `tests/unit/login-form.test.tsx` y `e2e/login.spec.ts` sin editar; las medidas, en `e2e/login-skin.spec.ts` |
| R24–R27, R29, R30 | `tests/unit/brand/metadata-assets.test.ts`: existencia de los archivos, cabecera PNG y dimensiones leídas del chunk IHDR, `manifest()` con los valores de D12, `metadata` del root layout, ausencia de los SVG de plantilla, y los SVG de `public/brand/` con el `viewBox` esperado |
| R25, R26, R28 | `e2e/brand-assets.spec.ts`: sin sesión, `GET` de `/manifest.webmanifest`, `/icon.svg`, `/apple-icon.png`, `/icons/icon-192.png` y de la URL de `og:image` → 2xx, y `/login` con los `<link>` y el `<meta property="og:image">` |
| R31 | `tests/unit/theme/sin-dependencias-nuevas.test.ts` (ya existe) más la guardia `guard-dependencias-aprobadas` |
| R33 | `tests/unit/theme/ui-primitivas-intactas.test.ts` (ya existe), en verde |

Ningún screenshot comparado: el fondo animado lo haría inestable (mismo criterio que QC-30 §8).

## 10. Alternativas descartadas

**A1. Logos como componentes React con el SVG en línea.** Permitiría `currentColor` y una sola
pieza para los dos temas. Se descarta por tres motivos. Duplicaría a mano los `path` del kit, y
el primer retoque de la marca dejaría dos versiones distintas: R30 exige el archivo del kit sin
tocar. Los SVG del kit no usan `currentColor`, así que habría que reescribirlos, y eso es
recolorear el logo, que la guía §05 prohíbe. Y el wordmark son más de 40 `path`: en línea
engorda el HTML de cada página privada. Las moléculas del fondo del login **sí** van en línea,
porque son polígonos simplificados del lienzo, decorativos, y no el logo.

**A2. Duplicar los tokens oscuros como variables `--login-*` en lugar del ámbito `.dark`.** Se
descarta: serían 30 valores copiados que se desincronizan con el primer cambio de paleta.
Además, los primitivos (`input`, `button`) no los leerían sin tocar `components/ui/`, y eso lo
prohíbe R33. El ámbito `.dark` reutiliza lo que ya existe.

**A3. Generar los iconos con código (`icon.tsx`, `opengraph-image.tsx` con `ImageResponse`).**
Se descarta: el kit ya trae los PNG revisados, y generarlos en cada build no aporta nada. Además,
`ImageResponse` no admite todo el SVG del logo.

**A4. Meter los tokens de movimiento y la regla global de movimiento reducido «de paso».** Se
descarta por D14: es de QC-228, y una regla global con `!important` cambiaría a la vez todas las
animaciones de `tw-animate-css` que ya usan los primitivos.

## 11. Multiplataforma

No hay excepción que declarar. `backdrop-filter` lleva el prefijo `-webkit-` y una base opaca
(R20). Las moléculas solo animan `transform` (con `will-change`), como las burbujas, así que se
componen en GPU. El isotipo del encabezado no es interactivo y no añade ningún destino táctil.
El `manifest` con `display: standalone` y el `apple-icon` cubren la instalación en iOS y en
Android. Los iconos maskable llevan el margen de seguridad del 20 % que pide la guía §04.

## 12. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `next/font/google` necesita red en el build | Igual que Geist hoy. Los tests mockean el módulo |
| El par `--input`/`--card` no llega a 3:1 al convertir desde los oklch redondeados | §2: se para y se reporta, no se retoca |
| El ámbito `.dark` del login se filtra al `Toaster` | El `Toaster` queda fuera del `main`; R17 lo prueba en E2E sobre el contenido del `main` |
| Colisión en `globals.css` con QC-227 y QC-228, que dependen de esta ficha | Las dos esperan a QC-226 (`depends_on`), así que no hay trabajo en paralelo |
| La URL absoluta de `og:image` sale con un host de preview | §7: se comprueba en T8, sin fijar `metadataBase` en código |

## 13. Dependencias de terceros

**Ninguna** (R31). `next/font/google` y `next/image` vienen con Next. El kit se generó fuera del
repo con `sharp` y Playwright, que ya estaban instalados. No hay fila nueva en
`docs/dependencias.md`.
