import { z } from 'zod';

import { normalizePresentationName } from './presentation-name';

/**
 * Esquema de entrada de la presentacion (`design.md > 6.2`). Mismo orden `trim()` antes
 * de `min(1)` que `product-input.ts`: R9 exige recortar antes de guardar, y con
 * `.trim().min(1)` el valor que sale del `parse` ya viene recortado.
 *
 * El `refine` cierra R37 (D22): un nombre que normaliza a la cadena vacia -p. ej.
 * "---"- se rechaza como NOMBRE INVALIDO aqui, en el borde, antes de llegar al indice
 * unico de la base. Si no existiera este refine, "---" pasaria la validacion de longitud
 * y terminaria intentando insertarse con `nameNormalized: ''`, y una segunda presentacion
 * de solo signos se anunciaria como "ya existe" en vez de como nombre invalido.
 */
const presentationNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((name) => normalizePresentationName(name) !== '', {
    message: 'El nombre de la presentacion no contiene ningun caracter valido.',
  });

/**
 * QC-80 (R10): la unidad de la presentacion es OBLIGATORIA, sin `default` y sin `nullish`.
 * La columna `presentations.unit_id` es `NOT NULL`: un esquema que aceptara la ausencia
 * estaria prometiendo un estado que la base rechaza. `uuid()` porque lo que viaja es el
 * identificador de una fila de `units`, nunca su nombre ni su simbolo.
 *
 * Este mismo objeto lo usa el formulario de cliente para su validacion previa (R17), asi
 * que el error cae con `issue.path[0] === 'unitId'`, que es lo que la pantalla ya sabe
 * mapear a un campo.
 */
const presentationUnitIdSchema = z.string().uuid();

export const createPresentationSchema = z.object({
  name: presentationNameSchema,
  unitId: presentationUnitIdSchema,
});

/** Reemplazo completo, igual que el producto (§ 11.7). QC-80 (R12): la edicion reemplaza
 *  nombre Y unidad, asi que es literalmente el mismo esquema que el alta. */
export const updatePresentationSchema = createPresentationSchema;

export type CreatePresentationInput = z.infer<typeof createPresentationSchema>;
export type UpdatePresentationInput = z.infer<typeof updatePresentationSchema>;
