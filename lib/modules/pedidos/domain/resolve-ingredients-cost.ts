import {
  calculateIngredientsCost,
  calculateLotIngredientsCost,
  calculateLotPackagingCost,
  calculateOrderCost,
  calculatePackagingCost,
  storedOrderCost,
  type CostInput,
  type PackagingCostLine,
  type RecipeCostLine,
  type StoredOrderCost,
} from './order-cost';

import type { PackagingCatalog, PackagingCostingBatch, ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog, UnitConversion } from '@/lib/modules/unidades';

/**
 * Lee los tres catalogos (`recetas`, `inventario`, `unidades`) y arma el `CostInput` que
 * `order-cost.ts` necesita. Una sola llamada a cada catalogo salvo `products`, que hace dos:
 * los lotes con disponible (`findCostingBatches`) y la unidad de cada insumo (`findRefs`),
 * ninguna crece con el numero de lineas de la receta. La receta ya NO guarda unidad por linea:
 * la unidad de cada ingrediente es la que `inventario` resuelve para ese producto en este
 * momento, y llega `null` para uno sin lotes.
 *
 * `options.orderId`, cuando el pedido ya existe -la edicion y su cotizacion, o el pedido que se
 * finaliza-, hace que lo que ESE pedido tiene apartado cuente como disponible para si mismo:
 * sin el, un pedido que se edita sin cambiar nada podria ver salir de su promedio el lote que
 * el mismo aparto entero.
 */
async function loadCostInput(
  recipes: RecipeCatalog,
  products: ProductCatalog,
  units: UnitCatalog,
  recipeId: string,
  orderQuantity: string,
  orderUnitId: string | null,
  companyId: string,
  options?: { readonly orderId?: string },
): Promise<CostInput> {
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
  if (orderUnitId !== null) unitIds.add(orderUnitId);
  const [unitRefs, bridge] = await Promise.all([
    units.findRefs([...unitIds], companyId),
    orderUnitId === null ? Promise.resolve(null) : units.findMassVolumeBridge(),
  ]);
  const unitConversions = new Map<string, UnitConversion>(unitRefs.map((ref) => [ref.id, ref]));

  return { orderQuantity, orderUnitId, lines: costLines, batches, units: unitConversions, bridge };
}

/** Coste de los ingredientes de una receta para una cantidad de pedido dada (`null` si no se
 *  puede calcular: `order-cost.ts`). */
export async function resolveIngredientsCost(
  recipes: RecipeCatalog,
  products: ProductCatalog,
  units: UnitCatalog,
  recipeId: string,
  orderQuantity: string,
  orderUnitId: string | null,
  companyId: string,
  options?: { readonly orderId?: string },
): Promise<string | null> {
  const input = await loadCostInput(recipes, products, units, recipeId, orderQuantity, orderUnitId, companyId, options);
  return calculateIngredientsCost(input);
}

/** Coste del LOTE de producto terminado: comparte las mismas lecturas que
 *  `resolveIngredientsCost` pero cuenta como cero cada ingrediente sin costo en vez de dejar
 *  el resultado entero sin importe. Nunca devuelve `null`. */
export async function resolveLotIngredientsCost(
  recipes: RecipeCatalog,
  products: ProductCatalog,
  units: UnitCatalog,
  recipeId: string,
  orderQuantity: string,
  orderUnitId: string | null,
  companyId: string,
  options?: { readonly orderId?: string },
): Promise<string> {
  const input = await loadCostInput(recipes, products, units, recipeId, orderQuantity, orderUnitId, companyId, options);
  return calculateLotIngredientsCost(input);
}

/** Los catalogos de lectura que necesita el importe completo del pedido. */
export type OrderCostCatalogs = {
  readonly recipes: RecipeCatalog;
  readonly products: ProductCatalog;
  readonly units: UnitCatalog;
  readonly packaging: PackagingCatalog;
};

async function loadPackagingBatches(
  packaging: PackagingCatalog,
  lines: readonly PackagingCostLine[],
  companyId: string,
  options?: { readonly orderId?: string },
): Promise<readonly PackagingCostingBatch[]> {
  if (lines.length === 0) return [];
  const ids = [...new Set(lines.map((line) => line.productId))];
  return packaging.findCostingBatches(ids, companyId, { excludeOrderId: options?.orderId });
}

/** Importe del pedido: ingredientes de la receta mas los envases del reparto, con la misma regla
 *  en la cotizacion y en lo que se guarda. `null` si cualquiera de las dos partes no se puede
 *  calcular. */
export async function resolveOrderCost(
  catalogs: OrderCostCatalogs,
  recipeId: string,
  orderQuantity: string,
  orderUnitId: string | null,
  packagingLines: readonly PackagingCostLine[],
  companyId: string,
  options?: { readonly orderId?: string },
): Promise<string | null> {
  const cost = await resolveStoredOrderCost(
    catalogs,
    recipeId,
    orderQuantity,
    orderUnitId,
    packagingLines,
    companyId,
    options,
  );
  return cost === null ? null : cost.total;
}

/** El mismo importe que `resolveOrderCost`, con la parte de envases aparte para guardarla. */
export async function resolveStoredOrderCost(
  catalogs: OrderCostCatalogs,
  recipeId: string,
  orderQuantity: string,
  orderUnitId: string | null,
  packagingLines: readonly PackagingCostLine[],
  companyId: string,
  options?: { readonly orderId?: string },
): Promise<StoredOrderCost | null> {
  const [ingredientsCost, packagingCost] = await Promise.all([
    resolveIngredientsCost(catalogs.recipes, catalogs.products, catalogs.units, recipeId, orderQuantity, orderUnitId, companyId, options),
    resolvePackagingCost(catalogs.packaging, packagingLines, companyId, options),
  ]);
  return storedOrderCost(ingredientsCost, packagingCost);
}

/** Solo el costo de los envases del reparto, con la regla de `calculatePackagingCost`. */
export async function resolvePackagingCost(
  packaging: PackagingCatalog,
  packagingLines: readonly PackagingCostLine[],
  companyId: string,
  options?: { readonly orderId?: string },
): Promise<string | null> {
  const batches = await loadPackagingBatches(packaging, packagingLines, companyId, options);
  return calculatePackagingCost(packagingLines, batches);
}

/** Coste del LOTE de producto terminado con sus envases: nunca `null`. */
export async function resolveLotCost(
  catalogs: OrderCostCatalogs,
  recipeId: string,
  orderQuantity: string,
  orderUnitId: string | null,
  packagingLines: readonly PackagingCostLine[],
  companyId: string,
  options?: { readonly orderId?: string },
): Promise<string> {
  const [ingredientsCost, batches] = await Promise.all([
    resolveLotIngredientsCost(catalogs.recipes, catalogs.products, catalogs.units, recipeId, orderQuantity, orderUnitId, companyId, options),
    loadPackagingBatches(catalogs.packaging, packagingLines, companyId, options),
  ]);
  const total = calculateOrderCost(ingredientsCost, calculateLotPackagingCost(packagingLines, batches));
  if (total === null) throw new Error('resolveLotCost: el costo del lote desborda decimal(14,4)');
  return total;
}
