// lib/modules/asignaciones/domain/finished-order-view.ts
import type { OrderResponsible } from './assignment-view';

export type FinishedOrderView = {
  readonly id: string;
  readonly numberText: string;
  /** `null` significa «no se pudo resolver»: la pantalla pinta el marcador de ausencia. */
  readonly recipeName: string | null;
  /** Cadena decimal, nunca `number` (`docs/architecture.md > Anti-patrones`). */
  readonly quantity: string;
  /** `null` = sin presentacion. */
  readonly presentationName: string | null;
  /** `null` = sin fecha de terminado. */
  readonly finishedAt: Date | null;
  /** Todos los responsables del pedido, incluido el propio actor si lo es. */
  readonly responsibles: readonly OrderResponsible[];
};
