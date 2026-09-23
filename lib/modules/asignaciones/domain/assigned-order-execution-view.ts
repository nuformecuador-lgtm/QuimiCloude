// lib/modules/asignaciones/domain/assigned-order-execution-view.ts
import type { RecipeStepView } from '@/lib/modules/recetas';
import type { UnitRef } from '@/lib/modules/unidades';

/**
 * Proyeccion cerrada de la pantalla de ejecucion. Sin autoria, sin marcas de tiempo y sin
 * existencia de producto: lo que no esta en el tipo no se puede filtrar por descuido.
 */
export type AssignedOrderExecutionView = {
  readonly orderId: string;
  readonly numberText: string;
  readonly status: 'PENDIENTE' | 'EN_CURSO';
  /** `null` = receta dada de baja o no resuelta. */
  readonly recipeName: string | null;
  /** Cadena decimal, nunca `number`. */
  readonly orderQuantity: string;
  readonly steps: readonly RecipeStepView[];
  readonly lines: readonly ExecutionLineView[];
};

export type ExecutionLineView = {
  readonly productName: string | null;
  /** "10.00" */
  readonly percentage: string;
  /** `consumedQuantity(orderQuantity, percentage)`. */
  readonly quantity: string;
  /** La del insumo; `null` = sin lotes o dado de baja. */
  readonly unit: UnitRef | null;
  /** Misma base efectiva que `unit`, sin ella misma; vacio si `unit` es `null`. */
  readonly alternativeUnits: readonly UnitRef[];
};
