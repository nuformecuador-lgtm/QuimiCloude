import { prisma } from '@/lib/shared/db/prisma';

import { addQuantities, compareQuantities } from '../../../domain/decimal-quantity';
import { PRODUCT_TYPES } from '../../../domain/product-type';

import { batchCompanyScope, presentationCompanyScope, productCompanyScope } from './company-scope';
import { findReservedAndAvailableByBatch } from './reservation-prisma';

import type { InventoryScope } from '../../../domain/inventory-scope';
import type { PackagingCostingBatch, PackagingRef } from '../../../domain/packaging-catalog';
import type { ProductId } from '../../../domain/product-catalog';

const ZERO = '0.0000';

type PackagingRow = { readonly id: string; readonly name: string; readonly presentationId: string };

async function findAlivePackaging(ids: readonly ProductId[], scope: InventoryScope): Promise<readonly PackagingRow[]> {
  const rows = await prisma.product.findMany({
    where: {
      AND: [
        productCompanyScope(scope),
        { id: { in: [...ids] }, type: PRODUCT_TYPES.PACKAGING, presentationId: { not: null }, deletedAt: null },
      ],
    },
    select: { id: true, name: true, presentationId: true },
  });
  return rows.flatMap((row) => (row.presentationId === null ? [] : [{ ...row, presentationId: row.presentationId }]));
}

async function findPresentations(ids: readonly string[], scope: InventoryScope) {
  return prisma.presentation.findMany({
    where: { AND: [presentationCompanyScope(scope), { id: { in: [...ids] } }] },
    select: { id: true, name: true, unitId: true, content: true },
  });
}

async function findBatchesOf(
  productIds: readonly string[],
  scope: InventoryScope,
  onlyCosting: boolean,
): Promise<readonly { readonly id: string; readonly productId: string; readonly unitCost: string | null }[]> {
  const rows = await prisma.productBatch.findMany({
    where: {
      AND: [
        batchCompanyScope(scope),
        onlyCosting
          ? { productId: { in: [...productIds] }, stock: { gt: 0 }, unitCost: { not: null } }
          : { productId: { in: [...productIds] } },
      ],
    },
    select: { id: true, productId: true, unitCost: true },
  });
  return rows.map((row) => ({ id: row.id, productId: row.productId, unitCost: row.unitCost?.toFixed(4) ?? null }));
}

export async function findPackagingRefs(
  ids: readonly ProductId[],
  companyId: string,
  options?: { readonly excludeOrderId?: string },
): Promise<readonly PackagingRef[]> {
  if (ids.length === 0) return [];
  const scope: InventoryScope = { companyId };

  const products = await findAlivePackaging(ids, scope);
  if (products.length === 0) return [];

  const presentations = new Map(
    (await findPresentations([...new Set(products.map((p) => p.presentationId))], scope)).map((p) => [p.id, p]),
  );
  const batches = await findBatchesOf(products.map((p) => p.id), scope, false);
  const byBatch = await findReservedAndAvailableByBatch(
    prisma,
    companyId,
    batches.map((b) => b.id),
    { excludeOrderId: options?.excludeOrderId },
  );
  const availableByProduct = new Map<string, string>();
  for (const batch of batches) {
    const available = byBatch.get(batch.id)?.available ?? ZERO;
    availableByProduct.set(batch.productId, addQuantities(availableByProduct.get(batch.productId) ?? ZERO, available));
  }

  return products.flatMap((product) => {
    const presentation = presentations.get(product.presentationId);
    if (presentation === undefined) return [];
    return [
      {
        id: product.id,
        name: product.name,
        presentationId: presentation.id,
        presentationName: presentation.name,
        content: presentation.content === null ? null : presentation.content.toFixed(4),
        unitId: presentation.unitId,
        available: availableByProduct.get(product.id) ?? ZERO,
      },
    ];
  });
}

export async function findPackagingCostingBatches(
  ids: readonly ProductId[],
  companyId: string,
  options?: { readonly excludeOrderId?: string },
): Promise<readonly PackagingCostingBatch[]> {
  if (ids.length === 0) return [];
  const scope: InventoryScope = { companyId };

  const products = await findAlivePackaging(ids, scope);
  if (products.length === 0) return [];

  const batches = await findBatchesOf(products.map((p) => p.id), scope, true);
  const byBatch = await findReservedAndAvailableByBatch(
    prisma,
    companyId,
    batches.map((b) => b.id),
    { excludeOrderId: options?.excludeOrderId },
  );

  return batches.flatMap((batch) => {
    const available = byBatch.get(batch.id)?.available ?? ZERO;
    if (batch.unitCost === null || compareQuantities(available, ZERO) <= 0) return [];
    return [{ productId: batch.productId, unitCost: batch.unitCost, available }];
  });
}
