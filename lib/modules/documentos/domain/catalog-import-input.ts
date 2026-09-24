/**
 * El esquema del borde de la vista previa y de la confirmacion de una importacion de catalogo.
 *
 * `lines` es la fila revisada tal como la deja el formulario del navegador, no como la interpreto
 * la IA. A proposito no reutiliza los esquemas de alta/edicion de linea de `proveedores` campo a
 * campo: esos exigen la forma ya valida, y una fila incompleta tiene que poder llegar con un campo
 * vacio o mal escrito para que la clasificacion la marque y la pantalla diga que esta mal -si el
 * borde ya la rechazara, no se sabria cual fila fallo, solo que la peticion entera lo hizo-. La
 * validez de negocio la decide la clasificacion, reutilizando esos mismos esquemas por campo; este
 * archivo solo fija la forma de tipo: cadena o `null`, nunca `number` en costo o medidas, e
 * `imagePath` como cadena o ausente. `presentation` y `name` si son cadena obligatoria -no `null`-:
 * el formulario los manda como texto, vacio si el revisor lo deja en blanco, y una cadena vacia es
 * justo lo que hace que el campo salga invalido al clasificar.
 */
import { z } from 'zod';

/** Mismo tipo que `ExtractedMeasurement` (`catalog-extraction.ts`): valor y unidad como texto
 *  suelto, sin patron ni lista cerrada aqui, para las mismas razones que el resto de este archivo. */
const measurementInputSchema = z
  .strictObject({
    value: z.string().nullable(),
    unit: z.string().nullable(),
  })
  .nullable();

const measurementsInputSchema = z
  .strictObject({
    diameter: measurementInputSchema,
    height: measurementInputSchema,
    mouth: z.string().nullable(),
  })
  .nullable();

/**
 * Una fila revisada por el navegador. Sin `unit`: ese dato solo lo trae la interpretacion de la
 * IA y sirve para sugerir la unidad de una presentacion nueva la primera vez que se abre la
 * revision; una vez que el revisor edita la fila, la sugerencia ya se hizo y no hace falta
 * reenviarla.
 */
export const reviewedLineInputSchema = z.strictObject({
  name: z.string(),
  presentation: z.string(),
  cost: z.string(),
  minPurchase: z.string().nullable(),
  deliveryTime: z.number().int().nullable(),
  material: z.string().nullable(),
  measurements: measurementsInputSchema,
  imagePath: z.string().nullable(),
});

export type ReviewedLineInput = z.infer<typeof reviewedLineInputSchema>;

/**
 * Vista previa: `lines` ausente pide que se interprete el texto de la IA; presente, son las filas
 * ya revisadas y hay que reclasificar con ellas.
 */
export const previewCatalogImportInputSchema = z.strictObject({
  supplierId: z.string().uuid(),
  documentFileId: z.string().uuid(),
  lines: z.array(reviewedLineInputSchema).optional(),
});

export type PreviewCatalogImportInput = z.infer<typeof previewCatalogImportInputSchema>;

/** La unidad que el revisor elige para una presentacion nueva, identificada por el nombre que
 *  trae la fila. */
export const newPresentationUnitSchema = z.strictObject({
  presentation: z.string(),
  unitId: z.string().uuid(),
});

export type NewPresentationUnitInput = z.infer<typeof newPresentationUnitSchema>;

/**
 * Confirmacion: `lines` son solo las filas incluidas y siempre van, aunque la lista este vacia
 * -confirmar sin ninguna fila incluida es una entrada valida, no un error de forma-.
 */
export const confirmCatalogImportInputSchema = z.strictObject({
  supplierId: z.string().uuid(),
  documentFileId: z.string().uuid(),
  lines: z.array(reviewedLineInputSchema),
  newPresentationUnits: z.array(newPresentationUnitSchema),
});

export type ConfirmCatalogImportInput = z.infer<typeof confirmCatalogImportInputSchema>;
