import { z } from 'zod';

import {
  DEFAULT_ORDER_PRIORITY,
  ORDER_PRIORITY_VALUES,
  ORDER_STATUS_VALUES,
  type OrderStatus,
} from './order-classification';
import { pageQuerySchema } from './page';

/**
 * Esquemas de entrada de los seis casos de uso (`design.md > 7.1-7.3`). Validacion de BORDE
 * (R55): nada sin tipar ni sin validar cruza hacia el dominio. Viven en `domain/` y el
 * contrato los reexporta, asi que la Server Action y -manana- el formulario de QC-35 validan
 * con el MISMO esquema.
 */

/**
 * Cantidad y precio como CADENA decimal, nunca `number`: el dominio no puede importar
 * `Prisma.Decimal` y un `number` de JavaScript es coma flotante binaria
 * (`docs/architecture.md > Anti-patrones`). `Decimal(14, 4)` son hasta 10 digitos enteros y 4
 * decimales. Mismo patron -literal- que `recetas` y `proveedores`; el adaptador driven es
 * quien convierte a `Prisma.Decimal`, y a la salida vuelve con `.toFixed(4)`.
 *
 * El patron NO admite signo, asi que un valor NEGATIVO se rechaza aqui, en la forma, tanto en
 * la cantidad como en el precio (R17, R18).
 */
const DECIMAL_14_4 = /^\d{1,10}(\.\d{1,4})?$/;

/**
 * R17: la cantidad tiene que ser MAYOR que cero. El patron por si solo deja pasar "0" y
 * "0.0000", asi que el `> 0` real lo cierra el `refine`.
 */
const quantitySchema = z
  .string()
  .regex(DECIMAL_14_4, { message: 'La cantidad debe ser un numero decimal valido.' })
  .refine((value) => Number.parseFloat(value) > 0, {
    message: 'La cantidad debe ser mayor que cero.',
  });

/**
 * R18: el precio unitario admite el CERO -un pedido puede registrar una entrega sin cargo
 * (QC-33 R9)- y rechaza el negativo. No lleva `refine`: el cero es valido y el negativo ya no
 * pasa el patron.
 */
const unitPriceSchema = z
  .string()
  .regex(DECIMAL_14_4, { message: 'El precio unitario debe ser un numero decimal valido.' });

/**
 * Receta y unidad: aqui, en el borde, solo se valida la FORMA -un UUID-. La EXISTENCIA y la
 * vigencia las comprueba el caso de uso a traves de los contratos publicos
 * `@/lib/modules/recetas` y `@/lib/modules/unidades` (R15, R16), nunca consultando sus tablas.
 */
const recipeIdSchema = z.string().uuid();
const unitIdSchema = z.string().uuid();

/** R19: conjunto CERRADO. Un valor de fuera muere en el borde y no llega al caso de uso. */
const prioritySchema = z.enum(ORDER_PRIORITY_VALUES);

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
  unitId: unitIdSchema,
  unitPrice: unitPriceSchema,
  priority: prioritySchema.default(DEFAULT_ORDER_PRIORITY),
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
 * Listado (R34-R39). Hereda de `pageQuerySchema` el minimo y la integridad de la paginacion
 * (R36); el defecto de 10 y el tope de 25 los aplica `lib/shared/pagination` en el adaptador.
 *
 * Los dos filtros son OPCIONALES y COMBINABLES (R38), y su conjunto es cerrado (R19). El de
 * estado SI admite `CANCELADO`: los pedidos cancelados se consultan, son los borrados los que
 * no salen nunca (R40). No hay busqueda por texto ni filtro por numero correlativo (R39).
 */
export const listOrdersSchema = pageQuerySchema.extend({
  status: z.enum(ORDER_STATUS_VALUES).optional(),
  priority: prioritySchema.optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type ListOrdersInput = z.infer<typeof listOrdersSchema>;
