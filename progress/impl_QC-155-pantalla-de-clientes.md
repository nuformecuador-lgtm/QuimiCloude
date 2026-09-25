# QC-155 — pantalla-de-clientes · bitácora de implementación

## T0 — Verificar la base heredada y preparar la base propia

**Verificación de lo que `design.md > 0` da por hecho** (todo confirmado, sin discrepancias):

- Las cinco Server Actions y sus tipos existen en
  `lib/modules/clientes/adapters/driving/customer-actions.ts`:
  `createCustomerAction`, `updateCustomerAction`, `deleteCustomerAction`, `getCustomerAction`,
  `listCustomersAction`, con `CreateCustomerFormState`, `CustomerMutationFormState`,
  `CustomerQueryResult`, `CustomerListResult`.
- `CUSTOMER_QUERYABLE` y `createCustomerSchema`/`updateCustomerSchema` se publican en el barrel
  `lib/modules/clientes/index.ts`, junto con las seis constantes de largo y `CustomerView`.
- Las primitivas `sheet.tsx`, `alert-dialog.tsx` y `sonner.tsx` ya están en `components/ui/`.
- `loginAndLand` existe en `e2e/helpers/landing.ts`.

**Base de datos propia `QuimiCloude_QC155`:**

1. Creada con `CREATE DATABASE "QuimiCloude_QC155"` (no existía).
2. `pnpm install` + `pnpm exec prisma generate`: el worktree se montó sin `node_modules`
   (`docs/worktrees.md`), así que hubo que instalar antes de poder ejecutar `prisma`.
3. `db:migrate` con `DATABASE_URL`/`DIRECT_URL` sobrescritas en el entorno del comando a
   `postgresql://postgres:xerxes@localhost:5432/QuimiCloude_QC155?schema=public`:

   ```
   ...
   20260924190100_finished_products_and_content_copies/
   20260924200000_customers_search_normalized/
   All migrations have been successfully applied.
   ```

4. `db:seed`, mismas variables:

   ```
   db:seed: roles creados: 2 (Administrador, Operador) - permisos creados: 11 (dashboard.consultar,
   inventario.consultar, inventario.modificar, recetas.consultar, recetas.modificar,
   unidades.consultar, unidades.modificar, proveedores.consultar, proveedores.modificar,
   pedidos.consultar, pedidos.modificar) - asignaciones permiso-rol creadas: 22 - empresa inicial:
   creada (QuimiCloud) - usuario inicial: creado
   ```

   El rol Empacador y `terminados.consultar` no salen en este resumen porque los inserta la
   migración de datos `20260922120000_packer_role` (no el seed): se comprobó por consulta directa
   que la base queda con los tres roles (`Administrador`, `Empacador`, `Operador`) y que
   `clientes.consultar`/`clientes.modificar` existen y están asignados **solo** al Administrador:

   ```
   roles: [ 'Administrador', 'Empacador', 'Operador' ]
   clientes perms: [ 'clientes.consultar', 'clientes.modificar' ]
   role-permission clientes: [
     { name: 'Administrador', permission_code: 'clientes.consultar' },
     { name: 'Administrador', permission_code: 'clientes.modificar' }
   ]
   ```

**Sin discrepancias que reportar.** No se tocó `lib/modules/**`, `lib/composition/**`, `db/**`,
`components/shared/**`, `components/ui/**` ni `package.json`.

## T1 — Constante, prefijo, ítem de menú, icono y alcance de `scope.test.ts`

### Archivos tocados

- `lib/shared/routes.ts`: `CUSTOMERS_ROUTE = '/clientes'` y fila en `PRIVATE_ROUTE_PREFIXES`.
- `lib/shared/navigation/private-nav.ts`: `CUSTOMERS_LABEL`, `'contact'` en `NavIconName`, ítem
  `nav-clientes` al final de `PRIVATE_NAV_ITEMS`, sección `NAV_SECTION_CHAIN`, permiso
  `clientes.consultar`.
- `lib/shared/navigation/nav-icons.ts`: fila `contact: Contact` (de `lucide-react`, ya instalado).
- `app/(private)/clientes/page.tsx` (nuevo): versión mínima, solo `requirePagePermission` y el
  título (`data-testid="clientes-title"`).
- `tests/unit/clientes/scope.test.ts`: sustituidos por su versión acotada los tres casos que
  QC-153/QC-154 dejaron en rojo a propósito (R26, R28, R38), con sus casos de sensibilidad. Los
  nombres conservan el `R<n>` de QC-153/154 y añaden `R37 (QC-155)`.
- `tests/unit/navegacion/private-layout-menu.test.tsx`: tensado con `nav-clientes` (ancla, casos
  de Administrador/Operador, caso "sin ningún permiso").
- `tests/unit/clientes-ui/private-nav-clientes.test.ts` (nuevo): forma del ítem, icono, filtrado
  con los tres roles del seed, `firstVisibleNavHref` sin cambios. El caso que lee el permiso de
  `page.tsx` queda `it.skip` hasta T6, como pide `tasks.md`.
- `tests/unit/clientes-ui/customers-route-contract.test.ts` (nuevo): R1, R2.
- Colateral, para tensar anclas anti-vacuidad que la nueva ruta/ítem rompían (fuera de la lista
  explícita de `design.md > 10`, pero con el mismo criterio de "se tensa, no se afloja"):
  `tests/unit/app-sidebar.test.tsx` (conteo y orden de `PRIVATE_NAV_ITEMS`) y
  `tests/unit/recetas-ui/recipe-route-contract.test.ts` (censo cerrado de exports de
  `lib/shared/routes.ts`).

### Mapa parcial R<n> → test

| Requisito | Test |
| --- | --- |
| R1 | `tests/unit/clientes-ui/customers-route-contract.test.ts` > "la ruta de clientes se declara una sola vez (R1)" |
| R2 | `tests/unit/clientes-ui/customers-route-contract.test.ts` > "el prefijo privado cubre la pantalla de clientes (R2)" |
| R4 | `tests/unit/clientes-ui/private-nav-clientes.test.ts` > "la navegacion privada lleva a clientes (R4)"; `tests/unit/navegacion/private-layout-menu.test.tsx` (ancla, casos Admin/Operador) |
| R6 (parte menú) | `tests/unit/clientes-ui/private-nav-clientes.test.ts` > "el item se oculta a quien no tiene el permiso (R4, R6)" |

R3, R5, R6 (parte pantalla) y el resto de R7–R42 quedan para las tandas siguientes (T2–T9), que
son las que construyen el resto de la pantalla.

### Salida real de los tests corridos

```
$ pnpm exec vitest run tests/unit/clientes/scope.test.ts
 Test Files  1 passed (1)
      Tests  25 passed (25)

$ pnpm exec vitest run tests/unit/navegacion/private-layout-menu.test.tsx
 Test Files  1 passed (1)
      Tests  12 passed (12)

$ pnpm exec vitest run tests/unit/clientes-ui/customers-route-contract.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)

$ pnpm exec vitest run tests/unit/clientes-ui/private-nav-clientes.test.ts
 Test Files  1 passed (1)
      Tests  12 passed | 1 skipped (13)

$ pnpm exec vitest run tests/guards/guard-nav-permisos-declarados.test.ts tests/guards/guard-pantallas-exigen-permiso.test.ts tests/guards/guard-rutas-privadas-cubiertas.test.ts
 Test Files  3 passed (3)
      Tests  23 passed (23)

$ pnpm exec vitest run tests/guards/guard-nav-serializable.test.ts tests/guards/guard-e2e-landing.test.ts
 Test Files  2 passed (2)
      Tests  19 passed (19)

$ pnpm exec vitest run tests/unit/app-sidebar.test.tsx tests/unit/recetas-ui/recipe-route-contract.test.ts
 Test Files  2 passed (2)
      Tests  42 passed (42)
```

Corrida conjunta final de los once archivos de arriba, tras las últimas tensadas:

```
$ pnpm exec vitest run tests/unit/clientes/scope.test.ts tests/unit/navegacion/private-layout-menu.test.tsx \
    tests/unit/clientes-ui/private-nav-clientes.test.ts tests/unit/clientes-ui/customers-route-contract.test.ts \
    tests/unit/app-sidebar.test.tsx tests/unit/recetas-ui/recipe-route-contract.test.ts \
    tests/guards/guard-nav-permisos-declarados.test.ts tests/guards/guard-pantallas-exigen-permiso.test.ts \
    tests/guards/guard-rutas-privadas-cubiertas.test.ts tests/guards/guard-nav-serializable.test.ts \
    tests/guards/guard-e2e-landing.test.ts
 Test Files  11 passed (11)
      Tests  141 passed | 1 skipped (142)
```

También se corrió `pnpm exec vitest related --run` sobre los tres archivos de `lib/shared/` y
`app/(private)/clientes/page.tsx`: arrastró 240 archivos / 3460 tests, con **3 rojos** —los tres
listados arriba en `app-sidebar.test.tsx` y `recipe-route-contract.test.ts`—, ya corregidos y
reverificados en verde. Nada más se puso rojo en esa corrida de 310 s.

`pnpm run typecheck`: verde (tras `pnpm exec next typegen`, necesario en un worktree recién
montado — `docs/worktrees.md > El gate`). `pnpm run lint`: verde, 0 errores (7 warnings
preexistentes en `tests/unit/documentos/confirm-catalog-import.test.ts` y
`tests/unit/pedidos/order-service.test.ts`, ajenos a este diff).

**No se corrió `pnpm test` ni `./init.sh` completo** (fuera del alcance de esta entrega, que es
T0+T1). `./init.sh` completo queda para el cierre de la ficha (T9).

### Archivos fuera de alcance

No se tocó `lib/modules/**`, `lib/composition/**`, `db/**`, `components/shared/**`,
`components/ui/**` ni `package.json`. No se tocó `feature_list.json` ni `progress/current.md`.

## T2 — `customer-list-params.ts`

### Archivos tocados

- `app/(private)/clientes/components/customer-list-params.ts` (nuevo): parser/serializador puro,
  copia de `recipe-list-params.ts`/`order-list-params.ts`, con el filtro de ciudad (texto) y de
  fecha de alta (rango), ambos derivados de `CUSTOMER_QUERYABLE.filterable` y nunca escritos a
  mano. `customerListHref`, `hasActiveSearchOrFilter`, `clearSearchAndFilters` y
  `withSearchResetsPage` (extendido a «termino **o** filtro cambiaron»).
- `app/(private)/clientes/components/index.ts` (nuevo): barrel, arrancado con este primer archivo.
- `tests/unit/clientes-ui/customer-list-params.test.ts` (nuevo).

### Mapa R<n> → test

| Requisito | Test |
| --- | --- |
| R12 | `customer-list-params.test.ts` > "busqueda recortada y sin normalizar", "busqueda de solo espacios" |
| R13 | `customer-list-params.test.ts` > "filtro de ciudad recortado", rango de fechas, `describe('withSearchResetsPage ...')` completo |
| R14 | `customer-list-params.test.ts` > "el orden solo acepta columnas de la lista blanca del contrato", "orden sobre campo no ordenable" |
| R16 | `customer-list-params.test.ts` > `describe('parseCustomerListParams acota, nunca falla (R16)')` completo (`it.each(CONTRATO)`) |
| R17 | `customer-list-params.test.ts` > "la consulta construida se vuelve a leer igual...", "la consulta no escribe busqueda, orden, ciudad ni fechas cuando estan vacios" |
| R1 (parcial, destino derivado) | `customer-list-params.test.ts` > "el destino se deriva de la constante de ruta de clientes" |
| R20 (parcial, activo/limpiar) | `customer-list-params.test.ts` > `describe('busqueda o filtro activos y limpiar (R20)')` |

### Salida real de los tests

```
$ pnpm exec vitest run tests/unit/clientes-ui/customer-list-params.test.ts
 Test Files  1 passed (1)
      Tests  42 passed (42)
```

`pnpm run typecheck` y `pnpm run lint`: verdes (los mismos 7 warnings preexistentes y ajenos de
`confirm-catalog-import.test.ts` y `order-service.test.ts`).

## T3 — `customer-labels.ts` y `customer-columns.tsx`

### Archivos tocados

- `app/(private)/clientes/components/customer-columns.tsx` (nuevo): `buildCustomerColumns` (factoria,
  no array del modulo, porque la celda de acciones es un componente de cliente que llega por
  parametro — mismo patron que `order-columns.tsx`/`recipe-columns.tsx` — y `customer-row-actions.tsx`
  todavia no existe, T6a). Nueve columnas: `lastNames`, `firstNames`, `city`, `phone`, `email`,
  `address`, `createdAt`, `updatedAt`, `actions`. `sortable` y `filter` derivados de
  `CUSTOMER_QUERYABLE`, nunca escritos a mano. Marcador de ausencia en telefono/correo/direccion.
  Fechas en UTC.
- `app/(private)/clientes/components/customer-labels.ts` (nuevo): reexporta `CUSTOMERS_LABEL` de
  `private-nav.ts` (mismo patron que `unit-labels.ts`), `CUSTOMERS_TITLE_TESTID` y
  `CUSTOMER_TABLE_TEXTS` (`design.md > 8`).
- `app/(private)/clientes/components/index.ts`: suma los dos archivos al barrel.
- `tests/unit/clientes-ui/customer-columns.test.tsx` (nuevo).

### Mapa R<n> → test

| Requisito | Test |
| --- | --- |
| R10 | `customer-columns.test.tsx` > `describe('las columnas declaradas son exactamente las nueve acordadas (R10)')` (positivo y negativo) |
| R11 | `customer-columns.test.tsx` > `describe('telefono, correo y direccion pintan un marcador identificable cuando faltan (R11)')` |
| R14 | `customer-columns.test.tsx` > `describe('las ordenables son exactamente la lista blanca del contrato (R14)')` y `describe('los filtros son exactamente los que declara la lista blanca (R13)')` |

### Salida real de los tests

```
$ pnpm exec vitest run tests/unit/clientes-ui/customer-columns.test.tsx tests/unit/clientes-ui/customer-list-params.test.ts
 Test Files  2 passed (2)
      Tests  56 passed (56)
```

`pnpm run typecheck` y `pnpm run lint`: verdes, mismos warnings ajenos.

## T4 — Estados: `customer-list-skeleton.tsx`, `customer-list-empty.tsx`, `customer-list-error.tsx`

### Archivos tocados

- `app/(private)/clientes/components/customer-list-skeleton.tsx` (nuevo): copia de
  `order-list-skeleton.tsx`, `CUSTOMER_SKELETON_COLUMN_COUNT = 9` (mismo numero que
  `buildCustomerColumns(...).length`), `data-testid="customer-list-skeleton"` y
  `"customer-row-skeleton"`, `role="status"` + `aria-busy`.
- `app/(private)/clientes/components/customer-list-empty.tsx` (nuevo): recibe `canModify` y
  **decide ella misma** si monta el disparador de alta que le llega por `children` (R5, R19); con
  `firstPageHref` presente pinta el enlace a la primera pagina y no el disparador (R20). El caso
  «sin coincidencias» no vive aqui (design.md > 5.1): lo pinta la propia tabla en T6.
- `app/(private)/clientes/components/customer-list-error.tsx` (nuevo): mensaje, `code` aparte y
  reintento como **enlace** a `retryHref` (`customerListHref(params)`, pasado por quien lo monta),
  no `router.refresh()` — desviación deliberada de `design.md > 5.1` respecto del patron mayoritario
  del repo (unidades, pedidos, grupos), que usa `router.refresh()`. Usa `UnexpectedErrorNotice`
  para el codigo inesperado, igual que las demas pantallas (QC-71).
- `app/(private)/clientes/components/index.ts`: suma los tres archivos al barrel.
- `tests/unit/clientes-ui/customer-list-skeleton.test.tsx`,
  `tests/unit/clientes-ui/customer-list-empty.test.tsx` y
  `tests/unit/clientes-ui/customer-list-error.test.tsx` (nuevos).

### Mapa R<n> → test

| Requisito | Test |
| --- | --- |
| R19 | `customer-list-empty.test.tsx` > `describe('el vacio es identificable y no finge que haya lista (R19)')`, `describe('el disparador de alta solo se monta con canModify (R5, R19)')` (canModify=false sin disparador, canModify=true con disparador) |
| R20 | `customer-list-empty.test.tsx` > "con `firstPageHref` presente, el disparador no se monta aunque `canModify` sea true (R20)", `describe('la vuelta a la primera pagina es un enlace real...')` |
| R21 | `customer-list-skeleton.test.tsx` > todo el archivo (numero de columnas, `role="status"`, `aria-busy`) |
| R22 | `customer-list-error.test.tsx` > `describe('el error es identificable...')`, `describe('el reintento es un enlace real...')` |
| R7 | `customer-list-error.test.tsx` > "NO pinta ninguna tabla: «fallo» no es «no hay clientes» (R7, R22)" |
| R39, R40 | `customer-list-empty.test.tsx` y `customer-list-error.test.tsx` > controles >= 44x44 px, sin `:hover` como unica via, localizados por `data-testid`/rol, nunca por copy |

### Salida real de los tests

```
$ pnpm exec vitest run tests/unit/clientes-ui/customer-list-skeleton.test.tsx tests/unit/clientes-ui/customer-list-empty.test.tsx tests/unit/clientes-ui/customer-list-error.test.tsx
 Test Files  3 passed (3)
      Tests  16 passed (16)
```

`pnpm exec vitest related --run` sobre los siete archivos de `app/(private)/clientes/components/`
tocados en T2–T4: 5 archivos de test relacionados, **72 passed (72)**.

`pnpm run typecheck`: verde. `pnpm run lint`: verde, mismos 7 warnings preexistentes y ajenos
(`confirm-catalog-import.test.ts`, `order-service.test.ts`).

### Archivos fuera de alcance (T2–T4)

No se tocó `lib/modules/**` salvo su **lectura** de `lib/modules/clientes/index.ts` (el barrel
publico) para confirmar los nombres exactos de exportacion antes de escribir los imports —ninguna
edicion—, tampoco `lib/composition/**`, `db/**`, `components/shared/**` (solo se **importa** desde
su barrel publico `@/components/shared/data-table` y desde `@/components/shared/unexpected-error-notice`,
igual que hacen pedidos/unidades/recetas), `components/ui/**` ni `package.json`. No se tocó
`specs/**`, `feature_list.json` ni `progress/current.md`. No se corrio `./init.sh` completo (queda
para T9).
