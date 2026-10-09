// lib/modules/asignaciones/domain/conditioning-batch-data.ts
/**
 * Que lineas del reparto tienen ya sus datos de lote. Lo usan Terminar y el detalle, para que el
 * aviso de la pantalla y el rechazo del servidor cuenten lo mismo.
 *
 * La clave es la presentacion: es unica por pedido, y es lo que comparten la linea del reparto y el
 * lote que entro por ella.
 */
import type { FinishedBatchOfOrderLine } from '@/lib/modules/inventario';

/** El lote de cada presentacion del pedido; una presentacion sin lote de produccion no aparece. */
export function batchesByPresentation(
  batches: readonly FinishedBatchOfOrderLine[],
): ReadonlyMap<string, FinishedBatchOfOrderLine> {
  return new Map(batches.map((batch) => [batch.presentationId, batch] as const));
}

/** Los tres datos se escriben juntos y la base no admite produccion sin vencimiento: basta mirar uno. */
export function hasBatchData(batch: FinishedBatchOfOrderLine | undefined): boolean {
  return batch !== undefined && batch.productionDate !== null;
}

/** Cuantas lineas no tienen datos de lote. Una linea sin lote cuenta como sin datos. */
export function missingBatchDataLines(
  lines: readonly { readonly presentationId: string }[],
  batches: readonly FinishedBatchOfOrderLine[],
): number {
  const byPresentation = batchesByPresentation(batches);
  return lines.filter((line) => !hasBatchData(byPresentation.get(line.presentationId))).length;
}
