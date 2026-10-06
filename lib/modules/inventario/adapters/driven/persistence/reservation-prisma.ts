import { Prisma, type PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { addQuantities, compareQuantities, subtractQuantities } from '../../../domain/decimal-quantity';
import { planReservation, type ReservationCandidateBatch } from '../../../domain/plan-reservation';
import type { ProductId } from '../../../domain/product-catalog';
import { netReservedByBatch, type ReservationMovementKind } from '../../../domain/reservation-ledger';
import type {
  ConsumptionOutcome,
  MaterialReservations,
  OrderCoverage,
  ReservationOutcome,
  ReservationQueries,
  ReservationRequirementLine,
} from '../../../domain/reservation';
import type { InventoryScope } from '../../../domain/inventory-scope';

import { consumeBatchStock, recalculateProductStock } from './product-prisma';

/**
 * `syncForOrder`, `releaseForOrder` y `consumeForOrder`. Reciben el
 * cliente que abre quien llama -global o transaccional- y no abren transaccion propia: el
 * pedido y su reserva tienen que comitear o deshacerse juntos, y esa transaccion la abre
 * `pedidos`, nunca este archivo.
 *
 * Escribe sobre `reservation_movements` y llama a `consumeBatchStock`/`recalculateProductStock`
 * de `product-prisma.ts` -driven a driven del MISMO modulo, como el adaptador de `pedidos`
 * escribe aqui-. Ningun `UPDATE` ni `DELETE` sobre `reservation_movements`: solo `create`.
 */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

const ZERO = '0.0000';

function isPositive(quantity: string): boolean {
  return compareQuantities(quantity, ZERO) > 0;
}

function maxZero(quantity: string): string {
  return compareQuantities(quantity, ZERO) < 0 ? ZERO : quantity;
}

/** Fecha civil, sin hora, igual que `toCivilDate` de `product-prisma.ts`: la columna es
 *  `@db.Date` y las diez cifras del ISO bastan. No se importa de alli: no esta exportada, y
 *  duplicar una funcion de tres lineas es mas barato que abrir un hueco publico solo para esto. */
function toCivilDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type ReservationMovementRow = { readonly batchId: string; readonly kind: string; readonly quantity: Prisma.Decimal };

function toLedgerRow(row: ReservationMovementRow): { readonly batchId: string; readonly kind: ReservationMovementKind; readonly quantity: string } {
  return { batchId: row.batchId, kind: row.kind as ReservationMovementKind, quantity: row.quantity.toFixed(4) };
}

/**
 * Bloquea las filas de `products` de la necesidad, UNA POR UNA y en orden ASCENDENTE de `id`:
 * el mismo efecto que un `SELECT ... WHERE id IN (...) FOR NO KEY UPDATE`
 * ordenado, sin depender de castear una lista de identificadores dentro de SQL crudo. Devuelve la
 * unidad de cada producto -`null` si todavia no tiene lotes-; los productos que no existen o son
 * de otra empresa simplemente no aparecen.
 */
async function lockProductsAscending(
  db: PrismaLike,
  companyId: string,
  productIds: readonly string[],
): Promise<Map<string, string | null>> {
  const orderedIds = [...new Set(productIds)].sort();
  const result = new Map<string, string | null>();
  for (const id of orderedIds) {
    const rows = await db.$queryRaw<ReadonlyArray<{ id: string; unitId: string | null }>>(Prisma.sql`
      SELECT "id", "unit_id" AS "unitId"
        FROM "products"
       WHERE "id" = ${id}::uuid
         AND "company_id" = ${companyId}::uuid
       FOR NO KEY UPDATE
    `);
    const row = rows[0];
    if (row !== undefined) result.set(row.id, row.unitId);
  }
  return result;
}

type BatchRow = {
  readonly id: string;
  readonly productId: string;
  readonly lot: string;
  readonly purchaseDate: Date;
  readonly stock: Prisma.Decimal;
};

/** Los lotes candidatos de un conjunto de productos, con su disponible YA descontado de lo que
 *  otros pedidos tengan apartado -o de todo lo apartado, si `excludeOrderId` es `null`-. */
function toCandidateBatches(
  batches: readonly BatchRow[],
  reservedByBatch: ReadonlyMap<string, string>,
): ReservationCandidateBatch[] {
  return batches.map((batch) => ({
    id: batch.id,
    productId: batch.productId as ProductId,
    lot: batch.lot,
    purchaseDate: toCivilDate(batch.purchaseDate),
    available: maxZero(subtractQuantities(batch.stock.toFixed(4), reservedByBatch.get(batch.id) ?? ZERO)),
  }));
}

export function createMaterialReservations(db: PrismaLike = prisma): MaterialReservations {
  return {
    async syncForOrder(input): Promise<ReservationOutcome> {
      const { orderId, companyId, requirement, actorId, now } = input;

      const requirementProductIds = requirement.map((line) => line.productId);

      // Un pedido puede llegar a esta llamada ya con algo apartado de un producto que la RECETA
      // NUEVA ya no pide (linea quitada): sin incluir tambien esos productos, esa reserva nunca
      // se liberaria.
      const ownBatchIds = await db.reservationMovement.findMany({
        where: { companyId, orderId },
        select: { batchId: true },
        distinct: ['batchId'],
      });
      const ownProducts =
        ownBatchIds.length === 0
          ? []
          : await db.productBatch.findMany({
              where: { id: { in: ownBatchIds.map((row) => row.batchId) }, companyId },
              select: { productId: true },
            });

      const productIds = [...new Set([...requirementProductIds, ...ownProducts.map((row) => row.productId)])];
      if (productIds.length === 0) return { kind: 'not_reserved' };

      const productUnits = await lockProductsAscending(db, companyId, productIds);

      const batches = await db.productBatch.findMany({
        where: { companyId, productId: { in: productIds } },
        select: { id: true, productId: true, lot: true, purchaseDate: true, stock: true },
      });
      const batchIds = batches.map((batch) => batch.id);

      const movementRows =
        batchIds.length === 0
          ? []
          : await db.reservationMovement.findMany({
              where: { companyId, batchId: { in: batchIds } },
              select: { batchId: true, orderId: true, kind: true, quantity: true },
            });

      const ownByBatch = netReservedByBatch(movementRows.filter((row) => row.orderId === orderId).map(toLedgerRow));
      const othersByBatch = netReservedByBatch(movementRows.filter((row) => row.orderId !== orderId).map(toLedgerRow));

      const candidateBatches = toCandidateBatches(batches, othersByBatch);

      const plan = planReservation({ requirement, products: productUnits, batches: candidateBatches });
      const targetByBatch =
        plan.kind === 'reserved' ? new Map(plan.allocations.map((allocation) => [allocation.batchId, allocation.quantity])) : new Map<string, string>();

      const touchedBatchIds = new Set([...targetByBatch.keys(), ...ownByBatch.keys()]);
      for (const batchId of touchedBatchIds) {
        const target = targetByBatch.get(batchId) ?? ZERO;
        const current = ownByBatch.get(batchId) ?? ZERO;
        const comparison = compareQuantities(target, current);
        if (comparison === 0) continue;

        const kind: ReservationMovementKind = comparison > 0 ? 'reserve' : 'release';
        const quantity = comparison > 0 ? subtractQuantities(target, current) : subtractQuantities(current, target);
        await db.reservationMovement.create({
          data: { companyId, orderId, batchId, kind, quantity: new Prisma.Decimal(quantity), createdBy: actorId, createdAt: now },
        });
      }

      if (plan.kind === 'insufficient') return { kind: 'insufficient', productIds: plan.productIds };
      return { kind: plan.allocations.length > 0 ? 'reserved' : 'not_reserved' };
    },

    async releaseForOrder(input): Promise<void> {
      const { orderId, companyId, reason, actorId, now } = input;

      const rows = await db.reservationMovement.findMany({
        where: { companyId, orderId },
        select: { batchId: true, kind: true, quantity: true },
      });
      const ownByBatch = netReservedByBatch(rows.map(toLedgerRow));

      for (const [batchId, quantity] of ownByBatch) {
        if (!isPositive(quantity)) continue;
        await db.reservationMovement.create({
          data: { companyId, orderId, batchId, kind: reason, quantity: new Prisma.Decimal(quantity), createdBy: actorId, createdAt: now },
        });
      }
    },

    async consumeForOrder(input): Promise<ConsumptionOutcome> {
      const { orderId, companyId, actorId, now } = input;
      const scope: InventoryScope = { companyId };
      const subset = input.productIds === undefined ? null : new Set<string>(input.productIds);
      const fallbackRequirement =
        subset === null
          ? input.fallbackRequirement
          : input.fallbackRequirement.filter((line) => subset.has(line.productId));

      const ownRows = await db.reservationMovement.findMany({
        where: { companyId, orderId },
        select: { batchId: true, kind: true, quantity: true },
      });
      let ownByBatch = new Map(
        [...netReservedByBatch(ownRows.map(toLedgerRow))].filter(([, quantity]) => isPositive(quantity)),
      );

      let ownBatchRows =
        ownByBatch.size === 0
          ? []
          : await db.productBatch.findMany({
              where: { id: { in: [...ownByBatch.keys()] }, companyId },
              select: { id: true, productId: true },
            });
      if (subset !== null) {
        ownBatchRows = ownBatchRows.filter((row) => subset.has(row.productId));
        const kept = new Set(ownBatchRows.map((row) => row.id));
        ownByBatch = new Map([...ownByBatch].filter(([batchId]) => kept.has(batchId)));
      }

      // El pedido no tiene nada apartado -no alcanzo al crearlo, o su reserva se libero por
      // una edicion que luego no volvio a apartar-. Se calcula y consume todo-o-nada de lo que
      // haya, sin pasar por `reservation_movements`: no hubo apartado que resolver.
      if (ownByBatch.size === 0) {
        return consumeWithoutReservation(db, scope, orderId, actorId, now, fallbackRequirement);
      }
      const batchProduct = new Map(ownBatchRows.map((row) => [row.id, row.productId]));

      const productIds = [...new Set(ownBatchRows.map((row) => row.productId))];
      const productUnits = await lockProductsAscending(db, companyId, productIds);

      const consumedByBatch = new Map<string, string>();
      const deficitByProduct = new Map<string, string>();

      for (const [batchId, quantity] of ownByBatch) {
        const result = await consumeBatchStock(db, { batchId, quantity, orderId, actorId }, now, scope);
        let consumedHere = quantity;

        if (result.kind === 'insufficient') {
          // Merma sobre el lote apartado: se consume lo que quede en el, y el resto se
          // completa de otros lotes con disponible, mas abajo.
          consumedHere = isPositive(result.available) ? result.available : '0.0000';
          if (isPositive(consumedHere)) {
            const partial = await consumeBatchStock(db, { batchId, quantity: consumedHere, orderId, actorId }, now, scope);
            if (partial.kind !== 'consumed') {
              throw new Error('reservation-prisma: consumo parcial inesperado bajo el bloqueo del producto');
            }
          }
          const productId = batchProduct.get(batchId);
          if (productId !== undefined) {
            const deficit = subtractQuantities(quantity, consumedHere);
            deficitByProduct.set(productId, addQuantities(deficitByProduct.get(productId) ?? ZERO, deficit));
          }
        }

        if (isPositive(consumedHere)) consumedByBatch.set(batchId, consumedHere);

        // El apartado de ESTE pedido en ESTE lote queda resuelto por el importe COMPLETO que
        // tenia reservado, sin importar cuanto pudo dar el lote de verdad: lo que falte se cubre
        // de otro lote o la operacion entera se deshace. `reservation_movements` no es el
        // libro fisico -ese es `inventory_movements`, ya asentado por `consumeBatchStock`-.
        await db.reservationMovement.create({
          data: { companyId, orderId, batchId, kind: 'consume', quantity: new Prisma.Decimal(quantity), createdBy: actorId, createdAt: now },
        });
      }

      if (deficitByProduct.size > 0) {
        const deficitProductIds = [...deficitByProduct.keys()];
        const requirementLines: ReservationRequirementLine[] = deficitProductIds.map((productId) => ({
          productId: productId as ProductId,
          quantity: deficitByProduct.get(productId) as string,
        }));

        const candidateRows = await db.productBatch.findMany({
          where: { companyId, productId: { in: deficitProductIds } },
          select: { id: true, productId: true, lot: true, purchaseDate: true, stock: true },
        });
        for (const row of candidateRows) batchProduct.set(row.id, row.productId);

        const candidateIds = candidateRows.map((row) => row.id);
        const othersRows =
          candidateIds.length === 0
            ? []
            : await db.reservationMovement.findMany({
                where: { companyId, batchId: { in: candidateIds }, NOT: { orderId } },
                select: { batchId: true, kind: true, quantity: true },
              });
        const othersByBatch = netReservedByBatch(othersRows.map(toLedgerRow));

        // Los lotes ya vaciados en este mismo consumo no se ofrecen de nuevo: su disponible real
        // ya quedo reflejado en `consumeBatchStock`, y aqui solo interesan los que NO se tocaron.
        const candidateBatches = toCandidateBatches(
          candidateRows.filter((row) => !consumedByBatch.has(row.id)),
          othersByBatch,
        );

        const productUnitMap = new Map(deficitProductIds.map((id) => [id, productUnits.get(id) ?? null]));

        const plan = planReservation({ requirement: requirementLines, products: productUnitMap, batches: candidateBatches });
        if (plan.kind === 'insufficient') {
          return { kind: 'insufficient', productIds: plan.productIds };
        }

        for (const allocation of plan.allocations) {
          const result = await consumeBatchStock(db, { batchId: allocation.batchId, quantity: allocation.quantity, orderId, actorId }, now, scope);
          if (result.kind !== 'consumed') {
            throw new Error('reservation-prisma: reparto del faltante inesperado bajo el bloqueo del producto');
          }
          consumedByBatch.set(allocation.batchId, addQuantities(consumedByBatch.get(allocation.batchId) ?? ZERO, allocation.quantity));
        }
      }

      const touchedProductIds = new Set<string>();
      for (const batchId of consumedByBatch.keys()) {
        const productId = batchProduct.get(batchId);
        if (productId !== undefined) touchedProductIds.add(productId);
      }
      for (const productId of touchedProductIds) await recalculateProductStock(db, productId, scope);

      return { kind: 'consumed' };
    },
  };
}

/** Consume la necesidad de respaldo todo-o-nada, sin tocar `reservation_movements` -no hubo
 *  apartado que resolver-. Misma regla de reparto que `syncForOrder`, pero consumiendo en vez de
 *  reservar. Una necesidad vacia (receta sin lineas) no escribe nada. */
async function consumeWithoutReservation(
  db: PrismaLike,
  scope: InventoryScope,
  orderId: string,
  actorId: string,
  now: Date,
  fallbackRequirement: readonly ReservationRequirementLine[],
): Promise<ConsumptionOutcome> {
  if (fallbackRequirement.length === 0) return { kind: 'nothing_to_consume' };

  const { companyId } = scope;
  const productIds = [...new Set(fallbackRequirement.map((line) => line.productId))];
  const productUnits = await lockProductsAscending(db, companyId, productIds);

  const batches = await db.productBatch.findMany({
    where: { companyId, productId: { in: productIds } },
    select: { id: true, productId: true, lot: true, purchaseDate: true, stock: true },
  });
  const batchIds = batches.map((batch) => batch.id);
  const reservedRows =
    batchIds.length === 0
      ? []
      : await db.reservationMovement.findMany({
          where: { companyId, batchId: { in: batchIds } },
          select: { batchId: true, kind: true, quantity: true },
        });
  const reservedByBatch = netReservedByBatch(reservedRows.map(toLedgerRow));
  const candidateBatches = toCandidateBatches(batches, reservedByBatch);

  const plan = planReservation({ requirement: fallbackRequirement, products: productUnits, batches: candidateBatches });
  if (plan.kind === 'insufficient') return { kind: 'insufficient', productIds: plan.productIds };

  const batchProduct = new Map(batches.map((batch) => [batch.id, batch.productId]));
  const touchedProductIds = new Set<string>();
  for (const allocation of plan.allocations) {
    const result = await consumeBatchStock(db, { batchId: allocation.batchId, quantity: allocation.quantity, orderId, actorId }, now, scope);
    if (result.kind !== 'consumed') {
      throw new Error('reservation-prisma: consumo sin apartado previo inesperado bajo el bloqueo del producto');
    }
    const productId = batchProduct.get(allocation.batchId);
    if (productId !== undefined) touchedProductIds.add(productId);
  }
  for (const productId of touchedProductIds) await recalculateProductStock(db, productId, scope);

  return { kind: 'consumed' };
}

export function createReservationQueries(db: PrismaLike = prisma): ReservationQueries {
  return {
    async findCoverageByOrderIds(companyId, orderIds): Promise<ReadonlyMap<string, OrderCoverage>> {
      const result = new Map<string, OrderCoverage>();
      if (orderIds.length === 0) return result;
      for (const orderId of orderIds) result.set(orderId, 'none');

      const ownRows = await db.reservationMovement.findMany({
        where: { companyId, orderId: { in: [...orderIds] } },
        select: { orderId: true, batchId: true, kind: true, quantity: true },
      });
      if (ownRows.length === 0) return result;

      const rowsByOrder = new Map<string, Array<{ batchId: string; kind: ReservationMovementKind; quantity: string }>>();
      for (const row of ownRows) {
        const list = rowsByOrder.get(row.orderId) ?? [];
        list.push(toLedgerRow(row));
        rowsByOrder.set(row.orderId, list);
      }

      const ownBatchesByOrder = new Map<string, ReadonlyMap<string, string>>();
      const allBatchIds = new Set<string>();
      for (const [orderId, rows] of rowsByOrder) {
        const net = netReservedByBatch(rows);
        const positive = new Map([...net].filter(([, quantity]) => isPositive(quantity)));
        ownBatchesByOrder.set(orderId, positive);
        for (const batchId of positive.keys()) allBatchIds.add(batchId);
      }
      if (allBatchIds.size === 0) return result;

      const batches = await db.productBatch.findMany({
        where: { id: { in: [...allBatchIds] }, companyId },
        select: { id: true, stock: true },
      });
      const stockByBatch = new Map(batches.map((batch) => [batch.id, batch.stock.toFixed(4)]));

      const allRows = await db.reservationMovement.findMany({
        where: { companyId, batchId: { in: [...allBatchIds] } },
        select: { batchId: true, kind: true, quantity: true },
      });
      const totalReservedByBatch = netReservedByBatch(allRows.map(toLedgerRow));
      const overReservedBatches = new Set(
        [...totalReservedByBatch]
          .filter(([batchId, reserved]) => compareQuantities(reserved, stockByBatch.get(batchId) ?? ZERO) > 0)
          .map(([batchId]) => batchId),
      );

      for (const [orderId, ownBatches] of ownBatchesByOrder) {
        if (ownBatches.size === 0) continue;
        const partial = [...ownBatches.keys()].some((batchId) => overReservedBatches.has(batchId));
        result.set(orderId, partial ? 'partial' : 'full');
      }
      return result;
    },
  };
}

/** Agregados por LOTE: existencia, apartado, disponible y si esta sobre-reservado.
 *
 *  Con `excludeOrderId`, lo apartado por ESE pedido no cuenta en `reserved` -y por tanto
 *  suma a `available`-: es lo que necesita el coste de un pedido que ya existe para contar su
 *  propia reserva como disponible para si mismo, sin abrir una segunda definicion del
 *  apartado. */
export async function findReservedAndAvailableByBatch(
  db: PrismaLike,
  companyId: string,
  batchIds: readonly string[],
  options?: { readonly excludeOrderId?: string },
): Promise<ReadonlyMap<string, { readonly reserved: string; readonly available: string; readonly overReserved: boolean }>> {
  const result = new Map<string, { reserved: string; available: string; overReserved: boolean }>();
  if (batchIds.length === 0) return result;

  const batches = await db.productBatch.findMany({
    where: { id: { in: [...batchIds] }, companyId },
    select: { id: true, stock: true },
  });
  const rows = await db.reservationMovement.findMany({
    where: {
      companyId,
      batchId: { in: [...batchIds] },
      ...(options?.excludeOrderId !== undefined ? { NOT: { orderId: options.excludeOrderId } } : {}),
    },
    select: { batchId: true, kind: true, quantity: true },
  });
  const reservedByBatch = netReservedByBatch(rows.map(toLedgerRow));

  for (const batch of batches) {
    const stock = batch.stock.toFixed(4);
    const reserved = reservedByBatch.get(batch.id) ?? ZERO;
    result.set(batch.id, {
      reserved,
      available: maxZero(subtractQuantities(stock, reserved)),
      overReserved: compareQuantities(reserved, stock) > 0,
    });
  }
  return result;
}

/** Los mismos agregados, sumados por PRODUCTO. */
export async function findReservedAndAvailableByProduct(
  db: PrismaLike,
  companyId: string,
  productIds: readonly string[],
): Promise<ReadonlyMap<string, { readonly reserved: string; readonly available: string }>> {
  const totals = new Map<string, { reserved: string; available: string }>();
  if (productIds.length === 0) return totals;

  const batches = await db.productBatch.findMany({
    where: { productId: { in: [...productIds] }, companyId },
    select: { id: true, productId: true },
  });
  if (batches.length === 0) return totals;

  const byBatch = await findReservedAndAvailableByBatch(db, companyId, batches.map((batch) => batch.id));
  for (const batch of batches) {
    const entry = byBatch.get(batch.id);
    const previous = totals.get(batch.productId) ?? { reserved: ZERO, available: ZERO };
    totals.set(batch.productId, {
      reserved: addQuantities(previous.reserved, entry?.reserved ?? ZERO),
      available: addQuantities(previous.available, entry?.available ?? ZERO),
    });
  }
  return totals;
}
