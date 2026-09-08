import type { OrderPriority, OrderStatus } from './order-classification';
import type { EditableOrderStatus } from './order-input';
import type { OrderNumber } from './order-number';

/**
 * Contratos de entrada y salida del pedido (`design.md > 7.3`). Viven en `domain/` -no en
 * `ports/`- porque describen el QUE se dice, no el COMO se habla con el mundo, y es lo unico
 * que el contrato publico (`index.ts`) puede reexportar.
 *
 * La cantidad viaja como CADENA decimal en las dos direcciones, nunca `number`
 * (`docs/architecture.md > Anti-patrones`): el adaptador driven la devuelve con `.toFixed(4)`.
 *
 * **QC-35bis (2026-09-07): el pedido ya no tiene unidad ni precio unitario.** Ninguno de los
 * tres tipos de este archivo los declara, asi que no hay forma de escribirlos ni de leerlos: la
 * columna se fue de `orders` y el tipo se fue de aqui a la vez. `unitName` tampoco existe -no
 * habia nada que resolver contra el catalogo de `unidades`-, y con el se cayo la unica razon
 * por la que `pedidos` hablaba con ese modulo.
 */

/**
 * Datos de negocio de un pedido, ya validados por `order-input.ts` y listos para el puerto.
 *
 * `status` es `EditableOrderStatus`, NO `OrderStatus`: este tipo no puede EXPRESAR
 * `'CANCELADO'`, y tampoco lleva `cancellationReason`. Es la primera de las cuatro capas de
 * `design.md > 8`: `updateOrder` no puede ni siquiera formular una cancelacion, y quien lo
 * intente rompe el `typecheck` en vez de descubrirlo en produccion. El unico camino hacia
 * `CANCELADO` es `cancelAlive`, que es el unico metodo del puerto con `reason` (R24, R26).
 *
 * En el ALTA el estado es siempre `PENDIENTE` (R9) y lo pone el caso de uso; el correlativo lo
 * entrega la secuencia de la base (R11) y los dos autores salen de la sesion (R6), asi que
 * ninguno de los tres esta aqui.
 */
export type NewOrder = {
  readonly recipeId: string;
  readonly quantity: string;
  readonly priority: OrderPriority;
  readonly status: EditableOrderStatus;
};

/**
 * La fila tal como la devuelve el puerto: lo que vive en `orders` y nada mas. NO trae el
 * nombre de la receta -eso lo resuelve el caso de uso con el contrato publico de `recetas`, con
 * UNA consulta por pagina (R43, R45)-, y por eso este tipo no es `OrderView`.
 *
 * `deletedAt` NO sale: ninguna consulta devuelve borrados (R40), asi que seria siempre `null`
 * y solo invitaria a filtrar en memoria lo que ya filtro el puerto.
 */
export type OrderRow = {
  readonly id: string;
  readonly number: OrderNumber;
  readonly recipeId: string;
  readonly quantity: string;
  readonly priority: OrderPriority;
  readonly status: OrderStatus;
  readonly cancellationReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
};

/**
 * Salida de la consulta de la ficha (R42). `numberText` lo compone `formatOrderNumber`, que es
 * la UNICA definicion del formato (R14, QC-33 R24); no se persiste ni se vuelve a formatear en
 * ningun otro sitio.
 *
 * `recipeName` es `string | null`: `null` solo si el id no vuelve del catalogo
 * -una receta borrada FISICAMENTE por consola, que las FK `RESTRICT` de QC-33 hacen casi
 * imposible-. La fila SIGUE apareciendo (mismo criterio que QC-25 R18 y QC-43 R37). Una receta
 * dada de BAJA si vuelve, con su nombre (R44).
 *
 * `createdBy`/`updatedBy` son IDENTIFICADORES, no nombres (R46): este modulo no consulta el
 * modelo `User`. Resolverlos es de QC-35.
 *
 * NO hay campo `total`: el total no se persiste (R47) y esta salida tampoco lo calcula. Es la
 * pregunta abierta 3 del spec, con su posicion por defecto escrita: devolverlo obligaria a
 * multiplicar dos decimales de 14 digitos, que no se puede hacer con `number` y hoy no tiene
 * aritmetica aprobada (`design.md > 13`).
 */
export type OrderView = {
  readonly id: string;
  readonly number: OrderNumber;
  readonly numberText: string;
  readonly recipeId: string;
  readonly recipeName: string | null;
  readonly quantity: string;
  readonly priority: OrderPriority;
  readonly status: OrderStatus;
  readonly cancellationReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
};

/**
 * Cada fila del listado lleva LO MISMO que la ficha (`design.md > 7.3`): un pedido es una sola
 * linea y no hay nada pesado que dejar fuera, a diferencia de las `lines` de una receta. Se
 * declara como alias y no como una copia recortada para que las dos salidas no puedan diverger.
 */
export type OrderSummary = OrderView;

