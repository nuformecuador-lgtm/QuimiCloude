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
 * QC-35bis (decision humana del 2026-09-07): **el precio unitario y la unidad SALIERON del
 * pedido**, y con ellos `unitPriceSchema` y `unitIdSchema`. Un pedido es receta + cantidad +
 * prioridad (+ estado en la edicion). No hay «campo opcional» ni «valor por defecto» para
 * ninguno de los dos: lo que el esquema no declara no puede llegar, asi que un formulario o un
 * cliente que siga enviando `unitId` o `unitPrice` no consigue nada -`z.object` descarta las
 * claves desconocidas- y no hay forma de reintroducirlos por descuido.
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
 * La presentacion en que se entrega lo fabricado: aqui solo se valida la FORMA -un UUID-. La
 * EXISTENCIA y que sea de la empresa de quien escribe las comprueba el caso de uso a traves
 * del contrato publico `@/lib/modules/inventario`, nunca consultando su tabla.
 *
 * Obligatoria en el alta y heredada por la edicion: un pedido viejo sin presentacion se edita
 * enviando una, sin rama especial.
 */
const presentationIdSchema = z.string().uuid();

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
  presentationId: presentationIdSchema,
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
 * Edicion: REEMPLAZO COMPLETO del conjunto de datos de negocio (R20), como QC-25 y QC-43. Un
 * parche parcial obligaria a distinguir «campo ausente» de «campo puesto a nulo» y a evaluar
 * la transicion contra un estado a medio llegar. Es la pregunta abierta 5 del spec, con su
 * posicion por defecto escrita y su coste: subir la prioridad obliga a reenviar todo el pedido.
 *
 * `status: 'CANCELADO'` muere AQUI, sin llegar al caso de uso ni al repositorio (R24), y
 * tampoco hay campo `reason`: cancelar es `cancelOrder` y solo el (decision cerrada 7).
 */
export const updateOrderSchema = z.object({
  ...createOrderSchema.shape,
  status: z.enum(EDITABLE_STATUS_VALUES),
});

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
 */
export const quoteOrderCostSchema = createOrderSchema.pick({ recipeId: true, quantity: true });

export type QuoteOrderCostInput = z.infer<typeof quoteOrderCostSchema>;
