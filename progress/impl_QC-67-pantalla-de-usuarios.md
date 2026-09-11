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

### Bloque 4 — T9, T10, T11, T12

**Creados**

- `.../components/user-form.tsx` — los **nueve** campos y ninguno mas, publicados en
  `USER_BUSINESS_FIELDS` para que el test afirme sobre la constante y no sobre literales. Viajan
  **tal cual**, sin `trim` ni `toLowerCase` en el cliente: el esquema del modulo ya normaliza y
  repetirlo aqui seria una segunda copia de una regla de negocio. `CODE_TO_FIELD` tipado con
  `ErrorCode`, asi que un codigo mal escrito o retirado del catalogo **rompe el typecheck** en vez
  de caer callado al mensaje generico (R23, R25, R27, R35)
- `.../components/user-sheet.tsx` — panel lateral unico para alta y edicion, controlado siempre y
  montado solo mientras esta abierto, con `key` por modo+id: cada apertura arranca limpia. La
  edicion pide `getUserAction(id)` con sus tres estados DENTRO del panel y envia el **reemplazo
  completo** de los nueve (R22, R26)
- `.../components/delete-user-dialog.tsx` — confirmacion que **nombra** al usuario; sin confirmar
  la action no se invoca; el rechazo se pinta dentro, por su `code`, el dialogo sigue abierto y la
  fila no se retira (R30, R31)
- `.../components/user-status-dialog.tsx` — **una** accion con los **cuatro** valores derivados de
  `USER_ACCOUNT_STATUSES` y confirmacion. Sin verbos por estado, sin decidir transiciones y sin
  excluir ninguno: eso seria regla de negocio en la UI. `blocked -> active` se ofrece igual que
  cualquier otro, y la pantalla no promete nada sobre el acceso (R32, R33, R34)
- `tests/unit/configuracion-ui/user-form.test.tsx` (18 casos), `user-sheet.test.tsx` (14, incluye
  el conteo de `<Toaster />`), `delete-user-dialog.test.tsx` (8), `user-status-dialog.test.tsx` (9)

**Modificados**

- `.../components/user-table.tsx` — retirado el `data-user-panel` provisional; monta **una**
  instancia de cada panel y dialogo para toda la pagina, cada una solo mientras esta abierta, y el
  disparador del alta gobernado por `canModify`
- `.../components/index.ts` — barrel ampliado
- `tests/unit/configuracion-ui/user-table.test.tsx` — **TENSADO**: deja de afirmar sobre el
  soporte provisional y pasa a afirmar que cada accion abre el panel real sobre ese usuario y que
  sin `usuarios.modificar` no se emite **ninguna** escritura (ni disparador, ni panel, ni dialogos)

**Tres decisiones que el reviewer debe mirar.**

1. El **disparador del alta vive en la tabla**, no dentro del panel como en unidades: el estado de
   escritura es unico para toda la pagina, asi que un `SheetTrigger` propio del panel habria
   dejado el modo `create` muerto.
2. El estado de la precarga lleva el `id` al que pertenece (`forId`). No es adorno: ademas de
   satisfacer `react-hooks/set-state-in-effect` sin renders en cascada, **impide que una respuesta
   tardia pinte la ficha de otra persona**.
3. El selector de rol sin catalogo **no se deshabilita**: pinta el aviso con su `data-code` y
   queda **sin opciones**. Deshabilitarlo habria retirado el control del `FormData` y `roleId`
   habria dejado de viajar, rompiendo la garantia de los nueve nombres (R24, R23).

**Ninguna primitiva de shadcn instalada**: `sheet`, `alert-dialog`, `select`, `input`, `label`,
`button` y `skeleton` ya estaban. Cero dependencias nuevas.

### Bloque 5 — T13, T14, T15

**Creados**

- `tests/unit/configuracion-ui/usuarios-convenciones.test.ts` — afirma sobre la FUENTE: sin
  componentes sueltos, sin rutas profundas, sin `fetch` a rutas propias, actions **por su ruta
  exacta** y nunca desde el barrel del modulo, `{ status: 'idle' }` construido aqui, ningun
  `'use client'` importa `lib/composition` ni la base, **ningun dato de credencial** en la ruta, y
  un solo `<Toaster />` en la zona privada. Ata por test que la feature no abre
  `lib/modules/identity/**`, `db/**` ni `package.json`, **con caso anti-vacuidad** que comprueba
  que el detector muerde (R8, R29, R35, R36, R37, R38)
- `tests/unit/configuracion-ui/usuarios-viewport.test.tsx` — 27 casos en los **dos** anchos (375 y
  1280 px): sin alto de ventana, objetivos >= 44x44, campos >= 16 px en todos los anchos, acciones
  en el DOM sin `:hover`, scroll horizontal **contenido en la tabla**, sin excepcion de escritorio
  (R21, R40)
- `e2e/usuarios.spec.ts` — los dos recorridos de R42, verdes en **Chromium y WebKit**

**Listas CERRADAS tensadas fuera de la carpeta de la feature (R39)** — todas suben el ancla **y**
nombran la entrada nueva; ninguna relaja el criterio, que sigue siendo `toEqual`:

- `tests/guards/guard-identificador-de-request.test.ts` — `E2E_ESPERADOS`, de 13 a 14
- `tests/unit/shared/data-table-alcance.test.ts` — dos anclas: consumidores autorizados de la
  tabla compartida (5 -> 6) y specs E2E que la referencian (5 -> 6). **La primera ya estaba en
  rojo desde el bloque 2** y no se detecto entonces porque las tandas solo corrian
  `configuracion-ui` y `guards`: la caza el gate completo, que es justo para lo que existe
- `tests/unit/identity/account-status-scope.test.ts` — `SITIOS_PERMITIDOS`, bloque rotulado propio
  con las **cinco** entradas de QC-67, cada una con el requisito que la autoriza, al estilo de los
  bloques que ya dejaron QC-78 y QC-66

**Los dos rojos que dio el gate, y su diagnostico.**

1. `account-status-scope` — **rojo legitimo**. La pantalla nombra el estado de cuenta porque es
   exactamente lo que su spec le manda: etiquetarlo, filtrarlo, pintarlo y moverlo. Se resolvio
   dando de alta los cinco archivos en la lista cerrada, **sin tocar produccion**.
2. `usuarios-viewport` — **falso positivo del propio detector**, no de la UI. El `100vh` que veia
   era `--available-height`, una **variable de medida** que el posicionador de **Base UI** siembra
   al abrir el selector (`useAnchorPositioning.js`), y que `components/ui/select.tsx` consume como
   `max-h-(--available-height)`: un **techo**, no una altura. Verificado ademas por `grep`: ningun
   archivo de la ruta escribe `100vh`, `h-screen` ni `min-h-screen`. El helper paso de buscar la
   **subcadena** `100vh` a mirar **declaraciones de altura reales** (`height` / `min-height` /
   `max-height`), ignorando las propiedades personalizadas, **con siete casos anti-vacuidad** que
   demuestran que sigue mordiendo. Se tenso en **precision**, no se aflojo en severidad.

## Mapa `R<n> -> test`

| R | Test real |
| --- | --- |
| R1 | `usuarios-route-contract.test.ts` — la pagina vive en la ruta DERIVADA de `USERS_ROUTE`, no en un literal |
| R2 | `private-nav-usuarios.test.ts` — tercer item, orden intacto, seccion no duplicada ni renombrada |
| R3 | `private-nav-usuarios.test.ts` + `usuarios-page.test.tsx` — item y pagina exigen el MISMO codigo; sin el permiso el item no se emite |
| R4 | `usuarios-page.test.tsx` — sin sesion redirige al login; con sesion sin permiso `notFound()`; con permiso renderiza |
| R5 | `usuarios-route-contract.test.ts` + `guard-rutas-privadas-cubiertas` |
| R6 | `user-row-actions.test.tsx` + `user-table.test.tsx` + `usuarios-page.test.tsx` — sin `usuarios.modificar` no se emite NINGUNA escritura (ni disparador, ni panel, ni dialogos); con el, las cuatro |
| R7 | `user-list-section.test.tsx` — `unauthorized` produce estado de error SIN un solo dato |
| R8 | `usuarios-convenciones.test.ts` — ningun `'use client'` importa composicion ni base de datos |
| R9 | `data-table-intacta-usuarios.test.ts` + `user-table.test.tsx` |
| R10 | `user-columns.test.tsx` — las SEIS claves exactas |
| R11 | `user-list-section.test.tsx` + `e2e/usuarios.spec.ts` — no se anade fila del actor ni aviso de ausencia |
| R12 | `user-table.test.tsx` — cambiar el termino NAVEGA, no filtra en cliente |
| R13 | `user-list-params.test.ts` + `user-columns.test.tsx` — filtro multivalor y UNICO |
| R14 | `user-columns.test.tsx` — ordenables LEIDAS de `USER_QUERYABLE.sortable` |
| R15 | `user-list-params.test.ts` — ancla contra el contrato: la lista blanca no se amplia |
| R16 | `user-table.test.tsx` — 10/25 y paginacion |
| R17 | `user-list-params.test.ts` — ninguna entrada produce error |
| R18 | `user-list-empty.test.tsx` |
| R19 | `user-list-section.test.tsx` — cargando, y error con el mensaje devuelto y reintentar |
| R20 | `user-columns.test.tsx` + `user-labels.test.ts` — se pinta el estado ALMACENADO; no se lee `lockedUntil` |
| R21 | `usuarios-viewport.test.tsx` — scroll horizontal contenido en la tabla |
| R22 | `user-sheet.test.tsx` — panel lateral; al cerrar, misma URL |
| R23 | `user-form.test.tsx` — exactamente NUEVE nombres en el `FormData` |
| R24 | `user-form.test.tsx` + `user-list-section.test.tsx` — opciones desde `listRolesAction`; fallo -> degradado, sin opciones inventadas |
| R25 | `user-form.test.tsx` — tipo de documento desde `DOCUMENT_TYPE_CODES` |
| R26 | `user-sheet.test.tsx` — precarga con `getUserAction`, tres estados del panel, reemplazo completo |
| R27 | `user-form.test.tsx` — reparto por `code`, panel abierto, valores conservados |
| R28 | `user-sheet.test.tsx` — toast neutro, sin credencial ni enlace |
| R29 | `user-sheet.test.tsx` + `usuarios-convenciones.test.ts` — refresco sin cambiar URL; UN solo `<Toaster />` |
| R30 | `delete-user-dialog.test.tsx` — nombra al usuario; sin confirmar no invoca |
| R31 | `delete-user-dialog.test.tsx` — `self_operation` y `last_administrator` DENTRO del dialogo, fila intacta |
| R32 | `user-status-dialog.test.tsx` — una accion, cuatro valores, confirmacion |
| R33 | `user-status-dialog.test.tsx` — rechazo dentro, estado de la fila intacto |
| R34 | `user-status-dialog.test.tsx` — `blocked -> active` se ofrece igual; no se tocan contadores |
| R35 | `user-form.test.tsx` + `user-columns.test.tsx` + `usuarios-convenciones.test.ts` — ningun dato de credencial en props ni en el envio |
| R36 | `usuarios-convenciones.test.ts` — imports por ruta exacta, `{status:'idle'}` local, sin `fetch` |
| R37 | `usuarios-convenciones.test.ts` — sin cambios en `identity`, `db/` ni `package.json`, con anti-vacuidad |
| R38 | `usuarios-convenciones.test.ts` — barrel y ausencia de rutas profundas |
| R39 | `usuarios-convenciones.test.ts` + las listas cerradas tensadas y verdes |
| R40 | `usuarios-viewport.test.tsx` — los dos anchos, con anti-vacuidad del detector |
| R41 | Las guardias de convencion barren toda `tests/unit/configuracion-ui/` y prohiben identificar por copy: los 17 archivos de test de esta ficha pasan bajo ellas |
| R42 | `e2e/usuarios.spec.ts` — alta + `pending`, y 404 sin permiso, en Chromium y WebKit |

Todos los archivos de la tabla viven en `tests/unit/configuracion-ui/`, salvo `e2e/usuarios.spec.ts`
y las guardias de `tests/guards/`. **Los 42 requisitos tienen test; ninguno queda sin anclar.**


## Salida de los tests

`./init.sh` **completo**, tercera corrida, 2026-09-11:

```
Test Files  346 passed (346)
     Tests  4704 passed | 31 skipped (4735)
  Duration  172.91s
aviso: 5 archivo(s) del baseline ya pasan; toca limpiarlos
✓ tests: sin rojos nuevos (0 rojos, todos en el baseline de 5); 5 por limpiar
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
```

E2E con Playwright (`pnpm exec playwright test e2e/usuarios.spec.ts`):

```
✓ [chromium] sin `usuarios.consultar` recibe 404 dentro del layout privado y no ve la tabla (10.4s)
✓ [chromium] da de alta un usuario y lo ve en la lista con estado pending           (12.7s)
✓ [webkit]   sin `usuarios.consultar` recibe 404 ...                                (13.5s)
✓ [webkit]   da de alta un usuario ...                                              (17.2s)
4 passed (24.9s)
```

**Dos avisos honestos sobre las corridas del gate.**

- Hicieron falta **tres** corridas completas. La primera y la segunda cayeron con **un solo rojo**
  cada una, y las dos veces fue `tests/unit/inventario/product-page.test.tsx`, un archivo que esta
  ficha **no toca**. No es regresion, y no se da por bueno a ojo: (a) el archivo pasa AISLADO,
  42/42 en 30 s; (b) el fallo **cambio de linea** entre corridas —1096 y luego 1509—, que es firma
  de plazo agotado y no de rotura determinista; (c) `git diff` confirma que el rango de esta rama
  no toca `app/(private)/inventario`, `lib/modules/inventario` ni `tests/unit/inventario`; (d) la
  tercera corrida completa salio limpia con el archivo dentro; (e) hay sesiones en paralelo en
  otros worktrees compitiendo por CPU. Es **el flake de saturacion que documenta QC-58**.
  **NO se anadio al baseline**: apagaria un archivo ajeno entero, y esa decision es humana y
  explicita —asi se tomo la de `product-crud.int.test.ts` el 2026-09-10—. Queda **para que el
  humano decida**.
- El gate avisa de que **5 entradas del baseline ya pasan y toca limpiarlas**. Es **deuda previa y
  ajena** a esta ficha —ninguna de las cinco es suya— y no se toco: limpiarlas es su propia
  decision, no un efecto colateral de esta.

