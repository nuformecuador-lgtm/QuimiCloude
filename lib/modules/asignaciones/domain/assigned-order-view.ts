// lib/modules/asignaciones/domain/assigned-order-view.ts
/**
 * QC-88 T6 — La proyeccion de SALIDA de `listAssignedOrders` (`design.md > 9.2`; R16-R20).
 *
 * Dominio PURO: sin `zod`, sin `next/*`, sin `@prisma/client` y sin `@/lib/shared/**`.
 *
 * `status` acotado a DOS literales -y no `OrderStatus` completo- no es cosmetico (R11): hace
 * que «se colo un ENTREGADO» sea un error de COMPILACION en quien construya la fila, y no un
 * test que alguien tiene que acordarse de escribir.
 *
 * `OrderResponsible` es el tipo de `asignaciones` (`./assignment-view.ts`), REUTILIZADO y no
 * redefinido: tres claves, sin correo, sin documento y sin estado de cuenta.
 */
import type { OrderPriority } from '@/lib/modules/pedidos';

import type { OrderResponsible } from './assignment-view';

/** Una fila de la lista de trabajo del Operador (R16-R20). */
export type AssignedOrderView = {
  readonly id: string;
  /** `formatOrderNumber`, la UNICA definicion del texto visible (R16). */
  readonly numberText: string;
  /** `null` -> marcador de ausencia de la pantalla, NUNCA el identificador tecnico (R17). */
  readonly recipeName: string | null;
  /** Cadena decimal, nunca `number` (`docs/architecture.md > Anti-patrones`). */
  readonly quantity: string;
  readonly priority: OrderPriority;
  /** El TIPO impide expresar un estado final: «se colo un ENTREGADO» no compila (R11). */
  readonly status: 'PENDIENTE' | 'EN_CURSO';
  /** Sin el propio actor (R20). */
  readonly otherResponsibles: readonly OrderResponsible[];
};
