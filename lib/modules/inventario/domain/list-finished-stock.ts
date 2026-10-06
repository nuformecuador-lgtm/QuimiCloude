import { requirePermission, type Actor } from './actor';
import { addQuantities, compareQuantities } from './decimal-quantity';
import { ValidationError } from './errors';
import { FINISHED_STOCK_QUERYABLE } from './finished-stock-queryable';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { summarizePackagedStock, type PackagedStockEntry } from './packaged-stock';

import type {
  FinishedStockBatch,
  FinishedStockGroup,
  FinishedStockProductLine,
  FinishedStockRow,
} from './finished-stock';
import type { Page } from './page';
import type { ProductView } from './product-view';

import type { FinishedOrderRepository } from '../ports/finished-order-repository';
import type { ListQueryLog } from '../ports/list-query-log';
import type { OrderNumberFormatter } from '../ports/order-number-formatter';

export type ListFinishedStockDeps = {
  readonly finishedOrders: FinishedOrderRepository;
  readonly orderNumbers: OrderNumberFormatter;
  readonly log: ListQueryLog;
};

const LIST_NAME = 'finished-stock';

const ZERO = '0.0000';

const listQuerySchema = createListQuerySchema();

function sumStock(batches: readonly FinishedStockBatch[]): string {
  return batches.reduce((total, batch) => addQuantities(total, batch.stock), ZERO);
}

/** Sin existencia no hay envases que contar: lista vacia, no `null`. */
function packagedOf(batches: readonly FinishedStockBatch[]): readonly PackagedStockEntry[] | null {
  if (compareQuantities(sumStock(batches), ZERO) === 0) return [];
  return summarizePackagedStock(batches) ?? null;
}

function productLine(product: ProductView, batches: readonly FinishedStockBatch[]): FinishedStockProductLine {
  const own = batches.filter((batch) => batch.productId === product.id);
  return { product, stock: sumStock(own), packagedStock: packagedOf(own) };
}

function compareProducts(a: ProductView, b: ProductView): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function toRow(group: FinishedStockGroup, orderNumbers: OrderNumberFormatter): FinishedStockRow {
  if (group.kind === 'withoutOrder') {
    return {
      kind: 'withoutOrder',
      key: `product:${group.product.id}`,
      productId: group.product.id,
      stock: sumStock(group.batches),
      unitId: group.product.unitId,
      products: [{ product: group.product, stock: sumStock(group.batches), packagedStock: null }],
    };
  }

  return {
    kind: 'order',
    key: `order:${group.orderId}`,
    orderId: group.orderId,
    orderNumber: group.orderNumber,
    numberText: orderNumbers.format(group.orderNumber),
    recipeName: group.recipeName,
    packagedStock: packagedOf(group.batches),
    products: [...group.products].sort(compareProducts).map((product) => productLine(product, group.batches)),
  };
}

/**
 * La pestana de producto terminado: una fila por pedido con su existencia en envases por
 * presentacion, y debajo sus productos terminados. Mismo permiso y mismo contrato de consulta que
 * el listado de productos; el orden y la busqueda los resuelve el repositorio sobre el conjunto
 * completo.
 */
export function createListFinishedStock(
  deps: ListFinishedStockDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<Page<FinishedStockRow>> {
  return async function listFinishedStock(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<FinishedStockRow>> {
    requirePermission(actor, 'inventario.consultar');

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { query, ignored } = sanitizeListQuery(parsed.data, FINISHED_STOCK_QUERYABLE);
    deps.log.ignoredFields(LIST_NAME, ignored);

    const page = await deps.finishedOrders.listStockGroups(query, { companyId: actor.companyId });
    return { ...page, items: page.items.map((group) => toRow(group, deps.orderNumbers)) };
  };
}
