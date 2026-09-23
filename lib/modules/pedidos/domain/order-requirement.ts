// lib/modules/pedidos/domain/order-requirement.ts
//
// Dominio puro: sin Prisma, sin framework, sin reloj. La cantidad necesaria de cada linea es
// `consumedQuantity(orderQuantity, percentage)`, la misma formula que ya usan el coste y la
// tabla de ingredientes: no hay una segunda multiplicacion propia de este modulo.

import { consumedQuantity } from '@/lib/modules/recetas';
import type { ReservationRequirementLine } from '@/lib/modules/inventario';

/** Linea de receta con lo minimo que hace falta para calcular la necesidad. */
export type RequirementSourceLine = {
  readonly productId: string;
  readonly percentage: string;
};

/** La necesidad de cada linea de receta para `orderQuantity` unidades del pedido, en la unidad
 *  del producto. Una receta sin lineas da una necesidad vacia. */
export function buildRequirement(
  lines: readonly RequirementSourceLine[],
  orderQuantity: string,
): readonly ReservationRequirementLine[] {
  return lines.map((line) => ({
    productId: line.productId,
    quantity: consumedQuantity(orderQuantity, line.percentage),
  }));
}
