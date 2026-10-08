import type { OrderStatus } from '../domain/order-classification';
import type { AssignedOrderSummary, OrderSummaryFilter, OrderSummaryOrdering } from '../domain/order-catalog';
import type { Page } from '../domain/page';

/** Una linea del reparto tal como sale de la base: con el id del envase, todavia sin su nombre,
 *  que es de `inventario`. `null` = linea guardada antes de que el reparto nombrara envases. */
export type OrderSummaryLineRecord = {
  readonly presentationId: string;
  readonly packages: number;
  readonly packagingProductId: string | null;
};

export type OrderSummaryRecord = Omit<AssignedOrderSummary, 'presentationLines'> & {
  readonly presentationLines: readonly OrderSummaryLineRecord[];
};

/** Los dos listados de resumen que `OrderCatalog` publica, antes de resolver los envases. */
export interface OrderSummaryReader {
  listAliveByIds(
    companyId: string,
    ids: readonly string[],
    statuses: readonly OrderStatus[],
    page: number,
    pageSize?: number,
  ): Promise<Page<OrderSummaryRecord>>;

  listAliveInCompany(
    companyId: string,
    statuses: readonly OrderStatus[],
    ordering: OrderSummaryOrdering,
    page: number,
    pageSize?: number,
    filter?: OrderSummaryFilter,
  ): Promise<Page<OrderSummaryRecord>>;
}
