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
 * Desde 2026-09-07 el precio unitario y la unidad salieron del pedido; el precio sigue fuera.
 * Devuelve la UNIDAD (`unitId`), porque la cantidad se interpreta siempre en ella,
 * con o sin reparto, y el reparto en si mismo -`presentationLines`- sustituye a la presentacion
 * unica.
 *
 * `OrderRow` y `OrderView` SI llevan `ingredientsCost`: el pedido guarda el coste de sus propios
 * ingredientes, opcional, calculado al escribirlo. No es un precio de venta.
 */

/**
 * Una linea del reparto ya resuelta y lista para el puerto de escritura: la presentacion, los
 * envases enteros y el contenido que se le copia en este instante (`null` = la
 * presentacion no lo tiene).
 */
export type OrderPresentationLineWrite = {
  readonly presentationId: string;
  readonly packages: number;
  readonly content: string | null;
};

/** Una linea del reparto tal como la lee el puerto: sin el contenido copiado, que solo
 *  necesita Terminar y lo lee por su propio camino. */
export type OrderPresentationLineRow = {
  readonly presentationId: string;
  readonly packages: number;
};

/** Una linea del reparto en la ficha y el listado. */
export type OrderPresentationLineView = {
  readonly presentationId: string;
  /** `null` solo si la presentacion no vuelve del catalogo. */
  readonly presentationName: string | null;
  readonly packages: number;
};

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
  /** Obligatoria: toda escritura de `NewOrder` la lleva. */
  readonly unitId: string;
  /** El reparto, ya resuelto y validado contra el total (puede ser `[]`). */
  readonly presentationLines: readonly OrderPresentationLineWrite[];
};

/**
 * Datos de negocio de una EDICION: lo mismo que `NewOrder` sin `status`. La edicion ya no
 * puede ni EXPRESAR un cambio de estado -ni siquiera `PENDIENTE` a `PENDIENTE`-, asi que quien
 * decide si el pedido sigue siendo editable es `assertTransition(row.status, row.status)` en
 * `update-order.ts`, contra el estado ya leido de la fila.
 */
export type OrderEdit = Omit<NewOrder, 'status'>;

/**
 * La fila tal como la devuelve el puerto: lo que vive en `orders` y nada mas. NO trae el
 * nombre de la receta -eso lo resuelve el caso de uso con el contrato publico de `recetas`, con
 * UNA consulta por pagina (R43, R45)-, y por eso este tipo no es `OrderView`.
 *
 * `deletedAt` NO sale: ninguna consulta devuelve borrados (R40), asi que seria siempre `null`
 * y solo invitaria a filtrar en memoria lo que ya filtro el puerto.
 *
 * `ingredientsCost` es el coste de los ingredientes de la receta con los lotes del momento en
 * que se escribio el pedido, o `null` si no se pudo calcular. No es un precio de venta.
 */
export type OrderRow = {
  readonly id: string;
  readonly number: OrderNumber;
  readonly recipeId: string;
  readonly quantity: string;
  readonly priority: OrderPriority;
  readonly status: OrderStatus;
  readonly cancellationReason: string | null;
  readonly ingredientsCost: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  /** El reparto en orden de alta (`created_at`, desempate `id`); `[]` = sin reparto. */
  readonly presentationLines: readonly OrderPresentationLineRow[];
  /** La unidad en que se expresa `quantity`.
   *  `null` solo en los pedidos anteriores sin presentacion. */
  readonly unitId: string | null;
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
 * `ingredientsCost` **no es un precio de venta**: es el coste de los ingredientes de la receta,
 * calculado con los lotes que habia en el momento de ESCRIBIR el pedido (alta o edicion), nunca
 * al leerlo. Puede ser `null` cuando no se pudo calcular; `null` y `0` no significan lo mismo, y
 * esta salida no tiene ningun otro campo de precio ni de moneda.
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
  readonly ingredientsCost: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  /** El reparto en orden de alta; `[]` = sin reparto. Cada linea lleva lo que
   *  `presentationLinesSchema` acepta, asi que la edicion lo precarga tal cual. */
  readonly presentationLines: readonly OrderPresentationLineView[];
  /** La unidad en que se expresa `quantity`; `null` en los pedidos que no la
   *  tienen todavia. */
  readonly unitId: string | null;
  /** El simbolo de la unidad, o su nombre si no tiene simbolo; `null` cuando `unitId`
   *  es `null`, nunca cuando el id no vuelve del catalogo -la FK con `RESTRICT` hace ese caso
   *  imposible por construccion-. */
  readonly unitLabel: string | null;
};

/**
 * Cada fila del listado lleva LO MISMO que la ficha (`design.md > 7.3`): un pedido es una sola
 * linea y no hay nada pesado que dejar fuera, a diferencia de las `lines` de una receta. Se
 * declara como alias y no como una copia recortada para que las dos salidas no puedan diverger.
 */
export type OrderSummary = OrderView;

