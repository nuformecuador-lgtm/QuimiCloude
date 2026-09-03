import { z } from 'zod';

import { normalizeRecipeName } from './recipe-name';

/**
 * Esquemas de entrada de receta (`design.md > 7.1`). Validacion de borde (R38): nada sin
 * tipar ni sin validar cruza hacia el dominio.
 */

/**
 * Cantidad de una linea, como CADENA: el dominio no puede importar `@prisma/client`
 * (R40), asi que `Decimal(14,4)` viaja por el borde como texto -mismo criterio que
 * `cost` en `inventario` (`design.md > 2`). Hasta 10 enteros y 4 decimales, y el `refine`
 * cierra el `> 0` real: el patron por si solo deja pasar "0" y "0.0000".
 */
const QUANTITY_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

const quantitySchema = z
  .string()
  .regex(QUANTITY_PATTERN, { message: 'La cantidad debe ser un numero decimal valido.' })
  .refine((value) => Number.parseFloat(value) > 0, {
    message: 'La cantidad debe ser mayor que cero.',
  });

/**
 * Unidad de la linea: referencia al catalogo de `unidades`, no texto libre (R50,
 * deroga R15). Aqui, en el borde, solo se valida la FORMA -un UUID valido-; la
 * EXISTENCIA real contra el catalogo la comprueba el caso de uso a traves de
 * `UnitCatalog` (`@/lib/modules/unidades`), igual que `productId` no valida existencia
 * en zod.
 */
const unitIdSchema = z.string().uuid();

export const recipeLineSchema = z.object({
  productId: z.string().uuid(),
  quantity: quantitySchema,
  unitId: unitIdSchema,
});

export type RecipeLineInput = z.infer<typeof recipeLineSchema>;

/**
 * `trim()` va ANTES de `min(1)`: si se aplicara despues, un nombre de solo espacios
 * pasaria el minimo de longitud y solo se recortaria tras la validacion, incumpliendo R7
 * -"recortar antes de guardarlo"-. Con `.trim().min(1)`, en ese orden, zod recorta el
 * valor de salida del `parse` y lo que queda vacio tras recortar se rechaza.
 *
 * El `refine` cierra R9: un nombre que normaliza a la cadena vacia -p. ej. "---"- se
 * rechaza aqui, en el borde, como nombre invalido, antes de llegar al indice unico.
 */
const recipeNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((name) => normalizeRecipeName(name) !== '', {
    message: 'El nombre de la receta no contiene ningun caracter valido.',
  });

const recipeDescriptionSchema = z.string().trim().max(500).nullish();

/** Pasos: hasta 50, cada uno de hasta 1.000 caracteres, ninguno vacio (R19, R20). */
const recipeStepsSchema = z
  .array(z.string().trim().min(1).max(1000))
  .max(50)
  .default([]);

/** Rechaza que la lista de lineas repita el mismo `productId` (R16). */
function sinProductoRepetido(lines: readonly RecipeLineInput[]): boolean {
  const ids = lines.map((line) => line.productId);
  return new Set(ids).size === ids.length;
}

const recipeLinesSchema = z
  .array(recipeLineSchema)
  .default([])
  .refine(sinProductoRepetido, {
    message: 'No puede haber dos lineas con el mismo producto.',
  });

/**
 * Bytes de una imagen nueva, sin validar todavia formato ni tamano -eso es
 * `validateRecipeImage` (T2), que corre en el caso de uso antes de subir-.
 */
const recipeImageUploadSchema = z.object({
  bytes: z.instanceof(Uint8Array),
});

/**
 * En el ALTA, el campo `image` solo admite dos estados: ausente (`undefined`) o
 * `{ bytes }` (`design.md > 7.1`: "en el alta solo hay dos estados... porque no hay
 * imagen anterior que quitar"). No se admite `null` explicito aqui.
 */
export const createRecipeSchema = z.object({
  name: recipeNameSchema,
  description: recipeDescriptionSchema,
  steps: recipeStepsSchema,
  lines: recipeLinesSchema,
  image: recipeImageUploadSchema.optional(),
});

/**
 * En la EDICION, el campo `image` tiene TRES estados y distinguirlos es requisito (R47):
 * - omitido (`undefined`): "no toco la imagen" -> conserva `imagePath`.
 * - `{ bytes }`: "esta es la nueva" -> sube y reemplaza.
 * - `null` explicito: "quitala" -> borra `imagePath` y el archivo.
 *
 * OJO CRITICO: se usa `.nullable().optional()` -nunca `.default()`- para que "omitido"
 * se preserve como `undefined` distinguible de `null`. `tests/unit/recetas/recipe-input.test.ts`
 * verifica explicitamente que el esquema no colapsa los dos casos.
 */
export const updateRecipeSchema = z.object({
  name: recipeNameSchema,
  description: recipeDescriptionSchema,
  steps: recipeStepsSchema,
  lines: recipeLinesSchema,
  image: recipeImageUploadSchema.nullable().optional(),
});

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
