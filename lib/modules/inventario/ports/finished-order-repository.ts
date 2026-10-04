import type { FinishedStockGroup } from '../domain/finished-stock';
import type { InventoryScope } from '../domain/inventory-scope';
import type { ListQuery } from '../domain/list-query';
import type { Page } from '../domain/page';
import type { ProductBatchView } from '../domain/product-batch-view';

/**
 * Lecturas del producto terminado agrupado por el pedido que lo produjo. Puerto aparte de
 * `ProductRepository` para que sus dobles no tengan que conocer estas lecturas.
 */
export interface FinishedOrderRepository {
  /**
   * Los lotes que entraron por el asiento `production` del pedido, con `presentationName`. Un
   * pedido inexistente, de otra empresa o sin lotes devuelve un array vacio; los lotes de un
   * producto dado de baja no salen, igual que en `findBatchesOfAliveProduct`.
   *
   * Con `productId`, solo los de ese producto. Con `orderId` `null`, los lotes de `productId`
   * que no entraron por ningun pedido.
   */
  findBatchesOfOrder(
    orderId: string | null,
    scope: InventoryScope,
    productId?: string | null,
  ): Promise<readonly ProductBatchView[]>;

  /**
   * Una pagina de filas de la pestana de producto terminado: una por pedido con existencia viva
   * y, al final, una por producto con lotes sin pedido y existencia viva. Orden por
   * `(ano, correlativo)` descendente; las filas sin pedido, por nombre de producto. La busqueda
   * de `query.search` va contra el numero visible del pedido y el nombre de la receta (o del
   * producto, en las filas sin pedido).
   */
  listStockGroups(query: ListQuery, scope: InventoryScope): Promise<Page<FinishedStockGroup>>;
}
