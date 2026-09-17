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
   * QC-88 (R11, R15) — los datos de un conjunto de pedidos por sus ids, acotados a los
   * estados pedidos y paginados. Bloque nuevo AL FINAL de la interfaz: `findAliveById` de
   * arriba no se toca.
   *
   * `companyId` es el PRIMER parametro, como `findAliveById(id, companyId)` ya lo tiene y
   * como `listOrderIdsByUserInCompany` de `asignaciones`: una llamada que lo olvide no
   * compila (sincronizacion del 2026-09-16, QC-60 ya le dio `company_id` a `orders`).
   *
   * Devuelve `Page<AssignedOrderSummary>` YA ARMADA: `toOffsetLimit`/`buildPage` viven en
   * `lib/shared/pagination`, que `domain/` no puede importar, asi que quien pagina es el
   * adaptador (mismo reparto que `OrderRepository.listAlive`).
   *
   * `ids` vacio no llega aqui: el caso de uso que la invoca corta antes, sin tocar ningun
   * puerto.
   */
  listAliveSummariesByIds(
    companyId: string,
    ids: readonly string[],
    statuses: readonly OrderStatus[],
    page: number,
    pageSize?: number,
  ): Promise<Page<AssignedOrderSummary>>;
}

/**
 * Lo que otro modulo puede saber de un pedido para LISTARLO (R11, R15 de QC-88). Sigue sin
 * traer autoria, motivo de cancelacion ni marcas de tiempo (mismo criterio que
 * `OrderAssignmentTarget`): lo que no esta en el tipo no se filtra por descuido.
 *
 * `number` es el par `(year, sequence)`; el texto visible lo compone `formatOrderNumber`, la
 * UNICA definicion (R16 de QC-88). `quantity` es CADENA decimal, nunca `number`
 * (`docs/architecture.md > Anti-patrones`).
 */
export type AssignedOrderSummary = {
  readonly id: string;
  readonly number: OrderNumber;
  readonly recipeId: string;
  readonly quantity: string;
  readonly priority: OrderPriority;
  readonly status: OrderStatus;
};
