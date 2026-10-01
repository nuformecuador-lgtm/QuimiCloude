# QC-172 — versiones-de-receta · design.md

> El CÓMO de `requirements.md`. Rutas verificadas en este worktree el 2026-10-01 (rama
> `feature/QC-172-versiones-de-receta`). El MCP `codebase-memory-mcp` no tenía índice de este
> worktree (`list_projects` solo lista el árbol principal y QC-170), así que todo se midió con
> Grep/Read. T0 vuelve a medir antes de tocar nada.

## 0. Lo que hay hoy

| Hecho | Dónde |
|---|---|
| `model Recipe`: `name`, `nameNormalized`, `steps Json`, `imagePath`, `companyId`, `deletedAt`; sin relación consigo misma | `db/schema.prisma:434-453` |
| `model RecipeLine`: `percentage Decimal(5,2)`, `@@unique([recipeId, productId])`, `onDelete: Cascade` | `db/schema.prisma:460-473` |
| CHECK `recipe_lines_percentage_range` (`> 0 AND <= 100`). La suma 100 % NO está en la base: la exige zod | `db/migrations/20260922160000_recipe_lines_percentage/migration.sql:33-34`; `lib/modules/recetas/domain/recipe-input.ts:227-229` |
| Esa migración vació `recipe_lines`: puede haber originales **sin líneas** en datos reales | misma migración, `:13` |
| Unicidad de nombre: `recipes_company_name_unique (company_id, name_normalized) WHERE deleted_at IS NULL` | `db/migrations/20260916120000_recipes_company_scope/migration.sql:160-162` |
| `isUniqueNameViolation` mira que `meta.target` incluya `name_normalized` (no el nombre del índice) | `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts:136,155-164` |
| `RECIPE_TOTAL_PERCENTAGE = '100.00'`, `sumPercentages` exacto en centésimas | `lib/modules/recetas/domain/recipe-percentage.ts:10,48-61` |
| Puerto `RecipeRepository` (5 métodos, `scope` al final) | `lib/modules/recetas/ports/recipe-repository.ts:73-106` |
| Puerto público `RecipeCatalog` (4 métodos, `companyId`) y `RecipeRef {id,name,isDeleted}` | `lib/modules/recetas/domain/recipe-catalog.ts:13-62` |
| `replaceAliveRecipe`: `updateMany` acotado → `deleteMany` → `upsert`, en una `$transaction` | `recipe-prisma.ts:385-436` |
| `softDeleteAliveRecipe`: un `updateMany` | `recipe-prisma.ts:441-452` |
| `buildRecipeWhere` (lista y su `count`) | `recipe-prisma.ts:316-328` |
| `orders.recipe_id` NOT NULL, FK RESTRICT; alta exige receta viva | `lib/modules/pedidos/domain/create-order.ts:108-109` |
| Edición: solo `PENDIENTE`/`EN_CURSO`; si la receta cambia se exige viva, si no se conserva | `lib/modules/pedidos/domain/update-order.ts:89,95-98` |
| Coste y necesidad leen las líneas con `findExecutionContentById` del id guardado | `create-order.ts:117-145`, `update-order.ts:116-141`, `resolve-ingredients-cost.ts:29` |
| Finalizar: `recipeRef.name` → nombre del producto terminado `` `${recipeName} · ${presentation}` ``, uno por `(company, recipe_id, presentation_id)` | `lib/modules/pedidos/domain/transition-order.ts:91,111,131-132`; `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:1003,1013`; índice `products_finished_identity_key` en `db/migrations/20260924190100_.../migration.sql:32-34` |
| Asignaciones: nombre y pasos desde el catálogo | `lib/modules/asignaciones/domain/get-assigned-order-execution.ts:67-69`, `compose-order-rows.ts:41` |
| Importación de fórmula: choque de nombre con `findAliveByNormalizedName` | `lib/modules/documentos/domain/confirm-formula-import.ts:155`, `preview-formula-import.ts:145` |
| Formulario de pedido: `RecipePicker` con `input` oculto `recipeId`, `chooseRecipe`, `getRecipeAction` para ingredientes, `ORDER_BUSINESS_FIELDS` | `app/(private)/pedidos/components/order-form.tsx:35,138,364,442-455,606-612`; `recipe-picker.tsx:79` |
| Permisos `recetas.consultar` / `recetas.modificar` | `lib/modules/identity/domain/permissions.ts:74-84` |

## 1. Modelo de datos

### 1.1 Una columna y una relación en `recipes`, ninguna tabla nueva

```prisma
/// @module recetas
model Recipe {
  // ...lo de hoy...
  parentRecipeId String?  @map("parent_recipe_id") @db.Uuid
  parent         Recipe?  @relation("RecipeVersions", fields: [parentRecipeId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  versions       Recipe[] @relation("RecipeVersions")
}
```

- **Una versión es una fila de `recipes` con `parent_recipe_id` no nulo** (D1). Sus líneas son filas de
  `recipe_lines` como las de cualquier receta, así que `findExecutionContentById` y todo lo que lee
  líneas sigue leyendo la versión igual que una receta.
- `steps` de una versión se guarda siempre `[]` (R8). `description` e `image_path`, `NULL` (⚑ P3).
- **La relación se declara en Prisma** (misma tabla, mismo módulo): permite `include: { parent }` en
  una sola consulta. No cruza módulos, así que no es el caso que `createdBy` evita al no declararla.
- **Misma empresa que la original**: la versión escribe `company_id` desde el `scope` del actor y la
  original se busca con ese mismo `scope` (§3.2), así que no puede nacer cruzada. Ver alternativa 8.3.
- **Un solo nivel (D7)**: no es expresable como CHECK (mira otra fila). Lo garantizan (a) el alta, que
  exige `parent_recipe_id IS NULL` en la original con la fila bloqueada `FOR SHARE` (§3.2), y (b) que
  ninguna operación reescribe `parent_recipe_id` después del alta. Ver alternativa 8.4.

### 1.2 Migración `db/migrations/<ts>_recipe_versions/`

`migration.sql` (escrita a mano, sin DML, así que no necesita el paréntesis de RLS de otras
migraciones de `recipes`):

```sql
ALTER TABLE "recipes" ADD COLUMN "parent_recipe_id" UUID;

ALTER TABLE "recipes" ADD CONSTRAINT "recipes_parent_recipe_id_fkey"
  FOREIGN KEY ("parent_recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recipes" ADD CONSTRAINT "recipes_parent_not_self"
  CHECK ("parent_recipe_id" IS NULL OR "parent_recipe_id" <> "id");

-- La unicidad de hoy pasa a ser SOLO entre originales (D6).
DROP INDEX "recipes_company_name_unique";
CREATE UNIQUE INDEX "recipes_company_name_unique"
  ON "recipes" ("company_id", "name_normalized")
  WHERE "deleted_at" IS NULL AND "parent_recipe_id" IS NULL;

-- Y una nueva entre versiones de la misma original. Hace además de índice para «versiones vivas
-- de X» (listar y dar de baja en cascada).
CREATE UNIQUE INDEX "recipes_version_name_unique"
  ON "recipes" ("parent_recipe_id", "name_normalized")
  WHERE "deleted_at" IS NULL AND "parent_recipe_id" IS NOT NULL;
```

- **Resuelve el choque que anticipaba el leader**: con el índice de hoy, una versión «Sin perfume» de
  «Crema base» chocaría con una original «Sin perfume». Se parte en dos índices parciales disjuntos
  (`parent_recipe_id IS NULL` / `IS NOT NULL`) y cada uno guarda su ámbito. El nombre del índice de
  originales se conserva para no romper lo que lo cite (tests de integración, T0).
- Ningún dato cambia: la columna nace a `NULL` en todas las filas, que quedan como originales (R42).
- **No hay índice suelto de `parent_recipe_id`**: el único acceso «por padre» es a versiones vivas y lo
  cubre `recipes_version_name_unique`; nunca hay borrado físico de `recipes` que obligue a la FK a
  buscar hijos.
- `isUniqueNameViolation` no cambia: el `target` de los dos índices incluye `name_normalized`, así que
  el duplicado de versión sale como `'duplicate'` por el mismo camino (T0 lo verifica contra Postgres,
  como se hizo en QC-25 T14).

`down.sql` (R43):

```sql
DO $$
DECLARE versions_count bigint;
BEGIN
  SELECT count(*) INTO versions_count FROM "recipes" WHERE "parent_recipe_id" IS NOT NULL;
  IF versions_count > 0 THEN
    RAISE EXCEPTION 'recipe_versions: hay % version(es) de receta guardada(s) ...; localizalas con: SELECT id, parent_recipe_id, name FROM recipes WHERE parent_recipe_id IS NOT NULL; ...', versions_count;
  END IF;
END $$;
DROP INDEX "recipes_version_name_unique";
DROP INDEX "recipes_company_name_unique";
CREATE UNIQUE INDEX "recipes_company_name_unique" ON "recipes" ("company_id", "name_normalized") WHERE "deleted_at" IS NULL;
ALTER TABLE "recipes" DROP CONSTRAINT "recipes_parent_not_self";
ALTER TABLE "recipes" DROP CONSTRAINT "recipes_parent_recipe_id_fkey";
ALTER TABLE "recipes" DROP COLUMN "parent_recipe_id";
```

Abortar con versiones es deliberado: sin la columna, cada versión pasaría a ser una original suelta
—posiblemente con un nombre que choca con otra— y los pedidos que la usan perderían el vínculo. No se
pueden borrar porque los pedidos las referencian con RESTRICT. Mismo patrón `DO $$ … RAISE` que
`20260916120000_recipes_company_scope/migration.sql:145-149`.

`pedidos`, `inventario` y `recipe_lines` **no** tienen migración.

## 2. Reglas puras del dominio (`lib/modules/recetas/domain/recipe-version.ts`, nuevo)

Sin Prisma ni framework; publicado por el barrel lo que otros módulos necesitan.

```ts
export const VERSION_NAME_SEPARATOR = ' · ';
export function recipeDisplayName(name: string, originalName: string | null): string;
export function isVersionUnderReview(isVersion: boolean, percentages: readonly string[]): boolean;
export function propagateLines(
  before: readonly RecipeLineData[],   // la original justo antes del guardado
  after: readonly RecipeLineData[],    // la original tras el guardado
  version: readonly RecipeLineData[],  // la versión tal como está
): readonly RecipeLineData[];
```

### 2.1 Nombre mostrado (R11)
`recipeDisplayName('Sin perfume', 'Crema base') === 'Crema base · Sin perfume'`; con `null`, el nombre
tal cual. Mismo separador que el producto terminado (`product-prisma.ts:1003`), así que R36 sale
«Crema base · Sin perfume · Envase 1 L» sin tocar `inventario`.

### 2.2 «Por revisar» (R21, R22) — derivado, no guardado
`isVersionUnderReview(isVersion, ps) = isVersion && !sumPercentages(ps).isComplete`.
- **Es derivado**: no hay columna `needs_review`. Se vuelve cierto al quedar la suma fuera de 100 % y
  falso en cuanto la versión se edita con líneas válidas (R3 obliga a 100 %), sin que nadie tenga que
  acordarse de bajar una bandera. Ver alternativa 8.2.
- **Solo versiones** (R21): la migración de QC-147 dejó originales sin líneas (§0); si la regla se
  aplicara a originales, esas recetas dejarían de poder usarse en un pedido, cosa que hoy sí pueden.
- La aritmética es la de `recipe-percentage.ts` (centésimas en `bigint`), sin `number`.

### 2.3 Propagación: qué es «un ingrediente que la versión no cambió» (R15, ⚑ P1)
Por producto `p`, con `B` = original antes, `A` = original después, `V` = versión (mapas
`productId → centésimas`, ausente = `⊥`):

| `V[p]` frente a `B[p]` | Resultado en la versión |
|---|---|
| iguales (incluido `⊥ = ⊥`) → **no cambiado** | `A[p]` (si `A[p] = ⊥`, la línea desaparece) |
| distintos → **cambiado por la versión** | `V[p]` (se queda como está, también si es `⊥`) |

Casos que la tabla cubre y que tienen test propio (T3): la original sube un % que la versión no tocó
(se propaga); la original quita un ingrediente que la versión conservaba igual (se quita); la original
quita uno que la versión ya había quitado (sigue fuera); la original añade uno nuevo (aparece en la
versión); la original añade uno que la versión ya había añadido por su cuenta (gana la versión); la
versión cambió el % (se respeta); el resultado no suma 100 o queda vacío (por revisar, R20). Comparar
porcentajes es comparar centésimas, así que `"5"` y `"5.00"` son iguales. El orden de salida es el de
`A` seguido de las líneas propias de `V`, estable.

## 3. `recetas`: puerto y adaptador

### 3.1 `RecipeRepository` (`ports/recipe-repository.ts`)

`RecipeRow` gana `original: { id; name; description; imagePath; steps } | null` (null = es original).
Métodos (todos con `scope: RecipeScope` al final, como exige la guardia):

| Método | Cambia | Qué hace |
|---|---|---|
| `create` | no | Solo originales. |
| `findAliveById` | **sí** | `include: { lines, parent: { select: … } }`; rellena `original`. |
| `listAlive` | **sí** | `buildRecipeWhere` añade `parentRecipeId: null` al nivel de `deletedAt` (R9). El `count` usa el mismo objeto. |
| `replaceAlive` | no | Sigue igual; lo usan la edición de original **sin** propagación y la edición de versión. |
| `softDeleteAlive` | **sí** | `$transaction`: `updateMany` acotado de la fila → si `count === 0` `'not_found'` → `updateMany({ parentRecipeId: id, deletedAt: null, ...recipeCompanyScope(scope) })` con la misma fecha y autor (R23). Para una versión el segundo paso no toca nada (R24). |
| `createVersion(originalId, data, actorId, now, scope)` | **nuevo** | `$transaction`: `SELECT … FROM recipes WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL AND parent_recipe_id IS NULL FOR SHARE` (con `companyScopeColumns(scope)`) → si no vuelve `'not_found'`; si vuelve, `tx.recipe.create` con `parentRecipeId`, `steps: []`, `description`/`imagePath` `null` y las líneas anidadas. `'duplicate'` por `isUniqueNameViolation`. |
| `listAliveVersions(originalId, scope)` | **nuevo** | `findMany({ where: { parentRecipeId: originalId, deletedAt: null, ...scope }, include: { lines }, orderBy: [{ name: 'asc' }, { id: 'asc' }] })`. |
| `replaceAliveWithPropagation(id, data, versionIds, actorId, now, scope)` | **nuevo** | §4. |

El `FOR SHARE` de `createVersion` serializa contra la baja de la original (que hace `UPDATE` de esa
fila): si la baja gana, el `SELECT` reevaluado no devuelve fila y la versión no nace huérfana.

### 3.2 Por qué la versión no se crea con `create` + un campo más
`create` no comprueba nada de la original. Meter `parentRecipeId` en `NewRecipe` dejaría al dominio
leer la original fuera de la transacción y escribir dentro, con una ventana en la que la original
puede darse de baja y la versión nacer viva bajo una original muerta, que la baja en cascada ya no
alcanza.

### 3.3 `RecipeCatalog` (contrato público, `domain/recipe-catalog.ts`)
Mismos 4 métodos y mismas firmas; cambian los tipos y el `where` de dos:

```ts
export type RecipeRef = {
  readonly id: RecipeId;
  readonly name: string;            // nombre MOSTRADO: compuesto si es versión (R11)
  readonly ownName: string;         // el de la fila
  readonly isDeleted: boolean;
  readonly isUnderReview: boolean;  // R21: siempre false en originales
  readonly original: { readonly id: RecipeId; readonly name: string } | null;
};
```

| Método | Cambio |
|---|---|
| `findRefsIncludingDeleted` | `select` gana `parent { id, name }` y `lines { percentage }`; `toRecipeRef` compone `name` y calcula `isUnderReview` con §2. Sigue siendo UNA consulta para N ids. |
| `findExecutionContentById` | `name` compuesto; `steps` = los de `parent` si es versión (R8), **sin** filtro de vida en el padre (una versión dada de baja sigue ejecutándose, R25); `lines` las propias. |
| `findIdsMatchingName` | ⚑ P2: `AND: [scope, { OR: [{ nameNormalized: c }, { parent: { nameNormalized: c } }] }]` (R41). El `OR` va dentro del `AND`, nunca al nivel del ámbito (`company-scope.ts:13-15`). |
| `findAliveByNormalizedName` | añade `parentRecipeId: null` (R37, D11). |

`RecipeExecutionContent` no cambia de forma. `RecipeDetail` (`domain/recipe-view.ts`) gana
`original: { id; name } | null`, `isUnderReview` y `displayName`; para una versión `steps`,
`description` e `imageUrl` salen de la original (R8, ⚑ P3).

## 4. Guardar la original con propagación

`updateRecipeSchema` gana `propagateToVersionIds: z.array(z.string().uuid()).default([])` sin
repetidos. `createUpdateRecipe`:

1. `requirePermission(actor, 'recetas.modificar')`, zod, `findAliveById`.
2. Si `existing.original !== null` → `ActionNotAllowedError` (R7): una versión se edita con su operación.
3. Validación de productos nuevos e imagen, como hoy.
4. Si `propagateToVersionIds` está vacío → `replaceAlive`, exactamente el camino de hoy (R16). Lo usa
   también `confirm-formula-import.ts:185`, que no propaga.
5. Si no → `replaceAliveWithPropagation`, que en **una** `prisma.$transaction`:
   1. `tx.recipe.updateMany({ where: { id, deletedAt: null, parentRecipeId: null, ...recipeCompanyScope(scope) } })` → `count === 0` → `'not_found'`.
   2. `before = tx.recipeLine.findMany({ where: { recipeId: id } })` — **antes** de tocar las líneas.
   3. Concilia las líneas de la original (`deleteMany` + `upsert` con `recipeId: id`), como `replaceAliveRecipe`.
   4. Por cada `versionId`: `tx.recipe.updateMany({ where: { id: versionId, parentRecipeId: id, deletedAt: null, ...recipeCompanyScope(scope) }, data: { updatedAt, updatedBy } })`; `count === 0` → lanza un centinela que revierte todo y se traduce a `'version_not_found'` (R17). Lee sus líneas, llama a `propagateLines(before, data.lines, versionLines)` y concilia con `recipeId: versionId`.
   5. Devuelve `{ kind: 'ok', propagated: [{ versionId, isUnderReview }] }` (R19).
6. El dominio traduce `'version_not_found'` a `ValidationError` y `'duplicate'` a `RecipeDuplicateNameError`.
   `UpdateRecipeResult` gana `propagated`.

**Por qué el adaptador llama a `propagateLines`.** El cálculo necesita `before` y las líneas de cada
versión **leídas dentro de la transacción** que escribe (R18 y concurrencia: otro guardado de la
versión entre leer y escribir perdería su cambio). La regla sigue viviendo en el dominio y se prueba
pura; el adaptador solo la invoca, igual que ya invoca `normalizeRecipeName` y `recipeStepSchema`
(`recipe-prisma.ts:5-6`). Ver alternativa 8.5.

El guardado de la original **no se rechaza** si una versión queda fuera de 100 % (R20): la versión no
pasa por `recipeLinesSchema`, que es lo que exige el 100 %; el CHECK por línea de la base sigue
cumpliéndose porque cada porcentaje viene de `A` o de `V`, ya válidos.

## 5. Casos de uso nuevos de `recetas`

| Caso de uso | Permiso | Entrada | Salida / errores |
|---|---|---|---|
| `createRecipeVersion(originalId, input, actor)` | `recetas.modificar` | `{ name, lines? }` | `{ id }`. `findAliveById(originalId)`: null → `RecipeNotFoundError` (R5); `original !== null` → `ActionNotAllowedError` (R4). `lines ?? existing.lines` pasa por `recipeLinesSchema` (R2, R3) y por la misma validación de productos que el alta (existe, no `FINISHED_PRODUCT`). `createVersion`: `'not_found'` → R5, `'duplicate'` → `RecipeDuplicateNameError` (R12). |
| `updateRecipeVersion(versionId, input, actor)` | `recetas.modificar` | `{ name, lines }` | `findAliveById`: null → `RecipeNotFoundError`; `original === null` → `ActionNotAllowedError` (R7). Valida como R3 (líneas preexistentes no se revalidan contra el catálogo, igual que `update-recipe.ts:90-102`). `replaceAlive` con `steps: []`, `description`/`imagePath` `null` (R6, R22). |
| `listRecipeVersions(originalId, actor)` | `recetas.consultar` | id | `RecipeVersionSummary[] = { id, name, displayName, isUnderReview, updatedAt }`. Original inexistente/baja/otra empresa/versión → `RecipeNotFoundError` (R10). |
| `deleteRecipe` (existe) | `recetas.modificar` | id | Sin cambios de dominio; la cascada vive en `softDeleteAlive` (R23, R24). |
| `getRecipe` (existe) | `recetas.consultar` | id | Rellena `original`, `isUnderReview`, `displayName`; pasos/descr./imagen de la original si es versión. |
| `listRecipes` (existe) | `recetas.consultar` | — | Sin cambios de dominio; el filtro está en `buildRecipeWhere` (R9). |

Los esquemas zod (`createRecipeVersionSchema`, `updateRecipeVersionSchema`) viven en
`recipe-input.ts` y reutilizan `recipeLinesSchema` y el `name` de receta (trim + min 1), de modo que
la regla del 100 % sigue en un solo sitio (D2).

**Server Actions** nuevas en `lib/modules/recetas/adapters/driving/recipe-actions.ts`, mismo patrón
que las de hoy (`currentActor` + `toErrorState`): `createRecipeVersionAction(originalId, input)`,
`updateRecipeVersionAction(versionId, input)`, `listRecipeVersionsAction(originalId)`. La de borrar es
`deleteRecipeAction`, ya existente. QC-174 consumirá las dos primeras; esta ficha solo usa la tercera
desde el formulario de pedido.

## 6. `pedidos`

### 6.1 Entrada
`createOrderSchema` (y por tanto `updateOrderSchema`, que es el mismo objeto, `order-input.ts:110`)
gana `recipeVersionId: z.preprocess('' → null, z.string().uuid().nullable()).default(null)`. Sin el
campo, todo igual (R31): los llamantes y los E2E de hoy no cambian.

### 6.2 Resolución de la receta del pedido (`domain/order-recipe.ts`, nuevo, puro)
```ts
resolveOrderRecipe(refs: readonly RecipeRef[], recipeId, recipeVersionId)
  : { effectiveId: string } | 'not_found' | 'under_review'
```
- `recipeId` debe volver, no estar dada de baja y tener `original === null`.
- Si hay `recipeVersionId`: debe volver, no dada de baja, `original?.id === recipeId`; si
  `isUnderReview` → `'under_review'`.
- `effectiveId = recipeVersionId ?? recipeId`.

**Alta** (`create-order.ts:108`): una sola llamada `findRefsIncludingDeleted([recipeId, versionId?])`;
`'not_found'` → `RecipeNotFoundError` (R32), `'under_review'` → `RecipeVersionUnderReviewError` (R33).
Todo lo que sigue —coste, `orders.create`, `findExecutionContentById`, `syncForOrder`— usa
`effectiveId` (R30). `orders.recipe_id` guarda la versión: D1, sin columna nueva.

**Edición** (`update-order.ts:95-98`): `effectiveId` candidato = `recipeVersionId ?? recipeId`. Si es
igual a `row.recipeId` → se acepta sin mirar vida ni revisión, la misma regla de hoy (R35). Si
difiere → `resolveOrderRecipe` con los mismos rechazos (R34). Coste y necesidad con `effectiveId`.

Error nuevo `RecipeVersionUnderReviewError` (`code = 'recipe_version_under_review'`) en
`pedidos/domain/errors.ts`, con su código en `lib/modules/errores/domain/error-codes.ts` y su mensaje
en `error-catalog.ts`: «La versión elegida está por revisar: ajústala antes de usarla en un pedido.»

### 6.3 Salida
`OrderView` (y `OrderSummary`, que es alias) gana
`recipeVersion: { originalId; originalName; versionName } | null`. `recipeName` pasa a ser el nombre
mostrado (R11) sin cambiar de tipo. `toOrderView` recibe el `Map` de `RecipeRef` en vez de
`id → name`. `get-order.ts:93-102` y `list-orders.ts:157-160` cambian solo en eso.

### 6.4 Lo que no cambia en `pedidos`
`transition-order.ts` (Finalizar): ya pasa `recipeRef.name` y `locked.recipeId` al alta del producto
terminado, así que con una versión llega `recipeId` = versión y el nombre compuesto (R36, D9) sin
tocar el archivo. `order-requirement.ts`, `resolve-ingredients-cost.ts`, `quote-order-cost.ts` y
`order-cost.ts` reciben un id y leen sus líneas: intactos.

## 7. Formulario de pedido

Componente nuevo `app/(private)/pedidos/components/recipe-version-select.tsx` (en el barrel
`index.ts` de la ruta), justo debajo de `<RecipePicker>` (`order-form.tsx:606`).

- Props: `recipeId: string | null` (la original elegida), `initialVersion: { id; name; note? } | null`
  (edición), `onChange(versionId: string | null)`, `error`.
- Al cambiar `recipeId` pide `listRecipeVersionsAction(recipeId)` y descarta respuestas superadas
  (mismo patrón que `ingredientsRequestRef`, `order-form.tsx:403`). Opciones: «Original» (`''`) + las
  versiones con `isUnderReview === false` (R26).
- Deshabilitado si no hay receta o no hay ninguna versión ofrecible (R27). Excepción R29: en edición,
  la versión actual se añade como opción aunque no sea ofrecible (con la nota «por revisar» o «dada
  de baja») y el control queda habilitado.
- **El valor viaja en un `input` oculto `recipeVersionId`**, como `recipeId` en `recipe-picker.tsx:62`:
  un `<select disabled>` no entra en el `FormData`.
- Primitiva: la `SelectField` interna de `order-form.tsx:748` si admite `disabled`; si no, el `Select`
  de shadcn que ya usa. T0 lo mira; no se crea primitiva nueva. Objetivo táctil ≥ 44 px y `text-base`,
  como el resto del formulario.

`order-form.tsx`:
- Estado `version: { id; name } | null`; `chooseRecipe` lo pone a `null` (R28).
- `effectiveRecipeId = version?.id ?? recipe?.id`; `loadIngredients`, `quote.onRecipeChange` y
  `quote.onQuantityChange` usan ese id (R28). `getRecipeAction(versionId)` ya funciona: una versión
  viva es una receta viva para `findAliveById`.
- `ORDER_BUSINESS_FIELDS` gana `'recipeVersionId'` (solo añade: `guard-pantalla-pedidos-se-amplia`).
- Edición: `RecipePicker` arranca con `order.recipeVersion?.originalId ?? order.recipeId` y la etiqueta
  `originalName ?? recipeName`; el selector de versión con `{ id: order.recipeId, name: versionName }`.

## 8. Alternativas descartadas

1. **Tabla `recipe_versions` aparte o guardar solo diferencias.** Descartadas por el humano en D1.
2. **Columna `needs_review` guardada.** Hay que escribirla en tres caminos (propagar, editar versión,
   migración) y bajarla bien en todos; derivada de la suma (§2.2) no puede quedar desfasada. Coste
   aceptado: leer los porcentajes de las líneas en `findRefsIncludingDeleted` y en la lista de
   versiones (pocas líneas por receta, por índice de `recipe_id`).
3. **FK compuesta `(company_id, parent_recipe_id) → (company_id, id)` escrita a mano.** Defendería la
   empresa también en la base, pero Prisma no acepta una relación opcional sobre un campo obligatorio
   (`companyId`), así que habría que no declarar la relación —perdiendo el `include` y añadiendo
   *drift*— y crear un único `(company_id, id)` solo para ella. La empresa ya queda garantizada por
   construcción (§1.1).
4. **Trigger que impida versión de versión.** Lógica en la base que ningún otro módulo usa y que
   nadie revisa en el dominio; con `FOR SHARE` en el alta y `parent_recipe_id` inmutable basta.
5. **Calcular la propagación en el dominio fuera de la transacción** y pasar las líneas ya calculadas
   al adaptador. Más «puro», pero lee la versión en una conexión y escribe en otra: un guardado
   concurrente de la versión se perdería en silencio (R18).
6. **Meter la propagación dentro de `replaceAliveRecipe`.** Esa función tiene una comprobación
   estructural propia en `guard-ambito-empresa-recetas.test.ts:554-673` y es la única exenta del
   barrido por parámetro (`:523`): añadirle escrituras a otras recetas las colaría por la exención.
   Función nueva, con la misma forma y la guardia ampliada (§10).
7. **Componer el `recipeId` final en el cliente** (mandar solo la versión como `recipeId`). Ahorra el
   campo, pero el servidor ya no podría comprobar que la versión es de la receta elegida ni distinguir
   «se eligió la original» de «se mandó una versión por el campo de receta».
8. **Guardar la base de propagación por versión (P1 b).** Recomendación contraria en P1.

## 9. Cada lector existente: intacto o cambia

| Lector | Archivo | Queda |
|---|---|---|
| Alta de pedido | `pedidos/domain/create-order.ts` | **Cambia**: resuelve receta + versión (§6.2) |
| Edición de pedido | `pedidos/domain/update-order.ts` | **Cambia**: idem, con la regla de «no cambia» |
| Ficha / lista de pedidos | `get-order.ts`, `list-orders.ts`, `order-view.ts` | **Cambia**: `recipeVersion`; nombre mostrado sale del catálogo |
| Búsqueda de pedidos por receta | `list-orders.ts:149` → `findIdsMatchingName` | Código de `pedidos` intacto; cambia el adaptador (⚑ P2) |
| Coste, cotización, necesidad | `resolve-ingredients-cost.ts`, `quote-order-cost.ts`, `order-cost.ts`, `order-requirement.ts` | **Intactos** (leen líneas del id) |
| Finalizar → producto terminado | `transition-order.ts:91-132` | **Intacto**; recibe el nombre compuesto |
| Producto terminado | `inventario/.../product-prisma.ts:969-1030`, `finished-goods.ts` | **Intactos** (uno por `recipe_id`, que ya es la versión) |
| Asignaciones (filas, ejecución, empaque) | `compose-order-rows.ts:41`, `get-assigned-order-execution.ts:67-69`, `packing-order-view.ts` | **Intactos**; reciben nombre compuesto y pasos de la original |
| Importación de fórmula | `confirm-formula-import.ts:155`, `preview-formula-import.ts:145` | **Intactos**; cambia `findAliveByNormalizedName` (solo originales) |
| Lista de recetas y su selector | `list-recipes.ts`, `recipe-picker.tsx` | **Intactos**; cambia `buildRecipeWhere` |
| Detalle de receta | `get-recipe.ts` | **Cambia**: campos de versión, pasos de la original |
| Edición de receta | `update-recipe.ts` | **Cambia**: rechaza versiones, propaga |
| Pantalla `/produccion/formulas/[id]` | `app/(private)/produccion/formulas/...` | **Intacta** en esta ficha. Abrir ahí el id de una versión (solo por URL) carga el detalle y guardar daría «acción no permitida» (R7): la pantalla de versiones es QC-174 |

## 10. Guardias y tests que se ponen rojos

| Qué | Por qué | Arreglo (task) |
|---|---|---|
| `tests/unit/identity/session-once-per-request-actions.test.ts` | Lee `adapters/driving/` del disco y se pone rojo con acciones nuevas que resuelven usuario y empresa fuera de su lista (`:297`) | Añadir las tres acciones de §5 (T7) |
| `tests/guards/guard-catalogo-de-errores.test.ts` | Código nuevo `recipe_version_under_review` | Código + mensaje en `errores` (T2) |
| `tests/guards/guard-ambito-empresa-recetas.test.ts` | No se pone roja si las funciones nuevas declaran y usan `scope`, pero su cabecera y `:518-523` afirman que `replaceAliveRecipe` es «la única función que consulta `recipeLine`»: deja de ser verdad | Ampliar el `describe` estructural a `replaceAliveWithPropagation` y comprobar `createVersion`/`softDeleteAliveRecipe` (T4) |
| Tests que construyen `RecipeRef` a mano (≈12 archivos según Grep de `isDeleted: …}`: `recipe-catalog`, `confirm-formula-import`, `list-orders`, `create-order`, `order-service`, `quote-order-cost`, `transition-order`, `company-scope`, `update-order`, `company-isolation-service`, `get-assigned-order-execution`, `company-scope-queries.int`) | `RecipeRef` gana campos obligatorios: typecheck rojo | Actualizar dobles (T6). T0 da la cifra exacta |
| Tests de `buildRecipeWhere`/`listAliveRecipes` con `toEqual` exacto | Gana `parentRecipeId: null` | T4 |
| `tests/integration/inventario/list-query-indexes.int.test.ts`, `tests/integration/recetas/company-scope*.int.test.ts` | Si comparan la definición literal de `recipes_company_name_unique` | T1 (T0 confirma) |
| Tests de `toOrderView` / `OrderView` con `toEqual` | Campo `recipeVersion` | T9 |
| Tests del formulario que fijan `ORDER_BUSINESS_FIELDS` | Gana un campo | T11 |
| `guard-empresa-en-esquema`, `guard-rls-force`, `guard-arquitectura-modulos`, `guard-dependencias-aprobadas`, `guard-pantalla-pedidos-se-amplia` | **No** deben ponerse rojas: ninguna tabla nueva, ninguna dependencia, solo se añaden exportaciones | Si alguna se pone roja, es un fallo del cambio, no de la guardia |

## 11. Cruce con otras fichas (para F2.0)

| Ficha | Estado | Archivos en común |
|---|---|---|
| QC-170 pedido-en-varias-presentaciones | pending (tiene worktree) | `order-form.tsx`, `order-input.ts`, `create-order.ts`, `update-order.ts`, `order-view.ts`, `order-actions.ts` probables |
| QC-164 unidad-del-pedido | pending | `order-form.tsx`, `order-input.ts`, `create-order.ts`, `update-order.ts`, `resolve-ingredients-cost.ts` |
| QC-173 fases-en-los-pasos | pending | `recipe-input.ts` (esquema de paso), `recipe-catalog-prisma.ts` (`toExecutionSteps`), `recipe-prisma.ts` (`toSteps`) |
| QC-174 crear-versiones-en-la-receta | bloqueada por esta | Consumirá §5; no comparte archivos mientras esta esté abierta |

Las tres primeras chocan en archivos; el mapa exacto por task está en `tasks.md`.

## 12. Dependencias

Ninguna nueva (D14, R45). Todo lo anterior usa Prisma, zod y los componentes shadcn ya instalados.

## 13. Decisiones para F1.4

Las tres preguntas abiertas de `requirements.md` (P1 base de propagación, P2 búsqueda por la original,
P3 descripción e imagen de la versión). Los requisitos ⚑ y §2.3, §3.3 y §5 están escritos con la
opción recomendada de cada una.
