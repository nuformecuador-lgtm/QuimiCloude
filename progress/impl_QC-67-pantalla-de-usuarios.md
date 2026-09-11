# QC-67 — pantalla-de-usuarios · bitacora de implementacion

> Zona `frontend`. Worktree `.worktrees/QC-67-pantalla-de-usuarios`, rama
> `feature/QC-67-pantalla-de-usuarios`. Spec aprobado por el humano el 2026-09-11.
> Esta ficha **no construye backend**: consume QC-66 y QC-94.

## T0 — Inventario de lo heredado (nada de esto se re-crea, R39)

Verificado en el worktree, con `./init.sh --rapido` en verde ANTES de tocar nada
(typecheck + lint + 29 archivos de guardias, 312 tests, 0 fallos).

| Pieza | Donde | Ficha |
| --- | --- | --- |
| `createUserAction`, `updateUserAction`, `deleteUserAction`, `setUserAccountStatusAction`, `getUserAction`, `listUsersAction` | `lib/modules/identity/adapters/driving/user-actions.ts` | QC-66 |
| `listRolesAction` + `RoleOptionsResult` | `lib/modules/identity/adapters/driving/role-actions.ts` | QC-94 |
| `requirePagePermission(code)` | `lib/modules/identity/adapters/driving/require-page-permission.ts` | QC-75 |
| `UserRow`, `UserDetail`, `USER_QUERYABLE`, `USER_ACCOUNT_STATUSES`, `DOCUMENT_TYPE_CODES`, `RoleOption`, `assertPermission` | `lib/modules/identity/index.ts` | QC-65/66/74/94 |
| Tabla compartida con filtro `select` multivalor | `components/shared/data-table/` | QC-55 + QC-57 |
| `PAGE_SIZE_OPTIONS` (10/25), `DEFAULT_PAGE_SIZE` | `lib/shared/pagination.ts` | QC-22 |
| Seccion «Configuración» con **dos** items (Presentaciones, Unidades) | `lib/shared/navigation/private-nav.ts` | QC-45 + QC-39 |
| `<Toaster />`, sidebar, `SidebarInset` | `app/(private)/layout.tsx` | QC-11 |
| `UnexpectedErrorNotice` | `components/shared/unexpected-error-notice.tsx` | QC-71 |
| Precedentes de pantalla completos | `app/(private)/configuracion/{presentaciones,unidades}/` | QC-45 / QC-39 |

Ninguna dependencia nueva, ninguna migracion, ningun archivo de `lib/modules/identity/**`,
`db/**`, `package.json` ni `components/shared/data-table/**` tocado.

## Archivos creados / modificados

### Bloque 1 — T1, T2, T3 (commit `066edea`)

**Creados**

- `app/(private)/configuracion/usuarios/page.tsx`
- `tests/unit/configuracion-ui/usuarios-route-contract.test.ts`
- `tests/unit/configuracion-ui/private-nav-usuarios.test.ts`
- `tests/unit/configuracion-ui/usuarios-page.test.tsx`

**Modificados (producto)** — los dos archivos ajenos que R39 permite, mas el mapa de iconos
que el `Record<NavIconName, LucideIcon>` obliga a completar:

- `lib/shared/routes.ts` — `USERS_ROUTE` + su fila en `PRIVATE_ROUTE_PREFIXES`, en el mismo commit
- `lib/shared/navigation/private-nav.ts` — `USERS_LABEL`, `'users'` en `NavIconName` y el TERCER
  item de `NAV_SECTION_CONFIGURATION`, al final del array
- `lib/shared/navigation/nav-icons.ts` — la fila `users: Users` (sin ella no compila).
  `lucide-react` ya estaba instalado y aprobado: **ninguna dependencia nueva**

**Tests heredados de lista CERRADA, TENSADOS y nunca relajados (R39)** — en los siete sube el
ancla **y** ademas se nombra la entrada nueva:

- `tests/guards/guard-pantallas-exigen-permiso.test.ts` (10 -> 11 pantallas privadas)
- `tests/guards/guard-nav-permisos-declarados.test.ts` (7 -> 8 enlaces, con `nav-usuarios`)
- `tests/unit/app-sidebar.test.tsx` (7 -> 8, lista exacta y en orden)
- `tests/unit/navegacion/private-layout-menu.test.tsx` (7 -> 8)
- `tests/unit/configuracion-ui/private-nav-configuracion.test.ts` (2 -> 3 items)
- `tests/unit/configuracion-ui/private-nav-unidades.test.ts` (2 -> 3, y ademas **fija** que
  unidades sigue siendo el segundo: se tensa con un aserto nuevo, no solo con el contador)
- `tests/unit/recetas-ui/recipe-route-contract.test.ts` (lista cerrada de exports de `routes.ts`)

**Nota de diseno que el reviewer debe mirar.** `canModify` se resuelve con `assertPermission` y
**nunca** con un `permissions.includes(...)` a mano (QC-74 R12: una sola implementacion de «el
actor tiene este permiso»). Como `assertPermission` siempre lanza lo que devuelve su `onDenied`,
la pagina le pasa una instancia centinela y la reconoce **por identidad** al atraparla; cualquier
otro error se relanza intacto. El `data-can-modify` del contenedor es **provisional** y
desaparece en T7, cuando el booleano viaje a `<UserListSection>` por props (R8).

### Bloque 2 — T4, T5, T6

**Creados**

- `app/(private)/configuracion/usuarios/components/user-list-params.ts` — parser y serializador
  PUROS (sin DOM, sin React, sin `next/*`). `sort` se valida contra `USER_QUERYABLE.sortable`
  **importado** y `status` contra `USER_ACCOUNT_STATUSES` **importado**, nunca copias. Los valores
  desconocidos del filtro se descartan uno a uno y una lista vacia es «sin filtro» (R17).
  `userListHref` deriva de `USERS_ROUTE`: ningun literal de URL (R1)
- `app/(private)/configuracion/usuarios/components/user-labels.ts` — `Record<UserAccountStatus,
  string>` (un quinto estado rompe el typecheck, no pinta un hueco), opciones del filtro derivadas
  de recorrer `USER_ACCOUNT_STATUSES`, y `toDateInputValue` en **UTC** con el patron ya vigente en
  cuatro pantallas del repo, de modo que un huso negativo no resta un dia (R20, R26)
- `app/(private)/configuracion/usuarios/components/user-columns.tsx` — las SEIS columnas exactas.
  `sortable` **se lee** de la lista blanca (`USER_QUERYABLE.sortable.includes(id)`), no se copia:
  hoy deja ordenables `username`, `email` y `accountStatus`, y NO `displayName` (es una
  composicion) ni `roleName` (no esta en la lista). `filter: 'select'` solo en `accountStatus`;
  ningun filtro por rol (R10, R13, R14, R15, R20)
- `app/(private)/configuracion/usuarios/components/user-row-actions.tsx` — con `canModify ===
  false` devuelve **`null`**: la celda no emite NADA, ni botones deshabilitados ni explicacion
  (R6). Con `true`, las tres acciones siempre en el DOM, con nombre accesible que nombra al
  usuario y objetivo tactil 44x44, nunca detras de `:hover` (R40)
- `app/(private)/configuracion/usuarios/components/index.ts` — barrel PARCIAL; lo cierra T13
- `tests/unit/configuracion-ui/user-list-params.test.ts`, `user-labels.test.ts`,
  `user-columns.test.tsx`, `user-row-actions.test.tsx`

**Modificados**

- `app/(private)/configuracion/usuarios/page.tsx` — dos lineas: el `<h1>` pasa a usar
  `USERS_TITLE_TESTID` importado **del barrel**, en vez de un literal
- `tests/unit/configuracion-ui/usuarios-page.test.tsx` — usa esa constante y anade un caso

**Nota de diseno que el reviewer debe mirar.** `UserRowActions` recibe los manejadores por props
(`onEdit`, `onDelete`, `onStatusChange`) en vez de montar el panel y los dialogos dentro de la
fila, que es lo que hace `unit-row-actions.tsx`. **Se aparta del precedente a proposito**: el
dueno del estado pasa a ser la tabla, que monta **una** instancia de cada panel para toda la
pagina en lugar de 10 o 25. Los manejadores son opcionales hoy y T9-T11 los enchufan sin
reescribir el componente.

### Bloque 3 — T7, T8

**Creados**

- `.../components/user-list-section.tsx` — Server Component `async` con
  `Promise.all([listUsersAction(params), listRolesAction()])`, ambas importadas **por su ruta
  exacta**. El listado decide el estado de la pantalla; **la consulta de roles se degrada**: si
  falla, la lista se pinta igual y el `ErrorState` viaja al panel, que no inventara opciones
  (R24). Los parametros se pasan **enteros y sin traducir**: `DataTableParams` es campo a campo
  `ListQuery`, y el esquema es `strictObject`
- `.../components/user-list-empty.tsx` — vacio identificable, con «limpiar» (busqueda y filtro a
  la vez) y «volver a la primera pagina» segun proceda, con los href de `userListHref` (R18)
- `.../components/user-list-error.tsx` — mensaje DEVUELTO por la action + reintentar; con
  `unexpected`, `UnexpectedErrorNotice` de QC-71. Nunca una tabla vacia como si no hubiera
  usuarios (R19)
- `.../components/user-list-skeleton.tsx` — el indicador de carga que la `key` del `<Suspense>`
  hace reaparecer en cada cambio de parametros (R19)
- `.../components/user-table.tsx` — `'use client'`, `<DataTable>` por el barrel publico con
  `status: 'idle'` siempre, navegacion por URL con `userListHref`: buscar, filtrar, ordenar,
  cambiar tamano o pagina **navega**, nunca se filtra ni se reordena en el cliente (R9, R12, R13,
  R14, R16)
- `tests/unit/configuracion-ui/user-list-section.test.tsx`, `user-list-empty.test.tsx`,
  `user-table.test.tsx`, `data-table-intacta-usuarios.test.ts`

**Modificados**

- `.../page.tsx` — declara `searchParams`, resuelve `parseUserListParams` **despues** del corte
  por permiso, monta el `<Suspense>` con su `key`, y **retira el `data-can-modify` provisional**:
  el booleano ya viaja por props a su consumidor real (R8)
- `.../components/index.ts` — barrel ampliado
- `tests/unit/configuracion-ui/usuarios-page.test.tsx` — los dos casos de `canModify` quedan
  **TENSADOS**: ya no miran un atributo de soporte, sino el consumidor real (con
  `usuarios.modificar` se emiten las acciones de fila; sin el, no se emite nada). Ganan alcance

**Tres notas para el reviewer.**

1. La tabla compartida **no vuelve a la pagina 1 al cambiar la busqueda** (si al cambiar el
   tamano). El test refleja el comportamiento REAL y no se toco nada compartido: R12 solo exige
   repedir la lista al servidor sobre el conjunto entero, cosa que se cumple. Si se quisiera el
   reset, es una decision nueva y su ficha, no un arreglo de esta.
2. El resolutor de Server Components `async` en jsdom es ya la **tercera copia** del repo
   (`presentation-page`, `unit-page`, `usuarios-page`). No se extrajo a `tests/helpers/` porque
   R39 prohibe tocar utilidades heredadas sin ficha que lo respalde. Queda anotado como deuda con
   nombre.
3. `user-table.tsx` transporta ya `roles` y `rolesError` y monta **una** instancia de panel para
   toda la pagina (`useState<UserPanel | null>`), no una por fila. Lleva un `data-user-panel`
   provisional que T9-T11 retiran al enchufar los componentes reales.

## Mapa `R<n> -> test`

(se rellena al cierre, con los nombres reales de archivo)

## Salida de los tests

(se rellena al cierre)
