// lib/modules/asignaciones/domain/packing-order-view.ts
/**
 * La fila comun de «Por empacar»: numero, receta, cantidad con su unidad, reparto, envases
 * enteros, estado y quien empaca. La usan `listPackingOrders` y `getPackingOrder`, para que las dos consultas nunca puedan
 * mostrar datos distintos de un mismo pedido.
 *
 * Reutiliza `composeOrderRows` para receta, reparto y unidad aunque tambien calcule responsables: esta
 * vista no los necesita, pero una segunda composicion paralela es la que podria divergir el dia que
 * cambie el criterio de nombre de receta, de presentacion o de etiqueta de la unidad.
 */
import { composeOrderRows, type ComposeOrderRowsDeps } from './compose-order-rows';
import type { OrderDistributionLineView } from './order-distribution-view';

import type { AssignedOrderSummary } from '@/lib/modules/pedidos';
import type { RecipeStepView } from '@/lib/modules/recetas';
import { formatOrderNumber, type OrderStatus } from '@/lib/modules/pedidos';
import type { ProductCatalog } from '@/lib/modules/inventario';

export type PackingOrderViewDeps = ComposeOrderRowsDeps & {
  readonly products: ProductCatalog;
};

/** Las piezas que la pantalla de «Por empacar» necesita de cada fila. `packedByName` y `packedById`
 *  viajan vacios (`null`) en `POR_EMPACAR`, porque todavia no hay quien empaca. */
export type PackingOrderRow = {
  readonly id: string;
  readonly numberText: string;
  readonly recipeName: string | null;
  /** Cadena decimal, nunca `number`. */
  readonly quantity: string;
  /** El reparto en orden de alta; vacio = «Sin presentacion». Solo lectura. */
  readonly presentationLines: readonly OrderDistributionLineView[];
  /** La unidad de `quantity`; los dos `null` = pedido sin unidad, la cifra va sola. */
  readonly unitId: string | null;
  readonly unitLabel: string | null;
  /** Cadena decimal, nunca `number` (`docs/architecture.md > Anti-patrones`). `null` si el asiento
   *  de produccion todavia no aparece en la lectura -no deberia ocurrir para un pedido que ya paso
   *  por Finalizar, pero la fila sigue saliendo, mismo criterio que una receta borrada. */
  readonly packages: string | null;
  readonly status: OrderStatus;
  readonly packedByName: string | null;
  readonly packedById: string | null;
};

/** La fila de un unico pedido, con los pasos con que se empaca. */
export type PackingOrderDetail = PackingOrderRow & {
  /** Vacio salvo `EN_EMPAQUE` a nombre del actor. Nunca trae pasos del operador. */
  readonly packingSteps: readonly RecipeStepView[];
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
      quantity: order.quantity,
      presentationLines: rowComposed?.presentationLines ?? [],
      unitId: order.unitId,
      unitLabel: rowComposed?.unitLabel ?? null,
      packages: packagesByOrder.get(order.id) ?? null,
      status: order.status,
      packedByName: order.packedBy === null ? null : packerNames.get(order.packedBy) ?? order.packedBy,
      packedById: order.packedBy,
    };
  });
}
