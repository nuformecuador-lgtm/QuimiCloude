import { calculateIngredientsCost, type RecipeCostLine } from './order-cost';

import type { ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog, UnitConversion } from '@/lib/modules/unidades';

/**
 * Coste de los ingredientes de una receta para una cantidad de pedido dada. Una sola llamada a
 * cada catalogo salvo `products`, que hace dos: los lotes con disponible (`findCostingBatches`)
 * y la unidad de cada insumo (`findRefs`), ninguna crece con el numero de lineas de la receta.
 * La receta ya NO guarda unidad por linea: la unidad de cada ingrediente es la que
 * `inventario` resuelve para ese producto en este momento, y llega `null` para uno sin lotes.
 *
 * `options.orderId`, cuando el pedido ya existe -la edicion y su cotizacion-, hace que lo que
 * ESE pedido tiene apartado cuente como disponible para si mismo: sin el, un pedido que se
 * edita sin cambiar nada podria ver salir de su promedio el lote que el mismo aparto entero.
 */
export async function resolveIngredientsCost(
  recipes: RecipeCatalog,
  products: ProductCatalog,
  units: UnitCatalog,
  recipeId: string,
  orderQuantity: string,
  companyId: string,
  options?: { readonly orderId?: string },
): Promise<string | null> {
  const content = await recipes.findExecutionContentById(recipeId, companyId);
  const lines = content?.lines ?? [];

  const productIds = [...new Set(lines.map((line) => line.productId))];
  const [batches, productRefs] = await Promise.all([
    products.findCostingBatches(productIds, companyId, { excludeOrderId: options?.orderId }),
    products.findRefs(productIds, companyId),
  ]);
  const productUnitIds = new Map(productRefs.map((ref) => [ref.id, ref.unitId]));

  const costLines: readonly RecipeCostLine[] = lines.map((line) => ({
    productId: line.productId,
    percentage: line.percentage,
    unitId: productUnitIds.get(line.productId) ?? null,
  }));

  const unitIds = new Set<string>();
  for (const line of costLines) {
    if (line.unitId !== null) unitIds.add(line.unitId);
  }
  for (const batch of batches) unitIds.add(batch.unitId);
  const unitRefs = await units.findRefs([...unitIds], companyId);
  const unitConversions = new Map<string, UnitConversion>(unitRefs.map((ref) => [ref.id, ref]));

  return calculateIngredientsCost({ orderQuantity, lines: costLines, batches, units: unitConversions });
}
