// lib/modules/asignaciones/domain/finished-order-view.ts
import type { OrderResponsible } from './assignment-view';
import type { OrderDistributionLineView } from './order-distribution-view';

export type FinishedOrderView = {
  readonly id: string;
  readonly numberText: string;
  /** `null` significa «no se pudo resolver»: la pantalla pinta el marcador de ausencia. */
  readonly recipeName: string | null;
  /** Cadena decimal, nunca `number` (`docs/architecture.md > Anti-patrones`). */
  readonly quantity: string;
  /** El reparto en orden de alta; vacio = «Sin presentacion». Solo lectura. */
  readonly presentationLines: readonly OrderDistributionLineView[];
  /** La unidad de `quantity`; los dos `null` = pedido sin unidad, la cifra va sola. */
  readonly unitId: string | null;
  readonly unitLabel: string | null;
  /** `null` = sin fecha de terminado. */
  readonly finishedAt: Date | null;
  /** Todos los responsables del pedido, incluido el propio actor si lo es. */
  readonly responsibles: readonly OrderResponsible[];
};
