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
 * La unidad del producto es una REFERENCIA al catalogo de `unidades` (QC-32, R10, R19), no
 * texto libre: aqui solo se valida la FORMA -que sea un uuid-. Que ese uuid EXISTA no lo
 * comprueba zod: lo rechaza la base con la clave foranea `products_unit_id_fkey` (R12).
 * Traducir ese error a un mensaje de usuario es de QC-38.
 */
const unitIdSchema = z.string().uuid();

/**
 * DECISION DEL HUMANO, 2026-09-03: `stock` y `qtyAlert` pasan a ser OBLIGATORIOS en la entrada.
 *
 * Acota a R5, que los declaraba opcionales. Lo que R5 garantizaba SOBRE LA BASE no se toca -las
 * columnas `stock` y `qty_alert` siguen siendo NULLABLE, y el modelo lo sigue afirmando en
 * `tests/unit/inventario/schema/inventario-schema.test.ts`-: lo que cambia es lo que la
 * APLICACION acepta al dar de alta o editar. Son los dos unicos campos numericos que quedan en
 * el formulario, y dejarlos vacios ahi ya no significa nada util.
 *
 * CONSECUENCIA QUE HAY QUE CONOCER: la edicion es reemplazo completo (R13/R19) y usa este mismo
 * esquema, asi que un producto anterior con `stock` o `qty_alert` a NULL en la base NO se puede
 * guardar sin rellenar los dos. El formulario los marca `required`, de modo que quien edite uno
 * de esos productos vera el campo vacio y tendra que darle un valor.
 *
 * `unitId` sigue siendo opcional: no se pinta ya en el formulario, y exigirlo dejaria la
 * edicion sin salida.
 *
 * `strictObject`, no `z.object` (QC-52 R1, `design.md > 4`): una entrada que traiga
 * `cost`, `minPurchase` o `deliveryTime` se RECHAZA como `invalid_input`, no se ignora en
 * silencio. Mismo criterio -y mismo motivo- que `createCatalogLineSchema` de QC-43:
 * ignorar el campo de mas es peor que rechazarlo, porque quien lo envia cree haber
 * guardado un costo que nunca se guardo.
 */
/**
 * Los CUATRO campos del producto, declarados UNA vez (QC-90, T3). El alta con primer lote
 * (`product-batch-input.ts`) los reutiliza tal cual en vez de copiarlos: dos listas
 * paralelas divergen en cuanto alguien anade un campo a una sola de ellas. Es el mismo
 * precedente que `catalogLineFieldsShape` de `proveedores/domain/catalog-line-input.ts`.
 *
 * Extraer la constante NO cambia `createProductSchema`, que sigue siendo el esquema de la
 * EDICION y no conoce ningun campo de lote (QC-90 R26).
 */
export const productFieldsShape = {
  name: productNameSchema,
  stock: nonNegativeIntSchema,
  qtyAlert: nonNegativeIntSchema,
  unitId: unitIdSchema.nullish(),
} as const;

export const createProductSchema = z.strictObject({ ...productFieldsShape });

/**
 * La edicion es REEMPLAZO COMPLETO, no `PATCH` por campos sueltos (§ 11.7, D3, R13): el
 * mismo esquema de alta, incluida la existencia (`stock`).
 */
export const updateProductSchema = createProductSchema;

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
