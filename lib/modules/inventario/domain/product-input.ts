import { z } from 'zod';

import { PRODUCT_TYPE_VALUES } from './product-queryable';

/**
 * Esquema de entrada del producto (`design.md > 6.1`). Validacion de borde (R28): nada
 * sin tipar ni sin validar cruza hacia el dominio.
 *
 * QC-52 (R1): el producto ya NO tiene costo, compra minima ni tiempo de entrega. Son
 * terminos COMERCIALES y dependen de a quien le compres, asi que viven en la linea del
 * catalogo del proveedor. Con ellos se fueron `COST_PATTERN`, `costSchema` y
 * `deliveryTimeSchema` de este archivo: lo que ya no se acepta tampoco se valida.
 */

/**
 * `trim()` va ANTES de `min(1)`: si se aplicara despues, '   ' pasaria el minimo de
 * longitud y solo se recortaria tras la validacion, incumpliendo R9 -"recortar antes de
 * guardarlo"-. Con `.trim().min(1)`, en ese orden, zod ya recorta el valor de salida del
 * `parse` y lo que queda vacio tras recortar se rechaza.
 */
const productNameSchema = z.string().trim().min(1).max(120);

const nonNegativeIntSchema = z.number().int().min(0);

/** Tipo de producto: opcional, por defecto PRODUCT. */
const productTypeSchema = z
  .enum(PRODUCT_TYPE_VALUES)
  .optional()
  .default('PRODUCT');

/**
 * El producto no declara unidad en el borde: la unidad la declara la PRESENTACION
 * (`presentations.unit_id`, NOT NULL), y `products.unit_id` la escribe `createWithFirstBatch`
 * copiandola de esa presentacion -el disparador solo RECHAZA lo que no cuadra-, asi que es un
 * dato que se lee (`ProductView.unitId`), no uno que se envie. Por eso
 * el alta y la edicion no aceptan `unitId` -y con `strictObject`, enviarlo es `invalid_input`,
 * no un campo ignorado en silencio-.
 */

/**
 * `qtyAlert` es obligatorio en la entrada aunque la columna `qty_alert` sea NULLABLE en la
 * base: un producto anterior con ese campo en NULL no se puede guardar sin rellenarlo, porque
 * la edicion es reemplazo completo y usa el mismo esquema que el alta.
 *
 * `strictObject`, no `z.object`: un campo de mas se RECHAZA como `invalid_input`, no se
 * ignora en silencio.
 */
/**
 * Los campos del producto, declarados UNA vez y compartidos por alta y edicion. La existencia
 * ya no esta aqui: es del lote, no del producto, y cada esquema que la necesita la declara
 * por su cuenta.
 */
export const productFieldsShape = {
  name: productNameSchema,
  qtyAlert: nonNegativeIntSchema,
  type: productTypeSchema,
} as const;

export const createProductSchema = z.strictObject({ ...productFieldsShape });

/**
 * La edicion es REEMPLAZO COMPLETO, no `PATCH` por campos sueltos. No comparte la
 * existencia con el alta: enviarla aqui es `invalid_input` por `strictObject`.
 */
export const updateProductSchema = createProductSchema;

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
