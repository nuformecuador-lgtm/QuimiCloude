# QC-194 — contrato público del backend (congelado para frontend_dev)

> Lo que el frontend puede importar y qué recibe. Los tipos de abajo están copiados literalmente
> del código. Si algo de aquí no cuadra con el código, manda el código y se avisa al leader.
> **STUB** = la forma ya es la definitiva pero el dato todavía no llega completo (ver §6).

## 1. Imports

| Qué | Desde |
|---|---|
| `recipeToolSchema`, `recipeToolsSchema`, `MAX_TOOL_QUANTITY`, `type RecipeToolInput` | `@/lib/modules/recetas` |
| `createRecipeSchema`, `updateRecipeSchema`, `createRecipeVersionSchema`, `updateRecipeVersionSchema` y sus `type ...Input` | `@/lib/modules/recetas` |
| `type RecipeDetail`, `type RecipeToolView` | `@/lib/modules/recetas` |
| `type RecipeExecutionContent`, `type RecipeExecutionTool` (solo backend; la UI no los necesita) | `@/lib/modules/recetas` |
| `type AssignedOrderExecutionView`, `type ExecutionToolView` | `@/lib/modules/asignaciones` |
| Server actions de receta (`createRecipeAction`, `updateRecipeAction`, `createRecipeVersionAction`, `updateRecipeVersionAction`, `getRecipeAction`) y sus `...FormState` / `RecipeQueryResult` | `@/lib/modules/recetas/adapters/driving/recipe-actions` (igual que hoy) |

El barrel de `recetas` se puede importar desde un componente de cliente (no arrastra servidor).

## 2. Tipos (literales)

### Entrada — `lib/modules/recetas/domain/recipe-input.ts`

```ts
export const MAX_TOOL_QUANTITY = 2147483647;

export const recipeToolSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(MAX_TOOL_QUANTITY),
  })
  .strict();

export type RecipeToolInput = z.infer<typeof recipeToolSchema>;
// = { productId: string; quantity: number }

export const recipeToolsSchema = z.array(recipeToolSchema).refine(sinProductoRepetido, {
  message: 'No puede haber dos herramientas con el mismo producto.',
});

// en cada esquema:
createRecipeSchema        tools: recipeToolsSchema.default([])
updateRecipeSchema        tools: recipeToolsSchema.optional()
createRecipeVersionSchema tools: recipeToolsSchema.optional()
updateRecipeVersionSchema tools: recipeToolsSchema.optional()
```

### Salida del detalle — `lib/modules/recetas/domain/recipe-view.ts`

```ts
export type RecipeToolView = {
  readonly id: string;
  readonly productId: string;
  readonly productName: string | null;
  readonly quantity: number;
};

export type RecipeDetail = RecipeSummary & {
  readonly steps: readonly RecipeStepView[];
  readonly lines: readonly RecipeLineView[];
  readonly tools: readonly RecipeToolView[];
  readonly original: { readonly id: string; readonly name: string } | null;
  readonly isUnderReview: boolean;
  readonly displayName: string;
};
```

### Pantalla del operador — `lib/modules/asignaciones/domain/assigned-order-execution-view.ts`

```ts
export type AssignedOrderExecutionView = {
  // ...campos de antes sin cambios...
  readonly lines: readonly ExecutionLineView[];
  readonly tools: readonly ExecutionToolView[];
  readonly presentationLines: readonly OrderDistributionLineView[];
  // ...
};

export type ExecutionToolView = {
  readonly productName: string | null;
  readonly quantity: number;
};
```

### Backend (no lo consume la UI, para referencia)

```ts
// ports/recipe-repository.ts
export type RecipeToolData = { readonly productId: string; readonly quantity: number };
export type RecipeToolRow = RecipeToolData & { readonly id: string };
NewRecipe.tools: readonly RecipeToolData[] | null;   // null = no tocar
RecipeRow.tools: readonly RecipeToolRow[];
NewRecipeVersion.tools: readonly RecipeToolData[];

// domain/recipe-catalog.ts
export type RecipeExecutionTool = {
  readonly productId: string;
  readonly productName: string | null;
  readonly quantity: number;
};
RecipeExecutionContent.tools: readonly RecipeExecutionTool[];
```

## 3. Lecturas: qué devuelve cada una

| Lectura | Dónde la usa la UI | `tools` |
|---|---|---|
| `getRecipeAction(id)` sobre una **original** | ficha `formulas/[id]/page.tsx` (precarga de edición) | `RecipeDetail.tools` de la original, en orden de alta. `productName: null` = producto dado de baja; se pinta «no disponible» y se conserva con su cantidad |
| `getRecipeAction(versionId)` | `formulas/[id]/versiones/[versionId]/page.tsx` | las **propias** de la versión (no las de la original) |
| `getRecipeAction(originalId)` para el alta de versión | `formulas/[id]/versiones/nueva/page.tsx` | las de la original: es la precarga del formulario de alta de versión |
| Alta de receta | `formulas/nueva/page.tsx` | no hay lectura: el estado inicial es `[]` |
| `getAssignedOrderExecution` (pantalla `/asignacion/[id]`) | `order-execution-screen.tsx` | `{ productName, quantity }` de la receta del pedido (la versión si el pedido es de una versión). Cantidad tal cual de la receta: **no** se escala con la cantidad del pedido. `productName: null` = de baja → «Herramienta no disponible». `[]` → no se pinta el bloque |

`productName` sale de un único `findRefs` sobre la unión de productos de líneas y herramientas
(solo vivos de la empresa del actor), igual que hoy en las líneas.

## 4. Server actions afectadas

Las firmas **no cambian**: el tipo de entrada es `unknown` y lo valida el esquema zod, que ya
tiene `tools`. Lo único nuevo es la clave `tools` en el cuerpo.

```ts
createRecipeAction(input: unknown): Promise<CreateRecipeFormState>
updateRecipeAction(id: string, input: unknown): Promise<UpdateRecipeFormState>
createRecipeVersionAction(originalId: string, input: unknown): Promise<CreateRecipeVersionFormState>
updateRecipeVersionAction(versionId: string, input: unknown): Promise<UpdateRecipeVersionFormState>
getRecipeAction(id: string): Promise<RecipeQueryResult>

type CreateRecipeFormState        = { status: 'idle' } | { status: 'success'; id: string } | ErrorState;
type UpdateRecipeFormState        = { status: 'idle' } | { status: 'success'; propagated: UpdateRecipeResult['propagated'] } | ErrorState;
type CreateRecipeVersionFormState = { status: 'idle' } | { status: 'success'; id: string } | ErrorState;
type UpdateRecipeVersionFormState = { status: 'idle' } | { status: 'success' } | ErrorState;
type RecipeQueryResult            = { status: 'success'; data: RecipeDetail } | ErrorState;
```

### Qué mandar en `tools`

| Action | Omitir `tools` | `tools: []` | `tools: [...]` |
|---|---|---|---|
| `createRecipeAction` | receta sin herramientas | igual | esas herramientas |
| `updateRecipeAction` | **conserva** las que tiene | **quita** todas | reemplaza por esas |
| `createRecipeVersionAction` | **copia** las de la original | versión sin herramientas | esas |
| `updateRecipeVersionAction` | **conserva** las que tiene | **quita** todas | reemplaza por esas |

**El formulario manda SIEMPRE la clave `tools`** (también `[]`), en los cuatro: «omitir» queda
para llamantes de servidor como el import de PDF. Cada elemento es exactamente
`{ productId: string /* uuid */, quantity: number /* entero 1..2147483647 */ }`, sin más claves
(`.strict()`): ni `key`, ni `productName`. `quantity` viaja como **número entero**, no como cadena
(`'2'` se rechaza): la UI convierte el texto con `Number.parseInt(t.quantity, 10)`. Las
herramientas de baja que ya estaban se mandan tal cual, igual que las líneas. Las herramientas no
entran en la suma del 100 %.

`updateRecipeAction` con `propagateToVersionIds`: si `tools` va en el cuerpo, se propagan a esas
versiones con la misma regla que las líneas (lo que la versión no cambió sigue a la original).

## 5. Errores

### Validación previa en el cliente (el mismo esquema, con `safeParse`)

Issues de zod 4 medidos sobre `createRecipeSchema` (iguales en los cuatro esquemas):

| Entrada en `tools` | `path` | `code` | `message` |
|---|---|---|---|
| fila sin producto | `['tools', i, 'productId']` | `invalid_type` | `Invalid input: expected string, received undefined` |
| producto que no es uuid | `['tools', i, 'productId']` | `invalid_format` | `Invalid UUID` |
| cantidad ausente | `['tools', i, 'quantity']` | `invalid_type` | `Invalid input: expected number, received undefined` |
| cantidad `0` / negativa | `['tools', i, 'quantity']` | `too_small` | `Too small: expected number to be >=1` |
| cantidad `1.5` | `['tools', i, 'quantity']` | `invalid_type` | `Invalid input: expected int, received number` |
| cantidad `'2'` (cadena) | `['tools', i, 'quantity']` | `invalid_type` | `Invalid input: expected number, received string` |
| cantidad > `MAX_TOOL_QUANTITY` | `['tools', i, 'quantity']` | `too_big` | `Too big: expected number to be <=2147483647` |
| clave extra en una fila | `['tools', i]` | `unrecognized_keys` | `Unrecognized key: "extra"` |
| **producto repetido** | **`['tools']`** (sin índice) | `custom` | `No puede haber dos herramientas con el mismo producto.` |

Los mensajes de forma son los genéricos de zod (en inglés): la UI pinta su propio texto por fila a
partir del `path` y no debe mostrar `issue.message`, salvo el de repetido, que es el único en
español. El de repetido **no** apunta a una fila: va como error general del tab (en la práctica el
selector ya excluye las elegidas, así que no debería darse).

### Respuesta del servidor

Cualquier rechazo llega como `ErrorState` (`@/lib/modules/errores`), nunca como excepción:

```ts
type ErrorState =
  | { status: 'error'; code: Exclude<ErrorCode, 'unexpected'>; message: string }
  | { status: 'error'; code: 'unexpected'; message: string; reference: string };
```

- Cuerpo que no pasa el esquema (incluido todo lo de la tabla de arriba): la action **no** llama al
  caso de uso y devuelve `{ status: 'error', code: 'invalid_input', message: 'La entrada recibida no es valida.' }`.
  **No** devuelve los issues ni el índice de la fila: el detalle por fila solo existe si el
  cliente valida antes.
- Herramienta nueva que no es MACHINE, o que no existe / es de otra empresa / está de baja: el
  dominio lanza `ValidationError` → el mismo `{ status: 'error', code: 'invalid_input', message: 'La entrada recibida no es valida.' }`.
  Tampoco dice qué fila. (**STUB**: esta validación entra en T5; hoy el servidor no la hace.)
- Sin permiso `recetas.modificar`: `code: 'unauthorized'`, como hoy.
- No hay ningún código de error nuevo.

## 6. Qué está STUB hasta T4–T8

| Pieza | Hoy | Queda completa en |
|---|---|---|
| Lectura de `RecipeRow.tools` (`RECIPE_INCLUDE` + `toRecipeRow`) | **real**: lee la tabla `recipe_tools`, orden de alta | — |
| `getRecipe` → `RecipeDetail.tools` con `productName` | **real** (un solo `findRefs`) | — |
| Escritura de herramientas (`create`, `createVersion`, `replaceAlive`, `replaceAliveWithPropagation`) | **STUB**: el adaptador Prisma ignora `tools`; se guarda la receta pero no sus herramientas. Por eso, hoy cualquier lectura devuelve `tools: []` | T4 |
| Validación de herramientas nuevas (MACHINE, existe, viva, empresa) | **STUB**: no se valida contra el catálogo | T5 |
| Alta de versión sin `tools` | copia las de la original (`original.tools`), ya cableado | — (persiste en T4) |
| `RecipeExecutionContent.tools` (`findExecutionContentByIdOn`) | **STUB**: siempre `[]` | T6 |
| `getAssignedOrderExecution` → `tools` | mapeo real con nombre de `findRefs`, pero recibe `[]` del catálogo, así que hoy siempre `[]` | T6 (dato) / T8 (tests) |

Para trabajar la UI sin base, montar los dobles con `tools` poblado: la forma es la definitiva.
