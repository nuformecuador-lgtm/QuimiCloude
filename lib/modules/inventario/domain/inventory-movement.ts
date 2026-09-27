import type { MovementReason } from './movement-reason';

export type InventoryMovementView = {
  readonly id: string;
  readonly kind: 'opening' | 'adjustment' | 'consumption' | 'production';
  readonly quantity: string;
  readonly reason: MovementReason | null;
  readonly authorName: string | null;
  readonly createdAt: string;
};

/** En tipos del dominio y no de Prisma: convertir es del adaptador driven. `orderId` solo lo
 *  llevan los asientos `consumption` y `production`: el `CHECK` de la migracion exige que vaya
 *  junto o ninguno. `orderPresentationLineId` solo lo lleva `production`: el reparto
 *  puede dar varios asientos `production` por pedido, uno por linea. */
export type NewInventoryMovement = {
  readonly batchId: string;
  readonly kind: 'opening' | 'adjustment' | 'consumption' | 'production';
  readonly quantity: string;
  readonly reason: MovementReason | null;
  readonly createdBy: string;
  readonly orderId: string | null;
  readonly orderPresentationLineId: string | null;
};
