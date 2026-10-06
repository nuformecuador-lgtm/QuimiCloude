// Siembra de envases para los tests de integracion de `pedidos`: un producto PACKAGING con su
// presentacion fija y un lote en la unidad de envases, por el adaptador real de `inventario`.
import { randomUUID } from 'node:crypto';

import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import { createWithFirstBatch } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { findPackageUnitId } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { prisma } from '@/lib/shared/db/prisma';

export type SeedPackagingInput = {
  readonly companyId: string;
  readonly presentationId: string;
  /** Autor del lote: un usuario de la empresa. */
  readonly createdBy: string;
  readonly stock?: string;
  readonly unitCost?: string;
  readonly name?: string;
};

/** Devuelve el id del envase. */
export async function seedPackaging(input: SeedPackagingInput): Promise<string> {
  const unitId = await findPackageUnitId();
  if (unitId === null) throw new Error('falta la unidad de sistema de envases');
  const created = await createWithFirstBatch(
    {
      name: input.name ?? `Envase ${randomUUID().slice(0, 8)}`,
      qtyAlert: '0',
      type: PRODUCT_TYPES.PACKAGING,
    },
    {
      presentationId: null,
      stock: input.stock ?? '1000',
      unitCost: input.unitCost ?? '0.5000',
      lot: null,
      purchaseDate: '2026-09-01',
      expiryDate: null,
      createdBy: input.createdBy,
    },
    new Date(),
    { companyId: input.companyId },
    { presentationId: input.presentationId, unitId },
  );
  return created.id;
}

/** Borra los envases dados con sus lotes y movimientos. Las lineas de pedido que los nombran
 *  tienen que haberse borrado antes. */
export async function dropPackaging(productIds: readonly string[]): Promise<void> {
  if (productIds.length === 0) return;
  const batches = await prisma.productBatch.findMany({
    where: { productId: { in: [...productIds] } },
    select: { id: true },
  });
  const batchIds = batches.map((batch) => batch.id);
  await prisma.reservationMovement.deleteMany({ where: { batchId: { in: batchIds } } });
  await prisma.inventoryMovement.deleteMany({ where: { batchId: { in: batchIds } } });
  await prisma.productBatch.deleteMany({ where: { id: { in: batchIds } } });
  await prisma.product.deleteMany({ where: { id: { in: [...productIds] } } });
}
