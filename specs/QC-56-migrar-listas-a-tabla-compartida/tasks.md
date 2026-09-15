# QC-56 — migrar-listas-a-tabla-compartida · tasks.md

> - `[P]` = puede ir en paralelo con las demás `[P]` de su tanda (no comparten archivo).
> - Rutas relativas al worktree: `F` = `app/(private)/produccion/formulas/` y
>   `S` = `app/(private)/proveedores/`.
> - **Verificación del subagente:** `pnpm typecheck`, `pnpm lint` y
>   `pnpm exec vitest related --run <archivos de la tarea>`. La suite completa y `./init.sh` los corre
>   el leader.
> - **Revisado el 2026-09-15 tras F1.4:** T0 ya no bloquea. T8 y T9 aplican D12. D13 está en T1, D14
>   en T4, T10, T11 y T14, y D15 en T2, T3, T6–T10 y T12. H6 (`design.md > 0`) queda para confirmar
>   al aprobar el spec.

## Tanda 0 — Puerta

### T0 — Decisiones de F1.4 — **HECHA**
- **Archivos:** ninguno.
- **Hecho:** D12–D15 están en `requirements.md > Decisiones cerradas`. No bloquea ninguna tarea.
  Lo único pendiente de confirmar es **H6**, que va con la aprobación del spec y afecta a T6–T10 y
  T12.

## Tanda 1 — Piezas puras, declaraciones y specs

### [x] T1 [P] — Publicar `SUPPLIER_QUERYABLE` por el barrel (D13)
- **Archivos:** `lib/modules/proveedores/index.ts`; `tests/unit/proveedores-ui/supplier-list-params.test.ts`
  (el caso del barrel lo añade T3 en ese archivo; aquí solo la línea de producción).
- **Requisitos:** R28, R31.
- **Hecho:**
  - Se añade **una línea**, `export { SUPPLIER_QUERYABLE } from './domain/supplier-queryable';`.
    No cambia nada más en `lib/`.
  - `tests/unit/shared/listas-blancas-listados.test.ts` y
    `tests/guards/guard-arquitectura-modulos.test.ts` siguen verdes.
  - Se ha buscado en `tests/` si algún test cierra la lista de exportaciones de ese barrel; si lo hay,
    se amplía aquí y se añade a la lista de archivos.

### [x] T2 [P] — Parser y serializador de recetas
- **Archivos:** `F/components/recipe-list-params.ts`, `tests/unit/recetas-ui/recipe-list-params.test.ts`.
- **Requisitos:** R11, R12, R13, R22, R32, R33.
- **Exporta:**
  - constantes `PAGE_PARAM`, `PAGE_SIZE_PARAM`, `SORT_PARAM`, `SEARCH_PARAM`, `CREATED_FROM_PARAM`,
    `CREATED_TO_PARAM`, `CREATED_AT_COLUMN_ID`, `SORT_SEPARATOR`, `FIRST_PAGE`, `PAGE_SIZE_OPTIONS`
    y `SHARED_PAGE_SIZES`;
  - funciones `parseRecipeListParams` (→ `DataTableParams`), `buildRecipeListQuery`,
    `recipeListHref`, `hasActiveSearchOrFilter` y `clearSearchAndFilters` (`design.md > 3`).
  - `RECIPE_QUERYABLE` se importa de `@/lib/modules/recetas`.
- **Tests:**
  - una fila por caso de la tabla de `design.md > 3`;
  - ida y vuelta `parse(build(p))`;
  - `hasActiveSearchOrFilter`: `false` con solo orden o tamaño, `true` con término y `true` con rango;
  - `clearSearchAndFilters` vacía búsqueda y filtros, vuelve a la página 1 y conserva orden y tamaño.

### [x] T3 — Parser y serializador de proveedores
- **Archivos:** `S/components/supplier-list-params.ts`, `tests/unit/proveedores-ui/supplier-list-params.test.ts`.
- **Depende de:** T1.
- **Requisitos:** R11, R12, R13, R22, R31, R32, R33.
- **Hecho:**
  - Lo mismo que T2, con `SUPPLIER_QUERYABLE` importado de `@/lib/modules/proveedores`.
  - Un caso afirma que es **el mismo objeto** que el de `domain/supplier-queryable` (R31).

### [x] T4 [P] — Columnas de recetas, sin descripción (D14)
- **Archivos:**
  - borrar `F/components/recipe-columns.ts`;
  - crear `F/components/recipe-columns.tsx`;
  - crear `F/components/recipe-columns-skeleton.ts`.
- **Requisitos:** R2, R3, R5, R7, R9, R18, R21.
- **Hecho:**
  - `recipe-columns.tsx` es `'use client'`.
  - Exporta `buildRecipeColumns({ rowActions })`, `RecipeColumnId` (con `'description'` en el
    `Exclude`), `RecipeColumn`, `EMPTY_CELL`, `IMAGE_COLUMN_ID`, `ACTIONS_COLUMN_ID`,
    `ACTIONS_COLUMN_LABEL` y `RECIPE_DEFAULT_PINNED_COLUMNS = [IMAGE_COLUMN_ID]`.
  - Declara seis columnas con los flags de `design.md > 4.1`.
  - `recipe-columns-skeleton.ts` exporta `RECIPE_SKELETON_COLUMN_COUNT = 6`, sin `'use client'`.
  - `id: 'description'` y `id: 'createdBy'` no compilan.

### [x] T5 [P] — Columnas de proveedores
- **Archivos:**
  - borrar `S/components/supplier-columns.ts`;
  - crear `S/components/supplier-columns.tsx`;
  - crear `S/components/supplier-columns-skeleton.ts`.
- **Requisitos:** R2, R3, R4, R7, R9, R18, R21.
- **Hecho:**
  - Exporta `buildSupplierColumns({ rowActions })`, `SupplierColumnId`, `SupplierColumn`,
    `EMPTY_CELL`, `ACTIONS_COLUMN_ID`, `ACTIONS_COLUMN_LABEL`,
    `SUPPLIER_DEFAULT_PINNED_COLUMNS = ['name']` y `SUPPLIER_SKELETON_COLUMN_COUNT = 6`.
  - La celda de nombre es el `Link` de `supplierDetailRoute` con `supplier-detail-link` y
    `min-h-11 min-w-11`.

### [x] T14 [P] — Enmiendas a QC-26 R8, QC-26 R14 y QC-44 R11
- **Archivos:**
  - `specs/QC-26-pantalla-de-recetas/requirements.md`: un bloque debajo de R8 (D14) y otro debajo de
    R14, en l.107 (D2);
  - `specs/QC-44-pantalla-de-proveedores/requirements.md`: un bloque a continuación de la enmienda
    de l.95-115, sin reescribirla.
- **Requisitos:** R2, R6, R8, R10 (trazabilidad).
- **Hecho:**
  - Bloques «ENMIENDA DEL 2026-09-15 (QC-56, decisión humana)» con el formato de
    `specs/QC-22-pantalla-de-productos/requirements.md:105-121`.
  - Explican qué se invierte o qué sale, qué sigue protegido y qué cambia de dueño.
  - El de QC-44 dice que reabre l.106.
  - No se borra ni se renumera ningún requisito.

## Tanda 2 — Tablas de cliente

### [x] T6 [P] — Tabla de recetas
- **Archivos:** `F/components/recipe-table.tsx` (reescrito).
- **Depende de:** T2, T4.
- **Requisitos:** R1, R6, R8, R9, R10, R14, R21, R22, R23, R32, R33.
- **Hecho:**
  - Es `'use client'`.
  - Exporta `RECIPE_TABLE_ID = 'recetas'`, `RECIPE_TABLE_TEXTS`, `RECIPE_NO_RESULTS_TEXT`,
    `RecipeTable` y `RecipeTableProps` (con `noResults?: { clearHref: string; firstPageHref?: string }`).
  - `<DataTable status="idle">` recibe las columnas de T4 y, como `rowActions`, `Link` a
    `recipeEditRoute` + `DeleteRecipeDialog`.
  - Navega con `recipeListHref` dentro de `startTransition`, con `aria-busy` y rótulo mientras dura.
  - Con `noResults` pasa `texts.empty = RECIPE_NO_RESULTS_TEXT` y un `emptyAction` con
    `recipe-list-no-results`, `recipe-list-clear-search` y, si llega `firstPageHref`,
    `recipe-list-no-results-first-page` (`design.md > 4.2`).
  - Se comprueba que `listRecipes` devuelve `totalPages ≥ 1` con cero filas
    (`lib/shared/pagination.ts:62`); si no, se acota a 1 aquí.
  - Ningún otro `tableId` vale `'recetas'` (`grep -r "TABLE_ID = '" app`).
  - No importa `components/ui/table`.

### [x] T7 [P] — Tabla de proveedores
- **Archivos:** `S/components/supplier-table.tsx` (reescrito).
- **Depende de:** T3, T5.
- **Requisitos:** R1, R4, R6, R8, R9, R10, R14, R21, R22, R23, R32, R33.
- **Hecho:**
  - Lo mismo que T6, con `SUPPLIER_TABLE_ID = 'proveedores'` y `SUPPLIER_NO_RESULTS_TEXT`.
  - `rowActions` = `SupplierSheet` + `DeleteSupplierDialog`.
  - testIds `supplier-list-no-results`, `supplier-list-clear-search` y
    `supplier-list-no-results-first-page`.

## Tanda 3 — Sección, estados, esqueleto y página (D12, D15)

### [x] T8 [P] — Recetas
- **Archivos:**
  - `F/components/recipe-list-section.tsx`
  - `F/components/recipe-list-empty.tsx` (solo si hace falta ajustar el `firstPageHref`)
  - `F/components/recipe-table-skeleton.tsx` (reescrito con `RECIPE_SKELETON_COLUMN_COUNT`)
  - borrar `F/components/recipe-list-toolbar.tsx`
  - `F/page.tsx`
  - `F/components/index.ts`
- **NO toca:** `F/components/recipe-list-error.tsx` (se conserva, H4), `F/nueva/**`, `F/[id]/**` ni
  `components/shared/data-table/**`.
- **Depende de:** T6.
- **Requisitos:** R15, R16, R17, R18, R19, R20, R30, R32, R33.
- **Hecho:**
  - La sección sigue exactamente el orden de `design.md > 4.3`:
    1. error: `RecipeListError`, fuera;
    2. cero filas sin búsqueda ni filtro: `RecipeListEmpty`, fuera;
    3. si no, `<div data-testid="recipe-list"><RecipeTable …/></div>` con **el mismo árbol** tenga
       filas o `noResults`.
  - `listRecipesAction(params)` aparece una sola vez en la ruta.
  - En `F/page.tsx`, `<Suspense>` sin `key` y con `fallback={<RecipeTableSkeleton rows={params.pageSize} />}`.
  - El barrel exporta lo nuevo y nada de lo borrado.
  - `F/nueva` y `F/[id]` compilan sin cambios.

### [x] T9 [P] — Proveedores
- **Archivos:**
  - `S/components/supplier-list-section.tsx`
  - `S/components/supplier-list-empty.tsx` (solo si hace falta ajustar el `firstPageHref`)
  - `S/components/supplier-table-skeleton.tsx` (reescrito con `SUPPLIER_SKELETON_COLUMN_COUNT`)
  - borrar `S/components/supplier-list-toolbar.tsx`
  - `S/page.tsx`
  - `S/components/index.ts`
- **NO toca:** `S/components/supplier-list-error.tsx` (se conserva), `S/[id]/**` ni
  `components/shared/data-table/**`.
- **Depende de:** T7.
- **Requisitos:** R15, R16, R17, R18, R19, R20, R30, R32, R33.
- **Hecho:**
  - Lo mismo que T8.
  - Se conservan el `SupplierSheet` de la cabecera de `S/page.tsx` y el del vacío.
  - `S/[id]/page.tsx` compila sin cambios.

## Tanda 4 — Tests unitarios y centinela

### T10 [P] — Tests de la pantalla de recetas
- **Archivos:** `tests/unit/recetas-ui/recipe-page.test.tsx`.
- **Depende de:** T8.
- **Requisitos:** R1–R10, R14–R24, R32, R33.
- **Qué se actualiza:**
  - **Mapa de testIds (l.142-169):**
    - `recipe-row` → `data-table-row-<id>`;
    - `recipe-page-size`, `-previous`, `-next`, `-status` → `data-table-page-size`, `-previous`,
      `-next`, `-page-indicator`;
    - `recipe-table`, `recipe-table-skeleton`, `recipe-row-skeleton`, `recipe-list-empty` y
      `recipe-list-error` se conservan;
    - se añaden `recipe-list-no-results` y `recipe-list-clear-search`.
  - **l.442-448:** la acción se llama con el `DataTableParams` completo.
  - **l.450-466:** el negativo de QC-26 R14 pasa a positivo (`design.md > 7`).
  - **l.490-500:** «volver a la primera» conserva el orden.
  - **l.502-513:** el esqueleto sigue con `MAX_PAGE_SIZE` filas y ya no existe `recipe-table`.
- **Casos nuevos:**
  - no hay `data-table-head-description` ni celda de descripción (R2, D14);
  - ordenar `name` navega (R6); imagen y pasos no ordenan (R7);
  - la búsqueda navega tras `SEARCH_DEBOUNCE_MS` (R8); el atajo de fecha navega (R9);
  - las filas llegan tal cual (R10); `aria-busy` en vuelo (R14);
  - las acciones no son fijables y miden 44×44 (R21);
  - vistas angosta y ancha (R24);
  - `RECIPE_SKELETON_COLUMN_COUNT` coincide con `buildRecipeColumns(...).length` (R18);
  - con `q` y cero filas se ven `recipe-list-no-results` y `data-table-search` con el término, **no**
    `recipe-list-empty` ni `recipe-create-open` dentro del estado, y `recipe-list-clear-search`
    apunta a una URL sin `q` ni fechas (R32, R33);
  - sin `q` y con cero filas se ve `recipe-list-empty` (R16);
  - con `page=3`, `q` y cero filas aparece `recipe-list-no-results-first-page` (R32);
  - **re-render del mismo árbol** de filas a cero filas con el foco en `data-table-search`: el foco y
    el valor se conservan (R33).

### T11 [P] — Contrato de ruta de recetas
- **Archivos:** `tests/unit/recetas-ui/recipe-route-contract.test.ts`.
- **Depende de:** T8.
- **Requisitos:** R2, R3, R10, R11, R15, R30.
- **Hecho:**
  - `ARCHIVOS_DE_LA_LISTA` (l.119-127): sin `recipe-list-toolbar.tsx`, y con `recipe-columns.tsx` y
    `recipe-columns-skeleton.ts`.
  - l.718-719 y l.758 leen `recipe-columns.tsx`, que no contiene `description`.
  - l.749-752: el negativo se sustituye según `design.md > 7.3`.
  - l.1327 se mantiene.
  - Se revisan l.996 (`CARPETAS_LEGITIMAS`) y l.1233 (`exportadas`), y se actualizan si cierran
    listas; su contenido exacto no se verificó en el spec.

### T12 [P] — Tests de la pantalla de proveedores
- **Archivos:** `tests/unit/proveedores-ui/supplier-page.test.tsx`. Además
  `tests/unit/proveedores/supplier-route-contract.test.ts` **solo si** cierra la lista de archivos de
  la lista (comprobarlo y declararlo en `progress/impl_*`).
- **Depende de:** T9.
- **Requisitos:** R1–R4, R6–R10, R14–R24, R32, R33.
- **Hecho:**
  - Mapa de testIds (l.148-180) como en T10, conservando `supplier-detail-link`.
  - l.517-535: el negativo de QC-44 R11 pasa a positivo.
  - Los mismos casos nuevos que T10 salvo el de la descripción, con teléfono y correo como columnas
    sin orden.
  - La columna fijada por defecto es `name`.

### T13 — Centinela de consumidores y componente intacto
- **Archivos:** `tests/unit/shared/data-table-alcance.test.ts`.
- **Depende de:** T8, T15, T16.
- **Requisitos:** R20, R29.
- **Hecho:**
  - l.16-23: importa `FORMULAS_ROUTE`.
  - l.188-197: séptima carpeta autorizada, con comentario fechado.
  - l.205 y l.213: «seis» pasa a «siete».
  - l.221: `toBeGreaterThan(6)`.
  - l.224-235: el caso «la pantalla de recetas sigue SIN consumirlo» se **invierte**, sin tocar
    l.237-258.
  - l.388-420: la lista de E2E añade, en orden, `e2e/recetas-pasos.spec.ts` y `e2e/recetas.spec.ts`
    (de nueve a once), y se afirma que `e2e/errores.spec.ts` no entra.
  - **Caso nuevo (R20):** en esta rama, el diff contra la rama base no toca
    `components/shared/data-table/**`.
    - Se reutiliza el enfoque de `tests/unit/configuracion-ui/data-table-intacta.test.ts:38-70`: si
      el rango git no resuelve, **falla ruidosamente**.
    - Lleva **precondición de rama**, para no morder en otras ramas, y así lo dice su comentario.

## Tanda 5 — E2E (líneas declaradas para el choque con QC-93, H5)

### T15 [P] — E2E de recetas: búsqueda y orden
- **Archivos:** `e2e/recetas.spec.ts`.
- **Depende de:** T8.
- **Requisitos:** R26.
- **Líneas que se tocan:**
  - l.94-98: nombres `orden_a` y `orden_b`.
  - l.199-222: `findRecipeCell` pasa a `data-table-cell-name` y `data-table-next`.
  - l.224-281: `beforeAll` crea las dos recetas de orden (antes se mira `db/schema.prisma`; si no se
    puede con Prisma, por la UI).
  - l.283-317: `afterAll` las borra por nombre exacto.
  - Un `test(...)` nuevo después de l.374 y antes de l.376.
  - Dentro del bloque de QC-93, solo l.386-387.
- **Hecho:** el recorrido de `design.md > 9` está verde en Chromium y WebKit, sin filas huérfanas.

### T16 [P] — E2E de pasos de receta: helper
- **Archivos:** `e2e/recetas-pasos.spec.ts`.
- **Depende de:** T8.
- **Requisitos:** R1.
- **Líneas que se tocan:** solo l.192-213 (`findRecipeRow`), que pasa a los testIds de la tabla
  compartida. No se amplía.
- **Hecho:** sigue verde en los dos motores.

### T17 [P] — E2E de proveedores: búsqueda y orden
- **Archivos:** `e2e/proveedores.spec.ts`.
- **Depende de:** T9.
- **Requisitos:** R26.
- **Líneas que se tocan:**
  - l.106-108: nombres de las dos filas de orden.
  - l.235-259: `findSupplierRow` pasa a `data-table-row-*` y `data-table-next`.
  - l.283-328: `beforeAll` crea los dos proveedores con Prisma.
  - l.330-365: `afterAll` los borra por nombre exacto.
  - l.402 y l.411: la fila y `supplier-detail-link`.
  - Un `test(...)` nuevo después de l.465 y antes de l.467.
  - Dentro del bloque de QC-93, solo l.479-481.
- **Hecho:** igual que T15.

## Tanda 6 — Cierre

### T18 — Trazabilidad y entrega
- **Archivos:** `progress/impl_QC-56-migrar-listas-a-tabla-compartida.md`.
- **Depende de:** T1–T17.
- **Requisitos:** R1–R33.
- **Hecho:**
  - Mapa `R1…R33 → test concreto`, sin huecos.
  - Lista de archivos tocados: fuera de rutas, tests, E2E y specs, solo `lib/modules/proveedores/index.ts`
    (R28, R31); ninguno en `components/shared/data-table/` (R20).
  - Resultado de `pnpm typecheck`, `pnpm lint` y `vitest related`.
  - El gate lo corre el leader.

## Dependencias

```text
T1 → T3
{T2, T4} → T6
{T3, T5} → T7
T6 → T8
T7 → T9
T8 → {T10, T11, T15, T16}
T9 → {T12, T17}
{T8, T15, T16} → T13
todo → T18
```

T14 no depende de nada.
