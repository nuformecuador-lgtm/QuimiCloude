# QC-194 — herramientas-de-la-receta · tasks.md

> Cada task: **Quién**, **Toca** (archivos, para cruzar en F2.0), **Hacer**, **Hecho cuando**. `[P]` =
> puede ir en paralelo con las demás `[P]` de su tanda. Dependencias en «Tras». Cierre de tanda:
> `./init.sh --rapido`; cierre de feature y antes del PR: `./init.sh`. Las § son de `design.md`. Los
> tests nombran el `R<n>` en el nombre del caso. Ningún comentario de producción cita fichas ni
> requisitos (`docs/conventions.md > Comentarios`).
>
> **T1 depende de P1.** Con la exención (recomendada) se hace tal cual; con `company_id` propio, T1
> añade el índice único en `recipes`, la FK compuesta y el ámbito, y T4 filtra por `recipeCompanyScope`.

## Tanda 0 — medición

### T0 — Medir antes de tocar [x]
**Quién:** implementer. **Toca:** solo `progress/impl_QC-194-herramientas-de-la-receta.md` (nuevo).
**Hacer:**
1. Reverificar cada fila de `design.md > 0` con archivo:línea (puede haber entrado `dev`), y el último
   timestamp de `db/migrations/`.
2. Leer `tests/integration/aislamiento.json` y `guard-ambito-empresa-recetas.test.ts:520-680`: qué hay
   que añadir para una tabla nueva de `recetas` y para `tx.recipeTool.*`.
3. Comprobar que la búsqueda paginada del selector de herramientas filtra por MACHINE y por vivos (no
   solo la primera página) — R24.
4. Listar los tests que construyen `RecipeRow`, `NewRecipe`, `RecipeDetail`,
   `RecipeExecutionContent`, `AssignedOrderExecutionView` o montan `RecipeLinesField` (se pondrán rojos
   por los campos nuevos), con rutas.
**Hecho cuando:** el archivo de progreso tiene las cuatro respuestas con rutas y cualquier
discrepancia con `design.md` está avisada al leader antes de T1.

## Tanda 1 — base, contrato y piezas puras

### T1 [P] — Migración y esquema `recipe_tools`
Tras T0 y P1. **Quién:** backend_dev. **Toca:** `db/schema.prisma`,
`db/migrations/20261003120000_recipe_tools/{migration.sql,down.sql}` (nuevos),
`tests/unit/recetas/schema/recipe-tools-migration.test.ts` (nuevo),
`tests/guards/guard-identificador-de-request.test.ts`, `tests/guards/guard-empresa-en-esquema.test.ts`,
`docs/architecture.md` (solo el bullet de exentas).
**Hacer:** §1 entero, incluida la exención.
**Hecho cuando:** `prisma validate` y `prisma migrate deploy` en limpio; `db:rollback` deja el esquema
como antes; el test de migración afirma tabla, FK a mano con RESTRICT, CHECK `> 0`, único compuesto,
índice de `product_id`, `ENABLE` + `FORCE ROW LEVEL SECURITY` y que `down.sql` lo revierte; las dos
guardias en verde con `recipe_tools` dado de alta.

### T2 [P] — Contrato de herramientas
Tras T0. **Quién:** backend_dev. **Toca:** `lib/modules/recetas/domain/recipe-input.ts`,
`lib/modules/recetas/index.ts`, `tests/unit/recetas/recipe-input.test.ts`.
**Hacer:** §2. Exportar `recipeToolSchema`, `recipeToolsSchema`, `MAX_TOOL_QUANTITY` y los tipos.
**Hecho cuando:** casos: válido; producto repetido rechazado (R4); cantidad `0`, `-1`, `1.5`, `'2'`,
ausente rechazadas (R6); clave extra rechazada; alta sin `tools` → `[]` (R2); edición sin `tools` →
`undefined` y con `[]` → `[]`, distinguibles (R17); líneas al 100 % + herramientas pasa (R7).

### T3 [P] — `propagateByProduct` / `propagateTools`
Tras T0. **Quién:** backend_dev. **Toca:** `lib/modules/recetas/domain/recipe-version.ts`,
`tests/unit/recetas/recipe-version.test.ts`.
**Hacer:** §3.4, sin cambiar el comportamiento de `propagateLines`.
**Hecho cuando:** los tests existentes de `propagateLines` siguen verdes sin tocarlos; casos nuevos de
`propagateTools`: igual que antes sigue a después (cantidad nueva); la original la quita → desaparece;
la versión la cambió / añadió / quitó → se queda; la original añade una que la versión no tenía → se
añade (R14); `isVersionUnderReview` no recibe herramientas (R16).

## Tanda 2 — servidor

### T4 — Puerto y adaptador Prisma
Tras T1, T2, T3. **Quién:** backend_dev. **Toca:** `lib/modules/recetas/ports/recipe-repository.ts`,
`lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`,
`tests/guards/guard-ambito-empresa-recetas.test.ts`,
`tests/integration/recetas/recipe-tools.int.test.ts` (nuevo), los dobles de repositorio que T0 listó.
**Hacer:** §3.1 y §4.
**Hecho cuando:** integración contra Postgres: crear con herramientas y leerlas en orden de alta (R1);
`replaceAlive` con `tools: null` no las toca y con `[]` las borra (R17); `createVersion` las guarda;
propagación aplica `propagateTools` y no toca versiones no indicadas (R14, R15); un `versionId` inválido
revierte también las herramientas de la original (R15); la guardia exige que `tx.recipeTool.*` vaya
después del `updateMany` acotado y filtre por `recipeId: id`.

### T5 — Casos de uso de receta y versión
Tras T4. **Quién:** backend_dev. **Toca:** `lib/modules/recetas/domain/{recipe-tools.ts (nuevo),
create-recipe.ts, update-recipe.ts, create-recipe-version.ts, update-recipe-version.ts, get-recipe.ts,
recipe-view.ts}`, `lib/modules/recetas/index.ts`, `tests/unit/recetas/recipe-tools.test.ts` (nuevo),
`tests/unit/recetas/{create-recipe,update-recipe,create-recipe-version,update-recipe-version,get-recipe}.test.ts`.
**Hacer:** §3.2 y §3.3.
**Hecho cuando:** unit con dobles: herramienta nueva no MACHINE → `ValidationError` sin llamar al
repositorio (R3); inexistente / otra empresa / de baja → `ValidationError` (R5); preexistente de baja
→ aceptada (R19); alta de versión sin `tools` copia las de la original, incluida una de baja, sin
`findRefs` sobre ellas (R11); con `tools`, solo valida las que no están en la original (R12); edición
sin `tools` → `NewRecipe.tools === null` (R17); sin `recetas.modificar` no llama al repositorio en
ninguna de las cuatro (R32); `getRecipe` devuelve `tools` con `productName: null` para la de baja, con
un único `findRefs` (R20). Integración en `recipe-tools.int.test.ts`: dar de baja un MACHINE usado
como herramienta funciona y la receta se sigue editando conservándola (R19, R21); editar una versión no
cambia la original (R13).

### T6 [P] — Contenido de ejecución y prueba de stock/costo
Tras T4. **Quién:** backend_dev. **Toca:** `lib/modules/recetas/domain/recipe-catalog.ts`,
`lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts`,
`tests/unit/recetas/recipe-catalog-prisma.test.ts` (o el que T0 identifique),
`tests/integration/pedidos/order-reservation-tools.int.test.ts` (nuevo).
**Hacer:** §5. No tocar `pedidos` ni `inventario`.
**Hecho cuando:** `toRecipeExecutionContent` devuelve `tools` aparte y `lines` idéntico al de hoy;
integración contra Postgres: receta con una herramienta MACHINE con lotes y otra sin stock → crear
pedido, revisar bloqueados, pasar a curso y consumir: cero filas de `reservation_movements` e
`inventory_movements` sobre lotes de herramientas, el pedido no queda `BLOQUEADO` por ellas (R8, R9), y
`ingredients_cost` igual que con la receta sin herramientas (R10).

### T7 [P] — Import de PDF conserva herramientas
Tras T5. **Quién:** backend_dev. **Toca:** `tests/integration/documentos/formula-import.int.test.ts`.
**Hacer:** §8. Sin código de producción.
**Hecho cuando:** reemplazar por PDF una receta con dos herramientas las deja intactas; crear por PDF
una receta nueva la deja sin herramientas (R18).

### T8 — Ejecución del operador (dominio)
Tras T6. **Quién:** backend_dev. **Toca:** `lib/modules/asignaciones/domain/{get-assigned-order-execution.ts,
assigned-order-execution-view.ts}`, `tests/unit/asignaciones/get-assigned-order-execution.test.ts`.
**Hacer:** §6, primera mitad.
**Hecho cuando:** la vista trae `tools` con nombre y cantidad de la receta del pedido (la de la versión
si es versión) (R28); la cantidad no cambia al cambiar la del pedido (R29); de baja → `productName:
null` (R30); un solo `findRefs` para líneas y herramientas; el permiso exigido sigue siendo el de hoy
(R32).

## Tanda 3 — pantallas

### T9 — Estado del formulario y payload
Tras T2. **Quién:** frontend_dev. **Toca:** `app/(private)/produccion/formulas/components/recipe-form-state.ts`,
`tests/unit/recetas-ui/recipe-form-state.test.ts`.
**Hacer:** §7, `tools` en los dos estados y en los dos builders.
**Hecho cuando:** el payload lleva siempre `tools` con `quantity` entera, incluidas las no disponibles
(R26); el estado inicial de edición sale de `recipe.tools` y el de alta de versión de `original.tools`
(R22, R23).

### T10 — Tab «Herramientas» controlado
Tras T9. **Quién:** frontend_dev. **Toca:** `formulas/components/recipe-lines-field.tsx`,
`formulas/components/index.ts`, `tests/unit/recetas-ui/recipe-lines-field-tools.test.tsx` (nuevo).
**Hacer:** §7: props `tools` / `onToolsChange` / `toolErrors`, campo de cantidad, cantidad 1 al elegir,
quitar el estado local y los comentarios «UI-only».
**Hecho cuando:** pinta nombre y cantidad de cada herramienta y «no disponible» con su cantidad para la
de baja (R20, R22); elegir pone `1` (R24); el selector excluye las elegidas (R24); cambiar herramientas
no cambia la suma ni lo que falta para 100 % (R26); el error de fila se pinta en su fila (R25);
controles ≥ 44×44 px e input `text-base` (R33).

### T11 — Formularios de receta y de versión
Tras T5, T10. **Quién:** frontend_dev. **Toca:** `formulas/components/{recipe-form.tsx,
recipe-version-form.tsx}`, las cuatro `page.tsx` de `formulas` solo si hace falta pasar `tools`,
`tests/unit/recetas-ui/recipe-form.test.tsx`, `tests/unit/recetas-ui/recipe-version-form.test.tsx`.
**Hacer:** §7, cableado del estado y validación previa.
**Hecho cuando:** guardar alta, edición, alta de versión y edición de versión envía exactamente las
herramientas del tab (R26); fila sin herramienta o con cantidad `0`/vacía → no se invoca la acción y el
error sale en la fila (R25); un rechazo del servidor sale en la región de error sin navegar (R27); la
página de alta de versión precarga las de la original (R23).

### T12 [P] — Bloque del operador
Tras T8. **Quién:** frontend_dev. **Toca:** `app/(private)/asignacion/[id]/components/{order-execution-tools.tsx
(nuevo), index.ts, order-execution-screen.tsx}`, `tests/unit/asignaciones-ui/order-execution-tools.test.tsx`
(nuevo).
**Hacer:** §6, segunda mitad.
**Hecho cuando:** con herramientas, bloque «Herramientas» con nombre y cantidad, sin botones ni campos
(R28); la de baja dice «Herramienta no disponible» con su cantidad (R30); sin herramientas, el bloque
no está en el DOM (R31); texto ≥ 16 px (R33).

## Tanda 4 — cierre

### T13 — Trazabilidad y gate completo
Tras todas. **Quién:** implementer. **Toca:** `progress/impl_QC-194-herramientas-de-la-receta.md`.
**Hacer:** mapa `R1…R34 → test` con ruta y nombre del caso; confirmar que `package.json` no cambió
(R34); `./init.sh` completo.
**Hecho cuando:** los 34 requisitos tienen test en verde y `./init.sh` termina en verde.
