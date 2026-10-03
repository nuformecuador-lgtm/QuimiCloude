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

/** Un envase del reparto y cuantos lleva: se aparta en envases, uno por envase. */
export type PackagingRequirementLine = {
  readonly productId: string;
  readonly packages: number;
};

/**
 * `before_consumption`: la receta aun no se consumio (PENDIENTE, EN_CURSO, BLOQUEADO), asi que
 * se aparta receta y envases. `materials_consumed`: la receta ya salio del inventario
 * (POR_EMPACAR) y solo quedan los envases.
 */
export type OrderRequirementPhase = 'before_consumption' | 'materials_consumed';

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

/** Los envases de unas lineas del reparto; las antiguas, sin envase, no aportan ninguno. */
export function packagingLinesOf(
  lines: readonly { readonly packagingProductId: string | null; readonly packages: number }[],
): readonly PackagingRequirementLine[] {
  return lines.flatMap((line) =>
    line.packagingProductId === null ? [] : [{ productId: line.packagingProductId, packages: line.packages }],
  );
}

export type OrderRequirementInput = {
  readonly recipeLines: readonly RequirementSourceLine[];
  readonly quantity: string;
  readonly packagingLines: readonly PackagingRequirementLine[];
  readonly phase: OrderRequirementPhase;
};

/**
 * La necesidad completa del pedido: la unica que se pasa a `syncForOrder`, que libera lo apartado
 * de cualquier producto que no venga aqui. Un mismo producto en dos lineas sale una vez, con la
 * suma.
 */
export function buildOrderRequirement(input: OrderRequirementInput): readonly ReservationRequirementLine[] {
  const recipe = input.phase === 'before_consumption' ? buildRequirement(input.recipeLines, input.quantity) : [];
  const packaging = input.packagingLines.map((line) => ({
    productId: line.productId,
    quantity: String(line.packages),
  }));

  const byProduct = new Map<string, string>();
  for (const line of [...recipe, ...packaging]) {
    const previous = byProduct.get(line.productId);
    byProduct.set(line.productId, previous === undefined ? line.quantity : addExact(previous, line.quantity));
  }
  return [...byProduct].map(([productId, quantity]) => ({ productId, quantity }));
}

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

/** Suma exacta sin recortar decimales: `consumedQuantity` puede dar mas de cuatro. */
function addExact(a: string, b: string): string {
  if (!DECIMAL_PATTERN.test(a) || !DECIMAL_PATTERN.test(b)) {
    throw new Error(`order-requirement: no es un decimal valido: ${JSON.stringify([a, b])}`);
  }
  const [aInt = '0', aFrac = ''] = a.split('.');
  const [bInt = '0', bFrac = ''] = b.split('.');
  const scale = Math.max(aFrac.length, bFrac.length);
  const sum = BigInt(aInt + aFrac.padEnd(scale, '0')) + BigInt(bInt + bFrac.padEnd(scale, '0'));
  if (scale === 0) return sum.toString();
  const digits = sum.toString().padStart(scale + 1, '0');
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}
