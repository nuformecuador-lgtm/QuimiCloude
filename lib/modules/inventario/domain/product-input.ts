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

const unitSchema = z.string().trim();

/**
 * `deliveryTime >= 0` se valida AQUI, en la aplicacion, porque la base no tiene `CHECK`
 * para el (D10). No se anade ningun `CHECK` a la base: el limite vive solo en zod.
 */
const deliveryTimeSchema = z.number().int().min(0);

export const createProductSchema = z.object({
  name: productNameSchema,
  presentationId: z.string().uuid(),
  stock: nonNegativeIntSchema.nullish(),
  cost: costSchema.nullish(),
  minPurchase: nonNegativeIntSchema.default(0),
  deliveryTime: deliveryTimeSchema.nullish(),
  qtyAlert: nonNegativeIntSchema.nullish(),
  unit: unitSchema.nullish(),
});

/**
 * La edicion es REEMPLAZO COMPLETO, no `PATCH` por campos sueltos (§ 11.7, D3, R13): el
 * mismo esquema de alta, incluida la existencia (`stock`).
 */
export const updateProductSchema = createProductSchema;

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
