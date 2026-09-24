import type { MovementReason } from './movement-reason';

export type InventoryMovementView = {
  readonly id: string;
  readonly kind: 'opening' | 'adjustment' | 'consumption';
  readonly quantity: string;
  readonly reason: MovementReason | null;
  readonly authorName: string | null;
  readonly createdAt: string;
};

/** En tipos del dominio y no de Prisma: convertir es del adaptador driven. `orderId` solo lo
 *  llevan los asientos `consumption`: el `CHECK` de la migracion exige que vaya junto o ninguno. */
export type NewInventoryMovement = {
  readonly batchId: string;
  readonly kind: 'opening' | 'adjustment' | 'consumption';
  readonly quantity: string;
  readonly reason: MovementReason | null;
  readonly createdBy: string;
  readonly orderId: string | null;
};
