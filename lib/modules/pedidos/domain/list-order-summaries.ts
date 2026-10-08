import { findPackagingNames } from './get-order';
import type { AssignedOrderSummary, OrderCatalog } from './order-catalog';
import { orderNumberContains } from './order-number';
import type { Page } from './page';

import type { PackagingCatalog } from '@/lib/modules/inventario';

import type { OrderSummaryReader, OrderSummaryRecord } from '../ports/order-summary-reader';

export type ListOrderSummariesDeps = {
  readonly summaries: OrderSummaryReader;
  /** Contrato PUBLICO de `inventario`: resuelve los nombres de los envases del reparto. */
  readonly packaging: PackagingCatalog;
};

/** Una sola llamada al catalogo de envases por pagina; un envase que no vuelve queda en `null`. */
async function withPackagingNames(
  packaging: PackagingCatalog,
  companyId: string,
  page: Page<OrderSummaryRecord>,
): Promise<Page<AssignedOrderSummary>> {
  const packagingIds = [
    ...new Set(
      page.items.flatMap((item) =>
        item.presentationLines.flatMap((line) => (line.packagingProductId === null ? [] : [line.packagingProductId])),
      ),
    ),
  ];
  const names = await findPackagingNames(packaging, packagingIds, companyId);
  return {
    ...page,
    items: page.items.map((item) => ({
      ...item,
      presentationLines: item.presentationLines.map((line) => ({
        presentationId: line.presentationId,
        packages: line.packages,
        packagingName: line.packagingProductId === null ? null : (names.get(line.packagingProductId) ?? null),
      })),
    })),
  };
}

export function createListAliveSummariesByIds(deps: ListOrderSummariesDeps): OrderCatalog['listAliveSummariesByIds'] {
  return async (companyId, ids, statuses, page, pageSize) =>
    withPackagingNames(
      deps.packaging,
      companyId,
      await deps.summaries.listAliveByIds(companyId, ids, statuses, page, pageSize),
    );
}

export type ListHistorySummariesDeps = {
  readonly summaries: OrderSummaryReader;
};

/** El filtro por numero se decide aqui y no en SQL, para que lo resuelva la misma
 *  `formatOrderNumber` que pinta el numero. Si no casa ninguno, el adaptador recibe la lista vacia
 *  y devuelve la pagina vacia ya armada. */
export function createListSummariesByIdsIncludingDeleted(
  deps: ListHistorySummariesDeps,
): OrderCatalog['listSummariesByIdsIncludingDeleted'] {
  return async (companyId, ids, statuses, page, pageSize, filter) => {
    const needle = filter?.numberContains;
    if (needle === undefined) {
      return deps.summaries.listHistoryByIdsIncludingDeleted(companyId, ids, statuses, page, pageSize);
    }
    const numbers = await deps.summaries.listNumbersByIdsIncludingDeleted(companyId, ids, statuses);
    const matching = numbers.filter((row) => orderNumberContains(row.number, needle)).map((row) => row.id);
    return deps.summaries.listHistoryByIdsIncludingDeleted(companyId, matching, statuses, page, pageSize);
  };
}

export function createListAliveSummariesInCompany(
  deps: ListOrderSummariesDeps,
): OrderCatalog['listAliveSummariesInCompany'] {
  return async (companyId, statuses, ordering, page, pageSize, filter) =>
    withPackagingNames(
      deps.packaging,
      companyId,
      await deps.summaries.listAliveInCompany(companyId, statuses, ordering, page, pageSize, filter),
    );
}
