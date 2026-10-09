import type { MovementReason } from './movement-reason';

export type InventoryMovementView = {
  readonly id: string;
  readonly kind: 'opening' | 'adjustment' | 'consumption' | 'production' | 'delivery';
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
  readonly kind: 'opening' | 'adjustment' | 'consumption' | 'production' | 'delivery';
  readonly quantity: string;
  readonly reason: MovementReason | null;
  readonly createdBy: string;
  readonly orderId: string | null;
  readonly orderPresentationLineId: string | null;
  /** Solo lo lleva `delivery`, y siempre: opcional para que los demas escritores no lo nombren. */
  readonly orderDeliveryId?: string | null;
  /** Solo los lleva un ajuste, y los dos juntos: el `CHECK` de la tabla rechaza uno sin el otro. */
  readonly previousStock?: string | null;
  readonly countedStock?: string | null;
};
