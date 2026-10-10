# QC-228 — movimiento-de-la-interfaz · design.md

## Lo que ya existe

Buscado en el board (`feature_list.json`, todos los estados), en `specs/` y en el código, con
`movimiento`, `animación`, `reduced-motion`, `transition`, `--dur-`, `tw-animate`, `sonner`.

| Dónde | Qué apareció | Qué se hace |
| --- | --- | --- |
| QC-226 (cerrada) | Declara `--dur-instant/fast/base/slow` y `--ease-standard/enter/exit` en `:root` (R6); login con moléculas en bucle, entrada única de la tarjeta y su regla local de movimiento reducido (R19–R22); y R32, que **prohíbe** movimiento fuera del login y la regla global de movimiento reducido, porque iban a esta ficha (D14) | Se reutilizan los tokens tal cual. El login no se toca. R32 se enmienda (§8) |
| QC-227 (pending) | Restyling de componentes, incluidos los botones primario, secundario y destructivo. Su ficha dice «No entra: animaciones (otra ficha)» | No se solapa en alcance, pero sí en `components/ui/button.tsx` (§9) |
| QC-30 (cerrada) | Las burbujas del login con su movimiento reducido. QC-226 las retiró | Nada |
| `app/globals.css` | `@import "tw-animate-css"`, los tokens de movimiento y el bloque del login | Se amplía (§3, §6, §7) |
| `components/ui/*` (Base UI 1.7, no Radix) | Diálogos, menús, desplegables, popover y autocompletar entran y salen con `data-open:animate-in … data-closed:animate-out` de `tw-animate-css` a `duration-100`. `Sheet` usa transiciones con `data-starting-style` / `data-ending-style` a `duration-200 ease-in-out` (velo `duration-150`). La barra lateral usa `duration-200 ease-linear`. El botón usa `transition-all` y `active:not-aria-[haspopup]:translate-y-px` | Se cambian las duraciones y curvas por los tokens (§4). No se crea ningún primitivo |
| `components/ui/sonner.tsx` + `sonner` 2.0.7 | El `Toaster` lo montan los layouts privado y público. Sonner trae su CSS: entrada de 400 ms, salida de un toast de atrás de 500 ms, y su propia regla `@media (prefers-reduced-motion)` | Se ajusta por CSS (§6). No se toca la librería |
| `components/shared/data-table/data-table-scroll-nav.tsx` | Las flechas de la tabla neutralizan la pulsación del `Button` (twMerge con el mismo stack) y desplazan con `behavior: 'smooth'` | Se conserva su neutralización (R18) y el desplazamiento respeta el movimiento reducido (R21) |
| `components/private/app-sidebar.tsx` + `app/globals.css` | Fondo, anillo y barra `::before` del ítem activo en reglas sin capa sobre `[data-slot='sidebar-menu-button'][data-active]` (QC-226 R11, D18); chevron que gira a `duration-200` sin curva | Se reutiliza la regla de R11 para pintar el indicador (§5) |
| `tests/unit/paridad/__snapshots__/*.snap` (QC-231/232/233) | Congelan las clases renderizadas de 13 pantallas, incluidas las de `Button`, `Dialog` y `Sheet` | Se regeneran como enmienda declarada (§8) |
| `_trabajo/marca/inventario-ui.md` | Sin gráficos ni tarjetas pulsables; `animate-spin` y `animate-pulse` en cargadores; `opacity-60 transition-opacity` en ~12 tablas al recargar | Ver «Lo que NO entra», P2, P3 y P5 |

Nada en el board ni en `specs/` hace ya lo que pide esta ficha. **Grafo:** el worktree de QC-228 no
está indexado; se consultó el proyecto `R-job-singularis-projects-QuimiCloude` (rama `dev`, de la
que sale esta rama) y el resto con Grep/Read.

## 1. Enfoque

Todo se resuelve con **CSS y clases de Tailwind**, más dos piezas pequeñas de cliente que el CSS
no puede hacer solo: medir dónde está el ítem activo (§5) y saber si se ha cambiado de módulo
(§7). Ninguna librería nueva. Ninguna conducta nueva: los cambios afectan a duraciones, curvas,
transformaciones y opacidades, nunca a qué se pinta al final ni a cuándo se puede pulsar.

Regla de uso de tokens en clases: `duration-(--dur-slow)` y `ease-(--ease-enter)` (sintaxis de
variable de Tailwind v4). `tw-animate-css` lee la duración de `--tw-duration` y la curva de
`--tw-ease`, que son justo las variables que escriben esas utilidades, así que `animate-in` /
`animate-out` heredan los tokens sin CSS propio. **A verificar en T1** con el CSS compilado.

## 2. Modelo de datos

Ninguno. Sin tablas, sin RLS, sin migraciones, sin Server Actions, sin rutas nuevas.

## 3. Valores por defecto de transición (R3)

En `app/globals.css`, dentro de `@theme inline`:

```css
--default-transition-duration: var(--dur-instant);
--default-transition-timing-function: var(--ease-standard);
```

Son las variables de tema que Tailwind v4 usa para cualquier `transition`, `transition-colors`,
`transition-all`… sin `duration-*` ni `ease-*` explícitos. Así el hover y el foco de **todos** los
controles pasan a 100 ms con la curva estándar sin editar uno a uno (botón, input, textarea,
checkbox, autocompletar, pestañas, fila de tabla, badge). Lo que declare su propia duración la
conserva.

## 4. Primitivos de `components/ui/` (R4–R9, R11)

Solo se tocan clases de duración, curva y escala; nada de color ni de tamaño (eso es QC-227).

| Archivo | Abrir / entrar | Cerrar / salir |
| --- | --- | --- |
| `dialog.tsx`, `alert-dialog.tsx` (contenido) | `duration-(--dur-slow) ease-(--ease-enter)`, `zoom-in-96` | `data-closed:duration-(--dur-fast) data-closed:ease-(--ease-exit)`, `zoom-out-96` |
| `dialog.tsx`, `alert-dialog.tsx` (velo) | `duration-(--dur-base) ease-(--ease-standard)` | igual que el contenido al cerrar |
| `sheet.tsx` (panel) | `duration-(--dur-slow) ease-(--ease-enter)` (sustituye `duration-200 ease-in-out`) | `data-ending-style:duration-(--dur-fast) data-ending-style:ease-(--ease-exit)` |
| `sheet.tsx` (velo) | `duration-(--dur-base)` | `data-ending-style:duration-(--dur-fast)` |
| `dropdown-menu.tsx`, `select.tsx`, `popover.tsx`, `autocomplete.tsx` | `duration-(--dur-base) ease-(--ease-enter)` | `data-closed:duration-(--dur-fast) data-closed:ease-(--ease-exit)` |
| `tooltip.tsx` | `duration-(--dur-fast) ease-(--ease-enter)` | `data-closed:ease-(--ease-exit)` |
| `tabs.tsx` (indicador `after:`) | `after:duration-(--dur-base) after:ease-(--ease-standard)` | — |
| `sidebar.tsx` (ancho, posición, etiqueta de grupo, rail) | `duration-(--dur-base) ease-(--ease-standard)` en lugar de `duration-200 ease-linear` y del `transition-all ease-linear` del rail | — |

`zoom-in-96` sale de `tw-animate-css` (el valor es un número sobre 100); si la versión instalada no
lo acepta, `zoom-in-[0.96]`. **A verificar en T1.** El chevron de grupo de
`components/private/app-sidebar.tsx` gana `ease-(--ease-standard)` y pasa a `duration-(--dur-base)`
(R12).

### 4.1 Botones (R16–R18)

En `components/ui/button.tsx` (cva):

- Base: `active:not-aria-[haspopup]:translate-y-px` se queda para las variantes que no son
  `default` ni `outline`. `transition-all` se queda (hereda 100 ms y la curva estándar por §3).
- `default`: `bg-primary hover:bg-primary/80` pasa a la utilidad `btn-shine` y
  `active:not-aria-[haspopup]:scale-[0.98]`.
- `outline`: se añaden `btn-veil` y `active:not-aria-[haspopup]:scale-[0.98]`. Su `hover:bg-muted`
  se retira, porque el velo lo sustituye.

Las dos utilidades se declaran con `@utility` en `app/globals.css`, para que también las reciban
los enlaces que usan `buttonVariants()` sin el componente:

```css
@utility btn-shine {
  background-image: var(--button-primary-gradient);
  background-size: 200% 100%;
  background-position: 0% 0;
  transition-property: background-position, transform, box-shadow;
  transition-duration: var(--dur-base), var(--dur-instant), var(--dur-instant);
  transition-timing-function: var(--ease-standard);
  @media (hover: hover) { &:hover { background-position: 100% 0; } }
}
@utility btn-veil { /* velo de --button-veil-color al 0 → 100 %, borde y texto a --primary en 100 ms */ }
```

`--button-primary-gradient` y `--button-veil-color` se declaran en `:root` con los valores del
lienzo (`linear-gradient(135deg, #0A4A47 0%, #02605A 45%, #0B7A72 100%)` y
`rgb(2 96 90 / 0.10)`) y en `.dark` con lo que resuelva **P1**. El hover va dentro de
`@media (hover: hover)`, como hace la variante `hover:` de Tailwind v4: en táctil no se queda
pegado, y el hover no es la única forma de descubrir nada (es decoración; regla multiplataforma).

**Enmienda 2026-10-09 (D11, «todas menos link»).**

- `outline-dashed`, `secondary` y `ghost`: `active:not-aria-[haspopup]:translate-y-px` pasa a
  `active:not-aria-[haspopup]:scale-[0.98]`, y su hover (`hover:bg-muted`, `hover:text-foreground`,
  `dark:hover:bg-input/50`, `dark:hover:bg-muted/50` o el `color-mix` de `secondary`) pasa a
  `btn-veil`. Se conservan los `aria-expanded:*`.
- `destructive`: solo cambia la pulsación a `scale-[0.98]`; conserva `hover:bg-destructive/*`.
- `link`: sin cambio (`translate-y-px`).
- `btn-veil` pinta el velo con `background-image` sobre el `background-color` de la variante, así
  que sobre `secondary` mezcla el petróleo al 10 % con su fondo azulado; el texto petróleo queda a
  5.4:1 en claro y 5.6:1 en oscuro. En `secondary` y `ghost`, cuyo borde es transparente en
  reposo, el hover pinta el borde de petróleo como en `outline`.
- La escala usa la propiedad CSS `scale`, independiente de `translate`: ya no pisa el
  `-translate-y-1/2` de los botones centrados, que era el motivo de neutralizar `translate-y-px`.

`data-table-scroll-nav.tsx` ya neutraliza la pulsación con el mismo stack
(`active:not-aria-[haspopup]:-translate-y-1/2`); se le añade `active:not-aria-[haspopup]:scale-100`
para que la flecha `outline` siga sin moverse (R18). Su `transition-colors` impide además animar
la escala.

## 5. Ítem activo que se desliza (R13–R15)

Pieza nueva: `components/private/sidebar-active-indicator.tsx` (`'use client'`), usada solo por
`app-sidebar.tsx`.

- `app-sidebar.tsx` envuelve cada lista (`SidebarMenu` de una sección y cada `SidebarMenuSub`) en
  un contenedor `relative` con una ref y renderiza dentro un `<span aria-hidden="true"
  data-slot="sidebar-active-indicator">` posicionado en absoluto. No es un `<li>`: no altera la
  lista ni los tests que cuentan ítems.
- En `useLayoutEffect`, con la ruta (`usePathname`, que el componente ya usa) como dependencia, busca
  el `[data-active]` **hijo directo de esa lista** (no de una sublista), lee `offsetTop`,
  `offsetLeft`, `offsetWidth` y `offsetHeight` y los aplica como
  `transform: translate(x, y)` + `width` / `height`. Un `ResizeObserver` sobre el contenedor
  recoloca al contraer a modo icono, al abrir un grupo y al girar el móvil.
- Transición: `transform` en `--dur-base` con `--ease-standard` (R13). La **primera** colocación de
  cada lista, y la que ocurre cuando el activo llega de otra lista, se hacen sin transición (se
  aplica con la transición desactivada y se activa en el frame siguiente) y con un fundido de
  opacidad de `--dur-base` (R14). Sin ítem activo en la lista, el indicador queda a opacidad 0.
- Pintura: el indicador lleva el mismo fondo y el mismo anillo de QC-226 R11. Una vez colocado,
  el contenedor marca `data-indicator-ready` y una regla sin capa
  `[data-indicator-ready] > … [data-slot='sidebar-menu-button'][data-active]` deja transparentes el
  fondo y el anillo del botón, para que no se pinten dos veces. La regla de R11 **no se edita**: sin
  JavaScript (o antes de hidratar) el botón sigue pintándose solo como hoy (R15). La barra
  `::before`, el color del icono y el texto en 600 se quedan en el botón (D18).
- El submenú activo (`sidebar-menu-sub-button`) usa el mismo mecanismo con su anillo propio.

Coste: ~80 líneas de cliente y una regla de CSS. Es la pieza que P4 permite recortar.

## 6. Toasts (R10)

Sonner trae su CSS (`node_modules/sonner/dist/styles.css`): `transition: transform 400ms, opacity
400ms, height 400ms, box-shadow 200ms` y, para un toast de atrás que se retira,
`transform 500ms, opacity 200ms`. Se sobrescriben desde `app/globals.css`, en una regla sin capa
con un ancestro `[data-sonner-toaster]` delante para ganar especificidad sin `!important`:

- `[data-sonner-toaster] [data-sonner-toast]`: duraciones `--dur-slow` (transform, opacity,
  height) y `--dur-base` (box-shadow), curva `--ease-enter`.
- `[data-sonner-toaster] [data-sonner-toast][data-removed='true']`: `--dur-fast` con `--ease-exit`,
  también en la variante de toast de atrás (quita los 500 ms).

Sonner ya entra desde abajo en la posición por defecto (`bottom-right`), que es la que usan los dos
layouts. Su regla propia de movimiento reducido (`transition: none !important`) se mantiene y es
compatible con §7. **A verificar en T5** que la hoja de Sonner, que se inyecta en tiempo de
ejecución, no gana por orden: se mide con `getComputedStyle` en el E2E.

## 7. Entrada de pantalla (R19, R20) y movimiento reducido (R21, R22)

### 7.1 Entrada de pantalla

- Función pura `navModuleKey(pathname, hrefs)` en `lib/shared/navigation/nav-module.ts`: devuelve
  el `href` más largo que es prefijo de la ruta (por segmentos, no por texto: `/pedidos` no es
  prefijo de `/pedidos-x`), o el primer segmento si ninguno lo es.
- Componente `ScreenEnter` (`'use client'`) en `app/(private)/components/screen-enter.tsx`,
  exportado por el barrel. El layout privado envuelve `{children}` con él y le pasa los `href` de
  los ítems que ya calcula para la barra lateral (no los vuelve a calcular el cliente).
- `ScreenEnter` calcula la clave de módulo con `usePathname()` y renderiza
  `<div key={clave} data-screen-enter={activo ? '' : undefined} className="contents">`. Al montar
  arranca un temporizador de `--dur-slow` + 120 ms (420 ms) que quita el atributo. Cambiar de módulo
  cambia la `key`, que remonta el envoltorio y vuelve a poner el atributo; navegar dentro del módulo
  no cambia la `key` y el atributo ya no está, así que los bloques que se insertan (por ejemplo, una
  pantalla de detalle) no se animan (R20).
- CSS en `app/globals.css`:

```css
@keyframes screen-enter { from { opacity: 0; transform: translateY(10px); } }
[data-screen-enter] > * > * { animation: screen-enter var(--dur-slow) var(--ease-enter) both; }
[data-screen-enter] > * > :nth-child(2) { animation-delay: 40ms; }
[data-screen-enter] > * > :nth-child(3) { animation-delay: 80ms; }
[data-screen-enter] > * > :nth-child(n + 4) { animation-delay: 120ms; }
```

  «Bloques de primer nivel» son los hijos del elemento raíz de la página (las páginas privadas
  devuelven un único `div` con cabecera, filtros y la sección de la tabla). El bloque de la tabla
  entra **entero**; sus filas no tienen animación propia (R23).
- `display: contents` mantiene el `flex-1` de la raíz de la página como hijo flexible de
  `SidebarInset`, como hoy.

### 7.2 Movimiento reducido

Se copia en `app/globals.css`, tal cual, la regla de `tokens.css` del kit
(`<raíz>/_trabajo/marca/tokens.css:134-140`):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- Base UI espera a que terminen las animaciones (`getAnimations()`) para desmontar: con 0.01 ms
  terminan en el acto, sin cambio de conducta.
- Login (R22): la regla local de QC-226 pone `animation: none` a las moléculas y
  `login-card-fade` a la tarjeta; la global no cambia `animation-name`, así que los E2E de
  `login-skin.spec.ts` que miran el nombre y la opacidad final siguen valiendo. **A verificar en
  T6.**
- Flechas de la tabla (R21): `scrollBy` pasa `behavior: 'auto'` cuando
  `matchMedia('(prefers-reduced-motion: reduce)').matches`; si `matchMedia` no existe (jsdom),
  conserva `'smooth'`, y los tests actuales no cambian.

> Nota 2026-10-09 (review): la primera colocación del indicador va sin fundido; compatible con R14.

## 8. Enmiendas a specs cerrados y tests que se tocan

> Nota 2026-10-09 (review): por R17, la variante `outline` de `button.tsx` también pierde `hover:text-foreground` y `dark:hover:bg-input/50` (pasa a `btn-veil`).

| Test | Por qué | Cómo |
| --- | --- | --- |
| `tests/unit/theme/color-tokens.test.ts > R32` (QC-226) | Prohíbe la regla global de movimiento reducido y cualquier movimiento fuera del login, que ahora son R19 y R21 de QC-228 | Se enmienda: deja de prohibir eso y pasa a exigir solo que el bloque del login siga como está. Nota `ENMIENDA QC-228 (D5)` en el caso, y nota en `specs/QC-226-tema-y-marca-base/requirements.md > R32` |
| `tests/unit/paridad/__snapshots__/*.snap` (QC-231, QC-232, QC-233) | Congelan las clases de `Button`, `Dialog`, `Sheet`, menús y barra lateral | Se regeneran con `-u` en un commit propio, `test(QC-228): paridad con las clases de movimiento`, **después** de comprobar que el diff de los snapshots solo cambia clases de duración, curva, escala, `btn-shine`/`btn-veil` y `hover:bg-*` de las dos variantes; el árbol accesible no cambia |
| `tests/unit/shared-ui/button-touch.test.tsx` | Si afirma sobre la cadena completa de clases del botón | Solo si falla: se ajusta la aserción de clase, no la de talla táctil |

QC-226 R11 no se enmienda en su texto: el resultado visual es el mismo, solo que con JavaScript el
fondo lo pinta el indicador. Se anota en `specs/QC-226-tema-y-marca-base/requirements.md > R11`.

## 9. Riesgos y choques

- **QC-227 toca `components/ui/button.tsx`** (y probablemente `badge.tsx`, `input.tsx`, `table.tsx`).
  Hoy está `pending`, así que no hay choque en vuelo; cuando entre, debe partir de esta rama
  mergeada y conservar `btn-shine` / `btn-veil` al cambiar colores.
- La medición del indicador depende del layout real: se prueba en E2E (Chromium y WebKit), no solo
  en jsdom.
- Las enmiendas de §8 son la mayor parte del diff de tests; van en commits separados para que el
  reviewer las lea solas.

## 10. Trazabilidad prevista (R → test)

| R | Test |
| --- | --- |
| R1, R2, R23 | `tests/guards/guard-movimiento.test.ts` (nuevo): recorre `app/` y `components/` y falla con `duration-N` > 400, `duration-[...]` > 400 ms, `ease-linear/in/out/in-out`, `cubic-bezier` fuera del bloque del login, `animate-bounce`, `animate-ping`, `animate-*` en `table.tsx`/`badge.tsx`/`brand-logo.tsx`, y `infinite` fuera del login y de `animate-spin`/`animate-pulse` |
| R3 | `tests/unit/theme/motion-tokens.test.ts` (nuevo, lee `globals.css`): las dos variables de §3 |
| R4–R9, R11, R12 | `tests/unit/shared-ui/motion-classes.test.tsx` (nuevo): renderiza cada primitivo abierto y afirma las clases de §4; y `e2e/movimiento.spec.ts` (nuevo): `getComputedStyle` de un diálogo y un `Sheet` al abrir y al cerrar |
| R10 | `tests/unit/theme/motion-tokens.test.ts` (reglas de Sonner) y `e2e/movimiento.spec.ts` (duración calculada del toast) |
| R13–R15 | `tests/unit/sidebar-active-indicator.test.tsx` (nuevo; con `offsetTop` simulado) y `e2e/movimiento.spec.ts` (el indicador acaba sobre el ítem activo, en expandido y en icono) |
| R16–R18 | `tests/unit/shared-ui/motion-classes.test.tsx` (clases), `tests/unit/theme/motion-tokens.test.ts` (`@utility`) y `tests/unit/shared/data-table-scroll.test.tsx` (caso nuevo: la flecha lleva `scale-100`) |
| R19, R20 | `tests/unit/navegacion/nav-module.test.ts` (nuevo), `tests/unit/screen-enter.test.tsx` (nuevo: cambia la ruta de módulo y dentro del módulo) y `e2e/movimiento.spec.ts` |
| R21, R22 | `tests/unit/theme/motion-tokens.test.ts` (la regla global), `tests/unit/shared/data-table-scroll.test.tsx` (caso nuevo con `matchMedia` simulado) y `e2e/movimiento.spec.ts` con `emulateMedia({ reducedMotion: 'reduce' })`; `e2e/login-skin.spec.ts` sigue verde |
| R24 | La suite existente, sin editar aserciones de comportamiento (salvo §8) |
| R25 | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) |

`e2e/movimiento.spec.ts` se da de alta en `E2E_ESPERADOS` de
`tests/guards/guard-identificador-de-request.test.ts`.

## 11. Alternativas descartadas

**A. Sobrescribir todo desde `globals.css` por `data-slot`, sin tocar `components/ui/`.** Fue lo
que hizo QC-226 para no abrir los primitivos. Aquí no sirve: las utilidades de `tw-animate-css`
(`duration-100` escribe `--tw-duration`) viven en `@layer utilities`, y ganarles desde fuera exige
`!important` o selectores que dependen del orden de capas, regla por regla y estado por estado
(`data-open`, `data-closed`, `data-starting-style`, `data-ending-style`, lado del `Sheet`). Quedaría
un segundo sitio, implícito, que decide la duración de cada primitivo. Editar las clases deja la
duración junto al componente y con tokens.

**B. View Transitions (`<ViewTransition>` de React / `experimental.viewTransition` de Next 16) para
la entrada de pantalla y el ítem que se desliza.** Resolvería las dos cosas sin medir el DOM, pero
en Next 16.3 sigue detrás de una bandera experimental, por defecto hace un fundido de la página
entera que habría que desactivar, y su soporte en WebKit / WebView de iOS antiguos no está
verificado (regla multiplataforma: sin verificar no es un sí).

**C. `template.tsx` en `app/(private)/` para la entrada de pantalla.** Next remonta el template al
navegar, pero no está verificado aquí si lo hace también al cambiar solo de parámetros de búsqueda
o al entrar a un detalle del mismo módulo. R20 depende justo de eso, y la clave explícita de §7.1
lo controla y se prueba en unitario.

**D. Posicionamiento por ancla de CSS (`anchor-name` / `position-anchor`) para el indicador.** Sin
JavaScript, pero Safari no lo soporta en todas las versiones de iOS que usan los operarios.

## 12. Dependencias

Ninguna nueva (R25). Se usan `tw-animate-css` ^1.4.0, Tailwind v4, Base UI y `sonner`, que ya están
en `docs/dependencias.md`.
