import { PRODUCT_TYPES, type ProductRef } from '@/lib/modules/inventario';

/**
 * Regla del % por tipo de producto: solo PRODUCT lo exige. Una linea con `percentage`
 * NULL de un producto PRODUCT se rechaza; en MACHINE y PACKAGING el NULL es valido.
 * Sin ref no hay veredicto -el producto borrado o ajeno lo resuelve la regla de
 * existencia de cada caso de uso, no esta-.
 */
export function hasNullPercentageOnProduct(
  lines: readonly { readonly productId: string; readonly percentage: string | null }[],
  refs: readonly ProductRef[],
): boolean {
  const typeById = new Map(refs.map((ref) => [ref.id, ref.type]));
  return lines.some(
    (line) => line.percentage === null && typeById.get(line.productId) === PRODUCT_TYPES.PRODUCT,
  );
}
