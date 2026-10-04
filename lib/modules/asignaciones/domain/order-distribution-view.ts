// lib/modules/asignaciones/domain/order-distribution-view.ts
/**
 * El reparto del pedido y la etiqueta de su unidad tal como los leen las vistas de este modulo.
 * Solo lectura: `asignaciones` no tiene ninguna forma de escribir ni el reparto ni la unidad.
 */
import type { AssignedOrderPresentationLine } from '@/lib/modules/pedidos';
import type { UnitRef } from '@/lib/modules/unidades';

export type OrderDistributionLineView = {
  readonly presentationId: string;
  /** `null` = la presentacion no volvio del catalogo: la pantalla pinta el marcador de ausencia. */
  readonly presentationName: string | null;
  readonly packages: number;
  /** `null` = linea antigua o envase que no volvio: la pantalla cae al nombre de la presentacion. */
  readonly packagingName: string | null;
};

/** Los ids unicos de las presentaciones de todas las lineas, para resolverlos en una sola llamada. */
export function distributionPresentationIds(
  orders: readonly { readonly presentationLines: readonly AssignedOrderPresentationLine[] }[],
): string[] {
  return [
    ...new Set(orders.flatMap((order) => order.presentationLines.map((line) => line.presentationId))),
  ];
}

/** Conserva el orden en que llegan las lineas: el de alta, que es el que fija `pedidos`. */
export function toDistributionLines(
  lines: readonly AssignedOrderPresentationLine[],
  presentationNames: ReadonlyMap<string, string>,
): readonly OrderDistributionLineView[] {
  return lines.map((line) => ({
    presentationId: line.presentationId,
    presentationName: presentationNames.get(line.presentationId) ?? null,
    packages: line.packages,
    packagingName: line.packagingName,
  }));
}

/** El simbolo de la unidad, o su nombre si no lo tiene. Mismo criterio que la ficha de pedidos,
 *  que no lo publica en su contrato. */
export function unitLabelOf(unit: Pick<UnitRef, 'name' | 'symbol'>): string {
  return unit.symbol ?? unit.name;
}
