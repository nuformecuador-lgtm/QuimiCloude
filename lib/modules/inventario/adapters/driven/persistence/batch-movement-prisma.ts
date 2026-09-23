import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import {
  batchCompanyScope,
  companyScopeColumns,
  movementCompanyScope,
  reservationMovementCompanyScope,
} from './company-scope';

import type { NewInventoryMovement } from '../../../domain/inventory-movement';
import type { InventoryScope } from '../../../domain/inventory-scope';
import type { MovementReason } from '../../../domain/movement-reason';
import type { BatchHistoryEntry } from '../../../domain/reservation';

/**
 * Escribe el asiento del libro. Recibe la `tx` desde fuera y nunca abre una propia: el asiento
 * tiene que quedar en la MISMA transaccion que el movimiento de stock que lo motiva, para que uno
 * no pueda comitear sin el otro.
 */
export async function writeMovement(
  tx: Prisma.TransactionClient,
  movement: NewInventoryMovement,
  now: Date,
  scope: InventoryScope,
): Promise<void> {
  await tx.inventoryMovement.create({
    data: {
      batchId: movement.batchId,
      kind: movement.kind,
      quantity: movement.quantity,
      reason: movement.reason,
      orderId: movement.orderId,
      createdBy: movement.createdBy,
      ...companyScopeColumns(scope),
      createdAt: now,
    },
  });
}

const MOVEMENT_SELECT = {
  id: true,
  kind: true,
  quantity: true,
  reason: true,
  orderId: true,
  createdBy: true,
  createdAt: true,
} satisfies Prisma.InventoryMovementSelect;

type MovementRow = Prisma.InventoryMovementGetPayload<{ select: typeof MOVEMENT_SELECT }>;

const RESERVATION_MOVEMENT_SELECT = {
  kind: true,
  quantity: true,
  orderId: true,
  createdBy: true,
  createdAt: true,
} satisfies Prisma.ReservationMovementSelect;

type ReservationMovementRow = Prisma.ReservationMovementGetPayload<{
  select: typeof RESERVATION_MOVEMENT_SELECT;
}>;

/**
 * `orderNumberText` y `authorName` llegan como el IDENTIFICADOR crudo -el pedido y quien escribio
 * el asiento-: resolverlos a texto mostrable es del caso de uso, que es quien conoce los
 * directorios de `pedidos` e `identity`.
 */
function toInventoryHistoryEntry(row: MovementRow): BatchHistoryEntry {
  return {
    kind: row.kind as BatchHistoryEntry['kind'],
    quantity: row.quantity.toFixed(4),
    reason: row.reason as MovementReason | null,
    orderNumberText: row.orderId,
    authorName: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function toReservationHistoryEntry(row: ReservationMovementRow): BatchHistoryEntry {
  return {
    kind: row.kind as BatchHistoryEntry['kind'],
    quantity: row.quantity.toFixed(4),
    // `reservation_movements` no tiene columna de motivo: solo la lleva el libro fisico.
    reason: null,
    orderNumberText: row.orderId,
    authorName: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * El historial de un lote, union de los dos libros (`design.md > 5.1`, `> 10`), del mas reciente
 * al mas antiguo. `null` cuando el lote no existe o es de otra empresa; comprobarlo aparte evita
 * que un lote sin asientos -anterior al libro- se confunda con uno que no existe.
 */
export async function findBatchMovements(
  batchId: string,
  scope: InventoryScope,
): Promise<readonly BatchHistoryEntry[] | null> {
  const batch = await prisma.productBatch.findFirst({
    where: { AND: [batchCompanyScope(scope), { id: batchId }] },
    select: { id: true },
  });
  if (batch === null) return null;

  const [inventoryRows, reservationRows] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { AND: [movementCompanyScope(scope), { batchId }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: MOVEMENT_SELECT,
    }),
    prisma.reservationMovement.findMany({
      where: { AND: [reservationMovementCompanyScope(scope), { batchId }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: RESERVATION_MOVEMENT_SELECT,
    }),
  ]);

  const entries = [
    ...inventoryRows.map(toInventoryHistoryEntry),
    ...reservationRows.map(toReservationHistoryEntry),
  ];
  // Cada lista ya llega ordenada de la base; el `sort` estable solo intercala las dos por fecha,
  // sin desordenar los empates dentro de cada una.
  entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return entries;
}
