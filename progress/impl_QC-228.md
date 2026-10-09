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
