import { calculateIngredientsCost, type RecipeCostLine } from './order-cost';

import type { ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog, UnitConversion } from '@/lib/modules/unidades';

/**
 * Coste de los ingredientes de una receta para una cantidad de pedido dada. Una sola llamada a
 * cada catalogo salvo `products`, que hace dos: los lotes con existencia (`findCostingBatches`)
 * y la unidad de cada insumo (`findRefs`), ninguna crece con el numero de lineas de la receta.
 * La receta ya NO guarda unidad por linea (R14): la unidad de cada ingrediente es la que
 * `inventario` resuelve para ese producto en este momento, y llega `null` para uno sin lotes.
 */
export async function resolveIngredientsCost(
  recipes: RecipeCatalog,
  products: ProductCatalog,
  units: UnitCatalog,
  recipeId: string,
  orderQuantity: string,
  companyId: string,
): Promise<string | null> {
  const content = await recipes.findExecutionContentById(recipeId, companyId);
  const lines = content?.lines ?? [];

  const productIds = [...new Set(lines.map((line) => line.productId))];
  const [batches, productRefs] = await Promise.all([
    products.findCostingBatches(productIds, companyId),
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
