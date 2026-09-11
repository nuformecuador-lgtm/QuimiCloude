# QC-67 — pantalla-de-usuarios · tasks.md

> Checklist de implementación. Cada task tiene criterio de «hecho» verificable. `[P]` = puede ir en
> paralelo con las otras `[P]` de su bloque.
>
> **Cierre de tanda**: `./init.sh --rapido`. **Cierre de feature y antes del PR**: `./init.sh`
> completo, sin excepción (regla 5 de `CLAUDE.md`).
>
> Toda ruta es relativa al worktree `.worktrees/QC-67-pantalla-de-usuarios`.

## T0 — Inventario de lo heredado (BLOQUEA todo lo demás)

- [x] Verificar en el worktree que existen y compilan: las seis actions de
      `lib/modules/identity/adapters/driving/user-actions.ts`, `listRolesAction` de
      `role-actions.ts`, `requirePagePermission`, `components/shared/data-table` (con filtro
      `select` multivalor), `PAGE_SIZE_OPTIONS` (10/25), `<Toaster />` del layout privado y la
      sección «Configuración» con sus **dos** ítems.
- [x] Anotar en `progress/impl_QC-67-pantalla-de-usuarios.md` qué se hereda. **Nada de esto se
      re-crea** (R39).
- **Hecho cuando**: la nota existe y `./init.sh --rapido` está verde antes de tocar nada.

## Bloque 1 — Ruta, protección y navegación (va ANTES que la página)

### T1 — `USERS_ROUTE` + prefijo privado *(depende de T0)*

- [x] Añadir `USERS_ROUTE = '/configuracion/usuarios'` a `lib/shared/routes.ts`, con su comentario.
- [x] Añadir la fila correspondiente a `PRIVATE_ROUTE_PREFIXES`, **en el mismo commit**.
- [x] Crear `app/(private)/configuracion/usuarios/page.tsx` mínimo para que la guardia de rutas
      cubiertas tenga carpeta que comparar.
- [x] Test de contrato de ruta (`usuarios-route-contract.test.ts`): el `page.tsx` vive en
      `app/(private)${USERS_ROUTE}/page.tsx` **derivado de la constante**, y la constante está en
      `PRIVATE_ROUTE_PREFIXES`.
- **Hecho cuando**: `guard-rutas-privadas-cubiertas` verde y el test de contrato pasa. **(R1, R5)**

### T2 — El ítem de Usuarios en la sección Configuración *(depende de T1)*

- [x] `USERS_LABEL` y el **tercer** ítem de `NAV_SECTION_CONFIGURATION` en `private-nav.ts`, al
      final del array, con `permission: 'usuarios.consultar'` y `href: USERS_ROUTE`. Sin tocar los
      dos ítems existentes ni la etiqueta de la sección.
- [x] Test `private-nav-usuarios.test.ts`: el ítem existe, apunta a la constante, declara ese
      permiso, y la sección sigue teniendo sus tres ítems **en ese orden**.
- [x] Test de coherencia ítem↔página: el permiso del ítem es **el mismo** código que exige
      `page.tsx`.
- **Hecho cuando**: `guard-nav-permisos-declarados` y `guard-nav-serializable` siguen verdes.
  **(R2, R3)**

### T3 — Corte por permiso de la página y decisión `canModify` *(depende de T1)*

- [x] `page.tsx`: `await requirePagePermission('usuarios.consultar')` en la **primera** línea, antes
      de resolver `searchParams`.
- [x] Resolver `canModify` con `identity.getSessionUser()` + `assertPermission(...)` —**nunca** un
      `permissions.includes(...)` a mano— y pasarlo por props.
- [x] Tests: sin sesión → redirige al login; con sesión sin `usuarios.consultar` → `notFound()`; con
      el permiso → renderiza; el archivo **no** contiene ninguna comparación manual del conjunto de
      permisos.
- **Hecho cuando**: los cuatro tests pasan. **(R4, R6 mitad servidor, R8)**

## Bloque 2 — Piezas puras (antes de la UI)

### T4 [P] — `user-list-params.ts` *(depende de T1)*

- [x] Parser y serializador puros: `page`, `pageSize` (contra `PAGE_SIZE_OPTIONS`), `sort` (contra
      `USER_QUERYABLE.sortable` **importado**), `status` (multivalor, contra `USER_ACCOUNT_STATUSES`
      **importado**), `q`. `userListHref` derivado de `USERS_ROUTE`.
- [x] Tests: `parse(build(p)) === p`; página 0 / negativa / `'1e3'` → primera página; tamaño 7 →
      10; campo de orden no declarado → sin orden; `status=pending,marciano` → solo `pending`;
      `status=marciano` → sin filtro; ninguna entrada produce error.
- **Hecho cuando**: la suite del parser pasa sin montar la pantalla. **(R13, R14, R16, R17)**

### T5 [P] — `user-labels.ts` *(depende de T0)*

- [x] Etiquetas de los cuatro estados en un `Record<UserAccountStatus, string>` (typecheck como
      garantía), opciones del filtro derivadas de `USER_ACCOUNT_STATUSES`, nombres accesibles de las
      acciones de fila compuestos con el nombre del usuario, y `toDateInputValue(date)` en **UTC**.
- [x] Tests: hay etiqueta para los cuatro estados y para ninguno más; `toDateInputValue` devuelve
      `YYYY-MM-DD` y **no** resta un día en husos negativos.
- **Hecho cuando**: los tests pasan. **(R20, R26 formato de fecha)**

### T6 [P] — `user-columns.tsx` + `user-row-actions.tsx` *(depende de T5)*

- [x] Seis columnas exactas (cinco de datos + acciones con `pinnable: false`); `sortable` solo en
      las que declara `USER_QUERYABLE.sortable`; `filter: 'select'` solo en `accountStatus`.
- [x] `UserRowActions`: con `canModify === false` devuelve **`null`** (celda vacía, sin botones
      deshabilitados ni explicación); con `true`, tres acciones siempre en el DOM, cada una con
      nombre accesible que nombra al usuario, y objetivo táctil de 44×44.
- [x] Tests: las claves de columna son exactamente las seis; no aparece `id`, ni ningún campo de
      credencial, ni `companyId`; `displayName` y `roleName` **no** son ordenables; sin `canModify`
      la celda no emite nada.
- **Hecho cuando**: los dos tests pasan. **(R10, R13, R14, R15, R6 mitad cliente)**

## Bloque 3 — Página, sección y estados

### T7 — `user-list-section.tsx` + los tres estados *(depende de T3, T4, T5)*

- [ ] `Promise.all([listUsersAction(params), listRolesAction()])`; el primero decide el estado de
      la pantalla, el segundo se **degrada** (la lista se pinta, el panel recibe el error de roles).
- [ ] Vacío (con «limpiar búsqueda» y «volver a la primera página» según proceda), cargando
      (esqueleto vía `key` del `<Suspense>`) y error (mensaje devuelto + reintentar).
- [ ] Tests: los tres estados; `unauthorized` en el listado → estado de error **sin un solo dato**;
      fallo de roles → la lista **sí** se pinta; los parámetros se pasan **enteros y sin traducir**
      a `listUsersAction`.
- **Hecho cuando**: pasan. **(R7, R18, R19, R24 degradado)**

### T8 — `user-table.tsx` *(depende de T6, T7)*

- [ ] `<DataTable>` por el barrel público, `status: 'idle'` siempre, navegación por URL con
      `userListHref`, selector 10/25 y paginación.
- [ ] Test `data-table-intacta-usuarios.test.ts`: ningún archivo de
      `components/shared/data-table/` cambia respecto a `dev`.
- [ ] Tests: cambiar búsqueda, filtro, orden, tamaño o página **navega** (no filtra en cliente).
- **Hecho cuando**: pasan. **(R9, R12, R13, R14, R16)**

## Bloque 4 — Escrituras

### T9 — `user-sheet.tsx` + `user-form.tsx` *(depende de T7)*

- [ ] Panel único para alta y edición; `{ status: 'idle' }` construido **aquí**; actions importadas
      por su **ruta exacta**.
- [ ] Los nueve campos y **ninguno más** (`USER_BUSINESS_FIELDS` exportada); `documentTypeCode`
      desde `DOCUMENT_TYPE_CODES`; `roleId` desde `listRolesAction`.
- [ ] Edición: `getUserAction(id)` al abrir, con sus estados cargando/error dentro del panel;
      precarga los nueve; envía reemplazo completo.
- [ ] Mapa `code -> campo` tipado con `ErrorCode`; el resto a la región `role="alert"`;
      `unexpected` vía `UnexpectedErrorNotice`.
- [ ] Tests: el `FormData` lleva exactamente los nueve nombres y **ningún** campo de credencial,
      empresa o estado; `duplicate_email` pinta junto al correo y `role_not_found` junto al rol; un
      rechazo **no** cierra el panel ni pierde lo escrito; el selector de rol sin catálogo no
      inventa opciones.
- **Hecho cuando**: pasan. **(R22, R23, R24, R25, R26, R27, R35, R36)**

### T10 [P] — `delete-user-dialog.tsx` *(depende de T6)*

- [ ] Confirmación que **nombra** al usuario; `id` como campo oculto; error dentro del diálogo por
      su `code`, diálogo abierto, fila intacta.
- [ ] Tests: sin confirmar no se invoca la action; `self_operation` y `last_administrator` se pintan
      dentro y no retiran la fila.
- **Hecho cuando**: pasan. **(R30, R31)**

### T11 [P] — `user-status-dialog.tsx` *(depende de T6)*

- [ ] **Una** acción «Cambiar estado» con selector de los **cuatro** valores derivados de
      `USER_ACCOUNT_STATUSES` y confirmación; `id` + `accountStatus` en el `FormData`.
- [ ] Tests: se ofrecen los cuatro valores y ninguno se excluye por el estado actual; no hay botones
      por verbo; `blocked → active` se ofrece igual; el rechazo se pinta dentro y **no** cambia el
      estado pintado en la fila.
- **Hecho cuando**: pasan. **(R32, R33, R34)**

### T12 — Éxito, toast y refresco *(depende de T9, T10, T11)*

- [ ] Cierre + toast + `router.refresh()` en las cuatro mutaciones; toast del alta **neutro**, sin
      credencial ni enlace.
- [ ] Test: en la zona privada hay **exactamente un** `<Toaster />`; tras un alta con éxito se
      refresca sin cambiar la URL (los parámetros de lista sobreviven).
- **Hecho cuando**: pasan. **(R28, R29)**

## Bloque 5 — Convenciones, plataforma y extremo a extremo

### T13 — Barrel y convenciones *(depende de T6–T12)*

- [ ] `components/index.ts` reexporta todos los componentes de la ruta; `page.tsx` importa **solo**
      por el barrel; en la carpeta de la ruta solo quedan archivos del App Router.
- [ ] Test `usuarios-convenciones.test.ts`: sin componentes sueltos, sin imports por ruta profunda,
      sin `fetch` a rutas propias, sin import de las actions desde `@/lib/modules/identity`, sin
      `lib/composition` ni cliente de base de datos en archivos `'use client'`.
- [ ] `git diff --stat` no toca `lib/modules/identity/**`, `db/**` ni `package.json`.
- **Hecho cuando**: pasa y las guardias de arquitectura siguen verdes. **(R37, R38, R39, R41)**

### T14 — Multiplataforma *(depende de T8, T9, T10, T11)*

- [ ] Test `usuarios-viewport.test.tsx` en angosto y ancho con `tests/helpers/viewport.ts`: sin
      `100vh`, objetivos ≥ 44×44, campos ≥ 16 px, acciones en el DOM sin `:hover`, scroll horizontal
      contenido en la tabla.
- **Hecho cuando**: pasa en los dos anchos, sin excepción declarada. **(R21, R40)**

### T15 — E2E *(depende de T8–T12)*

- [ ] `e2e/usuarios.spec.ts`: login → pantalla → **crear un usuario** → verlo en la lista con estado
      `pending`.
- [ ] Segundo caso: sesión válida **sin `usuarios.consultar`** → **404 dentro del layout privado**,
      sin tabla y sin nombrar el módulo.
- **Hecho cuando**: los dos pasan con Playwright. Cierra la E2E que QC-66 difirió aquí. **(R42)**

### T16 — Cierre *(depende de todo)*

- [ ] `./init.sh` completo en verde.
- [ ] `progress/impl_QC-67-pantalla-de-usuarios.md` con el mapa `R<n> -> test` de abajo, relleno con
      los nombres reales de archivo.
- [ ] Entrada en `progress/history.md`.

## Mapa `R<n> -> test` (lo exige `CHECKPOINTS.md > Trazabilidad`)

| R | Test previsto |
| --- | --- |
| R1 | `usuarios-route-contract.test.ts` — la página vive en la ruta derivada de `USERS_ROUTE` |
| R2 | `private-nav-usuarios.test.ts` — tercer ítem, orden intacto, sección no duplicada |
| R3 | `private-nav-usuarios.test.ts` + `usuarios-page.test.tsx` — ítem y página exigen el mismo código; sin permiso el ítem no se emite |
| R4 | `usuarios-page.test.tsx` — sin sesión redirige; sin permiso `notFound()`; con permiso renderiza |
| R5 | `usuarios-route-contract.test.ts` + `guard-rutas-privadas-cubiertas` |
| R6 | `user-row-actions.test.tsx` + `usuarios-page.test.tsx` — sin `usuarios.modificar` no se emite ninguna escritura; con él, las cuatro |
| R7 | `user-list-section.test.tsx` — `unauthorized` → error sin datos |
| R8 | `usuarios-convenciones.test.ts` — los `'use client'` no importan composición ni DB |
| R9 | `data-table-intacta-usuarios.test.ts` + `user-table.test.tsx` |
| R10 | `user-columns.test.tsx` — las seis claves exactas |
| R11 | `user-list-section.test.tsx` — no se añade fila del actor ni aviso de ausencia |
| R12 | `user-table.test.tsx` — cambiar el término navega, no filtra en cliente |
| R13 | `user-list-params.test.ts` + `user-columns.test.tsx` — filtro multivalor y único |
| R14 | `user-columns.test.tsx` — ordenables = `USER_QUERYABLE.sortable` |
| R15 | `user-list-params.test.ts` — la lista blanca del módulo no cambia (comparación contra el contrato) |
| R16 | `user-table.test.tsx` — 10/25 y paginación |
| R17 | `user-list-params.test.ts` — ninguna entrada produce error |
| R18 | `user-list-empty.test.tsx` |
| R19 | `user-list-section.test.tsx` — cargando y error |
| R20 | `user-columns.test.tsx` — se pinta el estado almacenado; no se lee `lockedUntil` |
| R21 | `usuarios-viewport.test.tsx` — scroll contenido en la tabla |
| R22 | `user-sheet.test.tsx` — panel lateral; al cerrar, misma URL |
| R23 | `user-form.test.tsx` — exactamente nueve nombres en el `FormData` |
| R24 | `user-form.test.tsx` — opciones desde `listRolesAction`; fallo → sin opciones inventadas |
| R25 | `user-form.test.tsx` — tipo de documento desde `DOCUMENT_TYPE_CODES` |
| R26 | `user-sheet.test.tsx` — precarga con `getUserAction`, estados del panel, reemplazo completo |
| R27 | `user-form.test.tsx` — reparto por `code`, panel abierto, valores conservados |
| R28 | `user-sheet.test.tsx` — toast neutro, sin credencial ni enlace |
| R29 | `user-sheet.test.tsx` + `usuarios-convenciones.test.ts` — refresco sin cambiar URL; un solo `<Toaster />` |
| R30 | `delete-user-dialog.test.tsx` — nombra al usuario; sin confirmar no invoca |
| R31 | `delete-user-dialog.test.tsx` — `self_operation` y `last_administrator` dentro del diálogo |
| R32 | `user-status-dialog.test.tsx` — una acción, cuatro valores, confirmación |
| R33 | `user-status-dialog.test.tsx` — rechazo dentro, estado de la fila intacto |
| R34 | `user-status-dialog.test.tsx` — `blocked → active` se ofrece; no se tocan contadores |
| R35 | `user-form.test.tsx` + `user-columns.test.tsx` — ningún dato de credencial en props ni en el envío |
| R36 | `usuarios-convenciones.test.ts` — imports por ruta exacta, `{status:'idle'}` local, sin `fetch` |
| R37 | `usuarios-convenciones.test.ts` — sin cambios en `identity`, `db/` ni `package.json` |
| R38 | `usuarios-convenciones.test.ts` — barrel y ausencia de rutas profundas |
| R39 | `usuarios-convenciones.test.ts` + guardias heredadas verdes |
| R40 | `usuarios-viewport.test.tsx` |
| R41 | revisión del reviewer sobre los propios tests: ningún assert sobre literales de copy |
| R42 | `e2e/usuarios.spec.ts` — alta + `pending`, y 404 sin permiso |
