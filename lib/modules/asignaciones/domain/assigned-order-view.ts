// lib/modules/asignaciones/domain/assigned-order-view.ts
import type { OrderPriority } from '@/lib/modules/pedidos';

import type { OrderResponsible } from './assignment-view';
import type { OrderDistributionLineView } from './order-distribution-view';

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
  /** El reparto en orden de alta; vacio = «Sin presentacion». Solo lectura. */
  readonly presentationLines: readonly OrderDistributionLineView[];
  /** La unidad de `quantity`; los dos `null` = pedido sin unidad, la cifra va sola. */
  readonly unitId: string | null;
  readonly unitLabel: string | null;
};
