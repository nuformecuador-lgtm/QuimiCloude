// lib/modules/pedidos/domain/order-catalog.ts
/**
 * QC-87 T2 (`design.md > 2.1`, R45). Servicio que `pedidos` ofrece a los demas modulos para
 * que puedan saber el ESTADO de un pedido sin tocar `prisma.order` ni importar nada de
 * `pedidos` por ruta profunda (`docs/architecture.md > Dominio` n.o 2: «se comparten
 * servicios via interfaz, nunca repositorios ni tablas»). Mismo patron que `RecipeCatalog`
 * de QC-33/QC-34, que es como `pedidos` aprendio a saber de una receta.
 *
 * NO se reutiliza `OrderRepository`: ese es el puerto INTERNO de `pedidos` -devuelve la fila
 * entera, sabe de paginacion y de altas- y sacarlo del modulo seria exactamente el
 * «repositorio compartido entre modulos» que la arquitectura prohibe.
 *
 * `pedidos` NO gana ningun caso de uso con esto: un tipo, una interfaz, un adaptador driven y
 * dos lineas de barril. Los seis casos de uso de QC-34 y `order-transitions.ts` quedan
 * intactos.
 */
import type { OrderPriority, OrderStatus } from './order-classification';
import type { OrderNumber } from './order-number';
import type { Page } from './page';

/** Lo que otro modulo puede saber de un pedido: su identidad y su ESTADO, y nada mas. Ni el
 *  numero, ni la receta, ni las cantidades (mismo criterio que `MemberCandidate` de QC-84):
 *  lo que no esta en el tipo no se puede filtrar por descuido.
 *
 *  `status` es el `OrderStatus` de QC-34, IMPORTADO y no copiado: una segunda lista de
 *  estados se desincronizaria en silencio de la tabla de transiciones. */
export type OrderAssignmentTarget = {
  readonly id: string;
  readonly status: OrderStatus;
};

/** El orden de un resumen paginado. `work_queue` es el de la lista de trabajo (prioridad,
 *  antiguedad, numero); `finished_recent_first` es el de «Terminados» (R20). */
export type OrderSummaryOrdering = 'work_queue' | 'finished_recent_first';

export interface OrderCatalog {
  /**
   * `null` = no existe, esta dado de baja, o NO ES DE ESA EMPRESA: para quien pregunta son el
   * mismo caso. Un pedido CANCELADO si vuelve -tiene estado propio precisamente para no
   * desaparecer-, y quien lo consulta decide que hacer con el.
   *
   * Esta consulta SI se filtra por empresa, como las de `OrderRepository`. La empresa llega como
   * `string` y no como `OrderScope` para no obligar a otros modulos a construir un tipo interno de
   * `pedidos`; el adaptador la convierte. Sin este filtro, asignar un pedido ajeno moriria contra
   * la FK compuesta de `order_assignments` con un `23503` sin traducir.
   */
  findAliveById(id: string, companyId: string): Promise<OrderAssignmentTarget | null>;

  /**
   * Devuelve la `Page` ya armada porque `lib/shared/pagination` no puede importarse desde
   * `domain/`: quien pagina es el adaptador. Con `ids` vacio no se llama, el caso de uso corta
   * antes.
   */
  listAliveSummariesByIds(
    companyId: string,
    ids: readonly string[],
    statuses: readonly OrderStatus[],
    page: number,
    pageSize?: number,
  ): Promise<Page<AssignedOrderSummary>>;

  /**
   * Como `listAliveSummariesByIds`, pero sin filtro de ids: toda la empresa. `asignaciones` la
   * usa para «Terminados» y «Todos», que no acotan por quien esta asignado. El `ordering`
   * decide el `ORDER BY`: `work_queue` es el mismo que `listAliveSummariesByIds`, extraido a
   * una constante compartida para que no diverjan; `finished_recent_first` ordena por fecha de
   * terminado, con los nulos al final y, entre ellos, por numero de pedido descendente (R20).
   */
  listAliveSummariesInCompany(
    companyId: string,
    statuses: readonly OrderStatus[],
    ordering: OrderSummaryOrdering,
    page: number,
    pageSize?: number,
  ): Promise<Page<AssignedOrderSummary>>;

  /**
   * Mueve el estado de un pedido vivo de esa empresa, SOLO si `assertTransition(from, to)` lo
   * permite: la comprobacion la hace `pedidos` con su propia matriz, dentro del metodo.
   *
   * `from` viaja para que el `UPDATE` filtre tambien por el, ademas de por `id`, `companyId`
   * y `deletedAt: null`: dos lecturas simultaneas no pueden escribir dos veces sobre la misma
   * transicion. `'not_found'` es el mismo caso que en `findAliveById` -no existe, esta de
   * baja o es de otra empresa-; `'stale'` es un caso nuevo: el pedido sigue vivo y es de esa
   * empresa, pero su estado ya no es `from` porque alguien lo movio entre la lectura y esta
   * llamada.
   */
  transitionAliveById(
    id: string,
    companyId: string,
    from: OrderStatus,
    to: OrderStatus,
    actorId: string,
    now: Date,
  ): Promise<'ok' | 'not_found' | 'stale'>;
}

/**
 * Sin autoria, sin motivo de cancelacion y sin marcas de tiempo: lo que no esta en el tipo no se
 * filtra por descuido. `quantity` es cadena decimal, nunca `number`
 * (`docs/architecture.md > Anti-patrones`).
 */
export type AssignedOrderSummary = {
  readonly id: string;
  readonly number: OrderNumber;
  readonly recipeId: string;
  readonly quantity: string;
  readonly priority: OrderPriority;
  readonly status: OrderStatus;
  /** `null` = sin presentacion: el contrato que `asignaciones` usa para pintarla. */
  readonly presentationId: string | null;
  /** `null` = sin fecha de terminado: un pedido entregado antes de que la columna existiera, o
   *  uno que no esta ENTREGADO. */
  readonly finishedAt: Date | null;
};
