import type { MovementReason } from './movement-reason';

export type InventoryMovementView = {
  readonly id: string;
  readonly kind: 'opening' | 'adjustment';
  readonly quantity: number;
  readonly reason: MovementReason | null;
  readonly authorName: string | null;
  readonly createdAt: string;
};

/** En tipos del dominio y no de Prisma: convertir es del adaptador driven. */
export type NewInventoryMovement = {
  readonly batchId: string;
  readonly kind: 'opening' | 'adjustment';
  readonly quantity: number;
  readonly reason: MovementReason | null;
  readonly createdBy: string;
};
