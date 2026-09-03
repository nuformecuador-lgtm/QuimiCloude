import { z } from 'zod';

/**
 * `cost` y `minPurchase` viajan como CADENA, nunca como `number` (`design.md > 6.2`): el
 * dominio no puede importar `@prisma/client` (R44) y el binario de coma flotante esta
 * prohibido para importes (`docs/architecture.md > Anti-patrones`). Quien convierte a
 * `Prisma.Decimal` -y de vuelta con `.toFixed(4)`- es el adaptador driven.
 *
 * El patron admite hasta 10 enteros y 4 decimales, la forma exacta de `DECIMAL(14,4)`, y
 * NO admite signo: por eso «>= 0» de `minPurchase` (R30) ya lo garantiza el patron, sin
 * comparacion numerica ninguna.
 */
const DECIMAL_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

/** Toda cifra decimal cuyos digitos son ceros: '0', '0.0', '00.0000'. */
const ZERO_PATTERN = /^0+(\.0*)?$/;

/**
 * Costo estrictamente mayor que cero (R28, decision cerrada 4). El cero se descarta
 * LEXICAMENTE, no convirtiendo a `number`: sobre una cadena decimal, «todos los digitos
 * son cero» es exacto y no pasa por coma flotante.
 *
 * Esta es la defensa del BORDE. La de la base -el `CHECK ("cost" > 0)` de la migracion de
 * esta ficha- es otra (R29) y se prueba contra Postgres real: `zod` da el mensaje al
 * usuario, la base cierra el camino de un `INSERT` por consola o de un seed.
 */
const costSchema = z
  .string()
  .regex(DECIMAL_PATTERN)
  .refine((value) => !ZERO_PATTERN.test(value));

/**
 * Minimo de compra: mismo decimal, pero el cero SI vale (R30). «Sin minimo pactado»
 * expresado de forma redundante no es un dato a medio escribir, y la base lo mantiene en
 * `>= 0` (decision 5 de QC-42, que esta ficha no toca).
 */
const minPurchaseSchema = z.string().regex(DECIMAL_PATTERN).nullish();

/**
 * Tiempo de entrega en dias enteros, sin cota superior (pregunta abierta 3 del diseno de
 * QC-42): un techo arbitrario seria un numero inventado y una migracion para cambiarlo.
 * Cero es «mismo dia», no un dato a medio escribir.
 */
const deliveryTimeSchema = z.number().int().min(0).nullish();

/**
 * Alta de una linea del catalogo (R41). `supplierId` y `productId` se validan solo en su
 * FORMA -que sean uuid-. Que el producto EXISTA y este vivo no lo comprueba `zod`: lo
 * pregunta el caso de uso al contrato publico de `inventario` (R26, `design.md > 5.3`), y
 * que el proveedor exista lo cierra la FK de la base.
 */
export const createCatalogLineSchema = z.strictObject({
  supplierId: z.string().uuid(),
  productId: z.string().uuid(),
  cost: costSchema,
  minPurchase: minPurchaseSchema,
  deliveryTime: deliveryTimeSchema,
});

/**
 * Edicion de la linea: SOLO las condiciones comerciales (R33). NO lleva `productId` ni
 * `supplierId`, y es `strictObject` a proposito -rechaza el campo de mas en vez de
 * ignorarlo en silencio-: la pareja proveedor-producto es la IDENTIDAD de la linea y esta
 * bajo indice unico (`design.md > 6.3`, P5). Cambiar de producto es dar de baja la linea y
 * crear otra, dos operaciones que ya existen.
 *
 * Ignorar el campo de mas seria peor que rechazarlo: quien lo enviara creeria haber
 * cambiado el producto y la linea seguiria apuntando al anterior, sin ningun aviso.
 */
export const updateCatalogLineSchema = z.strictObject({
  cost: costSchema,
  minPurchase: minPurchaseSchema,
  deliveryTime: deliveryTimeSchema,
});

export type CreateCatalogLineInput = z.infer<typeof createCatalogLineSchema>;
export type UpdateCatalogLineInput = z.infer<typeof updateCatalogLineSchema>;
