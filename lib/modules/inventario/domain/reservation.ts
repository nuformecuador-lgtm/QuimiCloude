// lib/modules/inventario/domain/reservation.ts
//
// Contrato de la reserva de material, visto desde fuera de `inventario`: solo tipos y las dos
// interfaces que otro modulo implementa contra o consume. La implementacion (Prisma, la
// transaccion) vive en los adaptadores driven de este modulo.

import type { MovementReason } from './movement-reason';
import type { ProductId } from './product-catalog';
import type { UnitId } from '@/lib/modules/unidades';

/** Necesidad ya calculada de un ingrediente, en la unidad de la LINEA de receta (no la del
 *  producto): quien reparte por lote es quien convierte. */
export type ReservationRequirementLine = {
  readonly productId: ProductId;
  readonly quantity: string;
  readonly unitId: UnitId;
};

export type ReservationOutcome = { readonly kind: 'reserved' } | { readonly kind: 'not_reserved' };

export type ConsumptionOutcome =
  | { readonly kind: 'consumed' }
  | { readonly kind: 'insufficient'; readonly productIds: readonly ProductId[] };

export type OrderCoverage = 'full' | 'partial' | 'none';

/** Escritura. Siempre dentro de la transaccion que abre quien llama. */
export interface MaterialReservations {
  syncForOrder(input: {
    readonly orderId: string;
    readonly companyId: string;
    readonly requirement: readonly ReservationRequirementLine[];
    readonly actorId: string | null;
    readonly now: Date;
  }): Promise<ReservationOutcome>;

  releaseForOrder(input: {
    readonly orderId: string;
    readonly companyId: string;
    readonly reason: 'release' | 'expire';
    readonly actorId: string | null;
    readonly now: Date;
  }): Promise<void>;

  consumeForOrder(input: {
    readonly orderId: string;
    readonly companyId: string;
    /** Solo se usa si el pedido no tiene nada apartado. */
    readonly fallbackRequirement: readonly ReservationRequirementLine[];
    readonly actorId: string;
    readonly now: Date;
  }): Promise<ConsumptionOutcome>;
}

/** Lectura, fuera de transaccion. */
export interface ReservationQueries {
  findCoverageByOrderIds(
    companyId: string,
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, OrderCoverage>>;
}

/** `inventario` no puede importar `pedidos` (ciclo), asi que declara aqui el HUECO que necesita
 *  para el historial: el numero visible de un pedido. `pedidos` lo implementa y
 *  `lib/composition` lo cabla, con el mismo patron que `people` en `listBatchMovements`. */
export interface OrderNumberDirectory {
  findNumberTexts(companyId: string, orderIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

/** Una fila del historial de un lote: union de `inventory_movements` -el
 *  libro fisico- y `reservation_movements` -el libro de la reserva-, ya resueltos sus nombres. */
export type BatchHistoryEntry = {
  readonly kind: 'opening' | 'adjustment' | 'consumption' | 'reserve' | 'release' | 'expire' | 'consume';
  readonly quantity: string;
  readonly reason: MovementReason | null;
  /** `null` cuando el asiento no viene de un pedido: alta, ajuste. */
  readonly orderNumberText: string | null;
  /** `null` cuando lo hizo el sistema: caducidad, la migracion que aparta los pedidos vivos. */
  readonly authorName: string | null;
  readonly createdAt: string;
};
