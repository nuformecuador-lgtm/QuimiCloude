# QC-228 — bitácora de implementación (frontend_dev)

## Tanda 1 — T1 y T4

### Archivos
- `app/globals.css` (modificado): `--default-transition-duration` / `--default-transition-timing-function`
  en `@theme inline`; reglas de Sonner (entrada, salida y toast de atrás); regla global de
  `prefers-reduced-motion` del kit.
- `tests/unit/theme/color-tokens.test.ts` (modificado): R32 enmendado (`ENMIENDA QC-228 (D5)`);
  en R6, el localizador pasa de `--dur-instant` a `--dur-instant:` (misma enmienda: `@theme inline`
  ya nombra `var(--dur-instant)` y el localizador antiguo caía en él). Ninguna aserción de R6 cambia.
- `tests/unit/theme/motion-tokens.test.ts` (nuevo).

### Verificación del supuesto de `design.md > 1` (CSS compilado con `@tailwindcss/node` 4.3.3)
- `tw-animate-css` 1.4.0: `--animate-in: enter var(--tw-animation-duration,var(--tw-duration,.15s))var(--tw-ease,ease)…` → lee `--tw-duration` y `--tw-ease`. **Sí.**
- `duration-(--dur-slow)` compila a `--tw-duration: var(--dur-slow); transition-duration: var(--dur-slow)`;
  `ease-(--ease-enter)` a `--tw-ease: var(--ease-enter); …`. **Sí.**
- `zoom-in-96` → `--tw-enter-scale: calc(96*1%)`; `zoom-out-96` → `--tw-exit-scale: calc(96*1%)`. **Existen.**
- `transition-colors` / `transition-all` → `transition-duration: var(--tw-duration, var(--dur-instant))`, curva `var(--tw-ease, var(--ease-standard))`.
- P2: `animate-spin` es `animation: var(--animate-spin)` (shorthand con `infinite`); la longhand
  `animation-iteration-count: 1 !important` de la regla global lo pisa. No hace falta nada más.

### Mapa R → test
| R | Test |
| --- | --- |
| R3 | `motion-tokens.test.ts > R3: las transiciones sin duracion ni curva propias…` |
| R10 | `motion-tokens.test.ts > R10: toasts > *` (6 casos: regla de 500 ms de Sonner, entrada, salida incl. toast de atrás, especificidad sin `!important`, arrastre, ≤ 400 ms) |
| R21 | `motion-tokens.test.ts > R21: con movimiento reducido…` y `> R21: los indicadores de carga en bucle se detienen…` |
| R22 | `motion-tokens.test.ts > R22: la regla global no cambia el nombre de ninguna animacion…`; `color-tokens.test.ts > R32 (ENMIENDA QC-228)` |

### Salida de los comandos
- `pnpm run typecheck`: verde (antes hizo falta `prisma generate` y `next typegen` en el worktree: sin ellos, 978 errores ajenos de `@prisma/client` y `LayoutProps`).
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`, todos preexistentes (`confirm-catalog-import.test.ts`, `order-service.test.ts`).
- `pnpm exec vitest related --run app/globals.css tests/unit/theme/color-tokens.test.ts tests/unit/theme/motion-tokens.test.ts`: `Test Files 4 passed (4) · Tests 53 passed (53)`.
- `pnpm exec vitest run tests/unit/theme`: `Test Files 10 passed (10) · Tests 58 passed (58)`.

### Notas
- Sonner: además de lo de `design.md > 6`, las dos reglas excluyen `[data-swiping='true']` para no
  pisar el `transition: none` de Sonner al arrastrar (si no, el toast iría por detrás del dedo).
- No se tocó `[data-sonner-toast] > *` (`transition: opacity 400ms`): no supera 400 ms; queda fuera de `design.md > 6`.
- E2E (`login-skin.spec.ts`) no corrido en esta tanda por indicación del leader.

**Veredicto:** T1 y T4 hechas; supuesto de tw-animate verificado, tests de tema verdes.

## Tanda — T7 (entrada de pantalla)

### Archivos
- `lib/shared/navigation/nav-module.ts` (nuevo): `navModuleKey(pathname, hrefs)` y `navItemHrefs(items)`.
- `app/(private)/components/screen-enter.tsx` (nuevo, `'use client'`): `ScreenEnter` y `SCREEN_ENTER_MS` (420).
- `app/(private)/components/index.ts` (modificado): exporta `ScreenEnter`.
- `app/(private)/layout.tsx` (modificado): `<ScreenEnter hrefs={navItemHrefs(navItems)}>{children}</ScreenEnter>`
  dentro de `SidebarInset`; los href salen de los `navItems` ya filtrados en el servidor.
- `app/globals.css` (modificado, solo al final): `@keyframes screen-enter`, retardos 40/80/120 ms y,
  con movimiento reducido, `animation-delay: 0ms` para los bloques.
- `tests/unit/navegacion/nav-module.test.ts` (nuevo), `tests/unit/screen-enter.test.tsx` (nuevo).

### Mapa R → test
| R | Test |
| --- | --- |
| R19 | `nav-module.test.ts` (prefijo por segmentos, href más largo, ruta sin ítem, `/` ignorado); `screen-enter.test.tsx > R19: …al montar`, `> R19: …a los 420 ms`, `> R19: al cambiar de módulo el atributo vuelve` |
| R20 | `nav-module.test.ts > R20: una pantalla de detalle pertenece al módulo del ítem`; `screen-enter.test.tsx > R20: navegar dentro del módulo… no repite la entrada` |

### Salida de los comandos
- `pnpm run typecheck`: verde.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`, los mismos preexistentes.
- `pnpm exec vitest related --run` (layout, screen-enter, barrel, nav-module y los dos tests): `Test Files 15 passed (15) · Tests 261 passed (261)`; incluye `private-layout.test.tsx` sin tocar.
- `pnpm exec vitest run guard`: `Test Files 62 passed (62) · Tests 834 passed | 15 skipped`.

### Notas
- La clave de una ruta sin ítem es `/<primer segmento>` (el design dice «el primer segmento»; se
  le antepone `/` para que todas las claves tengan forma de ruta). Un href `/` se ignora.
- Movimiento reducido: la regla global deja la duración en 0.01 ms pero no toca `animation-delay`;
  sin el ajuste, los bloques 2–4+ seguirían ocultos 40–120 ms (`fill-mode: both`). El ajuste usa
  `:nth-child(n)` para igualar especificidad con los retardos y ganar por orden.
- `usePathname()` puede devolver `null` fuera del App Router (tests que no lo simulan): se trata como `''`.

**Veredicto:** T7 hecha; tests de R19/R20 verdes y `private-layout.test.tsx` sin cambios.

## T2 y T3 — primitivos, chevron y botones (frontend_dev)

### Archivos
- Modificados: `components/ui/{dialog,alert-dialog,sheet,dropdown-menu,select,popover,autocomplete,tooltip,tabs,sidebar}.tsx`,
  `components/private/app-sidebar.tsx` (chevron), `components/ui/button.tsx`,
  `components/shared/data-table/data-table-scroll-nav.tsx`, `app/globals.css` (tokens
  `--button-primary-gradient` / `--button-veil-color` en `:root` y `.dark` y `@utility btn-shine` /
  `btn-veil`, tras el bloque de `--sidebar-panel-gradient`; la zona final de T7 no se toca).
- Tests: `tests/unit/shared-ui/motion-classes.test.tsx` (nuevo); casos nuevos en
  `tests/unit/theme/motion-tokens.test.ts` y `tests/unit/shared/data-table-scroll.test.tsx` (sin editar los
  existentes); `tests/unit/shared-ui/button-touch.test.tsx`: solo la cadena esperada del caso R5 del
  defecto, con nota `ENMIENDA QC-228`.

### Mapa R → test
| R | Test |
| --- | --- |
| R4 | `motion-classes.test.tsx > R4: el diálogo entra…` |
| R5 | `motion-classes.test.tsx > R5: el diálogo sale…` |
| R6 | `motion-classes.test.tsx > R6: el panel lateral…` |
| R7 | `motion-classes.test.tsx > R7: menús, desplegables, popover y autocompletar…` |
| R8 | `motion-classes.test.tsx > R8: el tooltip…` |
| R9 | `motion-classes.test.tsx > R9: el indicador de la pestaña activa…` |
| R11 | `motion-classes.test.tsx > R11: el ancho de la barra lateral…` |
| R12 | `motion-classes.test.tsx > R12: el chevron…` |
| R16 | `motion-classes.test.tsx > R16: el botón primario usa el brillo…`; `motion-tokens.test.ts > R16: el degradado del primario se desplaza…`, `> R16: en claro… en oscuro se deriva de --primary`, `> R16: el texto del primario cumple 4.5:1…` |
| R17 | `motion-classes.test.tsx > R17: el botón secundario (outline) usa el velo…`; `motion-tokens.test.ts > R17: el velo petróleo entra desde la derecha…`, `> R17: el velo es petróleo al 10 %…` |
| R18 | `motion-classes.test.tsx > R18: primario y secundario escalan al 98 %…`; `motion-tokens.test.ts > R18: la escala al pulsar se transiciona en --dur-instant…`; `data-table-scroll.test.tsx > R18: la flecha no encoge al pulsarse…` |
| R21 | `data-table-scroll.test.tsx > R21: con movimiento reducido la flecha desplaza al instante`, `> R21: sin movimiento reducido… suave` |

### Salida de los comandos
- `pnpm run typecheck`: verde (exit 0).
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`, los preexistentes.
- `pnpm exec vitest related --run <archivos de T2/T3>`: `Test Files 14 failed | 251 passed (265) · Tests 153 failed | 3795 passed | 1 skipped`.
  Los 153: 152 de `tests/unit/paridad/*` (13 archivos, T6) y 1 de `motion-tokens.test.ts > R22` (caso de T1:
  espera un único `@media (prefers-reduced-motion: reduce)` fuera del login y T7 añadió otro).
- `pnpm exec vitest run tests/unit/paridad`: `13 failed | 3 passed (16) · 152 failed | 37 passed`. Diff solo de
  atributos `class`, neto: quitadas `active:not-aria-[haspopup]:translate-y-px`, `hover:bg-primary/80`,
  `hover:bg-muted`, `dark:hover:bg-input/50`, `hover:text-foreground`, `duration-100`, `zoom-in-95`/`zoom-out-95`
  (diálogos); añadidas `btn-shine`, `btn-veil`, `active:not-aria-[haspopup]:scale-[0.98]`, `duration-(--dur-*)`,
  `ease-(--ease-*)`, `data-closed:*`, `after:duration-/ease-`, `zoom-in-96`/`zoom-out-96`. Sin snapshots regenerados.

### Notas
- `transition-all` del base sale **después** de las `@utility` en la capa de utilidades (comprobado
  compilando con `@tailwindcss/node`): las transiciones de `btn-shine`/`btn-veil` van en `&:not(:disabled)`
  para ganar por especificidad. En v4 la escala y el desplazamiento son las propiedades `scale` y
  `translate`, no `transform`.
- `active:not-aria-[haspopup]:translate-y-px` sale del base y pasa a las variantes que no son `default` ni
  `outline`, en vez de neutralizarlo con twMerge: así `buttonVariants()` y el `Button` renderizado siguen
  dando las mismas clases (caso R5 de `button-touch`).
- `outline` pierde también `hover:text-foreground`: con él, el texto no pasaría a `--primary` (R17). Es la
  única clase retirada fuera de las `hover:bg-*` que lista `design.md > 8`.
- Oscuro (P1): paradas `color-mix(in oklch, var(--primary) 85%, black)` → `--primary` → `… 85%, white`; velo
  `color-mix(in oklch, var(--primary) 10%, transparent)`.

**Veredicto:** T2 y T3 hechas; los casos nuevos pasan y solo fallan la paridad (T6) y el R22 que rompe el segundo bloque de movimiento reducido de T7.

## T5 — Guardia de movimiento, y arreglo del R22 roto por T7 (frontend_dev)

### Archivos
- `app/globals.css` (modificado): la regla `[data-screen-enter] > * > :nth-child(n) { animation-delay: 0ms }`
  pasa **dentro** del bloque global de movimiento reducido, después de la regla del kit (intacta), y se borra
  el segundo `@media (prefers-reduced-motion: reduce)` del final. Como el bloque global va antes de los
  retardos de entrada y tiene su misma especificidad (0,2,0), por orden perdería: gana con `!important`,
  como el resto del bloque. No se tocó `tests/unit/theme/motion-tokens.test.ts`.
- `tests/guards/guard-movimiento.test.ts` (nuevo): recorre `.ts/.tsx/.css` de `app/` y `components/` (sin
  comentarios; `globals.css` sin el bloque del login). Falla con `duration-N` > 400, `duration-[...]` > 400 ms
  o sin medida, `duration-(--x)` que no sea un `--dur-*` ≤ 400 ms, duraciones literales o `var(--dur-*)` > 400
  en `transition`/`animation` de CSS, tokens `--dur-*` > 400, `ease-linear/in/out/in-out`, `ease-(--x)` fuera
  de los tres tokens, `ease-[...]`, `cubic-bezier` fuera de la declaración de `--ease-*` y del login, tokens
  `--ease-*` con Y fuera de [0, 1], `animate-bounce`, `animate-ping`, `infinite`, y `animate-*`/`animation:`/
  `@keyframes` en `table.tsx`, `badge.tsx` y `brand-logo.tsx`. Cada detector tiene casos negativos con
  fuentes inventadas, más un ancla de no vacuidad (≥ 50 archivos) y una prueba de que quitar los
  delimitadores del login sí da infracciones.

### Mapa R → test
- R1 → `guard-movimiento.test.ts > R1: duration-N…`, `R1: duration-[...]…`, `R1: duration-(--x)…`,
  `R1: duraciones literales y tokens…` y el barrido `ningún archivo declara movimiento prohibido`.
- R2 → `guard-movimiento.test.ts > R2: ease-linear…`, `R2: ease-(--x)…`, `R2: cubic-bezier fuera…` y el barrido.
- R23 → `guard-movimiento.test.ts > R23: una curva… con rebote`, `R23: animate-bounce y animate-ping`,
  `R23: infinite fuera del login…`, `R23: animate-* y animaciones CSS en la tabla, el badge y el logo` y el barrido.

### Hallazgos de la guardia en el código actual
Ninguno. Las únicas apariciones de `cubic-bezier` e `infinite` son las tres declaraciones `--ease-*` y el
bloque del login; las clases de movimiento en uso son `duration-(--dur-*)`, `ease-(--ease-*)`, `animate-in/out`,
`animate-spin`, `animate-pulse` y `animate-none`.

### Salida
- `pnpm run typecheck` → `tsc --noEmit`, exit 0.
- `pnpm run lint` → `✖ 7 problems (0 errors, 7 warnings)` (avisos heredados en tests de pedidos y documentos).
  Una pasada anterior dio `1 error` mientras otro subagente editaba en paralelo; la siguiente, 0.
- `pnpm exec vitest run guard` → `Test Files 63 passed (63)`, `Tests 850 passed | 15 skipped (865)`.
- `pnpm exec vitest run tests/unit/theme tests/unit/screen-enter.test.tsx` → `Test Files 11 passed (11)`,
  `Tests 69 passed (69)` (incluye `motion-tokens > R22`, de nuevo verde).

**Veredicto:** T5 hecha y R22 de `motion-tokens` en verde sin editar el test; la guardia no encuentra infracciones.

## T8 — Indicador del ítem activo que se desliza (frontend_dev)

### Archivos
- `components/private/sidebar-active-indicator.tsx` (nuevo, `'use client'`): envuelve una lista en un
  `div.relative`; `span aria-hidden data-slot="sidebar-active-indicator" data-variant="menu|sub"`
  hermano de la lista. `useLayoutEffect` con `usePathname`; activo = `:scope > ul > li > [data-active]`;
  posición sumando `offsetTop/Left` por la cadena de `offsetParent` hasta el contenedor (el `<li>` es
  `relative`); `ResizeObserver` sobre el contenedor (recoloca sin transición). Modos en `data-motion`:
  `slide` (misma lista), `fade` (llega de otra lista o la lista no tenía activo; fuerza reflow con
  opacidad 0 y sin transición de posición), `none` (primera colocación y tamaño).
- `components/private/app-sidebar.tsx`: `SidebarMenu` de cada sección (`variant="menu"`) y cada
  `SidebarMenuSub` (`variant="sub"`) envueltos. El chevron de T2 intacto.
- `app/globals.css`: tras la regla del submenú activo y antes de `@layer base`, sin capa: pintura del
  indicador (`opacity: 0` inicial, mismo fondo y anillo que R11; `sub` con `--sidebar-accent` y anillo
  al 22 %) y la regla `[data-indicator-ready] > [data-slot='sidebar-menu'] > … > [data-active]` (y la
  del submenú) con `background: transparent; box-shadow: none`. La regla de R11 no se tocó.
- `tests/unit/sidebar-active-indicator.test.tsx` (nuevo, 14 casos).

### Mapa R → test
| R | Test |
| --- | --- |
| R13 | `sidebar-active-indicator.test.tsx > R13: dentro de la misma lista se desliza…`, `R13: el deslizamiento anima transform con --dur-base y --ease-standard` |
| R14 | `… > R14: la primera colocacion…`, `R14: si el activo llega de otra lista…`, `R14: el activo de un submenu no lo toma…`, `R14: sin item activo…` |
| R15 | `… > R15: al cambiar de tamano…`, `R15: el indicador es decorativo…`, `R15: sin JavaScript…` (SSR con `renderToString`), `R15: la barra lateral real…`, y los 4 casos de `SidebarActiveIndicator: CSS` (opacidad 0, mismo fondo/anillo que R11, anillo del submenú, regla de listo sin capa) |

### Salida de los comandos
- `pnpm run typecheck` → `tsc --noEmit` sin errores.
- `pnpm run lint` → `ESLint: 0 errors, 7 warnings in 2 files` (preexistentes: `confirm-catalog-import.test.ts`, `order-service.test.ts`).
- `pnpm exec vitest related --run components/private/sidebar-active-indicator.tsx components/private/app-sidebar.tsx app/globals.css tests/unit/sidebar-active-indicator.test.tsx`
  → `Test Files 19 passed (19)`, `Tests 339 passed (339)` (incluye `app-sidebar.test.tsx` y `sidebar-ajuste.test.tsx`, sin editar).
- `pnpm exec vitest run tests/unit/theme tests/unit/brand/fonts.test.ts tests/unit/login-skin.test.tsx tests/unit/sidebar-desktop.test.tsx tests/unit/sidebar-mobile.test.tsx guard`
  → `Test Files 77 passed (77)`, `Tests 971 passed | 15 skipped (986)`.
- `pnpm exec vitest run tests/unit/paridad` → `Test Files 13 failed | 3 passed (16)`, `Tests 152 failed | 37 passed (189)`:
  los diffs son clases de T2/T3 (`transition-all`, `scale-[0.98]`, `btn-veil`, `btn-shine`, `duration-(--dur-*)`,
  `ease-(--ease-*)`, `fade-*`, `zoom-*`, `slide-in-*`). Ningún test de paridad renderiza `AppSidebar` y el
  span del indicador no aparece en ningún diff (0 coincidencias de `sidebar-active-indicator`). Snapshots sin regenerar.

### Notas
- Primera pasada de `related`: rojo en `pedidos-ui/pedidos-viewport.test.tsx > R45`, que prohíbe la clase
  `opacity-0` en cualquier elemento. Se movió la opacidad inicial a la regla CSS del indicador; verde.
- Desvío leve de `design.md > 5`: la primera colocación de cada lista (montaje/hidratación) es inmediata y
  sin fundido, porque el botón ya está pintado por CSS en ese sitio y un fundido produciría un parpadeo.
  El fundido se aplica cuando el activo llega de otra lista o la lista no tenía activo. Cumple R14
  («como mucho un fundido»).
- El fundido usa reflow forzado en vez de esperar al frame siguiente (`requestAnimationFrame` puede correr
  antes del cálculo de estilos del mismo frame y saltarse la transición).
- La medición real (Chromium y WebKit) queda para `e2e/movimiento.spec.ts` (T9).

**Veredicto:** T8 hecha; R13–R15 con tests verdes, `app-sidebar` y `sidebar-ajuste` verdes sin tocar, y el span no entra en los snapshots de paridad.
