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

/**
 * EL DOCUMENTO DE UN PASO (QC-62, `design.md > 2`). Un paso ya NO es `{ body, type }`: es un
 * DOCUMENTO de estructura cerrada -parrafo, negrilla, cursiva y lista de verificacion, y nada
 * mas (decision cerrada 1)-. El campo `type` desaparecio del contrato (R9, decision cerrada 2):
 * si el documento lleva una lista de verificacion, ES un paso con checks; un dato derivado que
 * se guarda acaba contradiciendo a su origen.
 *
 * `.strict()` en CADA objeto no es adorno: por defecto zod DESCARTA en silencio las claves que
 * no declara, y R4 exige RECHAZARLAS. Sin esto, un documento con `href` o `level` cruzaria el
 * borde recortado y nadie se enteraria.
 */

/**
 * Fragmento de texto con sus marcas (R3). `text` va SIN `.trim()` -R5: lo que llega se guarda
 * tal cual- y SIN `.max()` -R12: no hay tope de caracteres en ninguna parte-. `min(1)` cierra
 * "un fragmento sin ningun caracter se rechaza" (R3).
 */
export const recipeStepSpanSchema = z
  .object({
    text: z.string().min(1),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
  })
  .strict();

export type RecipeStepSpan = z.infer<typeof recipeStepSpanSchema>;

/** ¿La lista de fragmentos aporta al menos un caracter distinto de espacio? (R7) */
function tieneCaracterVisible(spans: readonly { readonly text: string }[]): boolean {
  return spans.some((span) => span.text.trim() !== '');
}

/**
 * Item de una lista de verificacion. A diferencia del parrafo, NO puede quedar en blanco
 * (R7): una linea en blanco dentro de una lista de verificacion no representa nada.
 */
export const recipeStepChecklistItemSchema = z
  .object({
    spans: z.array(recipeStepSpanSchema),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (!tieneCaracterVisible(item.spans)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Un item de la lista de verificacion no puede quedar vacio.',
      });
    }
  });

export type RecipeStepChecklistItem = z.infer<typeof recipeStepChecklistItemSchema>;

/**
 * Bloque del documento. `kind` es un discriminante de BLOQUE, no el `type` que desaparece:
 * el `type` clasificaba el paso entero y era derivable de su contenido; `kind` clasifica UN
 * bloque y no es derivable de nada -sin el, un objeto con `spans` y otro con `items` solo se
 * distinguen adivinando campos-. R9 prohibe el primero, no el segundo.
 *
 * Un `paragraph` SIN `spans` se acepta: es la linea en blanco, y los saltos de linea del paso
 * son estos bloques, no caracteres dentro de un texto (R2). Un `checklist` SIN items se
 * rechaza. La asimetria es deliberada.
 */
export const recipeStepBlockSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('paragraph'),
      spans: z.array(recipeStepSpanSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal('checklist'),
      items: z.array(recipeStepChecklistItemSchema).min(1),
    })
    .strict(),
]);

export type RecipeStepBlock = z.infer<typeof recipeStepBlockSchema>;

/**
 * Tope de ELEMENTOS por paso (R11). Un elemento es cada parrafo y cada item de lista de
 * verificacion; el bloque `checklist` en si NO suma, es el envoltorio de sus items.
 *
 * 30 lo cerro el humano al aprobar el spec (F1.4, ultima fila de "Decisiones cerradas"). Vive
 * aqui, en UNA sola constante que el barrel publica, para que ninguna otra capa lo reescriba a
 * mano y las dos se desincronicen.
 */
export const MAX_STEP_ELEMENTS = 30;

/**
 * Cuenta los elementos de un documento: nº de parrafos + nº de items. Funcion PURA y exportada
 * para que quien tenga que avisar antes de enviar -y el test- cuente exactamente igual que el
 * esquema, en vez de replicar la aritmetica (R11).
 */
export function countRecipeStepElements(document: {
  readonly blocks: readonly RecipeStepBlock[];
}): number {
  return document.blocks.reduce(
    (total, block) => total + (block.kind === 'paragraph' ? 1 : block.items.length),
    0,
  );
}

/** ¿El documento entero aporta al menos un caracter distinto de espacio? (R7) */
function documentoTieneCaracterVisible(blocks: readonly RecipeStepBlock[]): boolean {
  return blocks.some((block) =>
    block.kind === 'paragraph'
      ? tieneCaracterVisible(block.spans)
      : block.items.some((item) => tieneCaracterVisible(item.spans)),
  );
}

/**
 * Un paso: el documento entero. Se valida por su FORMA, nunca por su contenido (R6, decision
 * cerrada 8). El orden de los bloques se conserva tal cual llego (R1, R5).
 */
export const recipeStepSchema = z
  .object({
    blocks: z.array(recipeStepBlockSchema),
  })
  .strict()
  .superRefine((document, ctx) => {
    if (!documentoTieneCaracterVisible(document.blocks)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Un paso no puede quedar vacio.',
      });
    }
    if (countRecipeStepElements(document) > MAX_STEP_ELEMENTS) {
      ctx.addIssue({
        code: 'custom',
        message: `Un paso admite como maximo ${MAX_STEP_ELEMENTS} elementos.`,
      });
    }
  });

export type RecipeStepInput = z.infer<typeof recipeStepSchema>;

/** Alias de lectura: el documento de un paso es el mismo dentro y fuera (`design.md > 2`). */
export type RecipeStepDocument = RecipeStepInput;

/**
 * Pasos: hasta 50 por receta, y ninguno vacio (R13; se mantiene lo vigente de QC-24/QC-25).
 * `.default([])`: sin pasos se persiste la lista vacia, no `undefined`.
 */
const recipeStepsSchema = z.array(recipeStepSchema).max(50).default([]);

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
