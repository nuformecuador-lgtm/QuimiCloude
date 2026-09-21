import { calculateIngredientsCost } from './order-cost';

import type { ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog, UnitConversion } from '@/lib/modules/unidades';

/**
 * Coste de los ingredientes de una receta para una cantidad de pedido dada. Una sola llamada a
 * cada catalogo: los `productId` de las lineas deduplicados para los lotes, y las unidades de
 * las lineas mas las de los lotes leidos, deduplicadas, para las conversiones.
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
  const batches = await products.findCostingBatches(productIds, companyId);

  const unitIds = new Set<string>();
  for (const line of lines) unitIds.add(line.unitId);
  for (const batch of batches) unitIds.add(batch.unitId);
  const unitRefs = await units.findRefs([...unitIds], companyId);
  const unitConversions = new Map<string, UnitConversion>(unitRefs.map((ref) => [ref.id, ref]));

  return calculateIngredientsCost({ orderQuantity, lines, batches, units: unitConversions });
}
