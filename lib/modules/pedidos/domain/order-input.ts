import { z } from 'zod';

import {
  DEFAULT_ORDER_PRIORITY,
  ORDER_PRIORITY_VALUES,
  ORDER_STATUS_VALUES,
  type OrderStatus,
} from './order-classification';

/**
 * Esquemas de entrada de los seis casos de uso (`design.md > 7.1-7.3`). Validacion de BORDE
 * (R55): nada sin tipar ni sin validar cruza hacia el dominio. Viven en `domain/` y el
 * contrato los reexporta, asi que la Server Action y -manana- el formulario de QC-35 validan
 * con el MISMO esquema.
 */

/**
 * Desde 2026-09-07 el precio unitario y la unidad salieron del pedido; el precio sigue fuera,
 * pero la UNIDAD vuelve (`unitId`, obligatoria en el alta y en la edicion): la cantidad se
 * interpreta siempre en ella, con o sin reparto, y cada linea del reparto la usa para convertir
 * `envases x contenido` de la unidad de su presentacion a la del pedido. `unitPriceSchema` sigue
 * sin existir: lo que el esquema no declara no puede llegar.
 */

/**
 * Cantidad como CADENA decimal, nunca `number`: el dominio no puede importar
 * `Prisma.Decimal` y un `number` de JavaScript es coma flotante binaria
 * (`docs/architecture.md > Anti-patrones`). `Decimal(14, 4)` son hasta 10 digitos enteros y 4
 * decimales. Mismo patron -literal- que `recetas` y `proveedores`; el adaptador driven es
 * quien convierte a `Prisma.Decimal`, y a la salida vuelve con `.toFixed(4)`.
 *
 * El patron NO admite signo, asi que una cantidad NEGATIVA se rechaza aqui, en la forma (R17).
 */
const DECIMAL_14_4 = /^\d{1,10}(\.\d{1,4})?$/;

/**
 * R17: la cantidad tiene que ser MAYOR que cero, y desde el 2026-09-07 es el UNICO decimal que
 * le queda al pedido. El patron por si solo deja pasar "0" y "0.0000", asi que el `> 0` real lo
 * cierra el `refine`.
 */
const quantitySchema = z
  .string()
  .regex(DECIMAL_14_4, { message: 'La cantidad debe ser un numero decimal valido.' })
  .refine((value) => Number.parseFloat(value) > 0, {
    message: 'La cantidad debe ser mayor que cero.',
  });

/**
 * Receta: aqui, en el borde, solo se valida la FORMA -un UUID-. La EXISTENCIA y la vigencia las
 * comprueba el caso de uso a traves del contrato publico `@/lib/modules/recetas` (R15), nunca
 * consultando su tabla.
 */
const recipeIdSchema = z.string().uuid();

/** R19: conjunto CERRADO. Un valor de fuera muere en el borde y no llega al caso de uso. */
const prioritySchema = z.enum(ORDER_PRIORITY_VALUES);

/**
 * La unidad en que se expresa `quantity` ([Q4]): aqui solo se valida la FORMA -un UUID-.
 * La EXISTENCIA y que sea visible para la empresa de quien escribe las comprueba el caso de uso
 * contra el contrato publico `@/lib/modules/unidades`. Obligatoria en el alta y en la edicion.
 */
const unitIdSchema = z.string().uuid();

/**
 * Una linea del reparto: la presentacion en que se entrega parte de lo fabricado y cuantos
 * envases ENTEROS de ella (R1). Aqui solo la FORMA; la existencia, el contenido copiado y el
 * total contra la cantidad del pedido los comprueba el caso de uso.
 */
const presentationLineSchema = z.object({
  presentationId: z.string().uuid(),
  packages: z.coerce.number().int().positive(),
});

/** Dos veces la MISMA presentacion en el reparto no son dos lineas: son la misma linea con los
 *  envases repetidos, y eso lo rechaza el borde en vez de sumarlos por su cuenta (R2). */
function hasNoDuplicatePresentation(lines: readonly { readonly presentationId: string }[]): boolean {
  return new Set(lines.map((line) => line.presentationId)).size === lines.length;
}

/** El reparto completo. `[]` es un pedido sin reparto todavia, valido (R9): quien no reparte
 *  nada al dar de alta lo reparte despues, hasta que empieza el empaque. */
export const presentationLinesSchema = z
  .array(presentationLineSchema)
  .refine(hasNoDuplicatePresentation, { message: 'Cada presentación aparece una sola vez.' })
  .default([]);

/**
 * Alta (R8, R9). Lo que este esquema NO declara, no puede llegar: no hay `status`, ni
 * `cancellationReason`, ni `orderYear`/`orderSequence`, ni `createdAt`, ni `createdBy` /
 * `updatedBy`. `z.object` DESCARTA las claves desconocidas, asi que un cliente que las envie
 * no consigue nada (R6, R9). El estado de alta es siempre `PENDIENTE` y lo pone el caso de
 * uso; el correlativo lo entrega la secuencia de la base (R11); los dos autores salen de la
 * sesion (R6).
 *
 * La prioridad es OPCIONAL en la entrada y su ausencia significa `BAJA` (R9). El defecto se
 * aplica AQUI y no en el caso de uso para que la salida del `parse` no tenga un campo
 * opcional que cada llamante tenga que volver a resolver; la constante es la del dominio
 * (`DEFAULT_ORDER_PRIORITY`), no un literal repetido.
 */
export const createOrderSchema = z.object({
  recipeId: recipeIdSchema,
  quantity: quantitySchema,
  priority: prioritySchema.default(DEFAULT_ORDER_PRIORITY),
  unitId: unitIdSchema,
  presentationLines: presentationLinesSchema,
});

/**
 * Los estados que una EDICION puede escribir (R24). Se DERIVA de `ORDER_STATUS_VALUES`
 * quitando `'CANCELADO'`, y no se escribe a mano: asi, el dia que aparezca un quinto estado,
 * quien lo anada tiene que decidir explicitamente si es editable en vez de heredarlo por
 * descuido de una lista copiada.
 */
export type EditableOrderStatus = Exclude<OrderStatus, 'CANCELADO'>;

export const EDITABLE_STATUS_VALUES: readonly EditableOrderStatus[] = ORDER_STATUS_VALUES.filter(
  (status): status is EditableOrderStatus => status !== 'CANCELADO',
);

/**
 * Edicion: REEMPLAZO COMPLETO del conjunto de datos de negocio. Un
 * parche parcial obligaria a distinguir «campo ausente» de «campo puesto a nulo». El coste:
 * subir la prioridad obliga a reenviar todo el pedido.
 *
 * La edicion ya no mueve el estado: un `status` que llegue en la entrada muere aqui, como
 * cualquier otra clave que el esquema no declare -`z.object` la descarta-, el mismo criterio
 * que el alta. Tampoco hay campo `reason`: cancelar es `cancelOrder` y solo el.
 */
export const updateOrderSchema = createOrderSchema;

/**
 * Cancelacion (R27). El tope de 500 vive AQUI, en la validacion de aplicacion, y no en el tipo
 * de la columna -que es `TEXT` sin longitud- (decision cerrada 4): cambiarlo es una linea y su
 * caso de test, no una migracion.
 *
 * `trim()` va ANTES de `min(1)` y de `max(500)`: si se aplicara despues, un motivo de solo
 * espacios pasaria el minimo y uno de 500 caracteres mas espacios se rechazaria sin motivo.
 */
export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

/**
 * QC-57 (R25): **`listOrdersSchema` DESAPARECIO.** El listado de pedidos ya no tiene forma
 * propia de consulta: el estado y la prioridad dejan de ser parametros suyos y entran como
 * filtros `select` del contrato generico (`domain/list-query.ts`), igual que en las otras seis
 * listas. Lo que aquel esquema garantizaba sigue garantizado, en otro sitio:
 *
 *   - los dos filtros OPCIONALES y COMBINABLES -ahora dos entradas de `filters`-;
 *   - su conjunto CERRADO (R19) -ahora lo poda `list-orders.ts` contra `ORDER_STATUS_VALUES` y
 *     `ORDER_PRIORITY_VALUES`; la diferencia deliberada es que un valor de fuera ya no rechaza
 *     la consulta: se omite y se anota, como cualquier campo no declarado (R5)-;
 *   - que un pedido `CANCELADO` SI se consulta (R25);
 *   - y que no hay busqueda por texto (R17: `orders` no tiene columna `name`, la busqueda se
 *     omite y se registra).
 *
 * `pageQuerySchema` se queda: lo publica el contrato del modulo y su forma es la que el
 * contrato de lista hereda para `page`/`pageSize`.
 */

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

/**
 * Receta y cantidad, con la MISMA regla que el alta -`pick` hereda la
 * forma UUID y el patron decimal sin copiarlos-. Un `companyId` en la entrada no llega a
 * ninguna parte: `z.object` descarta las claves de mas.
 *
 * `orderId` es OPCIONAL y solo lo envia el formulario de EDICION: el pedido que ya existe
 * cuenta lo que el mismo tiene apartado como disponible para si mismo. Esta entrada NO abre
 * ninguna lectura del pedido: el identificador viaja como cadena opaca hasta
 * `findCostingBatches`, que lo usa para no restar lo que ese pedido aparto.
 */
export const quoteOrderCostSchema = createOrderSchema
  .pick({ recipeId: true, quantity: true })
  .extend({ orderId: z.string().uuid().optional() });

export type QuoteOrderCostInput = z.infer<typeof quoteOrderCostSchema>;
