// Siembra de envases para los E2E del reparto: un producto PACKAGING con su presentacion fija,
// existencia en la unidad de envases y un unico lote SIN presentacion propia, tal como lo deja el
// alta real. Por Prisma, con el mismo patron que el resto de la siembra de `e2e/`.
import { normalizeProductName, PRODUCT_TYPES } from '@/lib/modules/inventario';
import { normalizeUnitName, PACKAGE_UNIT_NAME } from '@/lib/modules/unidades';
import { prisma } from '@/lib/shared/db/prisma';

export type SeedPackagingInput = {
  readonly companyId: string;
  readonly name: string;
  readonly presentationId: string;
  /** Envases enteros. */
  readonly stock: string;
  readonly unitCost: string;
  readonly lot: string;
  readonly createdBy: string;
};

export type SeededPackaging = {
  readonly productId: string;
  readonly batchId: string;
};

/** La unidad de sistema con la que se cuentan los envases; la crea la migracion. */
export async function findPackageUnitId(): Promise<string> {
  const unit = await prisma.unit.findFirst({
    where: { nameNormalized: normalizeUnitName(PACKAGE_UNIT_NAME), companyId: null },
    select: { id: true },
  });
  if (unit === null) {
    throw new Error(
      'falta la unidad de sistema de envases: aplica las migraciones con `pnpm run db:migrate` ' +
        'antes de correr `pnpm run e2e`.',
    );
  }
  return unit.id;
}

export async function seedPackaging(input: SeedPackagingInput): Promise<SeededPackaging> {
  const unitId = await findPackageUnitId();
  const purchaseDate = new Date('2026-01-01T00:00:00Z');

  const product = await prisma.product.create({
    data: {
      name: input.name,
      nameNormalized: normalizeProductName(input.name),
      type: PRODUCT_TYPES.PACKAGING,
      unitId,
      presentationId: input.presentationId,
      stock: input.stock,
      companyId: input.companyId,
    },
    select: { id: true },
  });

  const batch = await prisma.productBatch.create({
    data: {
      productId: product.id,
      presentationId: null,
      companyId: input.companyId,
      stock: input.stock,
      unitCost: input.unitCost,
      lot: input.lot,
      purchaseDate,
      createdBy: input.createdBy,
    },
    select: { id: true },
  });

  await prisma.inventoryMovement.create({
    data: {
      batchId: batch.id,
      kind: 'opening',
      quantity: input.stock,
      reason: null,
      companyId: input.companyId,
      createdBy: input.createdBy,
      createdAt: purchaseDate,
    },
  });

  return { productId: product.id, batchId: batch.id };
}

/** Lo que el pedido tiene apartado en un lote: `reserve` suma y el resto de asientos resta. */
export async function netReservedInBatch(orderId: string, batchId: string): Promise<number> {
  const movements = await prisma.reservationMovement.findMany({
    where: { orderId, batchId },
    select: { kind: true, quantity: true },
  });
  return movements.reduce(
    (total, movement) =>
      total + (movement.kind === 'reserve' ? 1 : -1) * Number(movement.quantity),
    0,
  );
}

export async function batchStock(batchId: string): Promise<number> {
  const batch = await prisma.productBatch.findUniqueOrThrow({
    where: { id: batchId },
    select: { stock: true },
  });
  return Number(batch.stock);
}
