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
 * Contenido del envase (R6, R7): decimal plano, hasta diez enteros y cuatro decimales, como
 * `costSchema` de `catalog-line-input.ts`. Opcional y anulable -`nullish()`-: una presentacion
 * puede no declararlo, y vaciar el campo se traduce a `null`, no a un `0` que fuera el `CHECK`
 * de la base rechazaria igual (`content > 0`).
 */
const CONTENT_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;
const CONTENT_ZERO_PATTERN = /^0+(\.0*)?$/;

const presentationContentSchema = z
  .string()
  .regex(CONTENT_PATTERN)
  .refine((value) => !CONTENT_ZERO_PATTERN.test(value))
  .nullish();

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

/**
 * `strictObject`, no `z.object` (QC-49 R17; mismo criterio y mismo motivo que
 * `product-input.ts` y `product-batch-input.ts`, que ya lo hacen citando QC-52 R1).
 *
 * R17 pide TRES cosas de una `companyId` colada en la entrada, y no dos: que no se escriba,
 * que no se tenga en cuenta y que la entrada SE RECHACE POR CAMPO DESCONOCIDO. Con `z.object`
 * las dos primeras se cumplian -la empresa la escribe `companyScopeColumns(scope)` desde el
 * ambito, y `PresentationData` no la lleva- pero la tercera no: zod PODA el campo de mas en
 * SILENCIO. Quien envio una empresa se iba creyendo que habia elegido en cual se guardaba la
 * presentacion, y se habia guardado en otra sin que nada se lo dijera. Ignorar el campo de mas
 * es peor que rechazarlo, exactamente por eso.
 *
 * Los dos llamantes del cliente -`presentation-form.tsx` y `presentation-select.tsx`- y las dos
 * Server Actions construyen el objeto con estos dos campos y nada mas, asi que la estrictez no
 * les cambia nada; lo que corta es la entrada que trae basura.
 */
export const createPresentationSchema = z.strictObject({
  name: presentationNameSchema,
  unitId: presentationUnitIdSchema,
  content: presentationContentSchema,
});

/** Reemplazo completo, igual que el producto (§ 11.7). QC-80 (R12): la edicion reemplaza
 *  nombre Y unidad, asi que es literalmente el mismo esquema que el alta. */
export const updatePresentationSchema = createPresentationSchema;

export type CreatePresentationInput = z.infer<typeof createPresentationSchema>;
export type UpdatePresentationInput = z.infer<typeof updatePresentationSchema>;
