import { z } from 'zod';

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

/**
 * QC-80 (R21): AQUI VIVIA `unitIdSchema`, y se fue con la columna. El producto YA NO declara
 * unidad -ni en el borde, ni en el contrato de salida, ni en la base: `products.unit_id`,
 * `products_unit_id_idx` y `products_unit_id_fkey` se eliminaron en
 * `20260911120000_presentation_unit`-. La unidad la declara ahora la PRESENTACION
 * (`presentations.unit_id`, NOT NULL), y la de un producto se DERIVA de la presentacion de su
 * lote mas reciente (`ProductView.latestBatchUnitId`, R22): un dato que se lee, no uno que se
 * envie. Por eso el alta y la edicion no aceptan `unitId` -y con `strictObject`, enviarlo es
 * `invalid_input`, no un campo ignorado en silencio-.
 */

/**
 * `qtyAlert` es obligatorio en la entrada aunque la columna `qty_alert` sea NULLABLE en la
 * base: un producto anterior con ese campo en NULL no se puede guardar sin rellenarlo, porque
 * la edicion es reemplazo completo (R13/R19) y usa el mismo esquema que el alta.
 *
 * `strictObject`, no `z.object` (QC-52, `design.md > 4`): un campo de mas se RECHAZA como
 * `invalid_input`, no se ignora en silencio.
 */
/**
 * Los campos del producto, declarados UNA vez y compartidos por alta y edicion. La existencia
 * ya no esta aqui: es del lote, no del producto (R9, R10), y cada esquema que la necesita la
 * declara por su cuenta.
 */
export const productFieldsShape = {
  name: productNameSchema,
  qtyAlert: nonNegativeIntSchema,
} as const;

export const createProductSchema = z.strictObject({ ...productFieldsShape });

/**
 * La edicion es REEMPLAZO COMPLETO, no `PATCH` por campos sueltos (§ 11.7, D3, R13). No
 * comparte la existencia con el alta: enviarla aqui es `invalid_input` por `strictObject`.
 */
export const updateProductSchema = createProductSchema;

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
