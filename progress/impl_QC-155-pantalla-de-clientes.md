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

## T5 — `customer-form.tsx` y `customer-sheet.tsx`

### Archivos tocados

- `app/(private)/clientes/components/customer-form.tsx` (nuevo): `<form action>` no controlado +
  `useActionState`, calcado de `presentation-form.tsx` (validacion previa con el MISMO esquema que
  valida el servidor, `createCustomerSchema` del barrel publico de `clientes`, sin reescribir sus
  reglas). Seis campos (`CUSTOMER_BUSINESS_FIELDS`), tres obligatorios (`CUSTOMER_REQUIRED_FIELDS`)
  con `required`/`aria-required`. `maxLength` de cada campo sale de las constantes
  `CUSTOMER_*_MAX_LENGTH` del barrel, nunca de un numero suelto. Correo y telefono son
  `type="text"` con `inputMode="email"`/`"tel"` y sin `pattern`. La edicion precarga los seis
  valores de la fila (`CustomerView`) y el envio es reemplazo completo: un opcional vaciado viaja
  vacio, tal cual llega del `<input>`, sin ninguna limpieza de `FormData` (a diferencia de
  unidades, aqui no hay pareja de campos que omitir). Ningun `code` del modulo `clientes`
  identifica un campo (`unauthorized`, `customer_not_found`, `invalid_input`, `unexpected`), asi
  que todo rechazo del servidor va a la region `role="alert"` del formulario; solo la validacion
  previa del cliente pinta error junto a un campo.
- `app/(private)/clientes/components/customer-sheet.tsx` (nuevo): panel lateral calcado de
  `presentation-sheet.tsx`/`unit-sheet.tsx`. Sin `open`, trae su propio disparador de alta
  (`customer-create-open`); con `open`/`onOpenChange`, es el enganche controlado de la edicion
  desde la fila (T6a). Exito: cierra, `toast.success(...)` sobre el `<Toaster/>` que ya monta
  `app/(private)/layout.tsx` —no se monta otro— y `router.refresh()`. Sin `revalidatePath`.
- `app/(private)/clientes/components/index.ts`: suma los dos archivos al barrel.
- `tests/unit/clientes-ui/customer-form.test.tsx` y `tests/unit/clientes-ui/customer-sheet.test.tsx`
  (nuevos). El formulario se monta siempre a traves de `CustomerSheet`, porque `SheetContent`
  exige un `Sheet` como ancestro (mismo patron que `presentation-sheet.test.tsx`).

### Mapa R<n> → test

| Requisito | Test |
| --- | --- |
| R24 | `customer-sheet.test.tsx` > `describe('panel lateral de clientes (R24)')` (panel lateral sin navegar, cerrar no navega, la edicion abre el mismo panel precargado) |
| R25 | `customer-form.test.tsx` > `describe('los seis campos, y ninguno mas (R25)')` (los seis campos exactos; los tres obligatorios marcados y los tres opcionales sin marcar) |
| R26 | `customer-form.test.tsx` > `describe('validacion previa con el esquema del contrato (R26)')`: "el largo maximo EXACTO... se acepta", "un caracter MAS que el maximo NO llama a la operacion...", "un obligatorio vacio no llama a la operacion: el navegador bloquea el envio antes", "el maximo de los tres opcionales tambien se acota...", "el correo y el telefono son `type=\"text\"` sin `pattern`...", "el correo y el telefono aceptan texto sin formato...", "los limites usados son los que exporta el contrato publico..." |
| R27 | `customer-form.test.tsx` > `describe('precarga y reemplazo completo en la edicion (R27)')` (precarga de los seis valores; reemplazo completo ligado al id; vaciar un opcional lo envia vacio) |
| R28 | `customer-form.test.tsx` > `describe('los rechazos se distinguen por su codigo, nunca por el texto (R28)')` (`customer_not_found`, `unauthorized`, `invalid_input` del servidor, no cierra ni pierde lo escrito, identificador del error inesperado con y sin catalogo) |
| R29 | `customer-form.test.tsx` > `describe('no hay advertencia de duplicado (R29)')` (dos altas con los mismos seis datos, sin dialogo ni bloqueo) |
| R30 | `customer-sheet.test.tsx` > `describe('exito: cerrar, avisar y refrescar (R30)')` (alta y edicion con exito cierran + toast + refresh; el panel no monta una segunda region de avisos) |

### Salida real de los tests

```
$ pnpm exec vitest run tests/unit/clientes-ui/customer-form.test.tsx tests/unit/clientes-ui/customer-sheet.test.tsx
 Test Files  2 passed (2)
      Tests  25 passed (25)
```

`pnpm exec vitest related --run` sobre `customer-form.tsx`, `customer-sheet.tsx` e `index.ts`:
7 archivos de test relacionados, **97 passed (97)**.

`pnpm run typecheck`: verde. `pnpm run lint`: verde, mismos 7 warnings preexistentes y ajenos
(`confirm-catalog-import.test.ts`, `order-service.test.ts`).

### Archivos fuera de alcance (T5)

No se tocó `lib/modules/**`, `lib/composition/**`, `db/**`, `components/shared/**` (solo se
**importa** `@/components/shared/unexpected-error-notice`, igual que unidades/presentaciones),
`components/ui/**` ni `package.json`. No se tocó `specs/**`, `feature_list.json` ni
`progress/current.md`. `customer-row-actions.tsx` y `delete-customer-dialog.tsx` quedan para T6a:
este panel se prueba con el disparador propio y con un enganche `open`/`onOpenChange` simulado por
un boton minimo en el test, tal como hara la fila real.

## T6a — `delete-customer-dialog.tsx` y `customer-row-actions.tsx`

### Archivos tocados

- `app/(private)/clientes/components/delete-customer-dialog.tsx` (nuevo): confirmacion de baja
  calcada de `delete-unit-dialog.tsx`. Nombra al cliente por `firstNames lastNames` en
  `delete-customer-message`, con el aviso de irreversibilidad. El `id` viaja en un `<input
  type="hidden">` dentro del `<form>`, que solo se envia al pulsar confirmar
  (`useActionState(deleteCustomerAction, ...)`, sin `bind`: `deleteCustomerAction` ya lee el `id`
  del `FormData`). El rechazo se pinta dentro del dialogo (`delete-customer-error`), distinguido
  por su `code` (`data-code`), y el dialogo sigue abierto; con exito aplica lo de T5: cerrar, toast
  y `router.refresh()`.
- `app/(private)/clientes/components/customer-row-actions.tsx` (nuevo): las dos acciones de fila
  (editar, dar de baja), calcado de `unit-row-actions.tsx`/`presentation-row-actions.tsx`. Con
  `canModify === false` devuelve `null` (celda vacia, sin boton deshabilitado): es la decision de
  presentacion que baja por props desde la seccion/tabla (T6), no una segunda comprobacion de
  autorizacion. Cada boton mide 44x44 px y su `aria-label` nombra al cliente. Monta
  `CustomerSheet` (editar, controlado) y `DeleteCustomerDialog` (baja, montado solo mientras esta
  abierto) por fila, igual que unidades y presentaciones.
- `app/(private)/clientes/components/index.ts`: suma los dos archivos al barrel.
- `tests/unit/clientes-ui/delete-customer-dialog.test.tsx` (nuevo). `deleteCustomerAction` es un
  doble espia; las otras cuatro actions del modulo fallan si se les llama, para que un dialogo que
  de paso listara o editara se note. `CustomerRowActions` se ejercita en el mismo archivo (mismo
  patron que `delete-unit-dialog.test.tsx` con `UnitRowActions`): no hay un
  `customer-row-actions.test.tsx` aparte.

### Mapa R<n> → test

| Requisito | Test |
| --- | --- |
| R31 | `delete-customer-dialog.test.tsx` > `describe('el dialogo nombra al cliente (R31)')` (nombres y apellidos completos, advertencia de irreversibilidad, sin el uuid visible) y `describe('mientras el usuario no confirme no se invoca la baja (R31)')` (abrir no invoca, pedir la baja desde la fila abre el dialogo sin invocar, volver atras cierra sin invocar) |
| R32 | `delete-customer-dialog.test.tsx` > `describe('los rechazos se pintan DENTRO del dialogo, que sigue abierto (R32)')` (`customer_not_found`, `unauthorized`, `invalid_input`, los tres codigos distintos) y `describe('la fila no se retira cuando la baja se rechaza (R32)')` |
| R33 | `delete-customer-dialog.test.tsx` > `describe('sin control de ver, filtrar, contar ni restaurar bajas (R33)')` |

### Salida real de los tests

```
$ pnpm exec vitest run tests/unit/clientes-ui/delete-customer-dialog.test.tsx
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

`pnpm exec vitest related --run` sobre `customer-row-actions.tsx`, `delete-customer-dialog.tsx` e
`index.ts`: 8 archivos de test relacionados, **112 passed (112)**.

`pnpm run typecheck`: verde. `pnpm run lint`: verde, mismos 7 warnings preexistentes y ajenos
(`confirm-catalog-import.test.ts`, `order-service.test.ts`).

### Archivos fuera de alcance (T6a)

No se tocó `lib/modules/**`, `lib/composition/**`, `db/**`, `components/shared/**` (solo se
**importa** `@/components/shared/unexpected-error-notice`), `components/ui/**` ni
`package.json`. No se tocó `specs/**`, `feature_list.json` ni `progress/current.md`.
`customer-table.tsx`, `customer-list-section.tsx`, el barrel final y `page.tsx` completa quedan
para T6, que es quien decide `canModify` en el servidor y lo baja por props hasta
`CustomerRowActions` y hasta el disparador de alta de la cabecera.

## T6 — `customer-table.tsx`, `customer-list-section.tsx`, barrel y `page.tsx` completa

### Archivos tocados

- `app/(private)/clientes/components/customer-table.tsx` (nuevo): monta la tabla compartida
  (`DataTable`) con `status="idle"` siempre — el error y el vacío se pintan fuera —, columnas de
  `buildCustomerColumns({ rowActions })` con `CustomerRowActions` enchufada por fila, y
  `toolbarActions={canModify ? <CustomerSheet /> : undefined}` para el disparador de alta
  (`customer-create-open`), que así vive en la barra de la tabla y no en la propia tabla ni en
  `page.tsx` (`design.md > 6`: "disparador en `toolbarActions` de la tabla y en el vacío"). La
  navegación va en `startTransition` y `router.push(customerListHref(...))`, con `aria-busy` +
  atenuación mientras está en vuelo, sin desmontar nada (R21). La sincronización de la caja de
  búsqueda con «Atrás» (`boxEpoch`, `pendingSearches`, `lastSearch`, `clearing`) es una **copia
  literal** del mecanismo de `order-table.tsx:143-215` (R18, `design.md > 5.3`), sin tocar
  `components/shared/data-table`: es la segunda copia que la ficha anota como deuda con nombre
  (`design.md > 12`, riesgo 3), no una tercera definición del mismo problema.
- `app/(private)/clientes/components/customer-list-section.tsx` (nuevo): `async`, llama
  `listCustomersAction(params)` **una vez**, importada por su ruta exacta, y despacha los cinco
  casos de `design.md > 5.1`: error → `CustomerListError`; cero filas sin término/filtro →
  `CustomerListEmpty` (con `<CustomerSheet />` como disparador de alta cuando la página es la
  primera, o el enlace a la primera página cuando `page > totalPages` — los dos casos comparten un
  solo componente, que ya decide internamente cuál mostrar según `firstPageHref`); cero filas con
  término o filtro → `CustomerTable` con `noMatches`; filas → `CustomerTable`. `canModify` solo se
  transporta, nunca se decide aquí (R8).
- `app/(private)/clientes/components/index.ts`: suma `customer-table` y `customer-list-section`
  al barrel.
- `app/(private)/clientes/page.tsx` (reemplaza la versión mínima de T1): primera línea
  `requirePagePermission('clientes.consultar')` (R3), luego `searchParams`, `canModifyCustomers()`
  (copia literal de `canModifyUsers()` de `configuracion/usuarios/page.tsx`: `assertPermission`
  contra `'clientes.modificar'`, sin `currentUserId` porque esta pantalla no tiene «uno mismo») y
  `parseCustomerListParams`. `<Suspense>` **sin `key`**, con `<CustomerListSkeleton>` como
  `fallback` para la primera carga (R21) y `<CustomerListSection>` dentro (R17, R18).
- `tests/unit/clientes-ui/private-nav-clientes.test.ts`: se activa (quita el `it.skip`) el caso
  «item y página declaran el MISMO código» — ahora `page.tsx` tiene exactamente un
  `requirePagePermission(...)`, así que el test puede leerlo de la fuente real.
- `tests/unit/shared/data-table-alcance.test.ts`: alta de la NOVENA pantalla consumidora
  (`CUSTOMERS_ROUTE`) en `carpetasAutorizadas`, y se **tensa** el ancla mínima de consumidores de
  siete a ocho (`toBeGreaterThan(8)`). No se toca la lista cerrada de E2E (`e2e/clientes.spec.ts`
  no existe todavía: es T8).
- `tests/unit/clientes-ui/customer-table.test.tsx` (nuevo, copia del patrón de
  `order-table.test.tsx`).
- `tests/unit/clientes-ui/customer-list-section.test.tsx` (nuevo, copia del patrón de
  `order-list-section.test.tsx`, simplificado: sin catálogos adicionales).
- `tests/unit/clientes-ui/clientes-page.test.tsx` (nuevo, copia del patrón de
  `usuarios-page.test.tsx`).

### Mapa R<n> → test

| Requisito | Test |
| --- | --- |
| R9 | `customer-table.test.tsx` > "la tabla estrena el componente compartido y no declara uno propio (R9)" |
| R12 | `customer-table.test.tsx` > "escribir en la caja navega desde la primera pagina, conservando lo demas (R12, R13)" |
| R13 | `customer-table.test.tsx` > "las filas se pintan en el orden en que llegan (R13)"; `customer-list-section.test.tsx` > "«Limpiar la busqueda» enlaza sin `q`..." |
| R18 | `customer-table.test.tsx` > `describe('la caja sigue a la URL cuando el termino cambia por fuera (R18)')` (eco propio no remonta; cambio externo sí remonta; tras «Limpiar», el eco y luego un cambio externo no dejan la caja atrás) |
| R19 | `customer-list-section.test.tsx` > "vacio: sin ningun cliente...", "el disparador de alta del vacio solo aparece con `canModify` (R19, R5)" |
| R20 | `customer-list-section.test.tsx` > `describe('sin coincidencias: DENTRO de la tabla, con la caja montada (R20)')`, `describe('la pagina que se quedo atras vuelve a la primera (R20)')` |
| R21 | `customer-table.test.tsx` > `describe('mientras la navegacion esta en vuelo, la caja conserva foco y texto (R21)')` (aria-busy, atenuación, sin desmontar) |
| R22 | `customer-list-section.test.tsx` > "error: se dice que fallo...", "el reintento del error enlaza a la MISMA consulta..." |
| R23 | `customer-table.test.tsx` > "el desbordamiento horizontal lo absorbe el primitivo (R23)" |
| R7 | `customer-list-section.test.tsx` > `describe('la pantalla no autoriza nada por su cuenta (R7)')`, "se invoca listCustomersAction UNA vez..." |
| R3 | `clientes-page.test.tsx` > `describe('el corte por permiso ocurre antes de leer o pintar nada (R3)')` |
| R5 | `clientes-page.test.tsx` > `describe('canModify sale de assertPermission y de nada mas (R5, R8)')`; `customer-table.test.tsx` > `describe('las acciones de fila respetan canModify (R5)')` |
| R6 | `private-nav-clientes.test.ts` > "item y pagina declaran el MISMO codigo, no uno contenido en el otro" (activado en esta task) |
| R8 | `clientes-page.test.tsx` > "la fuente NO compara el conjunto de permisos a mano", "la pantalla no se construye sus propios datos..." |
| R1, R2 (cobertura de la lista cerrada) | `data-table-alcance.test.ts` > "solo las nueve pantallas autorizadas importan components/shared/data-table" |

### Salida real de los tests

```
$ pnpm exec vitest run tests/unit/clientes-ui/customer-table.test.tsx tests/unit/clientes-ui/customer-list-section.test.tsx tests/unit/clientes-ui/clientes-page.test.tsx tests/unit/clientes-ui/private-nav-clientes.test.ts
 Test Files  4 passed (4)
      Tests  55 passed (55)

$ pnpm exec vitest run tests/unit/clientes-ui tests/unit/shared/data-table-alcance.test.ts tests/guards/guard-pantallas-exigen-permiso.test.ts tests/guards/guard-rutas-privadas-cubiertas.test.ts tests/unit/clientes/scope.test.ts tests/unit/navegacion/private-layout-menu.test.tsx
 Test Files  18 passed (18)
      Tests  242 passed | 2 skipped (244)
```

(Los 2 `skipped` son ajenos a esta task: casos condicionales de otras fichas que no aplican en
este estado del repo.)

```
$ pnpm exec vitest related --run "app/(private)/clientes/components/customer-table.tsx" \
    "app/(private)/clientes/components/customer-list-section.tsx" \
    "app/(private)/clientes/components/index.ts" "app/(private)/clientes/page.tsx"
 Test Files  11 passed (11)
      Tests  154 passed (154)
```

`pnpm run typecheck`: verde. `pnpm run lint`: verde, 0 errores (los mismos 7 warnings
preexistentes y ajenos de `confirm-catalog-import.test.ts` y `order-service.test.ts`).

### Archivos fuera de alcance (T6)

No se tocó `lib/modules/**`, `lib/composition/**` (solo se **importa**, igual que
`configuracion/usuarios/page.tsx`), `db/**`, `components/shared/**` (solo se **importa** su
barrel público `@/components/shared/data-table`, sin abrir ni un archivo suyo — lo confirma
`data-table-alcance.test.ts` en verde), `components/ui/**` ni `package.json`. No se tocó
`specs/**`, `feature_list.json` ni `progress/current.md`. `e2e/clientes.spec.ts` y su alta en
`E2E_ESPERADOS`/`data-table-alcance.test.ts` quedan para T8. Las guardias de fuente propias de la
ruta (`clientes-convenciones.test.ts`, `data-table-intacta-clientes.test.ts`,
`clientes-viewport.test.tsx`) quedan para T7.

## T7 — Guardias de fuente de la ruta

Commit `66912e98`. Archivos nuevos (ningún archivo de producción tocado):

- `tests/unit/clientes-ui/clientes-convenciones.test.ts`
- `tests/unit/clientes-ui/data-table-intacta-clientes.test.ts`
- `tests/unit/clientes-ui/clientes-viewport.test.tsx`

### Mapa R<n> → test

| R | Test |
| --- | --- |
| R9 | `data-table-intacta-clientes.test.ts` (acotado a `components/shared/data-table/`; sensibilidad: contrato `data-table-types.ts` fabricado en tmpdir con `renderRowActions` + contrato real como caso limpio) |
| R34 | `clientes-convenciones.test.ts` > "toda lectura y toda escritura..." y "los componentes de cliente reciben los datos..." (sensibilidad: fabricado en tmpdir con las tres violaciones + caso simétrico limpio) |
| R35 | `clientes-convenciones.test.ts` > "la feature no toca..." (diff contra merge-base con `dev`; sensibilidad: detector puro `intocablesTocados` sobre listas fabricadas) |
| R36 | `clientes-convenciones.test.ts` > "los componentes propios viven en `components/`..." (sensibilidad en tmpdir) |
| R37 | `clientes-convenciones.test.ts` > "lo heredado no se re-crea..." (sensibilidad: `layout.tsx` fabricado en tmpdir) |
| R38 | `clientes-convenciones.test.ts` > "la pantalla no nombra pedidos..." (sensibilidad: import de `@/lib/modules/pedidos` en tmpdir) |
| R39 | `clientes-convenciones.test.ts` > "la pantalla no usa `100vh`..." + `clientes-viewport.test.tsx` (`describe.each` 375px y 1280px: 44×44px, texto ≥16px, sin `:hover` único, área segura) |
| R40 | `clientes-convenciones.test.ts` > "los tests de la carpeta localizan por rol..." (excluye `toHaveTextContent`, que comprueba contenido de un elemento ya localizado por testid; sensibilidad en tmpdir) |

### Salida real de los tests

```
pnpm exec vitest run tests/unit/clientes-ui/clientes-convenciones.test.ts tests/unit/clientes-ui/data-table-intacta-clientes.test.ts tests/unit/clientes-ui/clientes-viewport.test.tsx
Test Files  3 passed (3)
     Tests  44 passed (44)
```

`pnpm run lint`: 0 errores (7 warnings preexistentes ajenos). `pnpm run typecheck`: el agente de T7 vio
`app/layout.tsx: Cannot find name 'LayoutProps'` porque el agente de T8 había borrado `.next`; tras
`pnpm exec next typegen` el typecheck vuelve a verde (comprobado por el implementer).

## T8 — `e2e/clientes.spec.ts`

Commit `00227c0f`. Archivos:

- `e2e/clientes.spec.ts` (nuevo): dos recorridos, fixtures `qc155_e2e_`, `loginAndLand`, sin red.
- `tests/guards/guard-identificador-de-request.test.ts`: alta de `'clientes.spec.ts'` en `E2E_ESPERADOS`.
- `tests/unit/shared/data-table-alcance.test.ts`: alta de `e2e/clientes.spec.ts` en la lista cerrada de E2E (ancla tensada de 22 a 23).

El caso R28 acotado de `tests/unit/clientes/scope.test.ts` admite el spec tal cual (excluye por nombre exacto).

### Mapa R<n> → test

| R | Test |
| --- | --- |
| R41 | `e2e/clientes.spec.ts` > "el Administrador entra por la URL, da de alta un cliente, lo encuentra sin tilde, lo edita y lo da de baja (R41)" |
| R42 | `e2e/clientes.spec.ts` > "una sesion valida sin `clientes.consultar` recibe 404 dentro del layout privado y no ve la tabla (R42)" |

### Salida real

`pnpm exec playwright test e2e/clientes.spec.ts --project=chromium --project=webkit` contra `QuimiCloude_QC155`:

```
Running 4 tests using 4 workers
✓ [chromium] R42 (20.8s)
✓ [webkit]   R42 (22.1s)
✓ [chromium] R41 (30.9s)
✓ [webkit]   R41 (33.0s)
4 passed (43.3s)
```

Consulta de limpieza tras la corrida: `{"customers":0,"customersByLastNames":0,"users":0,"companies":0}`.

`pnpm exec vitest run tests/guards/guard-e2e-landing.test.ts tests/guards/guard-identificador-de-request.test.ts tests/unit/shared/data-table-alcance.test.ts tests/unit/clientes/scope.test.ts`:
4 archivos, 78 passed | 2 skipped. `typecheck` limpio; `lint` 0 errores (7 warnings preexistentes ajenos).

Nota operativa: el puerto fijo 3117 de `playwright.config.ts` lo comparten todos los worktrees; la
corrida esperó a que otro worktree lo liberara.

## Cierre de trazabilidad (implementer)

R15 solo estaba cubierto por el parser (`customer-list-params.test.ts`: 10 por defecto, 25 admitido,
cualquier otro valor cae al defecto). Commit `871992d7` lo afirma sobre la tabla renderizada, sin
tocar producción.

| R | Test |
| --- | --- |
| R15 | `customer-list-params.test.ts` (casos «tamano dentro de las opciones», «tamano fuera de las opciones», «tamano no numerico») + `customer-table.test.tsx` > "el selector de tamano ofrece exactamente 10 y 25, con 10 por defecto (R15)" (3 casos) y "con mas clientes de los que caben, anterior y siguiente navegan a la pagina correcta e indican pagina y total (R15)" (4 casos) |

```
pnpm exec vitest run tests/unit/clientes-ui/customer-table.test.tsx tests/unit/clientes-ui/clientes-convenciones.test.ts
Test Files  2 passed (2)
     Tests  51 passed (51)
```

### Verificación final del implementer (tras `git merge origin/dev`: «Already up to date»)

- `pnpm exec next typegen` + `pnpm run typecheck`: verde (el `LayoutProps` se debía a que se borró `.next`).
- `pnpm run lint`: 0 errores, 7 warnings preexistentes ajenos.
- Segunda corrida del E2E tras sincronizar: chromium 2 passed, webkit 2 passed, **4 passed (29.4s)**; 0 filas `qc155_e2e_` en customers, users y companies.
- No se ha corrido la suite completa ni `./init.sh`: T9 (gate completo) le toca al leader.
