import type { OrderStatus } from '../domain/order-classification';
import type { AssignedOrderSummary, OrderHistorySummary, OrderSummaryOrdering } from '../domain/order-catalog';
import type { OrderNumber } from '../domain/order-number';
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

/** Las lecturas de resumen sobre las que se arman los listados de `OrderCatalog`. */
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
    filter?: { readonly packedBy?: string },
  ): Promise<Page<OrderSummaryRecord>>;

  /** Sin paginar ni ordenar: solo para decidir en el dominio que numeros casan con el filtro. */
  listNumbersByIdsIncludingDeleted(
    companyId: string,
    ids: readonly string[],
    statuses: readonly OrderStatus[],
  ): Promise<readonly { readonly id: string; readonly number: OrderNumber }[]>;

  listHistoryByIdsIncludingDeleted(
    companyId: string,
    ids: readonly string[],
    statuses: readonly OrderStatus[],
    page: number,
    pageSize?: number,
  ): Promise<Page<OrderHistorySummary>>;
}
