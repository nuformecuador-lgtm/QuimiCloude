import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '../../../domain/inventory-scope';
import type { ProductId, ProductRef } from '../../../domain/product-catalog';
import type { CostingBatch } from '../../../domain/costing-batch';
import type { ProductNameMatch } from '../../../domain/product-name-lookup';
import type { ProductStockByUnit } from '../../../domain/product-stock';
import type { ProductType } from '../../../domain/product-type';

import { batchCompanyScope, productCompanyScope } from './company-scope';
import { findReservedAndAvailableByBatch } from './reservation-prisma';
import { compareQuantities } from '../../../domain/decimal-quantity';
import { normalizeProductName } from '../../../domain/product-name';

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
  readonly unitId: string | null;
  readonly stockByUnit: readonly ProductStockByUnit[];
  readonly type: ProductType;
};

/** Fila de Prisma -> `ProductRef` del contrato publico. Funcion pura, testeable sin base. */
export function toProductRef(row: ProductCatalogRow): ProductRef {
  return {
    id: row.id,
    name: row.name,
    unitId: row.unitId,
    stockByUnit: row.stockByUnit,
    type: row.type,
  };
}

/** Fila cruda que devuelve la consulta: existencia, unidad y tipo guardados, ya en `products`. */
type ProductStockRow = {
  readonly id: string;
  readonly name: string;
  readonly stock: string;
  readonly unitId: string | null;
  readonly type: ProductType;
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
  const rows = await prisma.product.findMany({
    where: {
      AND: [productCompanyScope(scope), { id: { in: [...ids] }, deletedAt: null }],
    },
    select: { id: true, name: true, stock: true, unitId: true, type: true },
  });
  return rows.map((row) => ({ ...row, stock: row.stock.toFixed(4), type: row.type as ProductType }));
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
      unitId: row.unitId,
      stockByUnit: row.unitId === null ? [] : [{ unitId: row.unitId, quantity: row.stock }],
      type: row.type,
    }),
  );
}

const COSTING_BATCH_SELECT = {
  id: true,
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

/** Fila de Prisma -> `CostingBatch` del contrato publico. Funcion pura, testeable sin base.
 *  Un lote de MACHINE sin presentacion o sin costo no costea: se filtra antes de llegar aqui.
 *  `available` llega ya calculado -mismo agregado del libro de reservas que usan el listado de
 *  lotes y la cobertura- porque esta funcion no tiene acceso a `reservation_movements`. */
export function toCostingBatch(row: CostingBatchRow, available: string): CostingBatch {
  if (row.presentation === null || row.unitCost === null) {
    throw new Error(`toCostingBatch: lote ${row.lot} sin presentacion o sin costo`);
  }
  return {
    productId: row.productId,
    lot: row.lot,
    stock: row.stock.toFixed(4),
    unitCost: row.unitCost.toFixed(4),
    unitId: row.presentation.unitId,
    purchaseDate: toCivilDate(row.purchaseDate),
    available,
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
        {
          productId: { in: [...ids] },
          stock: { gt: 0 },
          // MACHINE sin presentacion o sin costo no entra en el costeo de recetas.
          presentationId: { not: null },
          unitCost: { not: null },
          product: { deletedAt: null },
        },
      ],
    },
    select: COSTING_BATCH_SELECT,
  });
}

/**
 * Implementa `ProductCatalog['findCostingBatches']`: los lotes CON DISPONIBLE de los
 * productos pedidos, de esa empresa, para que `pedidos` calcule el importe. Una sola
 * consulta de lotes mas una de agregados del libro de reservas para todos los `productId`
 * (el numero de consultas no crece con el numero de ingredientes). NO ordena -el promedio no
 * depende del orden- y NO escribe nada.
 *
 * El disponible sale de `findReservedAndAvailableByBatch`, EL MISMO agregado que usan el
 * listado de lotes y la cobertura: no hay una segunda definicion de lo apartado. Con
 * `excludeOrderId`, lo que ese pedido tiene apartado no se resta.
 */
export async function findCostingBatches(
  ids: readonly ProductId[],
  companyId: string,
  options?: { readonly excludeOrderId?: string },
): Promise<readonly CostingBatch[]> {
  if (ids.length === 0) return [];

  const rows = await findAliveBatchesWithStock(ids, { companyId });
  if (rows.length === 0) return [];

  const aggregates = await findReservedAndAvailableByBatch(
    prisma,
    companyId,
    rows.map((row) => row.id),
    { excludeOrderId: options?.excludeOrderId },
  );

  return rows
    .map((row) => toCostingBatch(row, aggregates.get(row.id)?.available ?? row.stock.toFixed(4)))
    .filter((batch) => compareQuantities(batch.available, '0.0000') > 0);
}

type ProductByNameRow = {
  readonly id: string;
  readonly name: string;
  readonly nameNormalized: string;
  readonly type: ProductType;
  readonly unitId: string | null;
};

/**
 * La consulta real. Vive aparte de `findProductsByNormalizedNames` por el mismo motivo que
 * `findAliveProducts`: declara el `scope` como `InventoryScope` y lo lleva hasta
 * `productCompanyScope`.
 */
async function findAliveProductsByNormalizedNames(
  normalizedNames: readonly string[],
  scope: InventoryScope,
): Promise<readonly ProductByNameRow[]> {
  const rows = await prisma.product.findMany({
    where: {
      AND: [
        productCompanyScope(scope),
        { nameNormalized: { in: [...normalizedNames] }, deletedAt: null },
      ],
    },
    select: { id: true, name: true, nameNormalized: true, type: true, unitId: true },
  });
  return rows.map((row) => ({ ...row, type: row.type as ProductType }));
}

/**
 * Implementa `ProductNameLookup['findAliveByNormalizedNames']`: productos VIVOS de esa empresa
 * cuyo `name_normalized` esta entre los de `names`, normalizados aqui -no por quien llama- con
 * `normalizeProductName`, la unica definicion de «mismo nombre» del modulo. Incluye los
 * terminados: filtrarlos es de quien llama (QC-159 `design.md > 5.3`).
 */
export async function findProductsByNormalizedNames(
  names: readonly string[],
  companyId: string,
): Promise<readonly ProductNameMatch[]> {
  const normalized = [...new Set(names.map(normalizeProductName))].filter((name) => name.length > 0);
  if (normalized.length === 0) return [];

  const rows = await findAliveProductsByNormalizedNames(normalized, { companyId });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameNormalized: row.nameNormalized,
    type: row.type,
    unitId: row.unitId,
  }));
}
