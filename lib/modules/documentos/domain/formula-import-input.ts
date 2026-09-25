/**
 * El esquema del borde de la vista previa y de la confirmacion de una importacion de formula.
 *
 * `steps` en la confirmacion viaja como `unknown[]`: cada paso se valida con `recipeStepSchema`
 * dentro del caso de uso, no aqui, porque el esquema de receta vive en `recetas` y este borde
 * solo fija la FORMA del payload.
 */
import { z } from 'zod';

import { MAX_FORMULA_STEPS } from './review-formula-import';

export const previewFormulaImportInputSchema = z.object({
  documentFileId: z.string().uuid(),
  // presente = solo recomprobar el choque de nombre contra una receta viva, sin reinterpretar el texto
  name: z.string().max(1000).optional(),
});

export type PreviewFormulaImportInput = z.infer<typeof previewFormulaImportInputSchema>;

const draftLineInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), productId: z.string().uuid(), percentage: z.string() }).strict(),
  z.object({ kind: z.literal('new'), newProductName: z.string(), percentage: z.string() }).strict(),
]);

export const confirmFormulaImportInputSchema = z
  .object({
    documentFileId: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    lines: z.array(draftLineInputSchema).max(200),
    steps: z.array(z.unknown()).max(MAX_FORMULA_STEPS),
    // null = crear una receta nueva; un id = reemplazar esa receta
    replaceRecipeId: z.string().uuid().nullable(),
  })
  .strict();

export type ConfirmFormulaImportInput = z.infer<typeof confirmFormulaImportInputSchema>;
