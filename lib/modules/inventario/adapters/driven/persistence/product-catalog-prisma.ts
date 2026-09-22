import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '../../../domain/inventory-scope';
import type { ProductId, ProductRef } from '../../../domain/product-catalog';
import type { CostingBatch } from '../../../domain/costing-batch';
import type { ProductStockByUnit } from '../../../domain/product-stock';

import { batchCompanyScope, productCompanyScope } from './company-scope';

/**
 * Implementa `ProductCatalog['findRefs']`: el hueco que el contrato publico de `inventario`
 * deja abierto para que otro modulo pueda saber si un producto existe, SIN tocar la tabla
 * ni el repositorio de producto.
 *
 * Una sola consulta, `deleted_at IS NULL` en el `where` (nunca en un filtro posterior):
 * `findRefs` SOLO devuelve productos VIVOS -los ids que no existan o esten borrados
 * logicamente simplemente no vienen en la respuesta (contrato de `ProductCatalog`,
 * `domain/product-catalog.ts`)-.
 *
 * El ambito de empresa se compone con `productCompanyScope`, el punto unico del modulo, en
 * un `AND` aparte del filtro por identificadores: un producto de otra empresa se resuelve
 * exactamente igual que uno inexistente, simplemente no vuelve.
 */

type ProductCatalogRow = {
  readonly id: string;
  readonly name: string;
  readonly stockByUnit: readonly ProductStockByUnit[];
};

/** Fila de Prisma -> `ProductRef` del contrato publico. Funcion pura, testeable sin base. */
export function toProductRef(row: ProductCatalogRow): ProductRef {
  return {
    id: row.id,
    name: row.name,
    stockByUnit: row.stockByUnit,
  };
}

/** Fila cruda que devuelve la consulta: existencia y unidad guardadas, ya en `products`. */
type ProductStockRow = {
  readonly id: string;
  readonly name: string;
  readonly stock: number;
  readonly unitId: string | null;
};

/**
 * La consulta real. Vive aparte de `findProductRefs` para que declare el `scope` con el mismo
 * tipo que el resto del modulo -`InventoryScope`, no la cadena suelta del contrato publico- y lo
 * lleve hasta `productCompanyScope` igual que cualquier otra lectura de `inventario`.
 */
async function findAliveProducts(
  ids: readonly ProductId[],
  scope: InventoryScope,
): Promise<readonly ProductStockRow[]> {
  return prisma.product.findMany({
    where: {
      AND: [productCompanyScope(scope), { id: { in: [...ids] }, deletedAt: null }],
    },
    select: { id: true, name: true, stock: true, unitId: true },
  });
}

export async function findProductRefs(
  ids: readonly ProductId[],
  companyId: string,
): Promise<readonly ProductRef[]> {
  if (ids.length === 0) return [];

  const rows = await findAliveProducts(ids, { companyId });

  return rows.map((row) =>
    toProductRef({
      id: row.id,
      name: row.name,
      stockByUnit: row.unitId === null ? [] : [{ unitId: row.unitId, quantity: row.stock }],
    }),
  );
}

const COSTING_BATCH_SELECT = {
  productId: true,
  lot: true,
  stock: true,
  unitCost: true,
  purchaseDate: true,
  presentation: { select: { unitId: true } },
} satisfies Prisma.ProductBatchSelect;

type CostingBatchRow = Prisma.ProductBatchGetPayload<{ select: typeof COSTING_BATCH_SELECT }>;

/** Fecha civil, sin hora: la columna es `@db.Date` y las tres cifras del ISO bastan. */
function toCivilDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Fila de Prisma -> `CostingBatch` del contrato publico. Funcion pura, testeable sin base. */
export function toCostingBatch(row: CostingBatchRow): CostingBatch {
  return {
    productId: row.productId,
    lot: row.lot,
    stock: row.stock,
    unitCost: row.unitCost.toFixed(4),
    unitId: row.presentation.unitId,
    purchaseDate: toCivilDate(row.purchaseDate),
  };
}

/**
 * La consulta real. Vive aparte de `findCostingBatches` por el mismo motivo que
 * `findAliveProducts`: declara el `scope` como `InventoryScope` y lo lleva hasta
 * `batchCompanyScope`.
 */
async function findAliveBatchesWithStock(
  ids: readonly ProductId[],
  scope: InventoryScope,
): Promise<readonly CostingBatchRow[]> {
  return prisma.productBatch.findMany({
    where: {
      AND: [
        batchCompanyScope(scope),
        { productId: { in: [...ids] }, stock: { gt: 0 }, product: { deletedAt: null } },
      ],
    },
    select: COSTING_BATCH_SELECT,
  });
}

/**
 * Implementa `ProductCatalog['findCostingBatches']`: los lotes CON EXISTENCIA de los
 * productos pedidos, de esa empresa, para que `pedidos` calcule el importe. Una sola
 * consulta para todos los `productId` (el numero de consultas no crece con el numero de
 * ingredientes). NO ordena -el orden es criterio de negocio de quien costea- y NO escribe
 * nada.
 */
export async function findCostingBatches(
  ids: readonly ProductId[],
  companyId: string,
): Promise<readonly CostingBatch[]> {
  if (ids.length === 0) return [];

  const rows = await findAliveBatchesWithStock(ids, { companyId });

  return rows.map(toCostingBatch);
}
