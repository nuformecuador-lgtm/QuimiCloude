# QC-39 — pantalla-de-unidades · bitácora de implementación

> Worktree: `.worktrees/QC-39-pantalla-de-unidades`, rama `feature/QC-39-pantalla-de-unidades`,
> base `origin/dev` en `516e9c0`. Spec: `specs/QC-39-pantalla-de-unidades/`.

## T0 — Inventario de lo heredado (verificado en el worktree, no supuesto)

Comprobado con `ls`/`test -f` sobre el worktree antes de escribir una línea de código:

| Pieza heredada | Evidencia en el worktree |
| --- | --- |
| Layout privado con `<main>` y `<Toaster />` | `app/(private)/layout.tsx` |
| `AppSidebar`, `PRIVATE_NAV_ITEMS` con la sección Configuración ya creada, `filterNavItemsByPermissions` | `lib/shared/navigation/private-nav.ts` |
| `requirePagePermission` | `lib/shared/auth/require-page-permission.ts` |
| Tabla compartida con `cell: (row) => ReactNode` | `components/shared/data-table/index.ts` |
| Primitivas shadcn/ui | `components/ui/`: `table`, `sheet`, `alert-dialog`, `select`, `input`, `label`, `button`, `sonner`, `skeleton` — **todas presentes, ningún `shadcn add`** |
| Las tres Server Actions de escritura + `listUnitsAction` | `lib/modules/unidades/adapters/driving/unit-actions.ts` |
| `UNIT_QUERYABLE`, `isUnitPage` | `lib/modules/unidades/domain/unit-queryable.ts`, `lib/modules/unidades/index.ts` |
| Helper de viewport | `tests/helpers/viewport.ts` |
| Playwright | `playwright.config.ts`, `e2e/` |
| Pantalla hermana de referencia (QC-45) | `app/(private)/configuracion/presentaciones/**`, `tests/unit/configuracion-ui/**` |

### Archivos de `lib/modules/unidades/` que esta ficha PUEDE tocar (los seis de `design.md > 1`)

1. `domain/unit-view.ts` — **NUEVO**
2. `domain/list-units.ts` — solo tipos de retorno
3. `ports/unit-repository.ts` — solo tipos de retorno
4. `adapters/driven/persistence/unit-prisma.ts` — `UNIT_SELECT` + `toUnitView`
5. `index.ts` — publica `type UnitView`
6. `adapters/driving/unit-actions.ts` — `listUnitsAction` acepta la consulta

### Archivos que esta ficha NO toca (y que un test de intactitud vigila)

`unit-catalog-prisma.ts`, `create-unit.ts`, `update-unit.ts`, `delete-unit.ts`, `unit-input.ts`,
`errors.ts`, `actor.ts`, `unit-queryable.ts`, `convert-quantity.ts`, `db/schema.prisma`,
`components/shared/data-table/**`, `components/ui/**`, `app/(private)/layout.tsx`, `AppSidebar`,
`app/(private)/produccion/**`, `app/(private)/proveedores/**`.

**Estado al cerrar T0:** ninguno de esos archivos creado ni modificado.

## Bloqueos y desvíos (se anotan aquí, no se improvisan)

- **`tests/helpers/user-event.ts` NO existe en este worktree.** El leader exige usar `setupUser()`
  de ese helper en todo test de interfaz (QC-58 lo está introduciendo en `dev`) y prohíbe
  improvisarlo o copiarlo. Consecuencia: **la implementación se detiene antes del primer test de
  UI**; T1 y T2 (contrato de lectura, sin DOM interactivo) sí se ejecutan.
- **La tarea de tensar `tests/unit/app-sidebar.test.tsx` y `tests/unit/navegacion/private-layout-menu.test.tsx`
  (T4, cuarto bullet) queda DIFERIDA al final por orden del leader**: esos dos archivos son
  intersección con QC-58, que sigue `in_progress`. R9 y R10 quedan cubiertos entretanto por
  `tests/unit/configuracion-ui/private-nav-unidades.test.ts`, que es archivo nuevo.
- **Ordenación forzada por las guardias:** `guard-rutas-privadas-cubiertas` exige la
  correspondencia en **los dos sentidos** («ningun prefijo puede sobrar»). Por tanto la entrada de
  `UNITS_ROUTE` en `PRIVATE_ROUTE_PREFIXES` (T3) y `page.tsx` (T8) tienen que aterrizar en la
  **misma tanda**; no pueden separarse sin dejar el gate en rojo a mitad.

## Tanda 1 — Bloque 1: el contrato de lectura (T1, T2)

Delegada en `backend_dev`. Commits: `16edbab` (T1), `ce75b2e` (T2).

### Archivos de producto tocados (los seis autorizados, ni uno más)

- `lib/modules/unidades/domain/unit-view.ts` — **NUEVO**: `UnitView = UnitRef & { baseUnitId, factor: string | null, isSystem }`
- `lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts` — `UNIT_SELECT` + `toUnitView`
- `lib/modules/unidades/ports/unit-repository.ts` — solo tipos de retorno
- `lib/modules/unidades/domain/list-units.ts` — solo tipos de retorno
- `lib/modules/unidades/index.ts` — publica `type UnitView`
- `lib/modules/unidades/adapters/driving/unit-actions.ts` — `listUnitsAction` sobrecargada

**Las sobrecargas de `design.md > 3` compilan: NO hizo falta el plan B** (`listUnitsPageAction`).

### Tests nuevos

- `tests/unit/unidades/unit-view-projection.test.ts` (R1, R2)
- `tests/unit/unidades/modulo-intacto.test.ts` (R3, R6, R47)
- `tests/unit/unidades/list-units-action.test.ts` (R5)
- `tests/unit/unidades/consumidores-catalogo.test.tsx` (R4)

### Tests heredados tocados, y por qué

Solo **ensanche de fixtures** por el cambio de tipo `UnitRef` → `UnitView`; **ningún aserto se
relajó** y ninguno cambió de exigencia: `tests/unit/unidades/list-units.test.ts`,
`list-units-query.test.ts`, `tests/unit/recetas-ui/recipe-form.test.tsx`,
`tests/unit/pedidos-ui/pedidos-viewport.test.tsx`, `tests/unit/proveedores-ui/{catalog-line-sheet,
delete-catalog-line-dialog,supplier-detail-page}.test.tsx`.
`tests/unit/unidades/module-contract.test.ts` se **tensó**: deduplica el barrido de funciones
exportadas para que las sobrecargas no cuenten tres veces; el conjunto exacto de cuatro actions
sigue siendo el mismo aserto.
**Ningún archivo de `app/` fue tocado** (R4 se cumple por tipos, no por edición).

### Verificación de la tanda (corrida por el implementer, en el worktree)

Antes hubo que **preparar el worktree**, que venía sin dependencias instaladas: `pnpm install
--frozen-lockfile` y `pnpm exec prisma generate` (el `postinstall` de Prisma queda como *ignored
build script* en un worktree recién montado, y sin el cliente generado `pnpm typecheck` sale rojo
con ~20 `TS2305: '@prisma/client' has no exported member 'Prisma'` que **no son de esta feature**).

```
$ pnpm typecheck
> tsc --noEmit
(sin salida — verde)

$ pnpm lint
> eslint
(sin salida — verde)

$ pnpm exec vitest run tests/unit/unidades tests/unit/recetas-ui tests/unit/proveedores-ui tests/unit/pedidos-ui
 Test Files  59 passed (59)
      Tests  779 passed | 7 skipped (786)
   Duration  82.31s
```

El gate (`./init.sh --rapido`) lo corre el leader; el implementer no se autoaprueba.

## Estado al cerrar la tanda 1

- **Hechas:** T0, T1, T2.
- **Pendientes:** T3 a T15.
- **Parada obligada:** falta `tests/helpers/user-event.ts` (ver «Bloqueos y desvíos»). El Bloque 2
  en adelante es todo pantalla, y su primer test de UI no se puede escribir sin el helper.

### Apuntes de la tanda 1 que no estaban en el spec

- **Nombres del tipo de salida.** `design.md > 5.1` habla de `UnitCatalogResult`; se **conserva
  `UnitListResult`**, que es el nombre que ya importan seis tests y que R4 protege, y se **añade
  `UnitPageResult`** para la rama paginada. Es un cambio de nomenclatura del diseño, no de
  contrato.
- **Sin `as`:** las dos ramas de salida de `listUnitsAction` se separan con `isUnitPage(data)`, no
  con una aserción de tipo.
- **La contingencia de las sobrecargas queda DESCARTADA con evidencia.** El `backend_dev` no pudo
  correr el build (el worktree venía sin dependencias). Tras instalarlas, el implementer corrió
  `pnpm exec next build` en el worktree: `✓ Compiled successfully in 44s`, `Finished TypeScript in
  24.8s`, doce rutas generadas. **El compilador de Server Actions acepta las declaraciones de
  sobrecarga en un módulo `'use server'`**, así que el plan B de `design.md > 3`
  (`listUnitsPageAction`) no se aplica y no hace falta anotarlo como desvío.
- **Rojo heredado a tener en cuenta para la tarea diferida:**
  `tests/unit/navegacion/private-layout-menu.test.tsx` ya está inscrito en
  `tests/baseline-rojos.json` como deuda determinista de `dev` (`private-user-trigger`). Es uno de
  los dos archivos que QC-58 está tocando y cuya tensión de anclas quedó diferida al final.
- **Los `tests/integration/**` no corren en este worktree**: no hay `.env` ni `DATABASE_URL`
  (`PrismaClientInitializationError`). No es un rojo de esta feature.

## Tanda 2 — Ruta, menú, piezas puras, columnas y pantalla (T3, T4, T5, T6, T7, T8)

Delegada en `frontend_dev` en cuatro turnos encadenados. Commits: `4180675`, `781928d`, `d26d3fe`,
`ee5fd6b` (T5, T6) · `0a5759d`, `99489cb`, `54d0365`, `a3924f9` (T7, T8) · `8064c9a`, `68022fe`
(T3, T4) · `82b04c9`, `f7d1efc`, `9f5bb2e`, `714e63d` (correcciones).

### Archivos nuevos de la pantalla

`app/(private)/configuracion/unidades/page.tsx` y, bajo `components/`: `index.ts`, `unit-labels.ts`,
`unit-list-params.ts`, `unit-equivalence.ts`, `unit-columns.tsx`, `unit-row-actions.tsx`,
`unit-table.tsx`, `unit-sheet.tsx`, `unit-form.tsx`, `delete-unit-dialog.tsx`,
`unit-list-section.tsx`, `unit-list-skeleton.tsx`, `unit-list-empty.tsx`, `unit-list-error.tsx`.

### Archivos ajenos tocados (contra la lista cerrada de `design.md > 1`)

- `lib/shared/routes.ts` — `UNITS_ROUTE` + su entrada en `PRIVATE_ROUTE_PREFIXES` (R8, R13). **Autorizado.**
- `lib/shared/navigation/private-nav.ts` — `UNITS_LABEL` + el ítem de Unidades (R9, R10). **Autorizado.**
- Ningún otro. `components/shared/data-table/**`, `components/ui/**`, `app/(private)/layout.tsx`,
  `AppSidebar` y `db/**` siguen intactos, y hay tests que lo afirman.

### Tests nuevos

`configuracion-ui/unit-list-params.test.ts`, `unit-equivalence.test.ts`, `unit-columns.test.tsx`,
`data-table-intacta-unidades.test.ts`, `unit-page.test.tsx`, `units-route-contract.test.ts`,
`private-nav-unidades.test.ts`, `permisos-unidades-coherentes.test.ts`.

### Anclas heredadas TENSADAS (nunca relajadas, R47)

1. `tests/guards/guard-pantallas-exigen-permiso.test.ts` — `RUTAS_ESPERADAS_HOY` de 9 a **10** rutas.
2. `tests/guards/guard-nav-permisos-declarados.test.ts` — de 6 a **7** enlaces, con `nav-unidades`.
3. `tests/unit/configuracion-ui/private-nav-configuracion.test.ts` — la sección Configuración pasa de
   1 ítem a **2**, conservando que la sección es UNA y que presentaciones sigue primero.
4. `tests/unit/unidades/unidades-convenciones.test.ts` — el ancla de QC-38 «ninguna ficha de unidades
   abre flujo navegable» **queda relevada por QC-39, que es justo la ficha que lo abre**. No se borra:
   pasa a exigir que haya **exactamente un** ítem de unidades, a `UNITS_ROUTE` importada, con
   `unidades.consultar` y en Configuración, **más** un caso nuevo que afirma que
   `lib/modules/unidades/**` sigue sin declarar navegación por su cuenta. Es más exigente que antes.

### Un centinela ajeno arreglado, no silenciado

`tests/unit/navegacion/qc75-convenciones.test.ts` se autolimitaba a «la rama de QC-75» detectándola
por `lib/shared/navigation/private-nav.ts`, **que toca toda ficha que añade un ítem de menú**. Con el
ítem de Unidades puesto, el centinela creía que ésta era la rama de QC-75 y denunciaba como
«backend intocable» los dos archivos de dominio que R1–R6 autorizan expresamente. Es el **segundo**
episodio de la misma clase —el primero lo sufrió QC-38 y está documentado en el propio archivo—.
Se endureció la **precondición** (ahora exige también algún archivo de
`specs/QC-75-menu-y-rutas-por-permiso/` en el rango, que solo aparece en los tres commits de esa
rama); **ningún aserto se tocó** y en la rama real de QC-75 el centinela aplica exactamente igual.

### Correcciones de conformidad detectadas por el implementer

- **R34.** `buildUnitFormData` enviaba `factor` como cadena vacía cuando el usuario declaraba
  derivación y dejaba el factor en blanco. R34 es tajante —«NUNCA una cadena vacía en esas tres
  claves»—, así que ahora la clave **no viaja** y la pareja incompleta la rechaza el dominio con su
  código, que es lo que R36 quiere. Corregido en `f7d1efc`.

### Decisiones tomadas que no estaban en el spec

1. **`createUnitColumns(baseIndex, baseUnits)`** en vez de una constante suelta: `DataTableColumn.cell`
   recibe solo la fila y la equivalencia necesita el índice de bases. El cierre resuelve el problema
   **sin añadir ninguna prop a la tabla compartida** (R31). Se exporta `UNIT_COLUMNS` para que el test
   recorra la declaración.
2. **Icono del ítem: `flask-conical`.** `NavIconName` es cerrado y no se puede ampliar sin tocar el
   mecanismo de QC-75 (R9). De los nombres disponibles, un matraz es lo más cercano a un instrumento
   de medida. Cambiarlo es una línea.
3. **`unitLabel` trata un símbolo en blanco como ausente** y cae al nombre: el diseño solo contempla
   `null`, pero `'   '` produciría la frase rota `1  = 1000 gr`.
4. **`formatUnitEquivalence` devuelve el marcador neutro** también si llega `baseUnitId` sin `factor`
   o al revés. El dominio garantiza que van juntos; esta capa presenta lo que recibe y no rompe la
   fila si la invariante se violara.
5. **El estado vacío no monta ningún disparador de alta**, ni siquiera genérico, para cumplir R24 al
   pie de la letra. El alta vive sobre la tabla.
6. **`UNITS_LABEL` vive en `private-nav.ts`** y `components/unit-labels.ts` es un re-export de una
   línea: un solo literal en todo el repo.

### Verificación de la tanda (corrida por el implementer, en el worktree)

```
$ pnpm typecheck
> tsc --noEmit
(sin salida — verde)

$ pnpm lint
> eslint
(sin salida — verde)

$ pnpm exec vitest run tests/unit/configuracion-ui tests/guards tests/unit/unidades \
    tests/unit/navegacion tests/unit/app-sidebar.test.tsx
 Test Files  2 failed | 66 passed (68)
      Tests  4 failed | 839 passed | 2 skipped (845)
```

**Los cuatro rojos, uno por uno, y ninguno es una regresión:**

| Rojo | Qué es |
| --- | --- |
| `private-layout-menu.test.tsx` — «con solo `inventario.consultar`, el control de cerrar sesión sigue presente» | **Deuda ajena inscrita en `tests/baseline-rojos.json`** desde 2026-09-08 (`getByTestId(userTrigger)`). No es de QC-39 |
| `private-layout-menu.test.tsx` — «sin ningún permiso, el menú queda sin ítems…» | **La misma deuda de baseline**, segundo caso |
| `private-layout-menu.test.tsx` — «ancla: el menú real tiene los seis ítems…» | **La tensión 6→7 DIFERIDA por orden del leader**: archivo intersección con QC-58 |
| `app-sidebar.test.tsx` — «`PRIVATE_NAV_ITEMS` tiene exactamente seis entradas…» | **La misma tensión 6→7 diferida**, en el segundo archivo intersección con QC-58 |

## Estado al cerrar la tanda 2

- **Hechas:** T0, T1, T2, T3, T4 (salvo su cuarto bullet, diferido), T5, T6, T7, T8, **más el código
  de producción de T9, T10, T11 y T12** —sin él, `page.tsx` no compila: la sección monta la tabla y
  las acciones de fila montan el panel y el diálogo—.
- **Pendientes por el bloqueo del helper:** los **tests** de T9 (`unit-table.test.tsx`), T10
  (`unit-sheet.test.tsx`), T11 (`delete-unit-dialog.test.tsx`), T12
  (`unidades-convenciones.test.ts` de la ruta) y T13 (`unidades-viewport.test.tsx`).
- **Pendientes sin bloqueo:** T14 (E2E, Playwright no usa `user-event`) y T15 (cierre).
- **Diferido hasta que QC-58 esté `done`:** el cuarto bullet de T4.

## Nota explícita para el reviewer — R34 sin cobertura, y por qué

**La corrección de que `factor` no viaje como cadena vacía está sin cobertura hasta que exista el
test de T10** (`tests/unit/configuracion-ui/unit-sheet.test.tsx`), que es el que ancla R34 espiando
el `FormData` enviado. No es un descuido: el test de T10 exige simular interacción de usuario y está
**bloqueado a la espera de `setupUser()`** (`tests/helpers/user-event.ts`, que sale de QC-58 y aún
no está en `dev`). El código de producción ya cumple R34; lo que falta es el ancla que impida que
alguien lo desande.
