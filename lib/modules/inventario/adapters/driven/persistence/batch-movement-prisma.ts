import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { batchCompanyScope, companyScopeColumns, movementCompanyScope } from './company-scope';

import type { InventoryMovementView, NewInventoryMovement } from '../../../domain/inventory-movement';
import type { InventoryScope } from '../../../domain/inventory-scope';
import type { MovementReason } from '../../../domain/movement-reason';

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
  createdBy: true,
  createdAt: true,
} satisfies Prisma.InventoryMovementSelect;

type MovementRow = Prisma.InventoryMovementGetPayload<{ select: typeof MOVEMENT_SELECT }>;

/**
 * El nombre mostrable de quien hizo el movimiento vive en otro modulo, y este adaptador no lee su
 * tabla: mientras no haya un directorio cableado hasta aqui, `authorName` es el identificador tal
 * cual, igual que un responsable que no vuelve de un directorio sigue saliendo con el suyo.
 */
function toMovementView(row: MovementRow): InventoryMovementView {
  return {
    id: row.id,
    kind: row.kind as InventoryMovementView['kind'],
    quantity: row.quantity.toFixed(4),
    reason: row.reason as MovementReason | null,
    authorName: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * El historial de un lote, del mas reciente al mas antiguo. `null` cuando el lote no existe o es
 * de otra empresa; comprobarlo aparte evita que un lote sin asientos -anterior al libro- se
 * confunda con uno que no existe.
 */
export async function findBatchMovements(
  batchId: string,
  scope: InventoryScope,
): Promise<readonly InventoryMovementView[] | null> {
  const batch = await prisma.productBatch.findFirst({
    where: { AND: [batchCompanyScope(scope), { id: batchId }] },
    select: { id: true },
  });
  if (batch === null) return null;

  const rows = await prisma.inventoryMovement.findMany({
    where: { AND: [movementCompanyScope(scope), { batchId }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: MOVEMENT_SELECT,
  });

  return rows.map(toMovementView);
}
