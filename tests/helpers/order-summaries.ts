// Los dos listados de resumen de `OrderCatalog` cableados como en `lib/composition`: adaptadores
// reales de `pedidos` y catalogo de envases real de `inventario`.
import {
  findPackagingCostingBatches,
  findPackagingRefs,
} from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
import {
  createListAliveSummariesByIds,
  createListAliveSummariesInCompany,
  type OrderCatalog,
} from '@/lib/modules/pedidos';
import {
  listAliveOrderSummariesByIds,
  listAliveOrderSummariesInCompany,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma';

export function realOrderSummaries(): Pick<OrderCatalog, 'listAliveSummariesByIds' | 'listAliveSummariesInCompany'> {
  const deps = {
    summaries: { listAliveByIds: listAliveOrderSummariesByIds, listAliveInCompany: listAliveOrderSummariesInCompany },
    packaging: { findRefs: findPackagingRefs, findCostingBatches: findPackagingCostingBatches },
  };
  return {
    listAliveSummariesByIds: createListAliveSummariesByIds(deps),
    listAliveSummariesInCompany: createListAliveSummariesInCompany(deps),
  };
}
