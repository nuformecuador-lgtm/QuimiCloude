import { Prisma, type PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { companyScopeColumns } from './company-scope';

import type { OrderScope } from '../../../domain/order-scope';
import type {
  DeliveryForVoid,
  DeliveryHistoryRow,
  DeliveryLineForVoid,
  NewDeliveryVoid,
  OrderDeliveryHistoryReader,
  OrderDeliveryVoidRepository,
  RegisteredDeliveryVoid,
} from '../../../ports/order-delivery-void-repository';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type CreateOutcome = { readonly kind: 'created'; readonly id: string } | { readonly kind: 'duplicate_key' };

/** Ninguno de los dos `INSERT` escribe `id`: en la anulacion solo puede chocar la clave por empresa,
 *  y en sus lineas solo la linea de entrega ya anulada. El choque aborta la transaccion de quien llama. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function findDeliveryVoidByKey(
  voidKey: string,
  scope: OrderScope,
  tx: PrismaLike,
): Promise<RegisteredDeliveryVoid | null> {
  const { companyId } = companyScopeColumns(scope);
  const row = await tx.orderDeliveryVoid.findUnique({
    where: { companyId_voidKey: { companyId, voidKey } },
    select: { id: true, delivery: { select: { orderId: true } } },
  });
  return row === null ? null : { id: row.id, orderId: row.delivery.orderId };
}

async function findDeliveryForVoid(
  deliveryId: string,
  scope: OrderScope,
  tx: PrismaLike,
): Promise<DeliveryForVoid | null> {
  return tx.orderDelivery.findFirst({
    where: { ...companyScopeColumns(scope), id: deliveryId },
    select: { id: true, orderId: true },
  });
}

async function findDeliveryLinesForVoid(
  deliveryId: string,
  scope: OrderScope,
  tx: PrismaLike,
): Promise<readonly DeliveryLineForVoid[]> {
  const columns = companyScopeColumns(scope);
  const rows = await tx.orderDeliveryLine.findMany({
    where: { ...columns, deliveryId, delivery: columns },
    select: {
      id: true,
      orderPresentationLineId: true,
      batchId: true,
      packages: true,
      quantity: true,
      voidLine: { select: { id: true } },
    },
    orderBy: [{ orderPresentationLineId: 'asc' }, { batchId: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    presentationLineId: row.orderPresentationLineId,
    batchId: row.batchId,
    packages: row.packages,
    quantity: row.quantity.toFixed(4),
    voided: row.voidLine !== null,
  }));
}

async function createDeliveryVoid(entry: NewDeliveryVoid, scope: OrderScope, tx: PrismaLike): Promise<CreateOutcome> {
  try {
    const { id } = await tx.orderDeliveryVoid.create({
      data: {
        ...companyScopeColumns(scope),
        deliveryId: entry.deliveryId,
        voidKey: entry.voidKey,
        reason: entry.reason,
        createdBy: entry.actorId,
        createdAt: entry.now,
      },
      select: { id: true },
    });
    return { kind: 'created', id };
  } catch (error) {
    if (isUniqueViolation(error)) return { kind: 'duplicate_key' };
    throw error;
  }
}

/** Las claves foraneas compuestas atan cada linea a la anulacion, a su entrega y a su empresa: una
 *  linea de otra entrega o de otra empresa hace fallar el `INSERT`. */
async function addDeliveryVoidLines(
  voidId: string,
  deliveryId: string,
  deliveryLineIds: readonly string[],
  scope: OrderScope,
  tx: PrismaLike,
): Promise<'ok' | 'already_voided'> {
  if (deliveryLineIds.length === 0) return 'ok';
  const { companyId } = companyScopeColumns(scope);
  try {
    await tx.orderDeliveryVoidLine.createMany({
      data: deliveryLineIds.map((deliveryLineId) => ({ companyId, voidId, deliveryId, deliveryLineId })),
    });
    return 'ok';
  } catch (error) {
    if (isUniqueViolation(error)) return 'already_voided';
    throw error;
  }
}

async function listOrderDeliveryHistory(
  orderId: string,
  scope: OrderScope,
  tx: PrismaLike,
): Promise<readonly DeliveryHistoryRow[]> {
  const columns = companyScopeColumns(scope);
  const rows = await tx.orderDelivery.findMany({
    where: { ...columns, orderId },
    select: {
      id: true,
      customerId: true,
      createdBy: true,
      createdAt: true,
      lines: {
        where: columns,
        select: {
          orderPresentationLineId: true,
          batchId: true,
          packages: true,
          voidLine: { select: { void: { select: { reason: true, createdBy: true, createdAt: true } } } },
        },
        orderBy: [{ orderPresentationLineId: 'asc' }, { batchId: 'asc' }],
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    customerId: row.customerId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lines: row.lines.map((line) => ({
      presentationLineId: line.orderPresentationLineId,
      batchId: line.batchId,
      packages: line.packages,
      void: line.voidLine === null ? null : line.voidLine.void,
    })),
  }));
}

/** Sobre el `tx` de la anulacion. Sin `update`, `delete` ni `upsert`: una anulacion no se modifica. */
export function createOrderDeliveryVoidRepository(tx: PrismaLike = prisma): OrderDeliveryVoidRepository {
  return {
    findByKey: (voidKey, scope) => findDeliveryVoidByKey(voidKey, scope, tx),
    findDelivery: (deliveryId, scope) => findDeliveryForVoid(deliveryId, scope, tx),
    findDeliveryLines: (deliveryId, scope) => findDeliveryLinesForVoid(deliveryId, scope, tx),
    create: (entry, scope) => createDeliveryVoid(entry, scope, tx),
    addLines: (voidId, deliveryId, deliveryLineIds, scope) =>
      addDeliveryVoidLines(voidId, deliveryId, deliveryLineIds, scope, tx),
  };
}

export function createOrderDeliveryHistoryReader(tx: PrismaLike = prisma): OrderDeliveryHistoryReader {
  return {
    listByOrder: (orderId, scope) => listOrderDeliveryHistory(orderId, scope, tx),
  };
}
