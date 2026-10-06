// lib/modules/pedidos/domain/order-requirement.ts
//
// Dominio puro: sin Prisma, sin framework, sin reloj. La cantidad necesaria de cada linea sale de
// `resolveLineNeed`, la misma que usan el coste y la tabla de ingredientes: no hay una segunda
// multiplicacion ni una segunda conversion propias de este modulo.

import type { ReservationRequirementLine } from '@/lib/modules/inventario';
import type { UnitConversion } from '@/lib/modules/unidades';

import { resolveLineNeed, type LineNeedUnits } from './order-line-need';

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

/** Las unidades con las que se convierte la necesidad. Un producto que no esta en
 *  `productUnits` se trata como un insumo sin unidad. */
export type RequirementUnits = LineNeedUnits & {
  readonly productUnits: ReadonlyMap<string, UnitConversion | null>;
};

/** `not_convertible` lleva los productos cuya linea no se pudo llevar a su unidad, sin repetir. */
export type RecipeRequirement =
  | { readonly kind: 'ok'; readonly lines: readonly ReservationRequirementLine[] }
  | { readonly kind: 'not_convertible'; readonly productIds: readonly string[] };

/** La necesidad de cada linea de receta para `orderQuantity` del pedido, en la unidad del
 *  producto. Una receta sin lineas da una necesidad vacia. */
export function buildRequirement(
  lines: readonly RequirementSourceLine[],
  orderQuantity: string,
  units: RequirementUnits,
): RecipeRequirement {
  const converted: ReservationRequirementLine[] = [];
  const notConvertible = new Set<string>();
  for (const line of lines) {
    const need = resolveLineNeed(orderQuantity, line.percentage, units.productUnits.get(line.productId) ?? null, units);
    if (need.kind === 'not_convertible') {
      notConvertible.add(line.productId);
    } else {
      converted.push({ productId: line.productId, quantity: need.quantity });
    }
  }
  return notConvertible.size > 0
    ? { kind: 'not_convertible', productIds: [...notConvertible] }
    : { kind: 'ok', lines: converted };
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
  readonly units: RequirementUnits;
};

/**
 * La necesidad completa del pedido: la unica que se pasa a `syncForOrder`, que libera lo apartado
 * de cualquier producto que no venga aqui. Un mismo producto en dos lineas sale una vez, con la
 * suma, que se hace ya en la unidad del producto.
 */
export function buildOrderRequirement(input: OrderRequirementInput): RecipeRequirement {
  const recipeRequirement: RecipeRequirement =
    input.phase === 'before_consumption'
      ? buildRequirement(input.recipeLines, input.quantity, input.units)
      : { kind: 'ok', lines: [] };
  if (recipeRequirement.kind === 'not_convertible') return recipeRequirement;
  const recipe = recipeRequirement.lines;
  const packaging = input.packagingLines.map((line) => ({
    productId: line.productId,
    quantity: String(line.packages),
  }));

  const byProduct = new Map<string, string>();
  for (const line of [...recipe, ...packaging]) {
    const previous = byProduct.get(line.productId);
    byProduct.set(line.productId, previous === undefined ? line.quantity : addExact(previous, line.quantity));
  }
  return { kind: 'ok', lines: [...byProduct].map(([productId, quantity]) => ({ productId, quantity })) };
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
