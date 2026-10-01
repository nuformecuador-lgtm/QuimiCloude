# QC-172 — versiones-de-receta · tasks.md

> Cada task: **Toca** (archivos, para cruzar en F2.0), **Hacer**, **Hecho cuando**. `[P]` = puede ir
> en paralelo con las demás `[P]` de su tanda. Dependencias en «Tras». Cierre de tanda:
> `./init.sh --rapido`; cierre de feature y antes del PR: `./init.sh`. Las secciones § son de
> `design.md`. Los tests nombran el `R<n>` en el nombre del caso.
>
> **Enmienda del plan aprobada por el humano el 2026-10-01, tras la medición de T0** (detalle en la
> bitácora, sección T0). No cambia ningún requisito ni lo que comprueba ningún test:
> 1. **T9** absorbe los tests que dan typecheck rojo por `OrderView.recipeVersion` y no estaban en
>    ninguna task: unos 14 de `pedidos-ui`, `order-service.test.ts` y `company-scope.test.ts`.
>    **T6** absorbe los cinco de `asignaciones` que construyen `RecipeRef` y faltaban en §10.
> 2. **T5** absorbe `tests/unit/recetas-ui/recipe-form.test.tsx` (construye un `RecipeDetail`).
> 3. Los tests que este archivo cita y no existen (`pedidos/get-order.test.ts`,
>    `recetas/get-recipe.test.ts`, `recetas/update-recipe.test.ts`) se **crean**.
> 4. **T4** añade a `tests/unit/recetas/module-contract.test.ts` la lista cerrada de archivos de
>    `lib/modules/recetas/` que toca esta ficha, como hicieron las anteriores.

## Tanda 0 — medición

### T0 [x] — Medir antes de tocar
**Toca:** solo `progress/impl_QC-172-versiones-de-receta.md` (nuevo). Ningún archivo de producción.
**Hacer:**
1. Volver a verificar cada fila de `design.md > 0` con archivo:línea en el árbol de la rama (puede
   haber entrado algo de `dev`).
2. Contar los tests que construyen `RecipeRef`, `RecipeRow`, `RecipeDetail` u `OrderView` a mano o con
   `toEqual` exacto, y los que fijan `buildRecipeWhere` y `ORDER_BUSINESS_FIELDS` (lista con rutas).
3. Mirar si algún test compara la definición literal de `recipes_company_name_unique`.
4. Comprobar si `SelectField` de `order-form.tsx:748` admite `disabled`; si no, qué `Select` de
   `components/ui/` usar.
5. Leer `order-actions.ts` y anotar cómo llega `FormData` al caso de uso (para `recipeVersionId`).
6. Leer la lista de `session-once-per-request-actions.test.ts` y anotar el formato de entrada.
7. Anotar el estado de QC-170, QC-164 y QC-173 en `dev` y los archivos que ya hayan tocado.
**Hecho cuando:** el archivo de progreso tiene las siete respuestas con rutas y cifras, y cualquier
discrepancia con `design.md` está escrita y avisada al leader antes de T1.

## Tanda 1 — base de datos y errores

### T1 [x] — Migración `recipe_versions`
Tras T0. **Toca:** `db/schema.prisma` (`model Recipe`), `db/migrations/<ts>_recipe_versions/{migration.sql,down.sql}`
(nuevo), `tests/unit/recetas/schema/recipe-versions-migration.test.ts` (nuevo),
`tests/integration/recetas/recipe-versions-constraints.int.test.ts` (nuevo), y los tests que T0.3 señale.
**Hacer:** §1.1 y §1.2.
**Hecho cuando:** `db:migrate` → `db:rollback` → `db:migrate` en limpio; el `down.sql` con una versión
guardada aborta y no cambia nada; el test estático compara el índice recreado en `down.sql` con su
definición literal de `20260916120000_recipes_company_scope`; integración prueba: dos versiones vivas
de la misma original con nombre equivalente → 23505 cuyo `meta.target` incluye `name_normalized`;
versión con el nombre de una original o de una versión de otra original → aceptada; original con el
nombre de una versión → aceptada; `parent_recipe_id = id` → 23514; la migración no cambia filas
existentes (R12, R13, R42, R43).

### T2 [x] [P] — Código de error `recipe_version_under_review`
Tras T0. **Toca:** `lib/modules/errores/domain/error-codes.ts`, `lib/modules/errores/domain/error-catalog.ts`,
`lib/modules/pedidos/domain/errors.ts`, tests de `errores` que cuenten códigos (T0).
**Hacer:** §6.2, último párrafo.
**Hecho cuando:** `guard-catalogo-de-errores` en verde y el mensaje en español sale por el traductor de
errores (R33).

## Tanda 2 — `recetas`

### T3 [x] [P] — Reglas puras de versión
Tras T0. **Toca:** `lib/modules/recetas/domain/recipe-version.ts` (nuevo), `lib/modules/recetas/index.ts`,
`tests/unit/recetas/recipe-version.test.ts` (nuevo).
**Hacer:** §2.
**Hecho cuando:** `propagateLines` tiene un caso por cada fila y cada caso enumerado de §2.3 (incluido
«5» = «5.00» y resultado vacío); `isVersionUnderReview` prueba original sin líneas → `false`, versión
sin líneas → `true`, 99,99 y 100,01 → `true`, 100,00 → `false`; `recipeDisplayName` con y sin
original (R11, R15, R20, R21).

### T4 [x] — Repositorio y adaptador
Tras T1, T3. **Toca:** `lib/modules/recetas/ports/recipe-repository.ts`,
`lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`, `lib/composition/index.ts`
(cableado de `recipeRepository`), `tests/guards/guard-ambito-empresa-recetas.test.ts`,
`tests/unit/recetas/recipe-prisma*.test.ts` (los que T0.2 señale),
`tests/integration/recetas/recipe-versions-repository.int.test.ts` (nuevo).
**Hacer:** §3.1, §3.2 y el paso 5 de §4.
**Hecho cuando:** integración contra Postgres prueba: `listAlive` y su `total` excluyen versiones, con
búsqueda y filtro (R9); `createVersion` con original de baja, versión u otra empresa → `'not_found'`
sin fila nueva (R4, R5, R40); `softDeleteAlive` de una original da de baja sus versiones con la misma
fecha y autor, y la de una versión solo a ella (R23, R24); `replaceAliveWithPropagation` con un id que
no es versión de esa original no deja nada cambiado (R17) y un fallo forzado a mitad tampoco (R18);
`findAliveById` de una versión trae `original` con sus pasos (R8). La guardia de ámbito sigue verde y
su `describe` estructural cubre también `replaceAliveWithPropagation`, con un caso que muere si se le
quita el `recipeCompanyScope(scope)` al `updateMany` de la versión.

### T5 [x] — Casos de uso de `recetas`
Tras T2, T4. **Toca:** `lib/modules/recetas/domain/{create-recipe-version.ts,update-recipe-version.ts,list-recipe-versions.ts}`
(nuevos), `update-recipe.ts`, `get-recipe.ts`, `recipe-input.ts`, `recipe-view.ts`, `index.ts`,
`lib/composition/index.ts` (exporta los tres casos de uso),
`tests/unit/recetas/{create-recipe-version,update-recipe-version,list-recipe-versions}.test.ts` (nuevos),
`tests/unit/recetas/{update-recipe,get-recipe}.test.ts`.
**Hacer:** §4 (pasos 1–6) y §5.
**Hecho cuando:** cada caso de uso prueba que sin permiso rechaza antes de llamar a ningún doble
(R38); crear con líneas, sin líneas (copia), con líneas que no suman 100, vacías, repetidas, con
producto terminado y con nombre duplicado (R1, R2, R3, R12); crear desde una versión → acción no
permitida (R4); editar versión con `updateRecipe` y original con `updateRecipeVersion` → rechazo sin
llamar al repositorio de escritura (R7); editar versión por revisar con líneas válidas → deja de estar
por revisar (R22); `updateRecipe` sin ids llama a `replaceAlive` y no a la propagación (R16); con ids
devuelve `propagated` (R14, R19); `getRecipe` de una versión devuelve pasos, descripción e imagen de la
original (R8, ⚑ P3); `listRecipeVersions` ordenado, con `isUnderReview`, y rechazo de versión/baja (R10).

### T6 [x] — Catálogo público y sus consumidores
Tras T3, T1. **Toca:** `lib/modules/recetas/domain/recipe-catalog.ts`,
`lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts`,
`tests/unit/recetas/recipe-catalog.test.ts`, `tests/integration/recetas/company-scope-queries.int.test.ts`,
y los dobles de `RecipeRef` que T0.2 liste en `tests/unit/{pedidos,asignaciones,documentos}/`.
**Hacer:** §3.3.
**Hecho cuando:** `toRecipeRef` y `toRecipeExecutionContent` prueban nombre compuesto, `original`,
`isUnderReview` (original sin líneas → `false`) y pasos de la original (R8, R11, R21); integración:
`findExecutionContentById` de una versión dada de baja devuelve los pasos de su original dada de baja
(R8, R25); `findAliveByNormalizedName` ignora versiones (R37); `findIdsMatchingName` encuentra una
versión por su nombre y por el de su original, y no la de otra empresa (R41, R40). Typecheck en verde.

### T7 [x] — Server Actions de versiones
Tras T5. **Toca:** `lib/modules/recetas/adapters/driving/recipe-actions.ts`,
`tests/unit/recetas/recipe-actions.test.ts`, `tests/unit/identity/session-once-per-request-actions.test.ts`.
**Hacer:** §5, último párrafo.
**Hecho cuando:** las tres acciones devuelven el estado de error traducido sin llamar al caso de uso
con entrada inválida; el test de lectura única de sesión las incluye y está en verde (R38).

## Tanda 3 — `pedidos`, producto terminado e importación

### T8 [x] — Pedido con versión en el servidor
Tras T2, T6. **Toca:** `lib/modules/pedidos/domain/{order-input.ts,order-recipe.ts (nuevo),create-order.ts,update-order.ts}`,
`lib/modules/pedidos/adapters/driving/order-actions.ts` (si T0.5 lo exige),
`tests/unit/pedidos/{order-recipe (nuevo),create-order,update-order,order-input}.test.ts`.
**Hacer:** §6.1, §6.2.
**Hecho cuando:** alta con versión guarda `recipe_id` = versión y calcula necesidad y coste con sus
líneas (R30); sin versión, idéntico a hoy (R31); cada rechazo de R32 con su doble (receta que es
versión, versión de otra receta, de baja, de otra empresa) y sin abrir la unidad de trabajo; versión
por revisar → `recipe_version_under_review` (R33); edición que cambia a versión por revisar o de baja →
rechazo (R34); edición que conserva una versión por revisar o de baja → aceptada y recalculada (R35,
R25); los permisos exigidos son los de hoy (R39).

### T9 [x] [P] — Salida del pedido y producto terminado
Tras T6. **Toca:** `lib/modules/pedidos/domain/{order-view.ts,get-order.ts,list-orders.ts}`,
`tests/unit/pedidos/{get-order,list-orders,transition-order}.test.ts`,
`tests/unit/asignaciones/get-assigned-order-execution.test.ts`,
`tests/integration/inventario/finished-goods-version.int.test.ts` (nuevo).
**Hacer:** §6.3, §6.4.
**Hecho cuando:** ficha y lista devuelven `recipeVersion` y el nombre compuesto (R11); la ejecución en
planta de un pedido con versión muestra el nombre compuesto y los pasos de la original (R8, R11);
Finalizar un pedido con versión llama al alta de producto terminado con el id de la versión y el
nombre compuesto, y en integración nace un producto distinto del de la original para la misma
presentación, llamado «Original · Versión · Presentación» (R36).

### T10 [x] [P] — Importación de fórmula frente a versiones
Tras T6. **Toca:** `tests/unit/documentos/{confirm-formula-import,preview-formula-import}.test.ts`,
`tests/integration/documentos/formula-import-versions.int.test.ts` (nuevo). Sin código de producción
(el cambio está en T6).
**Hecho cuando:** un nombre que solo coincide con una versión no marca choque en la vista previa y al
confirmar crea una original nueva (R37).

## Tanda 4 — formulario

### T11 [ ] — Selector de versión en el formulario de pedido
Tras T7, T8, T9. **Toca:** `app/(private)/pedidos/components/{recipe-version-select.tsx (nuevo),order-form.tsx,index.ts}`,
`tests/unit/pedidos-ui/recipe-version-select.test.tsx` (nuevo),
`tests/unit/pedidos-ui/{order-form,order-form-quote}.test.tsx` y los que fijen `ORDER_BUSINESS_FIELDS` (T0.2).
**Hacer:** §7.
**Hecho cuando:** sin receta o sin versiones ofrecibles, deshabilitado en «Original» (R27); con
versiones, «Original» primero y las por revisar ausentes (R26); elegir versión pide ingredientes y
cotización con su id, volver a «Original» con el de la original, cambiar de receta lo reinicia (R28);
edición con versión por revisar o de baja la muestra elegida y el `FormData` la conserva (R29); el
`input` oculto viaja también con el control deshabilitado; objetivo táctil ≥ 44 px y `text-base`;
`guard-pantalla-pedidos-se-amplia` en verde.

## Tanda 5 — cierre

### T12 [ ] — E2E en el pedido
Tras T11. **Toca:** `e2e/versiones-de-receta.spec.ts` (nuevo), y `e2e/helpers/` solo si hace falta un
ayudante nuevo.
**Hacer:** fixture con Prisma —empresa, Administrador del seed, tres productos con lote (A, B, C),
original «A 70 / B 30» y versión «A 50 / C 50», más una receta sin versiones—, mismo patrón que
`e2e/reserva-de-material.spec.ts`. Abrir el formulario, comprobar que con la receta sin versiones el
selector está deshabilitado, elegir la original y su versión, presentación y cantidad, guardar.
**Hecho cuando:** el pedido guardado tiene la versión como receta y lo reservado es de A y C en las
proporciones de la versión, con B sin reservar (R44, R30).

### T13 [ ] [P] — Enmiendas fechadas
Tras T1. **Toca:** `specs/QC-24*/requirements.md` o el spec donde viva la unicidad de nombre de receta,
`specs/QC-50*/design.md` (índice `recipes_company_name_unique`), `specs/QC-34*/design.md` (`RecipeRef`).
Solo una nota fechada al final de cada uno; T0 confirma rutas.
**Hecho cuando:** cada spec citado dice, con fecha y enlace a esta ficha, qué cambió.

### T14 [ ] — Gate completo y trazabilidad
Tras todas. **Toca:** `progress/impl_QC-172-versiones-de-receta.md`.
**Hacer:** `./init.sh` completo en verde; comprobar que `package.json` no cambió (R45); escribir el
mapa R → test:

| R | Test |
|---|---|
| R1, R2, R3, R12 | `tests/unit/recetas/create-recipe-version.test.ts` |
| R4, R5 | `create-recipe-version.test.ts`; `recipe-versions-repository.int.test.ts` |
| R6, R7, R22 | `update-recipe-version.test.ts`; `update-recipe.test.ts` |
| R8 | `get-recipe.test.ts`; `recipe-catalog.test.ts`; `recipe-versions-repository.int.test.ts` |
| R9 | `recipe-versions-repository.int.test.ts` |
| R10 | `list-recipe-versions.test.ts` |
| R11 | `recipe-version.test.ts`; `recipe-catalog.test.ts`; `get-order.test.ts`; `list-orders.test.ts` |
| R12, R13 | `recipe-versions-constraints.int.test.ts` |
| R14, R16, R19 | `update-recipe.test.ts` |
| R15, R20, R21 | `recipe-version.test.ts` |
| R17, R18 | `recipe-versions-repository.int.test.ts` |
| R23, R24 | `recipe-versions-repository.int.test.ts` |
| R25 | `update-order.test.ts`; `company-scope-queries.int.test.ts` |
| R26, R27, R28, R29 | `tests/unit/pedidos-ui/recipe-version-select.test.tsx`; `order-form.test.tsx` |
| R30, R31, R32, R33 | `order-recipe.test.ts`; `create-order.test.ts` |
| R34, R35 | `update-order.test.ts` |
| R36 | `transition-order.test.ts`; `finished-goods-version.int.test.ts` |
| R37 | `formula-import-versions.int.test.ts`; `confirm-formula-import.test.ts` |
| R38 | los tres tests de casos de uso nuevos + `recipe-actions.test.ts` |
| R39 | `create-order.test.ts`; `update-order.test.ts`; `guard-permisos-sembrados` en verde |
| R40 | `recipe-versions-repository.int.test.ts`; `company-scope-queries.int.test.ts` |
| R41 | `company-scope-queries.int.test.ts` |
| R42, R43 | `recipe-versions-migration.test.ts`; `recipe-versions-constraints.int.test.ts` |
| R44 | `e2e/versiones-de-receta.spec.ts` |
| R45 | `guard-dependencias-aprobadas` + diff de `package.json` vacío |

**Hecho cuando:** gate completo verde y cada `R1`–`R45` tiene al menos un test con su `R<n>` en el
nombre del caso.

## Mapa de archivos por task (para F2.0)

| Task | Producción | Choca con |
|---|---|---|
| T1 | `db/schema.prisma`, `db/migrations/<ts>_recipe_versions/` | cualquier ficha con migración en curso (orden de timestamps) |
| T2 | `errores/domain/error-codes.ts`, `error-catalog.ts`, `pedidos/domain/errors.ts` | fichas que añadan códigos de error |
| T3 | `recetas/domain/recipe-version.ts`, `recetas/index.ts` | — |
| T4 | `recetas/ports/recipe-repository.ts`, `recetas/.../recipe-prisma.ts`, `lib/composition/index.ts` | QC-173 (`recipe-prisma.ts`) |
| T5 | `recetas/domain/{update-recipe,get-recipe,recipe-input,recipe-view}.ts` + 3 nuevos, `index.ts`, `lib/composition/index.ts` | QC-173 (`recipe-input.ts`) |
| T6 | `recetas/domain/recipe-catalog.ts`, `recetas/.../recipe-catalog-prisma.ts` | QC-173 (`recipe-catalog-prisma.ts`) |
| T7 | `recetas/adapters/driving/recipe-actions.ts` | — |
| T8 | `pedidos/domain/{order-input,create-order,update-order}.ts`, `order-recipe.ts` (nuevo), quizá `order-actions.ts` | **QC-170, QC-164** |
| T9 | `pedidos/domain/{order-view,get-order,list-orders}.ts` | **QC-170** probable |
| T10 | — (solo tests) | — |
| T11 | `app/(private)/pedidos/components/{order-form.tsx,index.ts}`, `recipe-version-select.tsx` (nuevo) | **QC-170, QC-164** |
| T12 | `e2e/versiones-de-receta.spec.ts` (nuevo) | — |
| T13 | `specs/` de fichas cerradas | — |
