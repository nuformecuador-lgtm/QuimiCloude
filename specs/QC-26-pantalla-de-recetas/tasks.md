# QC-26 — pantalla-de-recetas · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task indica sus
dependencias, **los archivos que toca** y su **criterio de hecho** (verificable, no «parece bien»).
Un commit por task, formato `docs/conventions.md > Commits`.

**Recordatorio de gate** (`docs/verification.md`, `AGENTS.md > Regla del gate`): el `frontend_dev`
corre **sólo** `pnpm run typecheck`, `pnpm run lint` y `pnpm exec vitest related --run <sus
archivos>`. **No corre la suite completa.** `./init.sh --rapido` lo corre el **leader** al cerrar
cada tanda; `./init.sh` **completo**, al cerrar la feature y **antes del PR, sin excepción**.

**Esta feature es casi aditiva.** Crea todo bajo `app/(private)/produccion/formulas/` y
`lib/modules/unidades/`, y **sólo** edita cuatro archivos heredados, los que R51 autoriza
(`design.md > 1`):

- `lib/shared/routes.ts` · `lib/shared/navigation/private-nav.ts` ·
  `lib/composition/route-role-rules.ts` · `lib/composition/index.ts`
- (más `lib/modules/unidades/index.ts`, que es del módulo que esta ficha amplía por decisión
  cerrada, no un archivo ajeno)

Si una task te pide abrir **cualquier otro** archivo ajeno —y en particular
`lib/modules/recetas/**` o `lib/modules/inventario/**`, que son de QC-25 y QC-20 y están `done`—:
**para y avisa al leader** (R44).

---

## Bloque 0 — Precondiciones

### [x] T0 — Verificar la base heredada (BLOQUEA TODO)
- **Depende de**: que QC-11, QC-9, QC-20, QC-22, QC-24, QC-25 y QC-32 estén `done` y mergeadas en
  `dev`.
- **Qué se HEREDA ya montado y NO se re-crea** (comprobar uno por uno tras `git merge origin/dev`;
  esta T0 existe porque el choque entre las features 4 y 10 ya ocurrió una vez en este repo —
  `specs/11-*/tasks.md > T0`):
  1. `app/(private)/layout.tsx` con `SidebarProvider` + `SidebarInset` (que **es** el `<main>`) y
     **`<Toaster richColors />` ya montado** (QC-22 R22). **No se monta otro.**
  2. `components/private/app-sidebar.tsx` y `lib/shared/navigation/private-nav.ts` con
     `PRIVATE_NAV_ITEMS`, `BRAND_LABEL` y `FORMULAS_ROUTE` como placeholder. **El sidebar no se
     re-crea.**
  3. Primitivas de shadcn/ui presentes: `table`, `select`, `alert-dialog`, `sheet`, `sonner`,
     `button`, `input`, `label`, `skeleton`, `card`, `separator`, `tooltip`, `dropdown-menu`.
     **Ninguna se vuelve a añadir.**
  4. Vitest (`vitest.config.mts`, proyectos `ui`/`node`) y `tests/helpers/viewport.ts`; Playwright
     con sus specs y el patrón de fixtures de `e2e/session.spec.ts`. **No se montan.**
  5. Contrato público de `recetas` y sus cinco Server Actions, con `CreateRecipeFormState`,
     `UpdateRecipeFormState`, `DeleteRecipeFormState`, `RecipeQueryResult`, `RecipeListResult`.
     **El backend de recetas no se toca ni se amplía.**
  6. Contrato público de `inventario` y `listProductsAction`.
  7. `lib/shared/pagination.ts`, `lib/shared/routes.ts` (`PRIVATE_ROUTE_PREFIXES`) y
     `lib/composition/route-role-rules.ts` (`ROUTE_ROLE_RULES` con **una** fila).
  8. `lib/modules/unidades/` existe con `domain/unit-name.ts`, `domain/unit-catalog.ts` y
     `adapters/driven/persistence/unit-catalog-prisma.ts`, y **sin ningún adaptador driving**.
  9. **Que NO existe `app/(private)/produccion/`.**
- **Si falta cualquiera, o si el punto 9 falla: PARAR y avisar al leader.**
- **Hecho cuando**: los nueve puntos están verificados con su evidencia en
  `progress/impl_QC-26-pantalla-de-recetas.md`.

### [x] T1 — Anotar el contrato que se consume (BLOQUEA el código de datos)
- **Depende de**: T0.
- **Qué**: anotar en `progress/impl_QC-26-pantalla-de-recetas.md`: (a) la firma exacta de las siete
  actions que se usan; (b) que create/update **reciben un objeto tipado, no `FormData`, y no toman
  `prevState`** — por eso el formulario no usa `useActionState` (`design.md > 5`); (c) que ninguna
  llama a `revalidatePath`, por lo que el refresco es de la pantalla; (d) los campos de
  `RecipeSummary` y `RecipeDetail`, y cuáles quedan fuera de la lista (`id`, `createdBy`,
  `updatedBy`); (e) los **tres** estados de `image` en `updateRecipeSchema` y los **dos** en
  `createRecipeSchema`.
- **Hecho cuando**: los cinco puntos están anotados. Si algo difiere de `design.md > 0`, **parar y
  avisar**: cambia el diseño, no el contrato.

### [x] T2 — Instalar la dependencia aprobada y su fila del registro
- **Depende de**: T0 y de la aprobación del spec (F1.4). **Archivos**: `package.json`,
  `docs/dependencias.md`.
- **Qué**: instalar `@dnd-kit/core` y `@dnd-kit/sortable`. La fila de `docs/dependencias.md` va con
  estado **`excepcion`** y **tiene que decir qué check falló (el 2 — release en 12 meses, última
  publicación 2024-12-05) y por qué se aceptó**, más los otros tres checks y la fecha de aprobación
  humana (2026-09-03). Sin ese porqué la fila no vale (`docs/dependencias.md > Estados`).
- **Ninguna otra entrada nueva** (R45). Si algo más aparece en `package.json`, **parar y avisar**.
- **Hecho cuando**: `pnpm run test:guardias` pasa (incluida
  `guard-dependencias-aprobadas.test.ts`), y el diff de `package.json` contiene exactamente los
  paquetes aprobados y sus transitivos.

---

## Bloque 1 — Ruta, prefijo y regla de rol (va ANTES que las páginas)

### [x] T3 — Mudar la constante, cubrir el prefijo, declarar la segunda regla ruta→rol
- **Depende de**: T0. **Archivos**: `lib/shared/routes.ts`,
  `lib/shared/navigation/private-nav.ts`, `lib/composition/route-role-rules.ts`.
- **Qué** (`design.md > 2`, `> 3`):
  - mover `FORMULAS_ROUTE` a `lib/shared/routes.ts` y dejar en `private-nav.ts` el **reexport de
    compatibilidad**, con el mismo comentario que ya lleva `INVENTORY_ROUTE`;
  - añadir `NEW_RECIPE_ROUTE` y `recipeEditRoute(id)` derivados de la constante;
  - añadir `FORMULAS_ROUTE` a `PRIVATE_ROUTE_PREFIXES`;
  - añadir la segunda fila a `ROUTE_ROLE_RULES`:
    `{ prefix: FORMULAS_ROUTE, roles: [ADMIN_ROLE_NAME] }`, **reutilizando el import de
    `ADMIN_ROLE_NAME` que ese archivo ya tiene**;
  - exportar `RECIPES_LABEL` en `private-nav.ts`, cambiar la etiqueta del ítem y su `testId` a
    `nav-produccion-recetas`.
- **Va antes que las páginas a propósito** (`design.md > 14.1`): al revés,
  `guard-rutas-privadas-cubiertas.test.ts` pone el gate en rojo. **Ojo**: mientras la `page.tsx` no
  exista, el prefijo nuevo hará fallar la comprobación de «ningún prefijo sobra», así que T3 y T12
  cierran juntas la misma tanda del leader; si se separan, se anota el motivo.
- **Hecho cuando**: typecheck y lint limpios, `pnpm exec vitest related --run lib/shared/routes.ts`
  pasa y `grep` no encuentra `'/produccion/formulas'` como literal fuera de `routes.ts`.

---

## Bloque 2 — La lectura del catálogo de unidades (backend, decisión D4)

### [x] T4 — Dominio: caso de uso, actor y errores de `unidades`
- **Depende de**: T0. **Archivos**: `lib/modules/unidades/domain/actor.ts`,
  `domain/errors.ts`, `domain/list-units.ts`, `ports/unit-repository.ts`,
  `lib/modules/unidades/index.ts`.
- **Qué** (`design.md > 9`): `createListUnits({ units })` con `requireAdmin(actor)` **como primera
  línea**; `MAX_UNITS` declarado y pasado siempre al repositorio; el contrato público reexporta el
  caso de uso, sus tipos y `MAX_UNITS`, y **nunca** nada con `'use server'`.
- **Hecho cuando**: typecheck y lint limpios; `grep` confirma que `domain/` y `ports/` no importan
  `next/*`, `@prisma/client`, `lib/shared/` ni `@/lib/composition`; `pnpm run test:guardias` sigue
  verde.

### [x] T5 — [P] Adaptador driven y Server Action de unidades
- **Depende de**: T4. **Archivos**:
  `lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts`,
  `lib/modules/unidades/adapters/driving/unit-actions.ts`.
- **Qué**: `listUnits(limit)` con `prisma.unit.findMany({ orderBy: { name: 'asc' }, take: limit })`
  — **siempre con `take`** (R40); `listUnitsAction()` que resuelve el actor con
  `identity.getSessionUser()` vía `@/lib/composition`, igual que `recipe-actions.ts`, y traduce el
  error de dominio a estado serializable. **`unit-catalog-prisma.ts` no se toca.**
- **Hecho cuando**: typecheck y lint limpios; la action no repite `requireAdmin` ni ninguna regla.

### [x] T6 — Cablear la fachada `unidades` en el punto de composición
- **Depende de**: T4, T5. **Archivos**: `lib/composition/index.ts`.
- **Qué**: bloque **nuevo al final** del archivo, sin reordenar ni reformatear nada existente
  (`design.md > 14.7`): `export const unidades = { listUnits: createListUnits({ units: unitRepository }) }`.
- **Hecho cuando**: typecheck, lint y `pnpm run test:guardias` verdes, y el diff no toca ninguna
  línea previa del archivo.

### [x] T7 — [P] Tests del caso de uso y de la action de unidades
- **Depende de**: T5. **Archivos**: `tests/unit/unidades/list-units.test.ts`,
  `tests/unit/unidades/unit-actions.test.ts`.
- **Qué**: rol distinto de Administrador, actor nulo y rol desconocido → rechazo **con un doble del
  repositorio que falla si se le llama** (así R41 se prueba de verdad); el `take` que llega al
  repositorio es `MAX_UNITS`; el orden es estable por nombre; la action traduce el error de dominio
  sin relanzar y sin decidir nada.
- **Hecho cuando**: cubre R40, R41, R42 y sale en verde.

---

## Bloque 3 — La lista

### [x] T8 — Parser de parámetros de lista
- **Depende de**: T3. **Archivos**: `…/formulas/components/recipe-list-params.ts`, barrel.
- **Qué**: `parseRecipeListParams` puro (`design.md > 4.2`): `page` entero ≥ 1 con defecto 1;
  `pageSize` sólo 10 o 25, **importados** de `lib/shared/pagination`. Sin DOM, sin React.
- **Hecho cuando**: typecheck y lint limpios y el archivo no importa `react` ni `next/*`.

### [x] T9 — Columnas, tabla, esqueleto, vacío y error
- **Depende de**: T8. **Archivos**: `recipe-columns.ts`, `recipe-table.tsx`,
  `recipe-table-skeleton.tsx`, `recipe-list-empty.tsx`, `recipe-list-error.tsx`, barrel.
- **Qué** (`design.md > 4.3`): columnas como datos (`key`, `label`, `testId`), **sin** `id`,
  `createdBy` ni `updatedBy` (R9); imagen pintada con `imageUrl` **tal cual** y marcador cuando es
  `null` (R18); **ninguna marca ni aviso de líneas con producto de baja** —esa señal es solo del
  formulario y la lista no tiene de dónde sacarla sin romper R10 (`design.md > 13.L`)—; envoltorio
  con `overflow-x-auto` **en la tabla** (R19); esqueleto con tantas filas
  como `pageSize` (R16); vacío con acción de crear (R15); error con mensaje, `code` y reintento
  (R17).
- **Hecho cuando**: typecheck y lint limpios; `grep` no encuentra `100vh`, ni ninguna variable de
  entorno de almacenamiento, ni concatenación de URL de imagen en estos archivos.

### [x] T10 — Barra de herramientas: tamaño de página y paginación
- **Depende de**: T8, T9. **Archivos**: `recipe-list-toolbar.tsx`, barrel.
- **Qué**: selector con **10 y 25** (R11) y controles anterior/siguiente con «página X de Y»
  (R12). Cambiar cualquiera **navega** cambiando la cadena de consulta, nunca estado local.
  Controles ≥ 44×44 px (R50).
- **Hecho cuando**: typecheck y lint limpios; el componente no construye la URL con el literal de la
  ruta.

### [x] T11 — Diálogo de borrado
- **Depende de**: T9. **Archivos**: `delete-recipe-dialog.tsx`, barrel.
- **Qué**: `alert-dialog` que **nombra la receta** y advierte que no se puede deshacer; sólo al
  confirmar invoca `deleteRecipeAction(id)`; luego toast + `router.refresh()` (R39, R24).
- **Hecho cuando**: typecheck y lint limpios.

### [x] T12 — `page.tsx` de la lista y sección de datos
- **Depende de**: T9, T10, T11. **Archivos**: `…/formulas/page.tsx`,
  `…/components/recipe-list-section.tsx`, barrel.
- **Qué** (`design.md > 4.3`): Server Component con `metadata` construida con `BRAND_LABEL` y
  encabezado con `RECIPES_LABEL`, ambos **importados**; `<Suspense key={page-pageSize}>`;
  `RecipeListSection` `async` llama a `listRecipesAction` **una sola vez** (R10) y despacha a error
  / vacío / lista. Contenedor exterior `<div>`: **no se declara `main`** (R1). Importa **sólo desde
  `./components`** (R46).
- **Hecho cuando**: `pnpm run build` pasa y la URL responde 200 con sesión de Administrador en
  `pnpm dev` (evidencia anotada).

---

## Bloque 4 — El formulario

### [x] T13 — Armado del payload, puro y testeable
- **Depende de**: T1. **Archivos**: `components/recipe-form-state.ts`, barrel.
- **Qué** (`design.md > 5`, `> 8`): tipos del estado del formulario y `buildRecipePayload(mode,
  state)`. Los **tres** estados de la imagen se representan por **presencia de la clave**
  (`'image' in payload`), no por su valor (R35, R36); la cantidad se copia **tal cual, como
  cadena** (R29); los pasos salen en el orden mostrado (R32); las líneas van completas (R22). Sin
  React, sin DOM.
- **Hecho cuando**: typecheck y lint limpios y el archivo no importa `react` ni `next/*`.

### [x] T14 — [P] Selector de producto paginado
- **Depende de**: T1. **Archivos**: `product-picker.tsx`, barrel.
- **Qué** (`design.md > 6`): páginas con `listProductsAction({ page, pageSize: MAX_PAGE_SIZE })`
  —constante **importada**—, navegación de página dentro del propio desplegable con indicador de
  página actual y total (R28). **No filtra en cliente.**
- **Hecho cuando**: typecheck y lint limpios; `grep` confirma que no hay filtrado por texto sobre la
  lista descargada.

### [x] T15 — [P] Selector de unidad
- **Depende de**: T6. **Archivos**: `unit-picker.tsx`, barrel.
- **Qué**: recibe las unidades **por props** (R49), muestra `symbol` o, si es `null`, `name`, y
  envía el **id** (R30). Nunca texto libre.
- **Hecho cuando**: typecheck y lint limpios; el archivo no importa `@/lib/composition` ni `prisma`.

### [x] T16 — Campo de líneas de producto
- **Depende de**: T13, T14, T15. **Archivos**: `recipe-lines-field.tsx`, barrel.
- **Qué**: añadir y quitar líneas; receta sin líneas permitida (R27); cantidad `type="text"` con
  `inputMode="decimal"`, **nunca `type="number"`** (R29); error por línea con `aria-invalid` +
  `aria-describedby` a partir de `error.issues[].path` del esquema del contrato (R31).
- **Producto dado de baja** (`design.md > 6.1`, decisión cerrada del 2026-09-03): la línea cuyo
  `productName` es `null` se conserva y se reenvía intacta (R21), se marca en **su** celda con
  `data-testid="recipe-line-unavailable-<índice>"` (R53), y el bloque de líneas cierra con un aviso
  `role="status"`, `data-testid="recipe-lines-unavailable-notice"` y `data-count` con el número de
  líneas afectadas, **calculado en cada render** a partir de la lista (R54). Con cero afectadas el
  aviso **no se monta**.
- **Hecho cuando**: typecheck y lint limpios; `grep` no encuentra `type="number"`, `parseFloat(`,
  `Number(` ni `toFixed(` sobre la cantidad; el número del aviso sale de la lista de líneas y no de
  ningún booleano guardado al cargar.

### [x] T16b — [P] Tests del marcador y del aviso de líneas con producto de baja
- **Depende de**: T16. **Archivos**: `tests/unit/recetas-ui/recipe-lines-unavailable.test.tsx`.
- **Qué** (`design.md > 6.1`): (a) con **cero** líneas de baja el aviso **no existe** en el DOM y
  ninguna celda lleva marcador; (b) con **dos**, existen los dos marcadores —y solo en esas dos
  líneas—, el aviso existe y su `data-count` es `2`; (c) tras quitar una con `user-event` el
  `data-count` pasa a `1`; (d) tras quitar la última el aviso **desaparece**; (e) el payload enviado
  sigue conteniendo la línea marcada, intacta (R21 y R22 no se rompen). Asserts sobre `data-testid`,
  `role` y `data-count`, **nunca** sobre el copy.
- **Criterio de honestidad**: borrar el filtro que cuenta, el marcador o el desmontaje del aviso
  **debe** poner este test en rojo. Un test que solo comprobase «aparece algo» seguiría verde con el
  número mentiroso.
- **Hecho cuando**: cubre R53 y R54 y sale en verde.

### [x] T17 — Campo de pasos con arrastre y equivalente por teclado
- **Depende de**: T2, T13. **Archivos**: `recipe-steps-field.tsx`, barrel.
- **Qué** (`design.md > 7`): añadir, editar y quitar pasos (R32); `DndContext` + `SortableContext`
  con `verticalListSortingStrategy` (R33); **`KeyboardSensor` con `sortableKeyboardCoordinates`**
  y asa de arrastre como `<button>` con nombre accesible que incluye la posición, más los
  `announcements` de `aria-live` (R34); `PointerSensor` con `activationConstraint: { distance: 8 }`
  y asas ≥ 44×44 px siempre visibles (R50). **Éste es el único archivo de la feature que importa
  `@dnd-kit/*`** (`design.md > 10`).
- **Hecho cuando**: typecheck y lint limpios; `grep` confirma que ningún otro archivo importa
  `@dnd-kit`.

### [x] T18 — Campo de imagen con sus tres estados
- **Depende de**: T13. **Archivos**: `recipe-image-field.tsx`, barrel.
- **Qué** (`design.md > 8`): estado interno `untouched | replaced | cleared`; el control de quitar
  **no se ofrece en el alta** (R36); vista previa con `createObjectURL`/`revokeObjectURL` y, en
  edición sin tocar, la `imageUrl` del detalle (R37, R18); rechazo previo con
  `validateRecipeImage` y `MAX_IMAGE_BYTES` del **barrel** de `recetas`, con el error junto al campo
  (R38); los bytes se envían como `new Uint8Array(await file.arrayBuffer())`.
- **Hecho cuando**: typecheck y lint limpios. Si `Uint8Array` no cruza la frontera de la Server
  Action al probarlo en `pnpm dev`, **PARAR y avisar**: no se toca el esquema de QC-25.

### [x] T19 — El formulario y sus dos páginas
- **Depende de**: T16, T17, T18. **Archivos**: `recipe-form.tsx`, `…/formulas/nueva/page.tsx`,
  `…/formulas/[id]/page.tsx`, barrel.
- **Qué** (`design.md > 5`): componente controlado con `useTransition` —**no `useActionState`**, y
  el motivo queda escrito en el archivo—; validación previa con `createRecipeSchema` /
  `updateRecipeSchema` del **barrel** (R26); errores por campo y región `role="alert"` para los que
  no identifican campo, sin navegar fuera ni perder lo escrito (R23); con éxito navega a la lista,
  `toast.success` y `router.refresh()` (R24); **no monta ningún `<Toaster />`** (R25). La página de
  alta pide unidades y la primera página de productos; la de edición llama a `getRecipeAction(id)`
  y pinta «no encontrada» ante `not_found` (R21). Inputs a 16 px (R50).
- **Hecho cuando**: `pnpm run build` pasa; `grep` no encuentra `fetch(`, `@/lib/composition`,
  `prisma` ni `<Toaster` en los archivos de la ruta.

---

## Bloque 5 — Tests

### [x] T20 — [P] Tests de la lista
- **Depende de**: T12. **Archivos**: `tests/unit/recetas-ui/recipe-page.test.tsx`,
  `tests/unit/recetas-ui/recipe-list-params.test.ts`.
- **Qué**: ver el mapa de trazabilidad. Render dentro del layout privado con el patrón de mocks de
  `tests/unit/private-layout.test.tsx` y el helper `tests/helpers/viewport.ts`. Interacciones con
  `@testing-library/user-event`, nunca `fireEvent`. Asserts sobre roles ARIA, `data-testid` y
  constantes exportadas; **nunca** sobre literales de copy.
- **Hecho cuando**: cubre R1, R8-R19, R25, R39, R50 y sale en verde.

### [x] T21 — [P] Tests del formulario y del payload
- **Depende de**: T19. **Archivos**: `tests/unit/recetas-ui/recipe-form.test.tsx`,
  `tests/unit/recetas-ui/recipe-form-payload.test.ts`.
- **Qué**: los tres estados de la imagen por **presencia de clave**; la cantidad que llega a la
  action es la **misma cadena** que se escribió; el reordenado **completo por teclado** cambia el
  orden del payload (`design.md > 7`); quitar una línea la saca de la lista enviada; error de
  operación no navega ni pierde lo escrito; éxito navega, avisa y refresca.
- **Hecho cuando**: cubre R20-R24, R26-R38 y sale en verde. **Criterio de honestidad**: por cada
  test, preguntarse qué línea de producción se podría borrar sin que se pusiera rojo. Si la
  respuesta es «ninguna evidente», el test está mal escrito.

### [x] T22 — [P] Guardias de fuente y contrato de ruta
- **Depende de**: T19. **Archivos**: `tests/unit/recetas-ui/recipe-route-contract.test.ts`.
- **Qué**: lo que «no hacer» exige y no se observa renderizando (patrón de
  `tests/unit/dashboard-route-contract.test.ts`): las tres rutas derivadas de `FORMULAS_ROUTE`; sin
  literales de ruta; sin `fetch(`; sin `@/lib/composition` ni `prisma` en cliente; imports por
  barrel; sin `100vh`; `@dnd-kit` **sólo** en `recipe-steps-field.tsx`; sin `type="number"` en la
  cantidad; sin `createdBy`/`updatedBy` en las columnas; **el `data-testid` del marcador de producto
  de baja no aparece en ningún archivo de la lista** (R10 ampliado); sin búsqueda ni orden; sin `<Toaster />`
  propio; sin operaciones de creación, edición o borrado de unidades; sin cambios en
  `lib/modules/recetas/**` ni en `db/`.
- **Hecho cuando**: cubre R3, R7, R9, R10, R14, R18, R22, R25, R28, R29, R43, R44, R45, R46, R47,
  R48, R49, R50, R51.

### [x] T23 — [P] Tests de protección de ruta y rol
- **Depende de**: T3. **Archivos**: `tests/unit/identity/route-role-rules.test.ts` (ampliar),
  `tests/unit/identity/route-access.test.ts` (ampliar),
  `tests/unit/private-nav.test.ts` o equivalente ya existente (ampliar).
- **Qué**: existe la regla para `FORMULAS_ROUTE` con `ADMIN_ROLE_NAME` **y cubre las dos
  subrutas**; `decideRouteAccess` devuelve `allow` para Administrador y `redirect` con motivo
  `forbidden` para otro rol; sin sesión redirige al login (R4, R6); el ítem del sidebar apunta a la
  constante, ya **no** dice «Fórmulas» y comparte `RECIPES_LABEL` con el encabezado (R5). La regla
  de la ruta anterior **sigue existiendo**: no se sustituye, se añade.
- **Hecho cuando**: cubre R4, R5, R6 y `pnpm run test:guardias` sigue verde.

### [x] T24 — E2E del camino completo y del rechazo por rol
- **Depende de**: T19, T23. **Archivos**: `e2e/recetas.spec.ts`.
- **Qué** (`design.md > 12`): (1) login → la pantalla → «nueva» → alta con una línea de producto y
  un paso → la receta aparece en la lista; (2) sesión con rol distinto de Administrador pide la URL
  y acaba fuera sin ver la lista. **Sin subida de imagen.** Fixtures con prefijo `qc26_e2e_`,
  limpieza de huérfanos por edad y borrado en `afterAll`, copiando `e2e/session.spec.ts`. Asserts
  filtrando por el nombre con `RUN_ID`, **nunca** por «la primera fila» ni por totales.
- **Hecho cuando**: `pnpm run e2e` pasa en Chromium y WebKit y la base queda limpia. Si el worktree
  no tiene `DATABASE_URL`, el spec se escribe y **se declara NO ejecutado**, con el comando exacto
  anotado en `progress/impl_QC-26-pantalla-de-recetas.md`: el verde lo comprueba el leader.

---

## Bloque 6 — Verificación, trazabilidad y cierre

### [~] T25 — Verificación manual en navegador, con iOS incluido
- **Depende de**: T19.
- **Qué**: `pnpm dev` con sesión de Administrador. En ancho ≥ 1280 px y en ancho ≤ 375 px
  (emulación móvil **y**, para el scroll anidado y el arrastre táctil, Safari/WebKit real o
  simulador si está disponible): lista con scroll horizontal **dentro de la tabla y no del
  documento** (R19); arrastrar un paso con el dedo **sin secuestrar el scroll**; reordenar un paso
  **sólo con teclado** (R34); toast visible; diálogo de borrado alcanzable; ningún input hace zoom
  al enfocar; targets cómodos con el pulgar (R50).
- **Hecho cuando**: la comprobación está anotada (anchos, navegador y resultado) en
  `progress/impl_QC-26-pantalla-de-recetas.md`. Si algo falla en WebKit, **no se declara excepción
  de escritorio**: se arregla o se para y se reporta.

### [x] T26 — Mapa de trazabilidad `R<n> → test`
- **Depende de**: T7, T16b, T20, T21, T22, T23, T24, T25.
- **Qué**: volcar la tabla de abajo, ya con los nombres reales de los tests, en
  `progress/impl_QC-26-pantalla-de-recetas.md`, junto a los archivos tocados y la salida real.
- **Hecho cuando**: **los 54 requisitos (R1-R54)** tienen al menos un test nombrado. Un hueco es
  hallazgo bloqueante del reviewer.

### [x] T27 — [P] Declarar los «no aplica» de `CHECKPOINTS.md`
- **Depende de**: T19.
- **Hecho cuando**: cada punto de la lista del final de este archivo está copiado con su motivo en
  `progress/impl_QC-26-pantalla-de-recetas.md`.

### [ ] T28 — Gate completo y PR (lo cierra el leader)
- **Depende de**: T26, T27.
- **Hecho cuando**: `./init.sh` (completo, sin flags) termina en verde — **lo corre el leader** —,
  `package.json` contiene **sólo** los paquetes aprobados en T2,
  `progress/impl_QC-26-pantalla-de-recetas.md` tiene el mapa `R<n> → test` y la salida real, y el PR
  está abierto contra `dev` con título `feat(QC-26-pantalla-de-recetas): …`.

---

## Mapa de trazabilidad previsto (`R<n> → test`)

| Req | Test previsto | Archivo |
| --- | --- | --- |
| R1 | `la lista de recetas se renderiza dentro del armazon privado y no declara main propio` | recipe-page.test.tsx |
| R2 | `el alta y la edicion viven en subrutas derivadas de la constante y la edicion lleva el id` | recipe-route-contract.test.ts + recetas.spec.ts |
| R3 | `las tres rutas se derivan de FORMULAS_ROUTE y ningun archivo incrusta el literal` + `private-nav reexporta la constante en vez de redeclararla` | recipe-route-contract.test.ts |
| R4 | `las rutas de recetas estan cubiertas por un prefijo privado` + `sin sesion, pedirlas redirige al login` | guard-rutas-privadas-cubiertas.test.ts + route-access.test.ts |
| R5 | `el item del sidebar apunta a la constante, comparte RECIPES_LABEL con el encabezado y ya no dice Formulas` | private-nav (ampliado) + recipe-page.test.tsx |
| R6 | `existe una regla ruta-rol que restringe recetas y sus subrutas al rol Administrador` + `otro rol se redirige con motivo forbidden` + E2E `un no Administrador no ve el catalogo` | route-role-rules.test.ts + route-access.test.ts + recetas.spec.ts |
| R7 | `la pantalla no repite requireAdmin` + `un error unauthorized se presenta y no se muestran datos` | recipe-route-contract.test.ts + recipe-page.test.tsx |
| R8 | `la lista presenta todas las columnas de negocio declaradas` | recipe-page.test.tsx |
| R9 | `la lista no muestra id, createdBy ni updatedBy` (**en negativo**) | recipe-page.test.tsx + recipe-route-contract.test.ts |
| R10 | `pintar una pagina invoca la operacion de listado una sola vez y nunca la de detalle` + `la lista no pinta ninguna marca de linea con producto de baja` (**los dos en negativo**) | recipe-page.test.tsx |
| R11 | `el selector de tamano ofrece 10 y 25 y usa 10 por defecto` | recipe-page.test.tsx + recipe-list-params.test.ts |
| R12 | `permite avanzar y retroceder e indica pagina actual y total` | recipe-page.test.tsx |
| R13 | `los parametros invalidos o fuera de rango se acotan` | recipe-list-params.test.ts |
| R14 | `la pantalla no ofrece busqueda ni control de orden` (**en negativo**) | recipe-page.test.tsx + recipe-route-contract.test.ts |
| R15 | `sin recetas presenta el estado vacio con la accion de crear` | recipe-page.test.tsx |
| R16 | `mientras carga presenta el esqueleto en lugar de la lista` | recipe-page.test.tsx |
| R17 | `un error de la consulta presenta el estado de error con reintento y no una lista vacia` | recipe-page.test.tsx |
| R18 | `la imagen se pinta con la direccion que entrega la consulta y sin imagen se pinta el marcador` + `ningun archivo compone una URL de almacenamiento` | recipe-page.test.tsx + recipe-route-contract.test.ts |
| R19 | `el desbordamiento horizontal lo absorbe el envoltorio de la tabla y ningun ancestro` | recipe-page.test.tsx + T25 (WebKit) |
| R20 | `crear y editar navegan a su pagina propia y no abren panel ni modal` (**en negativo**) | recipe-page.test.tsx + recetas.spec.ts |
| R21 | `la edicion precarga el detalle y conserva la linea del producto dado de baja` + `una receta inexistente presenta el estado de no encontrada` | recipe-form.test.tsx |
| R22 | `quitar una linea la saca de la lista enviada y el guardado es una sola invocacion` | recipe-form.test.tsx + recipe-form-payload.test.ts |
| R23 | `un guardado rechazado muestra el error en linea, no navega y no pierde lo escrito` | recipe-form.test.tsx |
| R24 | `un guardado con exito vuelve a la lista, avisa por toast y refresca` | recipe-form.test.tsx + recetas.spec.ts |
| R25 | `la zona privada sigue teniendo exactamente una region de avisos` (**en negativo**) | recipe-page.test.tsx + recipe-route-contract.test.ts |
| R26 | `la validacion previa usa los esquemas del contrato y la ruta no declara reglas propias` | recipe-form.test.tsx + recipe-route-contract.test.ts |
| R27 | `se pueden anadir y quitar lineas y una receta sin lineas se guarda` | recipe-form.test.tsx |
| R28 | `el selector alcanza productos mas alla de la primera pagina y no filtra en cliente` (**en negativo**) | recipe-form.test.tsx + recipe-route-contract.test.ts |
| R29 | `la cantidad llega a la operacion como la misma cadena escrita` + `ningun archivo la convierte a numero` | recipe-form-payload.test.ts + recipe-route-contract.test.ts |
| R30 | `la unidad se elige del catalogo y viaja como id; sin simbolo se muestra el nombre` | recipe-form.test.tsx |
| R31 | `dos lineas del mismo producto no se envian y el error sale junto a la linea` | recipe-form.test.tsx |
| R32 | `los pasos se anaden, editan y quitan y se envian en el orden mostrado` | recipe-form.test.tsx + recipe-form-payload.test.ts |
| R33 | `reordenar por arrastre cambia el orden enviado` | recipe-form.test.tsx |
| R34 | `reordenar SOLO con teclado cambia el orden enviado y el asa anuncia su posicion` | recipe-form.test.tsx |
| R35 | `los tres estados de la imagen se distinguen por la presencia de la clave` | recipe-form-payload.test.ts |
| R36 | `el alta no ofrece quitar imagen y nunca envia el valor nulo` (**en negativo**) | recipe-form.test.tsx + recipe-form-payload.test.ts |
| R37 | `elegir un archivo muestra su vista previa y el envio en curso impide un segundo envio` | recipe-form.test.tsx |
| R38 | `un archivo demasiado grande o de formato no aceptado se rechaza sin invocar la operacion` | recipe-form.test.tsx |
| R39 | `el borrado pide confirmacion nombrando la receta y sin confirmar no invoca la operacion` | recipe-page.test.tsx |
| R40 | `el listado de unidades devuelve el catalogo ordenado y pide siempre un limite declarado` | list-units.test.ts |
| R41 | `sin actor, con rol desconocido o con rol distinto de Administrador se rechaza sin leer del repositorio` | list-units.test.ts + unit-actions.test.ts |
| R42 | `el dominio de unidades no importa framework, Prisma ni composicion y su contrato no reexporta la action` | guard-arquitectura-modulos + unit-actions.test.ts |
| R43 | `la pantalla obtiene las unidades solo por la operacion publicada` | recipe-route-contract.test.ts |
| R44 | `la feature no anade operaciones de escritura de unidades, no toca recetas y no cambia db/` (**en negativo**) | recipe-route-contract.test.ts |
| R45 | `package.json solo incorpora los paquetes de arrastre aprobados y su fila declara el check fallido` | guard-dependencias-aprobadas.test.ts + recipe-route-contract.test.ts |
| R46 | `los componentes de ruta se exponen por el barrel y no se importan por ruta profunda` | recipe-route-contract.test.ts |
| R47 | `ningun archivo de la ruta usa fetch a rutas API propias` | recipe-route-contract.test.ts |
| R48 | `ninguna primitiva de components/ui fue editada a mano` | recipe-route-contract.test.ts |
| R49 | `los componentes de cliente no importan composicion ni base de datos y reciben datos por props` | recipe-route-contract.test.ts + recipe-form.test.tsx |
| R50 | `las tres pantallas son usables en viewport angosto y ancho` + `sin 100vh, sin hover como unica via, tamanos tactiles y de fuente` | recipe-page.test.tsx + recipe-form.test.tsx + recipe-route-contract.test.ts |
| R51 | `la feature no duplica layout, sidebar, avisos ni primitivas: solo edita los archivos heredados autorizados` | recipe-route-contract.test.ts |
| R52 | `alta completa de una receta y rechazo de un no Administrador` | recetas.spec.ts |
| R53 | `solo la linea con productName nulo lleva el marcador de producto no disponible` | recipe-lines-unavailable.test.tsx |
| R54 | `sin lineas de baja no hay aviso; con dos el aviso cuenta dos; al quitar una cuenta una; al quitar la ultima desaparece` | recipe-lines-unavailable.test.tsx |

Ningún requisito queda huérfano: R1-R54, sin saltos. **R9, R10, R14, R18, R20, R22, R25, R28, R29,
R36, R44, R51 y R54 (su caso de cero) son tests en negativo a propósito**: mostrar el autor, pedir el detalle por fila,
colar un buscador que miente, componer la URL de la imagen a mano, volver al panel lateral, montar
un segundo `<Toaster />`, convertir la cantidad a número o colar el CRUD de unidades son justo las
cosas que una feature posterior puede añadir sin que nada se ponga rojo.

## Cobertura de las decisiones cerradas

La tabla completa está en `requirements.md > Cobertura de las decisiones cerradas`: cada una de las
21 filas —incluidas las dos que el humano cerró en F1.4— tiene al menos un `R<n>`, y cada `R<n>`
tiene al menos un test en el mapa de arriba.

## Checklist de `CHECKPOINTS.md`: qué «no aplica» (declararlo, no omitirlo)

- **Datos y seguridad (Supabase)** — tablas, RLS, migraciones, `down.sql`, secretos, webhooks:
  **NO APLICA**. Cero cambios en `db/` (R44): el esquema de recetas es de QC-24 y el de unidades de
  QC-32, ya mergeados con su RLS forzada.
- **«Cada permiso se valida en el SERVICE y tiene su test»**: **SÍ APLICA, y en dos mitades.** Para
  las cinco operaciones de receta **ya está cumplido por QC-25** y esta ficha **no lo
  re-implementa** (R7). Para la operación nueva de unidades **lo aporta esta ficha** (R41, T7). El
  corte de ruta es adicional y **no cuenta como autorización**.
- **Módulos hexagonales**: **SÍ APLICA** al módulo `unidades`, que gana dominio, puerto, adaptador
  driven y adaptador driving (R42). El contrato público no reexporta ninguna Server Action.
- **Mutaciones internas usan Server Actions**: **SÍ APLICA** (R47).
- **Componentes privados reciben datos por props**: **SÍ APLICA** (R49).
- **E2E de flujo crítico**: **SÍ APLICA**, T24, sin la subida de imagen y con el motivo escrito.
- **Multiplataforma**: **SÍ APLICA**, sin excepción declarada (R50, T25).
- **Dependencias**: **una añadida** (`@dnd-kit/core` + `@dnd-kit/sortable`), como **`excepcion`**
  con aprobación humana citada en `design.md > 10` y el check fallido escrito en su fila (R45).

## Deudas y notas que esta feature deja registradas (no silenciosas)

- **`dnd-kit` no se publica desde 2024** (pregunta abierta 3). Aislada en un solo archivo para que
  la salida a `@atlaskit/pragmatic-drag-and-drop` sea barata.
- **Sigue sin haber búsqueda** ni en recetas ni en productos (pregunta abierta 2): es la misma deuda
  que dejó QC-22 y **sigue sin ficha**.
- **Quién puede leer el catálogo de unidades** (pregunta 4): **cerrada el 2026-09-03**, solo
  Administrador (R41, `design.md > 9`). Si QC-38 necesita otro rol, lo relaja esa ficha.
- **Marcar en la lista las recetas con producto de baja** (pregunta 5): **descartado** por coste
  —exigiría un campo nuevo en el listado de QC-25, `done`, o 25 consultas de detalle por página, que
  rompen R10 (`design.md > 13.L`)—. Si algún día el listado trae ese campo, es ficha de backend y la
  decisión se revisa; hoy R10 lo prohíbe explícitamente.
- **`revalidatePath` en las actions de `recetas`** sería más barato que `router.refresh()` si más
  pantallas repiten el patrón. Es ficha de backend (`design.md > 13.I`).
- **El ítem «Fórmulas» del sidebar pasa a «Recetas»** y deja de dar 404; la pregunta abierta 1 deja
  escrito qué pasaría si algún día fórmula y receta dejan de ser lo mismo.
