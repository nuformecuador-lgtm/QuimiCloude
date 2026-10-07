import { sameDecimal } from './order-distribution';
import type { OrderEdit, OrderPresentationLineRow, OrderRow } from './order-view';
import type { DistributionLineInput } from './resolve-distribution';

/** Lo que una edicion general trae y se compara con la fila guardada. `recipeId` llega ya
 *  resuelto a la receta efectiva (la version si se eligio una). */
export type ComparableEdit = Pick<OrderEdit, 'recipeId' | 'quantity' | 'priority' | 'unitId'> & {
  readonly presentationLines: readonly DistributionLineInput[];
};

function sameLine(edit: DistributionLineInput, saved: OrderPresentationLineRow): boolean {
  if (edit.packages !== saved.packages) return false;
  if ('packagingProductId' in edit) return saved.packagingProductId === edit.packagingProductId;
  return saved.packagingProductId === null && saved.presentationId === edit.presentationId;
}

/** El orden no cuenta: cada linea entrante tiene que casar con una guardada distinta. */
function sameDistribution(
  edit: readonly DistributionLineInput[],
  saved: readonly OrderPresentationLineRow[],
): boolean {
  if (edit.length !== saved.length) return false;
  const pending = [...saved];
  for (const line of edit) {
    const index = pending.findIndex((candidate) => sameLine(line, candidate));
    if (index === -1) return false;
    pending.splice(index, 1);
  }
  return true;
}

/**
 * `true` si receta, cantidad, prioridad, unidad y reparto de la edicion son iguales a los de la
 * fila. No mira el cliente. Un pedido guardado sin unidad nunca es igual: la edicion siempre
 * trae una, y es el camino completo el que se la asigna.
 */
export function isCustomerOnlyEdit(row: OrderRow, edit: ComparableEdit): boolean {
  return (
    edit.recipeId === row.recipeId &&
    sameDecimal(edit.quantity, row.quantity) &&
    edit.priority === row.priority &&
    row.unitId !== null &&
    edit.unitId === row.unitId &&
    sameDistribution(edit.presentationLines, row.presentationLines)
  );
}
