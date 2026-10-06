# QC-194 — herramientas-de-la-receta · design.md

> Las secciones § se citan desde `tasks.md`. Los requisitos son los de `requirements.md`. Las
> recomendaciones marcadas ⚑ dependen de las preguntas abiertas P1–P4 y se confirman en F1.4.

## 0. Hechos medidos (rama al crear el spec)

| Hecho | Dónde |
|---|---|
| El tab «Herramientas» existe y es solo de pantalla: estado local `machines`, no sale por `onChange` | `app/(private)/produccion/formulas/components/recipe-lines-field.tsx:64-73`, `:154-162`, `:203`, `:278-316`, `:554-630` |
| `RecipeMachineFormValue` = `{ key, productId, productName }`, sin cantidad | `recipe-lines-field.tsx:69-73` |
| `buildRecipePayload` arma `{ name, description, steps, lines, image? }`, sin herramientas | `recipe-form-state.ts:111-175` |
| Las 4 páginas del formulario ya cargan la primera página de MACHINE como `initialMachinePage` | `formulas/nueva/page.tsx:46-106`, `[id]/page.tsx:62-169`, `[id]/versiones/nueva/page.tsx:32-135`, `[id]/versiones/[versionId]/page.tsx:33-152` |
| Contrato de entrada: `createRecipeSchema`, `updateRecipeSchema` (con `image` tri-estado y `propagateToVersionIds`), `createRecipeVersionSchema` (`lines` opcional = copia), `updateRecipeVersionSchema` | `lib/modules/recetas/domain/recipe-input.ts:250-297` |
| Edición: solo se valida contra el catálogo el producto NUEVO; el preexistente se acepta aunque esté de baja | `update-recipe.ts:91-106`, `update-recipe-version.ts:42-55` |
| `image` omitida = no tocar | `update-recipe.ts:112-113` |
| Alta de versión: copia las líneas de la original y las revalida enteras | `create-recipe-version.ts:42-56` |
| Propagación: `propagateLines(before, after, version)` compara por producto y porcentaje | `recipe-version.ts:24-63` |
| Escritura con propagación en una transacción; las líneas de antes se leen dentro | `recipe-prisma.ts:573-653` |
| `replaceAliveRecipe`: `updateMany` acotado por empresa primero, luego `deleteMany` + `upsert` de líneas por `recipeId: id` | `recipe-prisma.ts:409-460`; la estructura la vigila `tests/guards/guard-ambito-empresa-recetas.test.ts:570-680` |
| Contenido de ejecución: `findExecutionContentByIdOn` selecciona `lines` y nada más de la receta | `recipe-catalog-prisma.ts:190-209`; tipo en `recipe-catalog.ts:77-91` |
| Lectores de `content.lines` para stock y costo | `create-order.ts:159-160`, `update-order.ts:150-151`, `review-blocked-orders.ts:123-124`, `transition-order.ts:71-74`, `resolve-ingredients-cost.ts:29-30` |
| Pantalla del operador: `getAssignedOrderExecution` resuelve nombres con `products.findRefs` (solo vivos → `null` = de baja) | `lib/modules/asignaciones/domain/get-assigned-order-execution.ts:69-119`; vista en `assigned-order-execution-view.ts:11-38`; pantalla `app/(private)/asignacion/[id]/components/order-execution-screen.tsx:87-91` |
| Import de PDF: `updateRecipe(clash.id, { name, description, steps, lines })`, sin `image` | `lib/modules/documentos/domain/confirm-formula-import.ts:183-193` |
| `recipe_lines` no tiene `company_id` y es la única tabla de receta en la lista cerrada de exentas | `tests/guards/guard-empresa-en-esquema.test.ts:94`, `docs/architecture.md:33-41` |
| Las migraciones se nombran a mano en una lista cerrada | `tests/guards/guard-identificador-de-request.test.ts:285-370` |
| Última migración | `db/migrations/20261001170100_orders_blocked_index` |
| `PRODUCT_TYPES.MACHINE` publicado por el barrel de `inventario`; `ProductRef.type` ya llega en `findRefs` | `lib/modules/inventario/domain/product-type.ts:12-17`, `update-recipe.ts:104` |

## 1. Modelo de datos ⚑ (P1)

Tabla nueva **`recipe_tools`**, propiedad de `recetas`, gemela de `recipe_lines`:

```prisma
/// Sin `companyId`: hereda la empresa de su receta y cae con ella por el CASCADE.
/// `productId` no lleva `@relation` porque apunta a otro modulo; su FK esta escrita a mano.
/// @module recetas
model RecipeTool {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recipeId  String   @map("recipe_id") @db.Uuid
  productId String   @map("product_id") @db.Uuid
  quantity  Int
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  recipe Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@unique([recipeId, productId], map: "recipe_tools_recipe_id_product_id_key")
  @@index([productId], map: "recipe_tools_product_id_idx")
  @@map("recipe_tools")
}
```

y en `Recipe`: `tools RecipeTool[]`.

Migración **`db/migrations/20261003120000_recipe_tools/`** (timestamp posterior a
`20261001170100`; si `dev` trae una más nueva al implementar, se sube):

- `migration.sql`: `CREATE TABLE`, FK `recipe_tools_recipe_id_fkey` (CASCADE, la genera Prisma),
  **a mano** la FK `recipe_tools_product_id_fkey` → `products(id)` `ON DELETE RESTRICT ON UPDATE
  CASCADE` (igual que `recipe_lines_product_id_fkey`), el único compuesto, el índice de `product_id`,
  **a mano** `CHECK ("quantity" > 0)` como `recipe_tools_quantity_positive`, y `ENABLE` + `FORCE ROW
  LEVEL SECURITY` sin policies.
- `down.sql`: `DROP TABLE IF EXISTS "recipe_tools";` (arrastra FK, índices y CHECK).
- `INTEGER` (int4): la cantidad es un entero pequeño e informativo; no es una cantidad de stock, así
  que la regla de «decimal con precisión» y la de «cantidad con unidad» no le aplican (no hay
  existencia que medir). El tope del contrato es `2147483647` por la columna, no por producto.
- **Qué NO hace la base:** comprobar que el producto es MACHINE. Sería un CHECK sobre otra tabla
  (de otro módulo), o sea un trigger; lo valida el dominio en el borde (§3) y la base garantiza
  integridad referencial, unicidad y cantidad positiva.

**Exención de empresa (⚑ P1, sub-decisión humana).** Igual que `recipe_lines`: `recipe_tools` se
alcanza solo a través de su receta, que sí lleva `company_id`, y toda escritura filtra por el `id`
que el `updateMany` acotado por empresa ya verificó (§4). Requiere:
1. Añadir `{ tabla: 'recipe_tools', motivo: 'hereda la empresa de la receta a la que pertenece' }`
   a `EXENTAS` y a la lista literal de `guard-empresa-en-esquema.test.ts` (`:94`, `:265-273`).
2. Cambiar en `docs/architecture.md:33-41` «ocho tablas» por «nueve» y nombrar `recipe_tools` junto a
   `recipe_lines` (el guard compara el bullet con la lista).
Si el humano prefiere `company_id` propio: columna `company_id` NOT NULL, índice único nuevo
`recipes_id_company_id_key` en `recipes(id, company_id)`, FK compuesta `(recipe_id, company_id)` y
`recipeCompanyScope` en cada consulta de herramientas. Más superficie y más guardias, para una tabla
que no se consulta nunca sin su receta.

Guardias y tests de esquema que cambian: la lista cerrada de
`guard-identificador-de-request.test.ts` (alta de la migración), un test de migración nuevo en
`tests/unit/recetas/schema/` (UP crea lo descrito, DOWN lo revierte, `/// @module recetas`), y lo que
T0 encuentre en `tests/integration/aislamiento.json`.

## 2. Contrato de entrada (`recipe-input.ts`)

```ts
export const MAX_TOOL_QUANTITY = 2147483647;

export const recipeToolSchema = z
  .object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(MAX_TOOL_QUANTITY) })
  .strict();

export const recipeToolsSchema = z
  .array(recipeToolSchema)
  .refine(sinProductoRepetido, { message: 'No puede haber dos herramientas con el mismo producto.' });
```

| Esquema | Clave `tools` | Significado de omitirla |
|---|---|---|
| `createRecipeSchema` | `recipeToolsSchema.default([])` | sin herramientas (R2, R18) |
| `updateRecipeSchema` | `recipeToolsSchema.optional()` — **nunca `.default()`** | conservar las que tiene (R17, R18) |
| `createRecipeVersionSchema` | `recipeToolsSchema.optional()` | copia de la original (R11) |
| `updateRecipeVersionSchema` | `recipeToolsSchema.optional()` | conservar (R17) |

`[]` explícito = quitar todas. La misma trampa que `image`: si alguien pone `.default([])` en la
edición, el import de PDF borra las herramientas en silencio; un test del esquema lo fija (R17).

`quantity` viaja como `number`: es entero, no hay redondeo binario que temer. La UI la convierte de
texto a entero antes de enviarla (§8).

Las herramientas **no** pasan por el `superRefine` de la suma de `recipeLinesSchema` (R7).

## 3. Dominio (`lib/modules/recetas/domain/`)

### 3.1 Tipos del puerto (`ports/recipe-repository.ts`)

```ts
export type RecipeToolData = { readonly productId: string; readonly quantity: number };
export type RecipeToolRow = RecipeToolData & { readonly id: string };

NewRecipe        += readonly tools: readonly RecipeToolData[] | null;   // null = no tocar
RecipeRow        += readonly tools: readonly RecipeToolRow[];
NewRecipeVersion += readonly tools: readonly RecipeToolData[];
```

`null` en `NewRecipe.tools` y no «el caso de uso relee y reenvía las de antes»: releer fuera de la
transacción y reescribir pisaría un guardado concurrente de las herramientas (mismo motivo por el que
`propagateLines` lee `before` dentro de la transacción).

### 3.2 Validación de herramientas nuevas

Función interna `assertToolsValid(sent, alreadyThere, products, companyId)` en un archivo nuevo
`recipe-tools.ts`, usada por los cuatro casos de uso:

1. `nuevas = sent − alreadyThere` (por `productId`). `alreadyThere` es: vacío en el alta; las
   herramientas actuales de la receta en las dos ediciones; las de la original al crear una versión
   (R12, R19).
2. Si `nuevas` no está vacía: `products.findRefs(nuevas, companyId)`; falta alguna → `ValidationError`
   (R5); alguna con `type !== PRODUCT_TYPES.MACHINE` → `ValidationError` (R3).

Se usa `ValidationError` y no `ActionNotAllowedError` (que es lo que hoy responde un producto
terminado en las líneas) porque elegir un producto que no es herramienta es una entrada inválida,
no una acción vetada.

### 3.3 Casos de uso

- `createRecipe`: `tools` del esquema, validadas con `alreadyThere = []`, a `NewRecipe.tools`.
- `updateRecipe`: `data.tools === undefined` → `tools: null`; si no, validadas contra
  `existing.tools`. `requirePermission(actor, 'recetas.modificar')` sigue siendo la primera línea
  (R32).
- `createRecipeVersion`: `data.tools ?? original.tools` (copia, **sin** revalidar las copiadas: una de
  baja se conserva, R11 + D7). Las enviadas se validan contra `original.tools` (R12). Diferencia
  deliberada con las líneas, que hoy revalidan la copia entera: para herramientas D7 manda conservar.
- `updateRecipeVersion`: igual que `updateRecipe` sobre `existing.tools`; `null` si se omite.
- `getRecipe`: un solo `findRefs` con la unión de ids de líneas y herramientas; añade
  `tools: RecipeToolView[]` a `RecipeDetail`:
  ```ts
  export type RecipeToolView = { readonly id: string; readonly productId: string;
                                 readonly productName: string | null; readonly quantity: number };
  ```
  `productName: null` = de baja (R20).

### 3.4 Propagación (`recipe-version.ts`)

`propagateLines` se generaliza a `propagateByProduct<T extends { productId: string }>(before, after,
version, same: (a: T, b: T) => boolean)` sin cambiar su algoritmo; `propagateLines` pasa a ser
`propagateByProduct(…, sameByPercentage)` y la nueva `propagateTools` es
`propagateByProduct(…, (a, b) => a.quantity === b.quantity)`. Así R14 se cumple por construcción con
la misma regla que ya cumplen las líneas, y los tests actuales de `propagateLines` siguen valiendo.

`isVersionUnderReview` no cambia: solo recibe porcentajes (R7, R16).

## 4. Persistencia (`recipe-prisma.ts`)

- `RECIPE_INCLUDE` añade `tools: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }` y `toRecipeRow`
  mapea `tools`. Orden estable de alta; el `upsert` conserva `created_at` de la que ya estaba.
- `createRecipe` y `createRecipeVersion`: `tools: { create: [...] }` anidado junto a `lines`.
- `replaceAliveRecipe`: si `data.tools !== null`, tras las líneas y en la **misma** transacción,
  `tx.recipeTool.deleteMany({ where: { recipeId: id, productId: { notIn } } })` + `upsert` por
  `recipeId_productId`. Siempre **después** del `updateMany` acotado por empresa y de su salida
  temprana: es la condición estructural que vigila `guard-ambito-empresa-recetas.test.ts`, que se
  amplía para exigirla también a `recipeTool` (T4).
- `replaceAliveRecipeWithPropagation`: lee `beforeTools` dentro de la transacción **antes** de
  escribir; si `data.tools === null` no escribe herramientas en la original **ni** propaga
  herramientas (antes = después, `propagateTools` sería la identidad); si no, escribe las de la
  original y, por versión, `propagateTools(beforeTools, data.tools, currentTools)` con el mismo
  `deleteMany` + `upsert`. Un fallo revierte todo (R15).
- No hay helper compartido: el par `deleteMany`/`upsert` de `recipeTool` va escrito dentro de cada
  función (`replaceAliveRecipe`, la original y cada versión de `replaceAliveRecipeWithPropagation`).
  `guard-ambito-empresa-recetas.test.ts` exige que toda función que toque `tx.` declare y consuma
  `scope`, y que cada `tx.recipeTool.*` viva en la propia función, tras su `updateMany` acotado y su
  salida temprana; una función interna sin `scope` no pasaría la guardia, y darle un `scope` que no
  usa sería debilitarla.
- `translateWriteError`: el CHECK `recipe_tools_quantity_positive` (23514) y cualquier violación de
  FK (`23503`/`P2003`) de estas escrituras se traducen a `ValidationError`; en la práctica el dominio
  los para antes. No se distingue la FK de producto de las demás (autor, `parent_recipe_id`): con
  Prisma 6.19 el error llega con `meta.constraint: null` y el mensaje dice «Foreign key constraint
  violated on the (not available)», tanto en las escrituras anidadas como en los `upsert`.

## 5. Lo que NO cambia: stock, consumo y costo (R8–R10)

`RecipeExecutionContent` gana un campo **aparte**:

```ts
export type RecipeExecutionTool = { readonly productId: string; readonly productName: string | null;
                                    readonly quantity: number };
RecipeExecutionContent += readonly tools: readonly RecipeExecutionTool[];
```

`lines` sigue siendo exactamente lo que era. `buildRequirement`, `syncForOrder`, `consumeForOrder` y
`resolveIngredientsCost` leen solo `content.lines` (§0) y **no se tocan**: las herramientas no les
llegan porque viven en otro campo, no porque alguien las filtre. `findExecutionContentByIdOn`
añade `tools: { select: { productId, quantity }, orderBy: … }` al `select`.

La prueba de R8–R10 es de integración contra Postgres real (§10): una receta con una herramienta
MACHINE con lotes y otra sin stock; crear, editar y revisar bloqueados, pasarlo a curso y consumir; afirmar sobre
`reservation_movements` e `inventory_movements` que no hay ningún asiento con un lote de la
herramienta, que el pedido no queda bloqueado por ella, y que `ingredients_cost` es el mismo que con
la receta sin herramientas.

## 6. Pantalla del operador (`asignaciones`)

- `AssignedOrderExecutionView += readonly tools: readonly ExecutionToolView[]` con
  `ExecutionToolView = { productName: string | null; quantity: number }`.
- `getAssignedOrderExecution`: toma `content.tools`; el `findRefs` existente pasa a pedir la unión de
  ids de líneas y herramientas (una sola llamada). La cantidad se copia tal cual, **sin**
  `consumedQuantity` (R29). Permiso: `asignaciones.consultar`, el que ya exige (R32).
- Componente nuevo `OrderExecutionTools` en `app/(private)/asignacion/[id]/components/`, exportado por
  el barrel, montado en `order-execution-screen.tsx` entre `OrderExecutionLines` y el `StepReader`.
  Lista de solo lectura «nombre · cantidad», con `PRODUCT_NAME_FALLBACK`-equivalente «Herramienta no
  disponible» (R30). Con `tools.length === 0` no renderiza nada (⚑ P3, R31). Sin controles: no hay
  objetivos táctiles nuevos; el texto en `text-base` (R33).

## 7. Formulario (`app/(private)/produccion/formulas/components/`)

- `RecipeMachineFormValue += readonly quantity: string` (lo que escribe el usuario; se convierte a
  entero al armar el payload). Se renombra en el texto del archivo «máquina» → «herramienta» solo
  donde la rama toca, y se quitan los comentarios «UI-only», que pasan a ser falsos.
- **El tab deja de tener estado propio**: `RecipeLinesField` recibe `tools`, `onToolsChange` y
  `toolErrors` (controlado, como `lines`). El estado vive en `RecipeFormState.tools` y
  `RecipeVersionFormState.tools`; así el payload lo puede leer y el «guardar» lo puede validar.
- Precarga: `recipe.tools` (ficha de la original y página de versión, R22) y `original.tools` (alta
  de versión, R23), con `productName` del detalle (`null` → «no disponible», R20). Alta de receta:
  `[]`.
- Al elegir una herramienta en una fila: `quantity: '1'` si estaba vacía (R24). El selector ya
  excluye las elegidas (`usedMachineIds`) y ya recibe solo MACHINE (`initialMachinePage`); hay que
  comprobar en T0 que la búsqueda paginada del selector también filtra por MACHINE y por vivos.
- Campo de cantidad: `inputMode="numeric"`, `text-base`, solo dígitos al teclear (mismo patrón que
  `sanitizePercentageInput`), `min-h-11` (R33).
- `buildRecipePayload` y el builder de versión añaden **siempre** `tools: state.tools.map(t => ({
  productId, quantity: Number.parseInt(t.quantity, 10) }))` (R26). Las no disponibles van tal cual,
  igual que las líneas. El formulario siempre manda la clave: «omitir» queda solo para llamantes de
  servidor como el import de PDF.
- Validación previa con el esquema del contrato (como hoy): una fila sin producto o con cantidad no
  entera > 0 bloquea el envío y pinta el error en la fila (`toolErrors[index]`), mapeando el `path`
  `['tools', i, …]` del issue de zod (R25). El issue de producto repetido llega con `path`
  `['tools']`, sin índice: no apunta a ninguna fila y se pinta como error general del tab (el
  selector ya excluye las elegidas, así que en la práctica no se da). La suma de porcentajes se calcula solo con `lines`, así que
  R26 (segunda mitad) se cumple sin cambio; un test lo fija.
- Errores del servidor: los mismos estados de error que ya pinta el formulario (R27); no hay código de
  error nuevo.

## 8. Import de PDF

Sin cambios de código: `confirm-formula-import.ts` ya llama a `updateRecipe` sin `tools` y a
`createRecipe` sin `tools`; con §2 eso significa «conservar» y «vacía» (R18). Se añaden los tests que
lo fijan.

## 9. Permisos y producto dado de baja

- Escritura: los cuatro casos de uso ya abren con `requirePermission(actor, 'recetas.modificar')`;
  se añade un caso por operación que afirma que, sin permiso y con herramientas en el cuerpo, no se
  llama al repositorio (R32).
- Baja de producto (R21): la baja de producto es lógica (`deleted_at`) y no consulta recetas; la FK
  `RESTRICT` solo actúa en un borrado físico. Se fija con un test de integración que da de baja un
  MACHINE usado como herramienta y luego edita la receta conservándola (R19, R21).

## 10. Mapa requisito → test previsto

| R | Test (nivel) |
|---|---|
| R1, R2 | `tests/integration/recetas/recipe-tools.int.test.ts` (nuevo): alta/edición original y versión; alta sin `tools` |
| R3–R6 | `tests/unit/recetas/recipe-input.test.ts` (forma, repetido, cantidad) + `tests/unit/recetas/recipe-tools.test.ts` (MACHINE, inexistente, otra empresa, de baja) |
| R7 | `recipe-input.test.ts` (100 % + herramientas pasa) + `recipe-version.test.ts` (por revisar ignora herramientas) |
| R8–R10 | `tests/integration/pedidos/order-reservation-tools.int.test.ts` (nuevo, Postgres real) |
| R11–R16 | `tests/unit/recetas/recipe-version.test.ts` (`propagateTools`) + `recipe-tools.int.test.ts` (copia, edición aislada, propagación, rollback) |
| R17, R18 | `recipe-input.test.ts` (omitido ≠ `[]`) + `tests/integration/documentos/formula-import.int.test.ts` (reemplazo conserva) |
| R19–R21 | `recipe-tools.int.test.ts` + `tests/unit/recetas/get-recipe.test.ts` |
| R22–R27 | `tests/unit/recetas-ui/recipe-lines-field-tools.test.tsx` (nuevo) + `recipe-form-state.test.ts` |
| R28–R31 | `tests/unit/asignaciones/get-assigned-order-execution.test.ts` + `tests/unit/asignaciones-ui/order-execution-tools.test.tsx` (nuevo) |
| R32 | tests de autorización de los cuatro casos de uso |
| R33 | aserciones de clase en los tests de UI de R22–R31 |
| R34 | el gate de dependencias (`docs/dependencias.md`) sin filas nuevas |

E2E: ninguno (⚑ P2).

## 11. Alternativas descartadas

1. **Columna `kind` en `recipe_lines` con `percentage` anulable.** Una sola tabla, menos migración.
   Descartada: los cinco lectores de `content.lines` (§0), la suma de porcentajes, `propagateLines`,
   `isVersionUnderReview`, el `NOT NULL`/`CHECK` de `percentage` y el `UNIQUE (recipe_id,
   product_id)` pasarían a ver herramientas. Cumplir D1 exigiría filtrar en cada uno, y el próximo
   lector que se escriba sin el filtro reservaría stock de una máquina sin que nada falle. Con tabla
   aparte, D1 se cumple por construcción.
2. **Columna `tools jsonb` en `recipes`** (como `steps`). Descartada: sin FK a `products` (una baja
   física dejaría ids al vacío), sin unicidad en base, y sin forma de que un `RESTRICT` proteja el
   dato. `steps` es JSON porque es un documento; una herramienta es una referencia a otra tabla.
3. **Método aparte `findExecutionToolsById` en `RecipeCatalog`** en vez de un campo en
   `RecipeExecutionContent`. Descartada: obliga a `asignaciones` a dos lecturas por pantalla. El
   coste del campo —una consulta más dentro de las transacciones de reserva— es despreciable y
   `pedidos` no lo lee.
4. **Que el caso de uso de edición relea las herramientas y las reenvíe cuando se omiten.**
   Descartada: pisa en silencio un guardado concurrente (§3.1).

## 12. Preguntas abiertas: resolución propuesta

- **P1 — dónde se guardan.** Tabla `recipe_tools` (§1). La exención de empresa toca una lista
  cerrada de `docs/architecture.md`: **decide el humano en F1.4** entre exención (recomendada) y
  `company_id` propio.
- **P2 — E2E.** No. `CHECKPOINTS.md` pide E2E en flujos de autenticación, permisos, movimientos de
  inventario, importes y webhooks; esta ficha garantiza justamente que **no** mueve inventario ni
  importes, y eso se prueba mejor contra Postgres real en integración (§5) que por la pantalla.
- **P3 — bloque vacío del operador.** No se muestra (R31).
- **P4 — marcas de diferencia en herramientas de versión.** No en esta ficha.

## 13. Dependencias y plataforma

Ninguna librería nueva (R34). Los controles nuevos son los primitivos de `components/ui/` ya usados
por el tab; reglas de 44×44 px y 16 px en §6–§7 (R33). Sin excepción de escritorio.
