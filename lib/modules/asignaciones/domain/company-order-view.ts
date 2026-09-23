// lib/modules/asignaciones/domain/company-order-view.ts
import type { OrderPriority, OrderStatus } from '@/lib/modules/pedidos';

import type { OrderResponsible } from './assignment-view';

export type CompanyOrderView = {
  readonly id: string;
  readonly numberText: string;
  /** `null` significa «no se pudo resolver»: la pantalla pinta el marcador de ausencia. */
  readonly recipeName: string | null;
  /** Cadena decimal, nunca `number` (`docs/architecture.md > Anti-patrones`). */
  readonly quantity: string;
  /** `null` = sin presentacion. */
  readonly presentationName: string | null;
  readonly priority: OrderPriority;
  readonly status: OrderStatus;
  /** Todos los responsables del pedido, incluido el propio actor si lo es. */
  readonly responsibles: readonly OrderResponsible[];
  /** Siempre viaja; la columna solo se pinta con el filtro exactamente ENTREGADO. */
  readonly finishedAt: Date | null;
};
