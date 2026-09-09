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

## Tanda 3 — Listas cerradas heredadas y E2E (T14)

Commits: `a7e4ab5` (dos listas cerradas), `8df4083` (E2E + tercera lista), `0ed6a1f` (relevo del
ancla de E2E de QC-38).

### Tres listas cerradas heredadas, ampliadas TENSÁNDOLAS (R47)

1. `tests/unit/shared/data-table-alcance.test.ts` — **consumidores** de la tabla compartida (R34 de
   QC-55): la pantalla de unidades entra como **quinta**, con la carpeta **derivada de `UNITS_ROUTE`
   importada** y no de un literal. Tensado: el caso pasa de «cuatro» a «cinco», el mensaje de fallo
   dice ahora que migrar una **sexta** es una decisión, y el ancla anti-falso-verde sube de
   `toBeGreaterThan(3)` a `toBeGreaterThan(4)`. El caso «recetas sigue SIN consumirlo» intacto.
2. `tests/unit/recetas-ui/recipe-route-contract.test.ts` — **exports de `lib/shared/routes.ts`**
   (QC-64 R12): entra `UNITS_ROUTE` en su posición del `.sort()`. La garantía que el caso protege
   —el asistente de lectura de QC-64 sigue sin ruta propia— no se toca: el patrón se sigue aplicando
   a todas las declaraciones y la comparación sigue siendo de igualdad exacta.
3. `tests/unit/shared/data-table-alcance.test.ts` — **specs de E2E que referencian `data-table`**
   (R36): entra `e2e/unidades.spec.ts` como quinto, **en el mismo commit que crea el archivo**, para
   que la lista no apunte ni un minuto a algo inexistente.

### Un segundo ancla de QC-38 relevada

`tests/unit/unidades/unidades-convenciones.test.ts` afirmaba «`e2e/` no gana ningún `.spec.ts` nuevo
respecto de `origin/dev`». Lo escribió QC-38 al **diferir el E2E apuntando a QC-39**, que es esta
ficha. No se borra: el `toEqual([])` pasa a `toEqual(['e2e/unidades.spec.ts'])` —cero lo pone rojo y
dos también—, **más** un caso nuevo que exige que ese spec derive la URL de `UNITS_ROUTE` y declare
los **dos** casos que R50 pide, **más** su caso negativo. Es más exigente que antes.

### T14 — `e2e/unidades.spec.ts` (489 líneas)

**Recorrido 1 (R50):** login como Administrador con aterrizaje explícito → `page.goto` con la URL
derivada de `UNITS_ROUTE` y `q` acotada al prefijo del worker → alta en el panel lateral de una
unidad **derivada de una base existente** → verificación **en Postgres** (`baseUnitId`, factor por
`Decimal.equals`, `symbol` **nulo**) → la fila en la lista y su **equivalencia armada**
(`1 <derivada> = 1000 <base>`) leída de `data-table-cell-equivalence`.

**Recorrido 2 (R12):** login como Operador → `page.goto(UNITS_ROUTE)` → `status() === 404` →
`private-not-found` visible → `toHaveCount(0)` sobre el título, la tabla, la lista, el vacío y el
disparador de alta.

**Decisiones del E2E que no estaban en el spec:**
- **La unidad base se siembra por Prisma, no por la interfaz.** El estado vacío de esta pantalla no
  ofrece «crear la primera» (R24), así que con la búsqueda puesta y cero filas no habría disparador
  de alta. Sembrarla deja una fila —y con ella el disparador— y hace que el recorrido pruebe lo que
  R50 nombra: derivada **de una base existente**.
- **El `RUN_ID` va ANTES del sufijo** (`qc39_e2e_<RUN_ID>_base` / `_derivada`): la búsqueda va contra
  `nameNormalized` y la normalización elimina los `_`, así que el término normaliza a
  `qc39e2e<RUNID>` y es prefijo de ambos. Con el sufijo en medio no casaría.
- **Ninguna de las dos unidades declara símbolo**: `symbol` admite 10 caracteres y no cabe el
  `RUN_ID`. Sin símbolo, la frase se compone con los nombres, que sí son únicos por worker — y de
  paso ejercita el degradado de `unitLabel`.
- **Limpieza** con helper que tolera el rechazo: en `beforeAll` barre huérfanas de más de una hora y
  en `afterAll` las de este worker, **siempre derivadas primero**, cada paso en su `finally`.
- **Cobertura lateral de R34:** el recorrido 1 afirma en base de datos que
  `symbol === null` —«un símbolo no declarado no debe guardarse como cadena vacía»—. No sustituye al
  test de T10, pero cubre el mismo riesgo por el otro extremo.

**Riesgo señalado para quien ejecute Playwright:** el clic sobre el trigger del `Select` y su opción
en el portal. `e2e/permisos.spec.ts` documenta que en **WebKit** el overlay de `next dev`
(`<nextjs-portal>`) llegó a interceptar punteros. Si sale un timeout de actionability ahí, la salida
correcta es **teclado** (`focus()` + flechas + `Enter`), **nunca `{ force: true }`**.

### Reparto de la ejecución del E2E

El spec lo **escribió** un subagente, que tenía **prohibido** ejecutarlo: el intento anterior de esta
misma tarea murió por watchdog de stream a los 600 s, que es la causa que documenta
`AGENTS.md > Regla del gate`. **Playwright lo corrió el leader**, en Chromium y WebKit. La salida
real está más abajo, en «T14 — la corrida de Playwright».

### Verificación de la tanda (corrida por el implementer, en el worktree)

```
$ pnpm typecheck
> tsc --noEmit
(sin salida — verde)

$ pnpm lint
> eslint
(sin salida — verde)

$ pnpm exec vitest run tests/unit/shared tests/unit/recetas-ui tests/unit/configuracion-ui \
    tests/guards tests/unit/unidades tests/unit/navegacion tests/unit/app-sidebar.test.tsx
 Test Files  2 failed | 88 passed (90)
      Tests  4 failed | 1145 passed | 2 skipped (1151)
```

Los **cuatro** rojos son los mismos de la tanda 2 y ninguno es regresión: los **dos de baseline** de
`private-layout-menu` (el `userTrigger`) y las **dos anclas 6→7 DIFERIDAS** por orden del leader
(`private-layout-menu` y `app-sidebar`, intersección con QC-58).

## T14 — la corrida de Playwright (ejecutada por el leader)

**Verde en los dos navegadores. El criterio de hecho de T14 queda cumplido.**

```
$ set -a && . ./.env && set +a && pnpm exec playwright test e2e/unidades.spec.ts \
    --project=chromium --project=webkit

Running 4 tests using 4 workers
  ✓  4 [chromium] › unidades.spec.ts:459:7 › una sesion valida sin los permisos de unidades
        recibe 404 dentro del layout privado y no ve la tabla (R12) (10.5s)
  ✓  2 [webkit]   › unidades.spec.ts:459:7 › (R12) (12.1s)
  ✓  1 [chromium] › unidades.spec.ts:363:7 › el Administrador entra por la URL, da de alta una
        unidad derivada y la ve en la lista con su equivalencia armada (R50) (12.7s)
  ✓  3 [webkit]   › unidades.spec.ts:363:7 › (R50) (15.1s)

  4 passed (23.0s)
```

**El riesgo del `Select` en WebKit NO se materializó.** Se anticipó que el overlay de `next dev`
(`<nextjs-portal>`) pudiera interceptar punteros, como documenta `e2e/permisos.spec.ts`; pasó sin
tocar nada, así que **no** hizo falta la salida por teclado. Queda anotado por si reaparece: la
solución correcta sería `focus()` + flechas + `Enter`, **nunca `{ force: true }`**.

### La primera corrida fue roja, y no era de esta ficha

`2 passed, 2 failed`: los dos recorridos del Administrador caían igual en ambos navegadores, con
`getByTestId('unidades-title')` no encontrado. El snapshot de Playwright resolvió el caso: la página
había pintado el **404 del layout privado** a un usuario **Administrador** que sí veía el enlace de
Unidades en el menú.

**Causa, medida contra la base y no supuesta:** el catálogo de permisos de la base tenía **10 filas
y `unidades.modificar` no estaba**. QC-38 lo crea y lo siembra al Administrador —el catálogo debe
tener once—, pero **la base compartida no se había vuelto a sembrar desde que QC-38 se mergeó**. El
leader corrió `pnpm run db:seed`, idempotente desde QC-6, con esta salida:

```
permisos creados: 1 (unidades.modificar) - asignaciones permiso-rol creadas: 1 -
empresa inicial: ya existia - usuario inicial: ya existia
```

Nada más se tocó, y con eso los cuatro casos pasaron. **No hubo ningún cambio de código**: el fallo
no era del spec de E2E ni de la pantalla.

### HUECO DE VERIFICACIÓN REAL, para el reviewer

Ese rojo **reprodujo en un navegador real la grieta que R11 predice**: enlace visible y 404 al
pulsarlo, porque el ítem del menú declara `unidades.consultar` y la página exige además
`unidades.modificar` (`design.md > 6`).

Y aquí está lo importante: **R11 comprueba la coherencia contra `SEED_ROLE_PERMISSIONS`, que es la
constante del código —y tenía los once—, mientras que la base tenía diez.** El ancla de R11 estaba
en verde con la grieta abierta en producción de pruebas.

**Ningún test del repo compara el catálogo de permisos del código con el de la base de datos.** Es
un hueco de verificación real y **no es de esta ficha cerrarlo** —QC-39 es `frontend` y no toca
`db/` ni el seed—, pero conviene que el reviewer lo vea y que alguien le abra ficha: hoy, un
despliegue sin sembrar deja el menú y las páginas discrepando sin que nada se ponga rojo.

## Tanda 4 — F2.3 (merge con `origin/dev`) y el remate (T4 bullet 4, T9-T13)

### El merge, sin conflictos y con la comprobación explícita

`git fetch origin dev` + `git merge origin/dev` produjo el commit de merge `7c15374`, **sin un solo
conflicto**. Los cinco archivos que se esperaban ambiguos —donde la tanda 1 ensanchó fixtures y
QC-58 sustituyó `userEvent.setup()` por `setupUser()`— los resolvió git solo, porque eran líneas
distintas del mismo archivo.

**Comprobación explícita pedida por el leader, hecha y verde:** en esos cinco archivos
(`pedidos-ui/pedidos-viewport`, `proveedores-ui/catalog-line-sheet`,
`proveedores-ui/delete-catalog-line-dialog`, `proveedores-ui/supplier-detail-page` y
`recetas-ui/recipe-form`) **no queda ni una llamada a `userEvent.setup()`** y los cinco usan
`setupUser()`. No se ha revertido nada de QC-58 en silencio.

El merge **trajo trabajo ajeno de QC-65** (estado de cuenta de usuario, con migración y cambio de
`db/schema.prisma`), lo que obligó a **regenerar el cliente de Prisma** en el worktree
(`pnpm exec prisma generate`): sin eso, `pnpm typecheck` salía rojo con `TS2339: Property
accountStatus does not exist` en tests de integración **que no son de esta ficha**.

### Trabajo cerrado en esta tanda

- **T4, cuarto bullet (ya sin motivo para diferirlo):** anclas tensadas de **seis a siete** en
  `tests/unit/app-sidebar.test.tsx` y `tests/unit/navegacion/private-layout-menu.test.tsx`, con
  `nav-unidades` en su posición y sin reordenar nada. El segundo añade además lo que T4 pedía: el
  layout pinta `nav-unidades` con los permisos del Administrador y **no** con los del Operador.
- **T9, T10, T11** — los tres tests de interacción, **con `setupUser()` y `esperarInteractiva()`**
  del helper de QC-58. **Cero apariciones de `userEvent.setup()`** en todo lo que escribió esta
  ficha.
- **T12 y T13** — convenciones de la ruta y multiplataforma (16 casos, a 375 px y a 1280 px).

### R34 — la deuda queda CERRADA

El ancla que faltaba existe: `unit-sheet.test.tsx` espía el `FormData` que sale de la pantalla
(`vi.mock` de las actions; el `FormData` real es el segundo argumento de la llamada) y afirma
`has(clave) === false` en los **tres** casos, incluido el que se corrigió a mitad de ficha:

1. sin símbolo declarado, la clave `symbol` **no viaja**;
2. sin derivación declarada, **ninguna** de las dos claves de la equivalencia viaja;
3. **con derivación declarada y factor en blanco, viaja `baseUnitId` y NO viaja `factor`**.

Además: con los cuatro campos declarados, las claves enviadas son **exactamente** las cuatro de
negocio y ninguna vale la cadena vacía. **Ningún test destapó un fallo de la pantalla**: el código
pasó los tres casos tal cual estaba.

### Dos desviaciones propias que los tests nuevos destaparon, y su corrección

1. **`modulo-intacto.test.ts` medía contra un commit fijado a mano** (`516e9c0`). Tras el merge
   atribuía a QC-39 el `db/schema.prisma` que trajo **QC-65**. Corregido: ahora calcula la base con
   `git merge-base origin/dev HEAD`, así que mide **solo lo que esta rama añade** y seguirá siendo
   correcto tras cualquier merge futuro. **La lista de intocables y todos los asertos, intactos.**
2. **Dos tests importaban por ruta profunda**, saltándose el barrel: `unit-equivalence.test.ts` y
   `unit-list-params.test.ts`. Se escribieron **antes** de que el barrel existiera y lo dejaron
   anotado en su cabecera; ahora existe. Los caza la guardia de T12, que es de esta misma ficha.
   Corregidos los dos imports (R43), sin tocar producción ni relajar el detector.

### Un TERCER centinela ajeno acotado, y esto ya es un patrón

`tests/unit/identity/account-status-scope.test.ts`, recién llegado con QC-65, vigila el alcance de
**su** ficha (ni ruta, ni Server Action, ni pantalla) comparando `dev...HEAD` **sin comprobar en
ningún momento que la rama medida sea la suya**. Mergeado en `dev`, mide **cualquier** rama: QC-39,
cuyo trabajo entero es construir una pantalla, aparecía con 16 «infracciones» que son exactamente lo
que su spec manda construir.

Se acotó la **precondición** con señal conjuntiva —archivo central **más** carpeta de spec de
QC-65—, dejando `skipped` **ruidoso** («este caso NO ha comprobado nada») fuera de su rama, y se
cambió el rango del `dev` local —que iba 18 commits por detrás— a la base de fusión con
`origin/dev`. **Ningún aserto tocado; en la rama de QC-65 aplica exactamente igual.**

**Es el tercer episodio de la misma clase en este repo**: QC-38 lo sufrió, QC-75 lo dejó documentado
en su propio archivo, y esta ficha ha tenido que acotar **dos** (`qc75-convenciones` y
`account-status-scope`). El patrón —un centinela de alcance de ficha que se autolimita mal, o no se
autolimita, y muerde a la siguiente rama— **merece una regla del arnés**, no un parche por ficha.
Queda señalado para el reviewer y para `/afinar-regla`.

## Mapa `R<n> -> test` (completo, R1 a R50) — ningún requisito sin test

| R | Test que lo ancla | Estado |
| --- | --- | --- |
| R1 | `unidades/unit-view-projection.test.ts` | verde |
| R2 | `unidades/unit-view-projection.test.ts` | verde |
| R3 | `unidades/modulo-intacto.test.ts` | verde |
| R4 | `unidades/consumidores-catalogo.test.tsx` + `pnpm typecheck` | verde |
| R5 | `unidades/list-units-action.test.ts` | verde |
| R6 | `unidades/modulo-intacto.test.ts` + los heredados de `list-units` | verde |
| R7 | `configuracion-ui/unit-page.test.tsx` | verde |
| R8 | `configuracion-ui/units-route-contract.test.ts` + `unidades-convenciones.test.ts` | verde |
| R9 | `configuracion-ui/private-nav-unidades.test.ts` + `app-sidebar.test.tsx` (ancla tensada) | verde |
| R10 | `configuracion-ui/private-nav-unidades.test.ts` + `navegacion/private-layout-menu.test.tsx` | verde |
| R11 | `configuracion-ui/permisos-unidades-coherentes.test.ts` | verde |
| R12 | `units-route-contract.test.ts` + `unit-page.test.tsx` + `guard-pantallas-exigen-permiso` + `e2e/unidades.spec.ts` | verde |
| R13 | `guard-rutas-privadas-cubiertas` + `units-route-contract.test.ts` | verde |
| R14 | `configuracion-ui/unit-page.test.tsx` | verde |
| R15 | `configuracion-ui/unit-table.test.tsx` + `unidades-convenciones.test.ts` | verde |
| R16 | `configuracion-ui/unit-columns.test.tsx` | verde |
| R17 | `configuracion-ui/unit-equivalence.test.ts` | verde |
| R18 | `configuracion-ui/unit-table.test.tsx` | verde |
| R19 | `unit-columns.test.tsx` + `unit-table.test.tsx` + `unit-list-params.test.ts` | verde |
| R20 | `unit-list-params.test.ts` + `unit-table.test.tsx` | verde |
| R21 | `unit-table.test.tsx` + `unit-list-params.test.ts` | verde |
| R22 | `configuracion-ui/unit-table.test.tsx` | verde |
| R23 | `configuracion-ui/unit-list-params.test.ts` | verde |
| R24 | `configuracion-ui/unit-page.test.tsx` | verde |
| R25 | `configuracion-ui/unit-page.test.tsx` | verde |
| R26 | `configuracion-ui/unit-page.test.tsx` | verde |
| R27 | `configuracion-ui/unidades-viewport.test.tsx` | verde |
| R28 | `configuracion-ui/unit-columns.test.tsx` | verde |
| R29 | `configuracion-ui/unit-columns.test.tsx` | verde |
| R30 | `delete-unit-dialog.test.tsx` + `unidades-convenciones.test.ts` | verde |
| R31 | `configuracion-ui/data-table-intacta-unidades.test.ts` | verde |
| R32 | `configuracion-ui/unit-sheet.test.tsx` | verde |
| R33 | `configuracion-ui/unit-sheet.test.tsx` | verde |
| R34 | `configuracion-ui/unit-sheet.test.tsx` (espía del `FormData`, los tres casos) | verde |
| R35 | `configuracion-ui/unit-sheet.test.tsx` | verde |
| R36 | `configuracion-ui/unit-sheet.test.tsx` | verde |
| R37 | `configuracion-ui/unit-sheet.test.tsx` | verde |
| R38 | `unit-sheet.test.tsx` + `delete-unit-dialog.test.tsx` | verde |
| R39 | `tests/unit/private-layout.test.tsx` (heredado) | verde |
| R40 | `configuracion-ui/delete-unit-dialog.test.tsx` | verde |
| R41 | `configuracion-ui/delete-unit-dialog.test.tsx` | verde |
| R42 | `configuracion-ui/delete-unit-dialog.test.tsx` | verde |
| R43 | `configuracion-ui/unidades-convenciones.test.ts` | verde |
| R44 | `configuracion-ui/unidades-convenciones.test.ts` | verde |
| R45 | `guard-dependencias-aprobadas` + `unidades-convenciones.test.ts` + `data-table-intacta-unidades.test.ts` | verde |
| R46 | `configuracion-ui/unidades-convenciones.test.ts` | verde |
| R47 | `modulo-intacto.test.ts` + `data-table-intacta-unidades.test.ts` + la nota de T0 + las anclas tensadas | verde |
| R48 | `configuracion-ui/unidades-viewport.test.tsx` | verde |
| R49 | `configuracion-ui/unidades-convenciones.test.ts` | verde |
| R50 | `e2e/unidades.spec.ts` (corrida verde en Chromium y WebKit) | verde |

## Verificación final del implementer (el gate completo lo corre el leader)

```
$ pnpm typecheck
> tsc --noEmit
(sin salida — verde)

$ pnpm lint
> eslint
(sin salida — verde)

$ pnpm exec vitest run tests/unit tests/guards
 Test Files  1 failed | 256 passed (257)
      Tests  2 failed | 3203 passed | 12 skipped (3217)
```

**Los dos únicos rojos son deuda ajena de `dev` inscrita en `tests/baseline-rojos.json`**:
`private-layout-menu.test.tsx`, casos «con solo inventario.consultar, el control de cerrar sesión
sigue presente» y «sin ningún permiso, el menú queda sin ítems y el pie con cerrar sesión sigue
ahí», los dos cayendo en `getByTestId('private-user-trigger')` porque un cambio de UI commiteado
directamente en `dev` (`ab28f97`) movió el componente. **No son de QC-39** y su ficha está
pendiente.

Las **tres** anclas de seis a siete que sí eran de esta ficha —`app-sidebar`,
`private-layout-menu` y `guard-nav-permisos-declarados`— están **tensadas y verdes**.

**Deuda menor heredada, anotada y no tocada:** el caso «sin ningún permiso» de
`private-layout-menu.test.tsx` mantiene una lista de ítems que no nombra `nav-unidades`. Es uno de
los dos rojos de baseline y se dejó intacto a propósito; conviene recogerlo cuando se cierre esa
deuda de `dev`.

## Lo que queda pendiente y NO puede cerrar el implementer

- **T13, segundo bullet: la comprobación manual en un WebKit real** del scroll contenido en la
  tabla. `tasks.md` avisa de que «no es una casilla que se marque sola». El test automatizado de
  viewport la cubre en jsdom —`overflow-x-auto` en el envoltorio de la tabla y ningún ancestro que
  lo declare—, pero la comprobación en navegador real **exige levantar servidor, y ese reparto es
  del leader** (el subagente que intentó ejecutar Playwright murió por watchdog de stream). Queda
  **sin marcar y a la espera**.
- **T15, segundo bullet: `./init.sh` completo en verde.** Lo corre el leader; el implementer no se
  autoaprueba.
