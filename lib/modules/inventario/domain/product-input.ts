import { z } from 'zod';

/**
 * Esquema de entrada del producto (`design.md > 6.1`). Validacion de borde (R28): nada
 * sin tipar ni sin validar cruza hacia el dominio.
 *
 * `cost` viaja como CADENA, nunca como `number`: el dominio no puede importar
 * `@prisma/client` (R31) y el binario de coma flotante esta prohibido para importes
 * (`docs/architecture.md > Dominio` n.o 4). El patron admite hasta 10 enteros y 4
 * decimales; quien lo convierte a `Prisma.Decimal` es el adaptador driven (Grupo C).
 */
const COST_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

/**
 * `trim()` va ANTES de `min(1)`: si se aplicara despues, '   ' pasaria el minimo de
 * longitud y solo se recortaria tras la validacion, incumpliendo R9 -"recortar antes de
 * guardarlo"-. Con `.trim().min(1)`, en ese orden, zod ya recorta el valor de salida del
 * `parse` y lo que queda vacio tras recortar se rechaza.
 */
const productNameSchema = z.string().trim().min(1).max(120);

const nonNegativeIntSchema = z.number().int().min(0);

const costSchema = z.string().regex(COST_PATTERN);

/**
 * La unidad del producto es una REFERENCIA al catalogo de `unidades` (QC-32, R10, R19), no
 * texto libre: aqui solo se valida la FORMA -que sea un uuid-. Que ese uuid EXISTA no lo
 * comprueba zod: lo rechaza la base con la clave foranea `products_unit_id_fkey` (R12).
 * Traducir ese error a un mensaje de usuario es de QC-38.
 */
const unitIdSchema = z.string().uuid();

/**
 * `deliveryTime >= 0` se valida AQUI, en la aplicacion, porque la base no tiene `CHECK`
 * para el (D10). No se anade ningun `CHECK` a la base: el limite vive solo en zod.
 */
const deliveryTimeSchema = z.number().int().min(0);

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
 * `cost`, `deliveryTime` y `unitId` siguen siendo opcionales: ninguno se pinta ya en el
 * formulario, y exigirlos dejaria la edicion sin salida.
 */
export const createProductSchema = z.object({
  name: productNameSchema,
  presentationId: z.string().uuid(),
  stock: nonNegativeIntSchema,
  cost: costSchema.nullish(),
  minPurchase: nonNegativeIntSchema.default(0),
  deliveryTime: deliveryTimeSchema.nullish(),
  qtyAlert: nonNegativeIntSchema,
  unitId: unitIdSchema.nullish(),
});

/**
 * La edicion es REEMPLAZO COMPLETO, no `PATCH` por campos sueltos (§ 11.7, D3, R13): el
 * mismo esquema de alta, incluida la existencia (`stock`).
 */
export const updateProductSchema = createProductSchema;

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
