// lib/modules/asignaciones/domain/packing-order-view.ts
/**
 * La fila comun de «Por empacar»: numero, receta, presentacion, envases enteros, estado y quien
 * empaca. La usan `listPackingOrders` y `getPackingOrder`, para que las dos consultas nunca puedan
 * mostrar datos distintos de un mismo pedido.
 *
 * Reutiliza `composeOrderRows` para receta y presentacion aunque tambien calcule responsables: esta
 * vista no los necesita, pero una segunda composicion paralela es la que podria divergir el dia que
 * cambie el criterio de nombre de receta o presentacion.
 */
import { composeOrderRows, type ComposeOrderRowsDeps } from './compose-order-rows';

import type { AssignedOrderSummary } from '@/lib/modules/pedidos';
import { formatOrderNumber, type OrderStatus } from '@/lib/modules/pedidos';
import type { ProductCatalog } from '@/lib/modules/inventario';

export type PackingOrderViewDeps = ComposeOrderRowsDeps & {
  readonly products: ProductCatalog;
};

/** Las seis piezas que la pantalla de «Por empacar» necesita de cada fila. `packedByName` viaja
 *  vacio (`null`) en `POR_EMPACAR`, porque todavia no hay quien empaca. */
export type PackingOrderRow = {
  readonly id: string;
  readonly numberText: string;
  readonly recipeName: string | null;
  readonly presentationName: string | null;
  /** Cadena decimal, nunca `number` (`docs/architecture.md > Anti-patrones`). `null` si el asiento
   *  de produccion todavia no aparece en la lectura -no deberia ocurrir para un pedido que ya paso
   *  por Finalizar, pero la fila sigue saliendo, mismo criterio que una receta borrada. */
  readonly packages: string | null;
  readonly status: OrderStatus;
  readonly packedByName: string | null;
};

export async function composePackingOrderRows(
  deps: PackingOrderViewDeps,
  companyId: string,
  orders: readonly AssignedOrderSummary[],
): Promise<readonly PackingOrderRow[]> {
  const composed = await composeOrderRows(deps, companyId, orders);

  const orderIds = orders.map((order) => order.id);
  const receipts =
    orderIds.length === 0 ? [] : await deps.products.findFinishedGoodsReceipts(orderIds, companyId);
  const packagesByOrder = new Map(receipts.map((receipt) => [receipt.orderId, receipt.packages]));

  const packerIds = [
    ...new Set(orders.map((order) => order.packedBy).filter((id): id is string => id !== null)),
  ];
  const packerRefs =
    packerIds.length === 0
      ? []
      : await deps.people.findRefsIncludingDeletedInCompany(companyId, packerIds, deps.now?.() ?? new Date());
  const packerNames = new Map(packerRefs.map((ref) => [ref.id, ref.displayName] as const));

  return orders.map((order) => {
    const rowComposed = composed.get(order.id);
    return {
      id: order.id,
      numberText: formatOrderNumber(order.number),
      recipeName: rowComposed?.recipeName ?? null,
      presentationName: rowComposed?.presentationName ?? null,
      packages: packagesByOrder.get(order.id) ?? null,
      status: order.status,
      packedByName: order.packedBy === null ? null : packerNames.get(order.packedBy) ?? order.packedBy,
    };
  });
}
