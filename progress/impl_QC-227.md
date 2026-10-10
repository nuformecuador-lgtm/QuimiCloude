# QC-227 — componentes-con-la-nueva-marca · bitácora de implementación

## T0 — paridad sobre el `dev` nuevo (sin regenerar)

Rama en `952cdfcb` (merge de `origin/dev` con QC-228). En el worktree hizo falta
`pnpm install --frozen-lockfile` y `pnpm exec prisma generate` (pnpm bloqueó los scripts de
instalación; sin el cliente, 6 archivos de paridad fallaban al importar `.prisma/client/default`).
No es un cambio del repo.

```
pnpm exec vitest run tests/unit/paridad
 Test Files  21 passed (21)
      Tests  376 passed (376)
```

## Tanda 1

### T5 — contraste de los pares de componentes (frontend_dev)

- Nuevo `tests/unit/theme/contraste.ts`: se movieron sin cambiar su lógica `extractColorBlocks`,
  `readToken`, `parseOklch`, `oklchToLinearSrgb`, `relativeLuminance` y `contrastRatio`.
  `color-tokens.test.ts` los importa de ahí; sus tablas esperadas no se tocaron.
- Nuevo `tests/unit/marca/contraste-componentes.test.ts`. Las paradas hex del degradado se
  convierten con la fórmula sRGB de WCAG (local al test). El hover de `destructive` se calcula con
  `color-mix(in oklch, --destructive, --foreground 10%)` interpolando L, C y tono por el arco corto.

| R | Par | Claro | Oscuro |
| --- | --- | --- | --- |
| R2 | success-text / success-subtle | 7.06 | 9.66 |
| R2 | warning-text / warning-subtle | 7.50 | 9.48 |
| R2 | destructive-text / destructive-subtle | 7.66 | 9.49 |
| R2 | info-text / info-subtle | 7.56 | 9.54 |
| R2, R10 | muted-foreground / muted | 6.70 | 4.66 |
| R15 | sidebar-muted-foreground / sidebar | 7.96 | 7.62 |
| R15 | … / paradas del degradado | 5.10 (#0A4A47), 6.73, 7.96, 8.80 | 5.85 (#0B2F2F), 6.79, 7.63 |
| R18 | primary-foreground / primary | 7.46 | 9.96 |
| R19 | secondary-foreground / secondary | 11.44 | 11.09 |
| R20 | destructive-foreground / destructive | 5.40 | 8.30 |
| R20 | … / hover (mezcla 10 % --foreground) | 6.39 | 9.04 |
| R21 | ring / card | 7.46 | 8.96 |
| R21 | ring / background | 7.16 | 9.96 |
| R23 | input / card | 3.22 | 3.66 |
| R23 | input / background | 3.09 | 4.07 |

Todos llegan al umbral (4.5 texto, 3 interfaz). Ningún token tocado.

### T8 — logo del login con precarga (frontend_dev)

- Doc de Next 16.3.0 (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`):
  «Starting with Next.js 16, the `priority` property has been deprecated in favor of the `preload`
  property»; `preload={true}` «Preloads the image by inserting a `<link>` in the `<head>`», para
  cuando «The image is the Largest Contentful Paint (LCP) element». Se usa `preload`.
- En 16.3.0 `preload` quita `loading="lazy"` del `<img>` pero **no** le pone `fetchpriority="high"`
  (`get-img-props.js` solo pasa `fetchPriority` si se da). El aviso de LCP de `next dev` solo salta
  con `loading === 'lazy'`, así que desaparece. El test afirma lo que sí ocurre: sin
  `loading="lazy"` y con `<link rel="preload" as="image">` en el `<head>`.
- Pendiente para la tanda 3: el aviso de LCP en `next dev` y `e2e/login-skin.spec.ts`.
- Efecto en paridad: `login-paridad.test.tsx.snap` pierde `loading="lazy"` en el `<img>` del logo
  (diferencia fuera de `class`, buscada por R26).

### Mapa R → test (T5, T8)

| R | Test |
| --- | --- |
| R2, R10, R15, R18, R19, R20, R21, R23 (contraste) | `tests/unit/marca/contraste-componentes.test.ts` (un caso por R, en claro y oscuro) |
| R26 | `tests/unit/brand/brand-logo.test.tsx` > «logo del login» (dos casos `R26`) |
| R27 | `tests/unit/theme/color-tokens.test.ts`, verde sin editar tablas |

### Verificación (T5, T8)

- `pnpm run typecheck`: verde tras `pnpm exec next typegen` (sin él, `Cannot find name 'LayoutProps'`, `docs/verification.md`).
- `pnpm run lint`: 0 errores, 8 avisos `no-unused-vars` en archivos ajenos.
- `pnpm exec vitest related --run <mis archivos>`: 24 archivos, 4 rojos ajenos a T5/T8:
  `login-skin.test.tsx` (`focus-visible:ring-3` en el primitivo) y `motion-classes.test.tsx`
  (`hover:bg-destructive/20`), por T4; `login-paridad` (snapshot, T9); y
  `session-once-per-request-render.test.tsx`, que suelto pasa (12/12).
- `pnpm exec vitest run guard`: 66 archivos, 905 pasan.

Veredicto: T5 y T8 hechas; todos los pares llegan al umbral; la precarga del login usa `preload`.

### T1 — badges de estado (frontend_dev)

- `components/ui/badge.tsx`: variantes `success`, `warning`, `info`, `neutral`; `destructive` a
  `bg-destructive-subtle text-destructive-text` (conserva `[a]:hover:bg-destructive/20`, que el
  diseño no retira). Foco: `ring-[3px] ring-ring/50` → `outline-2 outline-offset-2 outline-ring`.
  El badge no lleva `outline-none`, así que no hace falta `outline-solid`.
- Mapas de tono de `order-status-badge.tsx` (estado, prioridad, cobertura) y `user-columns.tsx`
  con los valores de R3–R6; siguen siendo `Record` exhaustivos, sin `default`.
- «Por revisar» (marca de revisión) con `variant="info"` en `recipe-version-list.tsx` y
  `recipe-version-form.tsx`.

### T2 — cabecera de tabla y prop `tabular` (frontend_dev)

- `components/ui/table.tsx`: `TableHeader` con `bg-muted`; `TableHead` `text-foreground` →
  `text-muted-foreground`.
- `data-table-header-menu.tsx`: la cabecera fijada pasa a `bg-muted` (el cuerpo fijado sigue en
  `bg-background`). El icono de orden y el disparador no fijan color: heredan.
- `data-table-types.ts`: `tabular?: boolean`; `data-table.tsx` y `packing-orders-list-section.tsx`
  añaden `font-mono tabular-nums` solo al `td`. Ningún `*-columns.tsx` lleva aún `tabular: true` (T6).

### Mapa R → test (T1, T2)

| R | Test |
| --- | --- |
| R1 | `tests/unit/marca/badges-estado.test.tsx` > «R1: el Badge ofrece los cinco tonos…», «R1: el foco del badge…» |
| R3 | `badges-estado.test.tsx` > «R3: cada estado de pedido se pinta con su tono» |
| R4 | `badges-estado.test.tsx` > «R4: cada prioridad…» |
| R5 | `badges-estado.test.tsx` > «R5: cada cobertura…» |
| R6 | `badges-estado.test.tsx` > «R6: cada estado de cuenta de usuario…» |
| R8 | `badges-estado.test.tsx` > dos casos «R8» (lista y formulario de versión) |
| R9 | `badges-estado.test.tsx` > «R9: los badges conservan su texto visible, su data-testid y sus atributos data-*» |
| R10 | `tests/unit/marca/tablas-marca.test.tsx` > «R10: la cabecera…», «R10: la columna fijada…» |
| R11 | `tablas-marca.test.tsx` > «R11: la celda de cuerpo de una columna tabular…», «R11, R13: la lista de empaque…» |
| R13 | `tablas-marca.test.tsx` > «R13: la cabecera de una columna tabular y las celdas sin la marca siguen en Sans», «R11, R13: …» |

R7 llega en T6.

### Verificación (T1, T2)

- `pnpm run typecheck`: verde. Un primer intento dio `Cannot find name 'LayoutProps'` mientras otro
  agente regeneraba `.next/types`; al repetir, verde.
- `pnpm run lint`: `✖ 8 problems (0 errors, 8 warnings)`, todos en archivos ajenos.
- `pnpm exec vitest related --run <mis 10 archivos + 2 tests>` (arrastra casi toda la suite por
  `data-table`): `Test Files 23 failed | 255 passed (278)`, `Tests 330 failed | 3948 passed | 1 skipped`,
  3 errores de arranque de worker por carga (`unassign`, `document-upload-a11y-tactil`,
  `data-table-pagination`).
  - Paridad (T9, 18 archivos): asignacion-listas, asignacion, buscadores, campos, catalogo,
    clientes, confirmaciones, formularios, grupos, inventario, login, order-form-image, pedidos,
    presentaciones, proveedores, recetas, unidades, usuarios.
  - **Rojo por T1 fuera de la lista cerrada:** `tests/unit/pedidos-ui/order-columns.test.tsx`, tres
    casos «R29, R32: la celda pinta POR_ACONDICIONAR / EN_ACONDICIONAMIENTO / TERMINADO … y la
    variante secondary/default». Comparan la clase del badge con `<Badge variant="secondary"|"default">`,
    y R3 cambia esos tonos a warning/info/success. No se enmienda (no está en `design.md > 9`): se
    reporta.
  - Ajenos (T4): `login-skin.test.tsx` (`focus-visible:ring-3` en el input), `button-touch.test.tsx`
    (cadena de clases del botón), `motion-classes.test.tsx` (`hover:bg-destructive/20`).
  - Timeout por carga: `proveedores-ui/catalog-line-form.test.tsx` (20 s).
- Tests nuevos sueltos: `Test Files 2 passed (2)`, `Tests 14 passed (14)`.
- `pnpm exec vitest run guard`: `Test Files 66 passed (66)`, `Tests 905 passed | 18 skipped (923)`.

Veredicto: T1 y T2 hechas y sus tests verdes; bloqueo a decidir: `order-columns.test.tsx` afirma los tonos viejos y no está en la lista de enmiendas.

## T4 — Botones, campos y foco en los primitivos (frontend_dev)

**Archivos:** `components/ui/{button,input,textarea,select,autocomplete,checkbox,tabs,calendar}.tsx`;
nuevo `tests/unit/marca/botones-y-campos.test.tsx`; enmienda en `tests/unit/shared-ui/button-touch.test.tsx`.
Ninguno de los ocho primitivos contiene `ring-ring/`.

**CSS compilado (tailwindcss 4.3.3, `compile()` + `build()` desde el scratchpad, sin `next build`):**
`.outline-none { --tw-outline-style: none; outline-style: none }` y
`.focus-visible\:outline-2:focus-visible { outline-style: var(--tw-outline-style); outline-width: 2px }`.
Con `outline-none` en el mismo elemento el contorno quedaba en `none`: se añade `focus-visible:outline-solid`
(`--tw-outline-style: solid; outline-style: solid`) en botón, casilla, pestaña, limpiar del autocompletar
y día del calendario (`group-data-[focused=true]/day:outline-solid`). El E2E de T10 lo mide calculado.

**R → test (`tests/unit/marca/botones-y-campos.test.tsx`):**
- R18 → «R18 — el primario pinta --primary-foreground sobre --primary y conserva el brillo»
- R19 → «R19 — el secundario (outline) …» y «R19 — la variante secondary …»
- R20 → «R20 — el destructivo pinta …», «R20 — al pasar el puntero mezcla …», «R20 — … contorno comun»
- R21 (clases) → «R21 — el boton %s …», casilla, pestaña, día del calendario, limpiar del autocompletar
- R24 → «R24 — el campo %s pinta el borde de --input …» (input, textarea, select, autocomplete) y
  «R24 — el primitivo %s no deja ningun anillo translucido …» (los ocho archivos)
- R25 → «R25 — un boton aria-invalid …» y «R25 — el campo %s marcado aria-invalid …»

**Enmiendas:** `button-touch.test.tsx`, caso «R5 — sin touch, buttonVariants da las clases de siempre para
el defecto»: solo la cadena de clases (foco), con nota `ENMIENDA QC-227`.

**Fallan por T4 y NO están en la lista cerrada (sin tocar, reportados al leader):**
- `tests/unit/login-skin.test.tsx` > «conserva el radio y el anillo de foco de campo y boton en las
  primitivas»: exige `focus-visible:ring-3` en `input.tsx` y `button.tsx`.
- `tests/unit/shared-ui/motion-classes.test.tsx` > «R17: destructive y link no llevan velo; destructive
  conserva su hover rojo»: exige `hover:bg-destructive/20`.

**Salida:** typecheck exit 0 · lint exit 0 (solo warnings ajenos) · `vitest run guard` 66 archivos, 905 ok,
18 skipped · `vitest related` (8 primitivos + test): 23 archivos fallan, 330 tests (322 snapshots de
paridad), el resto: los dos de arriba, `button-touch` (ya enmendado, verde), `order-columns` (badges, de
otra task) y `catalog-line-form` (timeout por carga, verde al relanzarlo solo).

**Veredicto T4:** primitivos hechos y test verde; bloqueado por dos tests fuera de la lista cerrada.

## T12 (medida) · T3 · T12 (cambio) — barra lateral (frontend_dev)

### T12 — medida sobre el código de partida, sin tocar producción

`e2e/marca-componentes.spec.ts`, bloques «carril colapsado» y «control de colapso», Chromium y
WebKit, claro y oscuro. Ruta activa = aterrizaje del Administrador (`loginAndLand`), exigida como
enlace de primer nivel de `PRIVATE_NAV_ITEMS` (salió `nav-asignacion`). Modo icono por la cookie
`SIDEBAR_STATE_COOKIE` (valor comprobado con `readSidebarOpenState`), `reducedMotion: 'reduce'`.
Las cifras son idénticas en los dos navegadores y en los dos modos (salvo el contraste, por modo).

| Caja (modo icono, px) | Medido antes | Esperado por el diagnóstico |
| --- | --- | --- |
| Contenedor / carril | 96 / 60, eje x = 48 | 96 / 60, eje 30 + 18 |
| Botones de navegación (9) y enlace de marca | 32 × 44 en x = 26, centro 42, desvío −6 | 32 × 44, −6 |
| Iconos de los botones | 16 × 16, centro 42, desvío −6 | −6 |
| Indicador del activo | 32 × 44, igual al botón, desvío −6 | −6 |
| Hover de un inactivo | fondo `--sidebar-accent`, caja 32 × 44, desvío −6 | −6 |
| Isotipo | 16 × 32 (16 de ancho), centro 42, desvío −6 | 16 de ancho |
| Avatar del pie | 24 × 24, centro 46, desvío −2 | −2 |
| Expandida | botones 220 × 44 = ancho de la lista; logo 27.91 de alto; indicador = activo | sin cambio |

| Control (contraste icono/fondo) | Claro | Oscuro |
| --- | --- | --- |
| Pastilla colapsada, reposo | 13.66 | 16.24 |
| Pastilla colapsada, hover | **1.53** (`--primary` sobre `--sidebar-accent`, el `btn-veil`) | 7.28 |
| Pastilla expandida, reposo | 17.78 (fondo `bg-muted` por `aria-expanded`) | 14.39 |
| Pastilla expandida, hover | 6.75 (`--primary` sobre `bg-muted`) | 7.61 |
| Encabezado (390 px, cerrado), reposo / hover | 18.84 / 7.16 | 18.84 / 9.96 |

Iconos: pastilla 14 × 14, encabezado 16 × 16; dentro del botón y de la ventana; `elementFromPoint`
cae en el botón en todos los casos (ni recorte ni tapado). R39: `lucide-panel-left` fijo en todos.
Resultado: 44 rojos de 48 en la primera corrida (4 eran de R36, verde). En el control: 13 rojos (12
de R39 y R38 en claro con hover y colapsada, los dos navegadores).

**Diagnóstico confirmado.** El «~1.3:1» de `design.md > 16.7` era una estimación: la fórmula de
`color-tokens.test.ts` sobre `--primary` (0.44 0.076 188) y `--sidebar-accent` (0.34 0.058 195) da
1.53, que es lo medido. Misma causa, otra cifra.

### T3 — ítem inactivo y contorno global

- Regla del inactivo en `app/globals.css`, sin capa, tras el bloque del activo (y del indicador),
  antes de `@layer base`. **Desvío del spec:** el selector de `design.md > 5` tiene un salto de línea
  entre `:is(...)` y `:not(...)`, que en CSS es un combinador descendiente (seleccionaría los hijos
  del botón). Va como selector compuesto: `:is(...):not([data-active]):not(:hover):not(:focus-visible)`.
- `@layer base`: `outline-ring/50` → `outline-ring`.
- Regla del activo, su `::before`, su icono y el del submenú: sin tocar (el test los congela).

### T12 — cambio

- `components/ui/sidebar.tsx`: `size-8!`/`p-2!` → `size-11!`/`p-3.5!` con prefijo de modo icono;
  `SidebarTrigger` pinta `children ?? <PanelLeftIcon />`.
- `components/private/app-sidebar.tsx`: `group-data-[collapsible=icon]:p-1.5!` en el enlace de marca;
  pastilla con `PanelLeftCloseIcon`/`PanelLeftOpenIcon` según `open` y colores del panel con `!`.
- `components/private/nav-user.tsx`: `group-data-[collapsible=icon]:justify-center`.
- `app/(private)/components/sidebar-toggle.tsx`: icono según `isExpanded`.
- `app/globals.css`: `padding: 14px` y comentario corregido.
- Nombres confirmados en `node_modules/lucide-react` 1.29.0: `PanelLeftOpenIcon`, `PanelLeftCloseIcon`
  (clases `lucide-panel-left-open` / `lucide-panel-left-close`).
- `components/private/sidebar-active-indicator.tsx`: fuera del diff.

Medido después (los dos navegadores, los dos modos): botones, marca e indicador 44 × 44 con centro
en 48 (desvío 0); iconos 16 × 16 centrados; isotipo 32 × 32 en (32,32), dentro del enlace; avatar
centrado (desvío 0); expandida igual que antes. Pastilla: claro 13.66 / 10.84 (reposo / hover
colapsada), 13.66 expandida; el encabezado igual que antes. R39 cambia al pulsar.

Nota: con la pastilla expandida, `aria-expanded:bg-sidebar!` gana a `hover:bg-sidebar-accent!`, así
que en ese estado el hover no cambia el fondo. Cumple R38; se ve en las capturas de T10.

### Enmiendas de test

- `tests/guards/guard-identificador-de-request.test.ts`: alta de `marca-componentes.spec.ts` en
  `E2E_ESPERADOS` (punto de extensión).
- `tests/unit/sidebar-ajuste.test.tsx`, caso «en modo icono el boton se fuerza a 44px con
  !important»: `padding: 10px` → `14px` y su comentario (era falso), con nota `ENMIENDA QC-227`.

### Mapa R → test (R14–R17, R22 parcial, R31–R39)

| R | Test |
| --- | --- |
| R14, R15, R16, R17 | `tests/unit/marca/sidebar-inactivo.test.ts` (casos R14…R17) |
| R22 (base) | `tests/unit/marca/sidebar-inactivo.test.ts` > «R22 la base pinta el contorno con outline-ring opaco» |
| R31 | E2E «carril colapsado» > R31; `sidebar-carril.test.ts` > R31, «R31 R35» |
| R32 | E2E > R32 |
| R33 | E2E > R33 |
| R34 | E2E > R34 |
| R35 | E2E > R35; `sidebar-carril.test.ts` > «R31 R35» |
| R36 | E2E > R36; `sidebar-carril.test.ts` > R36 (lista congelada); `sidebar-ajuste`, `sidebar-desktop`, `app-sidebar`, `ui-primitivas-intactas` verdes |
| R37 | `sidebar-carril.test.ts` > R37 |
| R38 | E2E «control de colapso» > R38 (pastilla ×2 estados, encabezado); `sidebar-carril.test.ts` > R38 (clases) |
| R39 | E2E > R39 (pastilla ×2, encabezado); `sidebar-carril.test.ts` > R39 ×3 |

### Verificación

- `pnpm exec playwright test e2e/marca-componentes.spec.ts` (después): **48 passed (1.0m)**, exit 0.
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errores (warnings ajenos en `confirm-catalog-import.test.ts` y `order-service.test.ts`).
- `pnpm exec vitest related --run <9 archivos>`: 23 archivos, 384 passed.
- `pnpm exec vitest run guard`: 66 archivos, 905 passed, 18 skipped.
- Sidebar: `sidebar-ajuste`, `sidebar-desktop`, `app-sidebar`, `theme/ui-primitivas-intactas`,
  `theme/sidebar-panel`, `marca/sidebar-inactivo`, `marca/sidebar-carril`: 7 archivos, 65 passed.
- Paridad: 17 de 21 en rojo, ninguno por estas tasks (ningún `.snap` contiene marcado de la barra).

**Veredicto:** diagnóstico confirmado; T3 y T12 hechas, E2E verde en Chromium y WebKit, en claro y oscuro.

Nota del implementer sobre las cifras: el diseño estimaba «~1.3:1» para la pastilla con hover en
claro; se midió **1.53**, que es exactamente lo que da la fórmula sobre `--primary`/`--sidebar-accent`.
La causa es la prevista (`btn-veil`), así que se tomó como confirmado.

## Tanda 2

### Enmiendas de test fuera de la lista cerrada de `design.md > 9` (permitidas por el leader, anotadas)

Las tres son aserciones de clase que contradicen requisitos aprobados. Solo cambia la clase o
variante esperada, con un comentario `ENMIENDA QC-227` en el caso. Los archivos se añadieron a
`tasks.md > Archivos esperados` antes de editarlos. Commit `c2b63bfe`.

| Test | Caso | Cambio | Por |
| --- | --- | --- | --- |
| `tests/unit/pedidos-ui/order-columns.test.tsx` | it.each «R29, R32: la celda pinta %s…» | `secondary`/`default`/`secondary` → `warning`/`info`/`success` | R3 |
| `tests/unit/login-skin.test.tsx` | «conserva el radio y el anillo de foco…» | `focus-visible:ring-3` → `ring-1` (campo) y `outline-2` (botón) | R21, R24 |
| `tests/unit/shared-ui/motion-classes.test.tsx` | «R17: destructive y link no llevan velo…» | `hover:bg-destructive/20` → `hover:bg-[color-mix(in_oklch,var(--destructive),var(--foreground)_10%)]` | R20 |

Dentro de la lista cerrada: `button-touch.test.tsx` (T4), `sidebar-ajuste.test.tsx` (T12, P12) y el
alta en `E2E_ESPERADOS` de `guard-identificador-de-request.test.ts` (T12).

### T6 — columnas de cifras y panel de lotes (frontend_dev, commit `363b4203`)

- `tabular: true` exactamente en las columnas de `design.md > 4.2`, en los 12 `*-columns.tsx`.
- `order-ingredients-table.tsx`: `font-mono tabular-nums` en Porcentaje, Stock, Cantidad requerida y Restante.
- `product-batches-panel.tsx`: «Sobre-reservado» como `<Badge variant="destructive">` con el mismo
  testid; los seis `<dd>` en Mono.
- Tests: `tablas-marca.test.tsx` (R11, R13 lista exacta por archivo con el builder real; ingredientes;
  R12 `<dd>`), `badges-estado.test.tsx` (R7).

### T7 — foco en compuestos y rutas, y guardia (frontend_dev, commit `4dd3f5a0`)

- Controles (contorno `outline-2 outline-offset-2 outline-solid outline-ring`): `shared-select`,
  `presentation-select`, `presentation-unit-select`, `responsible-avatars`, `product-field`,
  `execution-trace-columns`, `execution-trace-detail`.
- Campos (`focus-visible:border-ring ring-1 ring-ring`): `date-picker` (`TRIGGER_CLASS`), disparador
  de `data-table-filters`, y `file-field` con `focus-within:`.
- Desviación: en `file-field`, `focus-within:border-ring` va solo en reposo, para no pisar el borde
  rojo de error (R25). Con error o arrastrando, el foco es solo el anillo de 1 px.
- Guardia `tests/guards/guard-anillo-de-foco.test.ts`, con caso negativo.

### Verificación de cierre de la tanda 2 (implementer, árbol limpio)

```
pnpm run typecheck            -> exit 0
pnpm run lint                 -> ✖ 7 problems (0 errors, 7 warnings)  (ajenos)
pnpm exec vitest run guard tests/unit/marca
 Test Files  73 passed (73)
      Tests  1001 passed | 18 skipped (1019)
```

## Tanda 3

### T9 — paridad (commit `211bca44`, solo snapshots)

`pnpm exec vitest run tests/unit/paridad -u`: 347 snapshots actualizados en 17 archivos; 21/21 y
376/376 en verde tras regenerar. Comparación con HEAD quitando `class="…"`:

| Snapshot | Sin `class` |
| --- | --- |
| asignacion-listas, asignacion, buscadores, campos, catalogo, clientes, confirmaciones, formularios, grupos, inventario, pedidos, presentaciones, proveedores, recetas, unidades, usuarios | idénticos |
| login | **diferente**: el `<img>` del logo vertical pierde `loading="lazy"` (2 líneas). Quitando también `loading="lazy"` es idéntico |

Se commitearon los 16 idénticos. `login-paridad.test.tsx.snap` **no se regeneró**: la diferencia es
el efecto buscado de R26, pero la regla de T9 es regenerar solo si no queda diferencia. Queda en rojo
hasta que el leader decida.

Enmiendas de la lista cerrada de `design.md > 9` en T9: ninguna más hizo falta.

### T9 (cierre) — paridad del login (commit `f8c0d3f2`)

Aprobado por el leader. Antes de regenerar se comparó viejo y nuevo quitando `class="…"`: la única
diferencia eran las 2 líneas del `<img>` del logo con `loading="lazy"`; quitando también ese
atributo, idénticos. `vitest run tests/unit/paridad/login-paridad.test.tsx -u`: 2 snapshots
actualizados, 2/2 en verde. Nota de R26 sobre `fetchpriority` en `design.md > 8` (commit `edb40f50`).

### T10 — E2E (commit `f9d03db4`)

**Base aislada.** `quimicloude_e2e_qc227` en el contenedor `quimicloude-pg17`: `CREATE DATABASE`,
`pnpm run db:migrate` y `pnpm run db:seed` con `DATABASE_URL`/`DIRECT_URL` apuntando a ella (el
resto de `../../.env` sin cambiar). Borrada al final. La base compartida no se tocó.

**Casos nuevos** en `e2e/marca-componentes.spec.ts`, bloque «tablas, barra y foco calculados», en
claro y oscuro. Los colores se comparan contra el token resuelto por el mismo navegador (sonda
con `color: var(--token)`), con tolerancia 0.003 por canal.
- Tabla: la lista de **Clientes** con un cliente sembrado, no `/pedidos`. **Desvío de
  `design.md > 11`**: sin filas `DataTable` no pinta la cabecera, y sembrar un pedido arrastra
  receta, producto y presentación. La cabecera es el mismo `TableHeader`/`DataTableHeaderCell`.
- R16 con foco: en Chromium con `Tab`. El WebKit de Playwright no tabula enlaces (ni con `Tab` ni
  con `Alt+Tab`); allí se pulsa una tecla y se enfoca por programa, y se afirma `:focus-visible`.

Medidas (iguales en Chromium y WebKit):

| R | Medida | Claro | Oscuro |
| --- | --- | --- | --- |
| R10 | cabecera: fondo = `--muted`, texto e icono de orden = `--muted-foreground`, contraste | 6.70 | 4.66 |
| R10 | columna fijada por su menú: fondo `--muted`, texto `--muted-foreground`; celda fijada del cuerpo `--background` | ok | ok |
| R11 | celda «Fecha de alta»: `"IBM Plex Mono", …`, `tabular-nums` | ok | ok |
| R13 | celda «Apellidos» y cabecera «Fecha de alta»: `"IBM Plex Sans", …`, `normal` | ok | ok |
| R15 | `nav-dashboard` en reposo: texto e icono = `--sidebar-muted-foreground`, contraste contra `--sidebar` | 7.96 | 7.62 |
| R16 | con hover: `--sidebar-accent-foreground` | ok | ok |
| R16 | **con foco por teclado: `--sidebar-foreground` (lab 94.3), no `--sidebar-accent-foreground` (lab 97.8)** | **rojo** | **rojo** |
| R23 | buscador: borde 1px de `--input`; contra `--card` / `--background` | 3.22 / 3.09 | 3.66 / 4.07 |
| R24 | buscador con `Tab`: borde `--ring`, un anillo `0 0 0 1px` opaco de `--ring`, `outline-style: none` | ok | ok |
| R21 | botón «Limpiar filtro» con `Tab`: `solid` 2px, offset 2px, `--ring` opaco; contra `--card` / `--background` | 7.46 / 7.16 | 8.96 / 9.96 |

**R16 con foco — decisión de comportamiento, para el leader.** El primitivo
(`sidebarMenuButtonVariants`) no fija color en `focus-visible` (solo `focus-visible:ring-2`), y la
regla de T3 excluye `:focus-visible`, así que el ítem enfocado hereda `--sidebar-foreground`. Antes
de QC-227 también era `--sidebar-foreground`: el «como hoy» de R16 no se cumple para el foco. O se
añade `focus-visible` a `--sidebar-accent-foreground` (p. ej. en la regla de `globals.css` o con
`focus-visible:text-sidebar-accent-foreground` en el primitivo), o se enmienda R16 para el foco. El
caso E2E afirma R16 tal como está escrito y queda en rojo; no se cambió código.

**Listas cerradas:** `marca-componentes.spec.ts` entra en `E2E_PERMITIDOS`
(`tests/unit/clientes/scope.test.ts`) y en la lista de E2E que referencian `data-table`
(`tests/unit/shared/data-table-alcance.test.ts`, de 35 a 36). Las dos se añadieron a `tasks.md >
Archivos esperados`. Ya estaba en `E2E_ESPERADOS` desde T12.

**Corrida de los cuatro specs** (`pnpm exec playwright test e2e/marca-componentes.spec.ts
e2e/theme.spec.ts e2e/login-skin.spec.ts e2e/movimiento.spec.ts`, Chromium y WebKit):

```
  4 failed   (R16 con foco: chromium light/dark, webkit light/dark)
  94 passed (1.8m)
```

`theme`, `login-skin` y `movimiento`: 30 de 30 en verde. `marca-componentes`: 64 verdes y los 4 de
R16 con foco.

**Aviso de LCP (R26).** `next dev --port 3118` y un script temporal de Playwright que abre `/login`
y recoge la consola: Chromium y WebKit, `loading` ausente, `fetchpriority` ausente, `<link
rel="preload" as="image" href="/brand/logo-vertical-dark.svg">`, **0 avisos de LCP**. Control
negativo: quitando `preload` del login (revertido al momento), sale `loading="lazy"` y el aviso
«Image with src "/brand/logo-vertical-dark.svg" was detected as the Largest Contentful Paint (LCP)».

### T11 — cierre

```
git diff --diff-filter=A --name-only origin/dev...HEAD -- components app   -> (vacío)  D2 ok
git diff --name-only origin/dev...HEAD -- lib/modules db                   -> (vacío)  D7 ok
git diff origin/dev...HEAD -- package.json                                 -> (vacío)  R28
node scripts/archivos-en-vuelo.mjs --candidata QC-227
  CHOCA con QC-217 (Christian Quevedo): app/(private)/asignacion/components/conditioning-orders-columns.tsx
  CHOCA con QC-223 (Christian Quevedo): app/(private)/pedidos/components/order-columns.tsx,
                                        tests/guards/guard-identificador-de-request.test.ts
  AVISO: QC-96 sin rama publicada; QC-131 sin `## Archivos esperados`
```

Los dos choques son con archivos que ya estaban en «Archivos esperados» del spec aprobado. Los cambios
de QC-227 ahí son de una línea: `tabular: true` en la columna Envases y en Cantidad/Fecha de solicitud,
y una entrada en `E2E_ESPERADOS`. Lo decide el leader.

### Gate de cierre

- `./init.sh` (rápido, con `../../.env`): **rojo** solo en `test:rapido`, con 288 archivos y
  `2 failed | 4380 passed | 1 skipped`. Los dos rojos son `login-paridad.test.tsx` (R1 en reposo y
  R1 R2 enviando), el snapshot que queda sin regenerar.
- `pnpm exec vitest run tests/unit/shared tests/unit/clientes tests/unit/paridad tests/guards`:
  además de `login-paridad`, salía rojo `clientes-convenciones.test.ts` («nadie importa los
  componentes de la ruta por ruta profunda»). La causa era el import de `buildCustomerColumns` por
  ruta profunda en `tests/unit/marca/tablas-marca.test.tsx`. Corregido con el import del barrel,
  que ya lo reexporta. Después, `tablas-marca` y `clientes-convenciones` dan 48 passed y 3 skipped;
  typecheck y eslint en verde.

Otra desviación: `data-table-header-menu.tsx` y `data-table-types.ts` salen con el diff entero porque
su blob en `dev` estaba en CRLF y `.gitattributes` (`* text=auto eol=lf`) lo normaliza a LF al
editarlos. `git diff -w` muestra el cambio real (4 líneas).

## T11 — Mapa R → test consolidado (R1–R39)

E2E = `e2e/marca-componentes.spec.ts` (Chromium y WebKit, claro y oscuro). `marca/` = `tests/unit/marca/`.

| R | Test |
| --- | --- |
| R1 | `marca/badges-estado.test.tsx` > «R1: el Badge ofrece los cinco tonos…», «R1: el foco del badge…» |
| R2 | `marca/contraste-componentes.test.ts` > caso R2 (cuatro pares subtle/text, claro y oscuro) |
| R3 | `marca/badges-estado.test.tsx` > «R3: cada estado de pedido se pinta con su tono»; `tests/unit/pedidos-ui/order-columns.test.tsx` (enmienda) |
| R4 | `marca/badges-estado.test.tsx` > «R4: cada prioridad…» |
| R5 | `marca/badges-estado.test.tsx` > «R5: cada cobertura…» |
| R6 | `marca/badges-estado.test.tsx` > «R6: cada estado de cuenta de usuario…» |
| R7 | `marca/badges-estado.test.tsx` > «R7: «Sobre-reservado» del panel de lotes es un badge de tono error…» |
| R8 | `marca/badges-estado.test.tsx` > dos casos «R8» (lista y formulario de versión) |
| R9 | `marca/badges-estado.test.tsx` > «R9: los badges conservan su texto visible, su data-testid y sus atributos data-*» |
| R10 | `marca/tablas-marca.test.tsx` > «R10: la cabecera…», «R10: la columna fijada…»; `marca/contraste-componentes.test.ts` > R10; E2E > «R10 la cabecera pinta --muted-foreground sobre --muted, tambien la columna fijada, con 4.5:1» |
| R11 | `marca/tablas-marca.test.tsx` > «R11: la celda de cuerpo…», «R11, R13: …» (lista exacta por archivo); E2E > «R11 R13 la celda de fecha va en Plex Mono tabular…» |
| R12 | `marca/tablas-marca.test.tsx` > «R12: lote, cantidades y fechas del panel van en Mono con cifras tabulares, y sus etiquetas no» |
| R13 | `marca/tablas-marca.test.tsx` > «R13: la cabecera de una columna tabular y las celdas sin la marca siguen en Sans»; E2E > «R11 R13 …» |
| R14 | `marca/sidebar-inactivo.test.ts` > caso R14 |
| R15 | `marca/sidebar-inactivo.test.ts` > caso R15; `marca/contraste-componentes.test.ts` > R15 (con paradas del degradado); E2E > «R15 R16 un item inactivo pinta --sidebar-muted-foreground con 4.5:1…» |
| R16 | `marca/sidebar-inactivo.test.ts` > caso R16; E2E > «R15 R16 … con hover» (verde) y «R16 un item inactivo con foco por teclado pinta --sidebar-accent-foreground» (**rojo**, decisión pendiente) |
| R17 | `marca/sidebar-inactivo.test.ts` > caso R17 |
| R18 | `marca/botones-y-campos.test.tsx` > «R18 — el primario…»; `marca/contraste-componentes.test.ts` > R18 |
| R19 | `marca/botones-y-campos.test.tsx` > «R19 — el secundario (outline)…», «R19 — la variante secondary…»; `marca/contraste-componentes.test.ts` > R19 |
| R20 | `marca/botones-y-campos.test.tsx` > tres casos «R20»; `marca/contraste-componentes.test.ts` > R20 (reposo y hover); `tests/unit/shared-ui/motion-classes.test.tsx` (enmienda) |
| R21 | `marca/botones-y-campos.test.tsx` > «R21 — el boton %s…», casilla, pestaña, día, limpiar; `marca/contraste-componentes.test.ts` > R21; E2E > «R21 R23 R24 con el teclado…» |
| R22 | `tests/guards/guard-anillo-de-foco.test.ts` (con caso negativo); `marca/sidebar-inactivo.test.ts` > «R22 la base pinta el contorno con outline-ring opaco» |
| R23 | `marca/contraste-componentes.test.ts` > R23; `marca/botones-y-campos.test.tsx` > «R24 — el campo %s pinta el borde de --input…»; E2E > «R21 R23 R24 …» |
| R24 | `marca/botones-y-campos.test.tsx` > «R24 — el campo %s…», «R24 — el primitivo %s no deja ningun anillo translucido…»; E2E > «R21 R23 R24 …» |
| R25 | `marca/botones-y-campos.test.tsx` > «R25 — un boton aria-invalid…», «R25 — el campo %s marcado aria-invalid…» |
| R26 | `tests/unit/brand/brand-logo.test.tsx` > «R26: el login pide el logo vertical por precarga y sin carga diferida», «R26: los usos de la barra lateral y del encabezado privado siguen en carga diferida y sin precarga»; aviso de LCP ausente en `next dev` (T10, con control negativo) |
| R27 | `tests/unit/theme/color-tokens.test.ts`, verde sin editar tablas |
| R28 | `tests/unit/theme/sin-dependencias-nuevas.test.ts`, `tests/guards/guard-dependencias-aprobadas.test.ts`; `git diff origin/dev...HEAD -- package.json` vacío |
| R29 | `tests/unit/paridad/*` (21 archivos), regenerados solo con diferencias de `class` (y `loading="lazy"` del logo por R26) |
| R30 | `tests/guards/guard-movimiento.test.ts`, verde sin editar; `e2e/movimiento.spec.ts` verde |
| R31 | E2E > «R31 la marca y cada boton de primer nivel son cuadrados de 44 px…»; `marca/sidebar-carril.test.ts` > R31, «R31 R35» |
| R32 | E2E > «R32 el icono de cada boton … y el avatar del pie estan centrados…» |
| R33 | E2E > «R33 el indicador del item activo tiene la caja del boton activo…» |
| R34 | E2E > «R34 el fondo de hover de un boton inactivo cae dentro de su caja centrada» |
| R35 | E2E > «R35 el isotipo mide 32 px…»; `marca/sidebar-carril.test.ts` > «R31 R35» |
| R36 | E2E > «R36 expandida…»; `marca/sidebar-carril.test.ts` > R36; `sidebar-ajuste`, `sidebar-desktop`, `app-sidebar`, `theme/ui-primitivas-intactas` |
| R37 | `marca/sidebar-carril.test.ts` > R37 |
| R38 | E2E > «R38 la pastilla del borde muestra su icono…» (×2 estados), «R38 el control del encabezado…»; `marca/sidebar-carril.test.ts` > R38 |
| R39 | E2E > «R39 la pastilla pinta abrir…» (×2), «R39 el control del encabezado…»; `marca/sidebar-carril.test.ts` > R39 ×3 |

### Gate de cierre (2026-10-10)

```
./init.sh (con ../../.env)                      -> == init OK ==  exit 0
  typecheck paso · lint paso (0 errores, 7 warnings ajenos)
  test:rapido related: Test Files 290 passed (290) · Tests 4428 passed | 3 skipped
  gate.siempre:        Test Files 105 passed (105) · Tests 1461 passed | 35 skipped
pnpm exec vitest run tests/unit/shared tests/unit/clientes tests/unit/paridad tests/guards
  Test Files 151 passed (151) · Tests 2036 passed | 19 skipped (2055)
node scripts/archivos-en-vuelo.mjs --candidata QC-227
  CHOCA con QC-217 (Christian Quevedo): app/(private)/asignacion/components/conditioning-orders-columns.tsx
  CHOCA con QC-223 (Christian Quevedo): app/(private)/pedidos/components/order-columns.tsx, tests/guards/guard-identificador-de-request.test.ts
  AVISO: QC-96 sin rama publicada; QC-131 sin `## Archivos esperados`
```

Los CHOCA son los mismos de antes (los gestiona el leader); las dos listas nuevas de T10 no añaden choques.

Veredicto: T9–T11 hechas y gate local verde; E2E 94/98 verdes en Chromium y WebKit, con R16 en foco en rojo (pinta `--sidebar-foreground`), que queda para que decida el leader.

## R16 con foco — decisión humana 2026-10-10 (igualado al hover)

- `app/globals.css`: regla sin capa tras la del inactivo (T3),
  `[data-slot='sidebar-content'] :is(menu-button, menu-sub-button):not([data-active]):focus-visible { color: var(--sidebar-accent-foreground); }`.
  No hizo falta tocar el primitivo.
- `tests/unit/marca/sidebar-inactivo.test.ts`: caso nuevo «R16 con foco de teclado el inactivo toma el color del hover…».
- Anotada en `requirements.md` (nota de aprobación 2026-10-10) y en `progress/features/QC-227.md > Decisiones`.
- Mapa: R16 → `marca/sidebar-inactivo.test.ts` (R16 ×2) y E2E «R15 R16 … con hover» y «R16 un item inactivo con foco por teclado…», ahora en verde.

Verificación (base aislada `quimicloude_e2e_qc227`, creada, migrada, sembrada y borrada):

```
playwright marca-componentes (chromium+webkit)          -> 68 passed (1.6m)
  R16 foco: lab(97.766 …) = --sidebar-accent-foreground, focus-visible=true, en los 4 casos
playwright theme + login-skin + movimiento               -> 30 passed (42.8s)
./init.sh -> == init OK ==; typecheck y lint pasan (0 errores); related 290 archivos, 4429 passed | 3 skipped; siempre 105 archivos, 1461 passed | 35 skipped
```

Batería `vitest run tests/unit/shared tests/unit/clientes tests/unit/paridad tests/guards`: 151 archivos, 2036 passed | 19 skipped; ningún snapshot de paridad cambió.

Veredicto: R16 con foco igualado al hover; E2E 98/98 en Chromium y WebKit y gate local verde.

## Vuelta 2 — correcciones del review (B1, B2, B3)

**B1.** Las dos reglas del inactivo en `app/globals.css` seleccionan ahora por
`:is([data-sidebar='menu-button'], [data-sidebar='menu-sub-button'])`. Medido en el navegador:
`nav-produccion` lleva `data-slot="collapsible-trigger"` (expandida) y `"dropdown-menu-trigger"`
(modo icono), y conserva `data-sidebar="menu-button"`. Las exclusiones (`[data-active]`, `:hover`,
`:focus-visible`) y el ámbito `sidebar-content` no cambian.
- Unitario nuevo `tests/unit/marca/sidebar-grupos.test.tsx`: monta `AppSidebar` con
  `PRIVATE_NAV_ITEMS`, expandida y en modo icono, y comprueba con el selector **leído de
  `globals.css`** que cada disparador de grupo y cada enlace casan con las dos reglas, y que la
  marca y el pie no. Control negativo: con el selector viejo (`data-slot`) caen los 2 casos de grupos.
- `tests/unit/marca/sidebar-inactivo.test.ts`: constantes de selector actualizadas.
- E2E nuevo «R15 R16 un item con submenu…» (expandida y modo icono × claro y oscuro × Chromium y
  WebKit, 8 casos): `nav-produccion` en reposo = `--sidebar-muted-foreground` (7.96 claro, 7.62
  oscuro contra `--sidebar`), con foco por `Tab` = `--sidebar-accent-foreground` y `:focus-visible`.

**B2.** El comentario de la regla de foco ya no cita requisito ni decisión.

**B3.** T0, T9, T10 y T11 marcadas en `tasks.md`; T11 con nota: el «sin CHOCA» lo gestiona el
leader. `sidebar-grupos.test.tsx` añadido a «Archivos esperados».

Mapa: R15 y R16 suman `marca/sidebar-grupos.test.tsx` (casos «R15 R16 … disparador de grupo» y
«… enlaces») y el E2E «R15 R16 un item con submenu…»; R17 suma «R17 … la marca y el pie no casan».

Verificación (base aislada `quimicloude_e2e_qc227`, creada, migrada, sembrada y borrada):

```
playwright marca-componentes + theme + login-skin + movimiento (chromium+webkit) -> 106 passed (1.7m)
./init.sh -> == init OK ==; lint 0 errores; related 291 archivos, 4436 passed | 3 skipped; siempre 105, 1461 passed | 35 skipped
vitest run tests/unit/shared tests/unit/clientes tests/unit/paridad tests/guards -> 151 archivos, 2036 passed | 19 skipped
```

Observación (fuera de B1): `CONTENT_BUTTONS` de los bloques R31–R36 del E2E sigue seleccionando por
`data-slot`, así que la medida del carril colapsado no incluye los disparadores de grupo.

## Vuelta 2b — carril medido con los disparadores de grupo

- `e2e/marca-componentes.spec.ts`: `CONTENT_BUTTONS` pasa a `[data-slot="sidebar-content"] [data-sidebar="menu-button"]`,
  así que R31–R36 miden también `nav-produccion` y `nav-integraciones`.
- **Modo icono:** los dos grupos ya estaban bien. Botón de 44 × 44 centrado en el eje (desvío 0) e
  icono centrado (desvío 0), en los dos navegadores y modos. No hubo nada que corregir.
- **Expandida (R36): rojo encontrado.** Los dos grupos medían 220 × **32**, frente a 44 de los
  enlaces. La regla `[data-slot='sidebar-menu-button'] { min-height: 44px }` no los alcanzaba, por
  la misma causa que B1. Corrección en `app/globals.css`, con una regla nueva
  `[data-sidebar='menu-button']:not([data-slot='sidebar-menu-button']) { min-height: 44px }`.
  La original se conserva tal cual: la congelan `theme/sidebar-panel.test.tsx` y `login-skin.test.tsx`,
  que siguen verdes sin editar. Después de la corrección, los 11 miden 220 × 44.
- `tests/unit/marca/sidebar-grupos.test.tsx`: caso «R36 … la regla del alto tactil de 44 px alcanza a
  cada disparador de grupo» (expandida y modo icono). Control negativo: sin la regla nueva caen los
  dos casos.

```
playwright marca-componentes + theme + login-skin + movimiento (chromium+webkit) -> 106 passed (1.8m)
  (base aislada quimicloude_e2e_qc227: creada, migrada, sembrada y borrada)
./init.sh -> == init OK ==; lint 0 errores; related 291 archivos, 4438 passed | 3 skipped; siempre 105, 1461 passed | 35 skipped
```
