# QC-56 — migrar-listas-a-tabla-compartida · tasks.md

> `[P]` = puede ir en paralelo con las demás `[P]` de su tanda (no comparten archivo).
> Todas las rutas son relativas a la raíz del worktree. `F` = `app/(private)/produccion/formulas/`
> y `S` = `app/(private)/proveedores/`.
>
> **Verificación de cada tarea (subagente):** `pnpm typecheck`, `pnpm lint` y
> `pnpm exec vitest related --run <archivos de la tarea>`. La suite completa y `./init.sh` los corre
> el leader (`AGENTS.md > Regla del gate`).

## Tanda 0 — Puerta

### T0 — Respuestas de F1.4 a H1, H2, H3 y a las preguntas abiertas 2 y 3
- **Archivos:** ninguno de producción. El leader anota las respuestas en `requirements.md` y, si
  cambian R19, R20 o R30, pide la revisión del spec antes de seguir.
- **Bloquea:** T1 (H2), T8 y T9 (H1, H3) y T4 (pregunta 2).
- **Hecho:** cada uno de H1, H2 y H3 tiene una variante elegida por escrito. Las preguntas 2 y 3
  tienen respuesta o constan como «sin respuesta: se queda como está».

## Tanda 1 — Piezas puras y declaraciones

### T1 [P] — Publicar `SUPPLIER_QUERYABLE` por el barrel de `proveedores` (H2)
- **Archivos:** `lib/modules/proveedores/index.ts`.
- **Depende de:** T0 (H2 aprobado).
- **Requisitos:** R11, R28.
- **Hecho:**
  - Una línea `export { SUPPLIER_QUERYABLE } from './domain/supplier-queryable';` y nada más en
    `lib/modules/`.
  - `tests/unit/shared/listas-blancas-listados.test.ts` y `tests/guards/guard-arquitectura-modulos.test.ts`
    siguen verdes.
  - Se ha buscado en `tests/` si algún test cierra la lista de exportaciones de ese barrel; si
    existe, se amplía en esta misma tarea y se añade a la lista de archivos.

### T2 [P] — Parser y serializador de la lista de recetas
- **Archivos:** `F/components/recipe-list-params.ts`, `tests/unit/recetas-ui/recipe-list-params.test.ts`.
- **Requisitos:** R11, R12, R13, R22.
- **Hecho:**
  - Exporta `PAGE_PARAM`, `PAGE_SIZE_PARAM`, `SORT_PARAM`, `SEARCH_PARAM`, `CREATED_FROM_PARAM`,
    `CREATED_TO_PARAM`, `CREATED_AT_COLUMN_ID`, `SORT_SEPARATOR`, `FIRST_PAGE`, `PAGE_SIZE_OPTIONS`,
    `SHARED_PAGE_SIZES`, `parseRecipeListParams` (devuelve `DataTableParams`), `buildRecipeListQuery`
    y `recipeListHref` (`design.md > 3`).
  - `RECIPE_QUERYABLE` se importa de `@/lib/modules/recetas`.
  - Tests nuevos, uno por fila de la tabla de `design.md > 3`: ida y vuelta `parse(build(p))`,
    campo de orden fuera de la lista blanca, fecha inexistente, término solo con espacios, y que las
    dos listas de tamaños coinciden.
  - Desaparecen del archivo `RecipeListParams` y `RecipePageSize` como forma de salida.

### T3 — Parser y serializador de la lista de proveedores
- **Archivos:** `S/components/supplier-list-params.ts`, `tests/unit/proveedores-ui/supplier-list-params.test.ts`.
- **Depende de:** T1.
- **Requisitos:** R11, R12, R13, R22.
- **Hecho:** lo mismo que T2 con `SUPPLIER_QUERYABLE` importado de `@/lib/modules/proveedores` y
  `supplierListHref` derivado de `SUPPLIERS_ROUTE`.

### T4 [P] — Fábrica de columnas de recetas
- **Archivos:**
  - borrar `F/components/recipe-columns.ts`;
  - crear `F/components/recipe-columns.tsx`;
  - solo con la variante B de H1: crear `F/components/recipe-columns-skeleton.ts`.
- **Depende de:** T0 (pregunta 2: si se acota la descripción).
- **Requisitos:** R2, R3, R5, R7, R9, R21.
- **Hecho:**
  - `'use client'`.
  - Exporta `buildRecipeColumns({ rowActions })`, `RecipeColumnId`, `RecipeColumn`, `EMPTY_CELL`,
    `IMAGE_COLUMN_ID`, `ACTIONS_COLUMN_ID`, `ACTIONS_COLUMN_LABEL` y `RECIPE_DEFAULT_PINNED_COLUMNS`
    (`[IMAGE_COLUMN_ID]`).
  - Las columnas y sus flags son exactamente los de `design.md > 4.1`.
  - Escribir `id: 'createdBy'` no compila.

### T5 [P] — Fábrica de columnas de proveedores
- **Archivos:** borrar `S/components/supplier-columns.ts`; crear `S/components/supplier-columns.tsx`.
- **Requisitos:** R2, R3, R4, R7, R9, R21.
- **Hecho:**
  - `'use client'`.
  - Exporta `buildSupplierColumns({ rowActions })`, `SupplierColumnId`, `SupplierColumn`,
    `EMPTY_CELL`, `ACTIONS_COLUMN_ID`, `ACTIONS_COLUMN_LABEL` y `SUPPLIER_DEFAULT_PINNED_COLUMNS`
    (`['name']`).
  - La celda de nombre es el `Link` de `supplierDetailRoute` con `supplier-detail-link` y
    `min-h-11 min-w-11`.

### T14 [P] — Enmiendas a QC-26 R14 y QC-44 R11
- **Archivos:** `specs/QC-26-pantalla-de-recetas/requirements.md` (bloque nuevo debajo de l.107),
  `specs/QC-44-pantalla-de-proveedores/requirements.md` (bloque nuevo debajo de la enmienda,
  l.95-115, sin reescribirla).
- **Depende de:** T0.
- **Requisitos:** R6, R8, R10 (trazabilidad de la inversión).
- **Hecho:**
  - Dos bloques «ENMIENDA DEL 2026-09-15 (QC-56, decisión humana)» con el formato de
    `specs/QC-22-pantalla-de-productos/requirements.md:105-121`.
  - Dicen qué se invierte, qué sigue protegido (nada se filtra en el cliente) y qué cambia de dueño.
  - El de QC-44 deja escrito que reabre su frase «La lista de PROVEEDORES no cambia» (l.106).
  - No se borra ni se renumera ningún requisito.

## Tanda 2 — Tablas de cliente

### T6 [P] — Tabla de recetas sobre la tabla compartida
- **Archivos:** `F/components/recipe-table.tsx` (reescrito).
- **Depende de:** T2, T4.
- **Requisitos:** R1, R6, R8, R9, R10, R14, R21, R22, R23.
- **Hecho:**
  - `'use client'`.
  - Exporta `RECIPE_TABLE_ID = 'recetas'`, `RECIPE_TABLE_TEXTS`, `RecipeTable` y `RecipeTableProps`.
  - Monta `<DataTable>` con las columnas de T4 y `rowActions` = `Link` a `recipeEditRoute` +
    `DeleteRecipeDialog`.
  - Navega con `recipeListHref` dentro de `startTransition`, con `aria-busy` y rótulo mientras
    `isPending`.
  - `rows` pasa sin transformar.
  - `grep -r "TABLE_ID = '" app` muestra que ningún otro `tableId` vale `'recetas'`.
  - No importa `components/ui/table`.

### T7 [P] — Tabla de proveedores sobre la tabla compartida
- **Archivos:** `S/components/supplier-table.tsx` (reescrito).
- **Depende de:** T3, T5.
- **Requisitos:** R1, R4, R6, R8, R9, R10, R14, R21, R22, R23.
- **Hecho:**
  - Lo mismo que T6 con `SUPPLIER_TABLE_ID = 'proveedores'`.
  - `rowActions` = `SupplierSheet` + `DeleteSupplierDialog`.
  - Ningún otro `tableId` vale `'proveedores'`.

## Tanda 3 — Sección, estados y página (bloqueada por H1 y H3)

### T8 [P] — Recetas: sección, estados, página y barrel
- **Archivos:**
  - `F/components/recipe-list-section.tsx`
  - `F/components/recipe-list-empty.tsx`
  - `F/components/recipe-table-skeleton.tsx` (se borra con la variante A; con la B se reescribe
    para contar columnas con `recipe-columns-skeleton.ts`)
  - borrar `F/components/recipe-list-toolbar.tsx`
  - `F/page.tsx`
  - `F/components/index.ts`
- **NO toca:** `F/components/recipe-list-error.tsx` (lo reutilizan `F/nueva/page.tsx` y
  `F/[id]/page.tsx`, H4), `F/nueva/**` ni `F/[id]/**`.
- **Depende de:** T0 (H1, H3), T6.
- **Requisitos:** R15, R16, R17, R18, R19, R20, R30.
- **Hecho:**
  - `listRecipesAction(params)` aparece una sola vez en la ruta.
  - El `<Suspense>` de `F/page.tsx` no tiene `key`.
  - Los estados siguen la variante elegida en `design.md > 5`.
  - «Volver a la primera» usa `recipeListHref({ ...params, page: FIRST_PAGE })`.
  - El barrel exporta todo lo nuevo y nada de lo borrado.
  - `F/nueva` y `F/[id]` compilan sin cambios.

### T9 [P] — Proveedores: sección, estados, página y barrel
- **Archivos:**
  - `S/components/supplier-list-section.tsx`
  - `S/components/supplier-list-empty.tsx`
  - `S/components/supplier-list-error.tsx` (se borra con la variante A)
  - `S/components/supplier-table-skeleton.tsx` (se borra con la A; se reescribe con la B)
  - borrar `S/components/supplier-list-toolbar.tsx`
  - `S/page.tsx`
  - `S/components/index.ts`
- **NO toca:** `S/[id]/**` (el catálogo ya está migrado).
- **Depende de:** T0 (H1, H3), T7.
- **Requisitos:** R15, R16, R17, R18, R19, R20, R30.
- **Hecho:**
  - Lo mismo que T8 para proveedores.
  - El `SupplierSheet` de la cabecera de `S/page.tsx` se conserva.
  - `S/[id]/page.tsx` compila sin cambios.

## Tanda 4 — Tests unitarios y centinela

### T10 [P] — Tests de la pantalla de recetas
- **Archivos:** `tests/unit/recetas-ui/recipe-page.test.tsx`.
- **Depende de:** T8.
- **Requisitos:** R1–R10, R14–R24.
- **Hecho:**
  - **Mapa `testId` (l.142-169):**
    - `recipe-table` → el contenedor de `RecipeTable`;
    - `recipe-row` → `data-table-row-<id>`;
    - `recipe-page-size`, `-previous`, `-next`, `-status` → `data-table-page-size`,
      `data-table-previous`, `data-table-next`, `data-table-page-indicator`;
    - `recipe-table-skeleton` y `recipe-row-skeleton` → según H1/H3.
  - **l.442-448:** se espera `listRecipesActionMock` con el `DataTableParams` completo.
  - **l.450-466 (negativo de QC-26 R14):** se reescribe en positivo según `design.md > 7`.
  - **l.490-500:** «volver a la primera» conserva orden, búsqueda y rango.
  - **l.502-513:** carga según la variante de H1.
  - **Casos nuevos**, al menos uno por requisito:
    - activar la cabecera `name` navega con `SORT_PARAM` (R6);
    - `description`, `stepCount` e `image` no tienen botón de orden (R7);
    - escribir en `data-table-search` navega tras `SEARCH_DEBOUNCE_MS` con temporizadores falsos (R8);
    - un atajo de fecha navega con `CREATED_FROM_PARAM` (R9);
    - las filas pintadas son las del simulador y en su orden (R10);
    - `aria-busy` mientras la transición está en vuelo, y el foco sigue en la búsqueda (R14);
    - `actions` no ofrece `data-table-pin-actions` y sus controles miden `min-h-11 min-w-11` (R21);
    - vistas angosta y ancha con `tests/helpers/viewport.ts`: sin scroll del documento (R24).
  - Ningún assert compara copy (R25).

### T11 [P] — Contrato de ruta de recetas
- **Archivos:** `tests/unit/recetas-ui/recipe-route-contract.test.ts`.
- **Depende de:** T8.
- **Requisitos:** R3, R10, R11, R15, R30.
- **Hecho:**
  - **`ARCHIVOS_DE_LA_LISTA` (l.119-127):** sin `recipe-list-toolbar.tsx`, `recipe-columns.ts`
    pasa a `.tsx`, y `recipe-table-skeleton.tsx` según H3.
  - **l.718-719 y l.758:** leen `recipe-columns.tsx`, que es donde vive ahora `recipe.imageUrl`.
  - **l.749-752 (negativo de QC-26 R14):** sustituido según `design.md > 7.3`.
  - **l.1327:** mantiene la comprobación sobre `recipe-table.tsx` y `recipe-list-section.tsx`.
  - **Se revisan y actualizan** si cierran listas de archivos o de exportaciones: l.996
    (`CARPETAS_LEGITIMAS`) y l.1233 (`exportadas`). Su contenido exacto no se ha verificado en el
    spec.

### T12 [P] — Tests de la pantalla de proveedores
- **Archivos:** `tests/unit/proveedores-ui/supplier-page.test.tsx`. Además
  `tests/unit/proveedores/supplier-route-contract.test.ts` **solo si** cierra la lista de archivos
  de la lista (comprobarlo al empezar y declararlo en `progress/impl_*`).
- **Depende de:** T9.
- **Requisitos:** R1–R4, R6–R10, R14–R24.
- **Hecho:**
  - Mapa `testId` (l.148-180) como en T10, con `supplier-detail-link` conservado.
  - **l.517-535 (negativo de QC-44 R11):** se reescribe en positivo según `design.md > 7`.
  - Los mismos casos nuevos que T10, cambiando `image`/`description`/`stepCount` por
    `phone`/`email`.
  - La columna fijada por defecto es `name`.

### T13 — Centinela de consumidores de la tabla compartida
- **Archivos:** `tests/unit/shared/data-table-alcance.test.ts`.
- **Depende de:** T8, T15, T16.
- **Requisitos:** R29.
- **Hecho:**
  - **l.16-23:** importa también `FORMULAS_ROUTE`.
  - **l.188-197:** añade `FORMULAS_ROUTE` como **séptima** carpeta autorizada, con su comentario
    fechado.
  - **l.205 y l.213:** los textos pasan de «seis» a «siete».
  - **l.221:** el ancla sube a `toBeGreaterThan(6)`.
  - **l.224-235:** el caso «la pantalla de recetas sigue SIN consumirlo» se **invierte** en «la
    pantalla de recetas lo consume por el barrel», sin borrar la mitad que prohíbe importar
    `app/(private)/produccion` desde la tabla compartida (l.237-258).
  - **l.388-420:** la lista cerrada de E2E añade, en orden, `e2e/recetas-pasos.spec.ts` y
    `e2e/recetas.spec.ts`: de nueve a once. Se comprueba que `e2e/errores.spec.ts` **no** entra (H4).

## Tanda 5 — E2E (declaración de líneas para el choque con QC-93, H5)

### T15 [P] — E2E de recetas: búsqueda y orden
- **Archivos:** `e2e/recetas.spec.ts`.
- **Depende de:** T8.
- **Requisitos:** R26.
- **Líneas que se tocan:**
  - l.94-98: constantes con los dos nombres nuevos `orden_a` y `orden_b`.
  - l.199-222: `findRecipeCell` pasa a `data-table-cell-name`, `data-table-next` y el contenedor de
    la lista.
  - l.224-281: `beforeAll` crea las dos recetas de orden; antes se comprueba en `db/schema.prisma`
    qué campos exige `Recipe`, y si no se puede con Prisma se crean por la UI.
  - l.283-317: `afterAll` las borra por nombre exacto.
  - Un `test(...)` nuevo dentro del `describe` de l.323, **después de l.374 y antes de l.376**.
  - Dentro del bloque de QC-93 (l.376-388), **solo** l.386-387 (`data-testid`).
- **Hecho:** el recorrido de `design.md > 9` está verde en Chromium y WebKit y no deja filas huérfanas.

### T16 [P] — E2E de pasos de receta: helper de búsqueda de fila
- **Archivos:** `e2e/recetas-pasos.spec.ts`.
- **Depende de:** T8.
- **Requisitos:** R1 (no se rompe al migrar).
- **Líneas que se tocan:** solo l.192-213 (`findRecipeRow` y su comentario): `recipe-row`,
  `recipe-page-next` y `recipe-list` pasan a los de la tabla compartida. **No se amplía.**
- **Hecho:** el spec sigue verde en Chromium y WebKit.

### T17 [P] — E2E de proveedores: búsqueda y orden
- **Archivos:** `e2e/proveedores.spec.ts`.
- **Depende de:** T9.
- **Requisitos:** R26.
- **Líneas que se tocan:**
  - l.106-108: nombres `orden_a` y `orden_b`.
  - l.235-259: `findSupplierRow` pasa a `data-table-row-*` y `data-table-next`.
  - l.283-328: `beforeAll` crea los dos proveedores con Prisma.
  - l.330-365: `afterAll` los borra por nombre exacto.
  - l.402 y l.411: la fila y `supplier-detail-link`, que se conserva.
  - Un `test(...)` nuevo dentro del `describe` de l.371, **después de l.465 y antes de l.467**.
  - Dentro del bloque de QC-93 (l.467-483), **solo** l.479-481 (`data-testid`).
- **Hecho:** igual que T15.

## Tanda 6 — Cierre

### T18 — Trazabilidad y entrega al leader
- **Archivos:** `progress/impl_QC-56-migrar-listas-a-tabla-compartida.md`.
- **Depende de:** T1–T17.
- **Requisitos:** los treinta.
- **Hecho:**
  - Mapa `R1…R30 → test concreto` (archivo y nombre del `it`/`test`) sin huecos.
  - Lista de archivos tocados, que permite comprobar R27 y R28.
  - Variantes aplicadas de H1, H2 y H3.
  - Se dice si el componente compartido se tocó (solo si H1-A lo aprobó) y en qué líneas.
  - `pnpm typecheck` y `pnpm lint` verdes, con `vitest related` sobre todo lo tocado.
  - `./init.sh --rapido` y `./init.sh` los corre el leader.

## Dependencias en una línea

`T0 → {T1, T4, T14}` · `T1 → T3` · `{T2, T4} → T6` · `{T3, T5} → T7` · `{T0, T6} → T8` ·
`{T0, T7} → T9` · `T8 → {T10, T11, T15, T16}` · `T9 → {T12, T17}` · `{T8, T15, T16} → T13` ·
`todo → T18`
