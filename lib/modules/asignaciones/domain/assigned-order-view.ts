// lib/modules/asignaciones/domain/assigned-order-view.ts
import type { OrderPriority } from '@/lib/modules/pedidos';

import type { OrderResponsible } from './assignment-view';

export type AssignedOrderView = {
  readonly id: string;
  readonly numberText: string;
  /** `null` significa «no se pudo resolver»: la pantalla pinta el marcador de ausencia. */
  readonly recipeName: string | null;
  /** Cadena decimal, nunca `number` (`docs/architecture.md > Anti-patrones`). */
  readonly quantity: string;
  readonly priority: OrderPriority;
  /** Dos literales y no `OrderStatus`: colar un estado final deja de compilar. */
  readonly status: 'PENDIENTE' | 'EN_CURSO';
  /** Sin el propio actor. */
  readonly otherResponsibles: readonly OrderResponsible[];
  /** `null` = sin presentacion. Solo lectura: el Operador no tiene forma de cambiarla. */
  readonly presentationName: string | null;
};
