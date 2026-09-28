// lib/modules/pedidos/domain/resolve-distribution.ts — R6, R7, R35, R36, R41, R42.
//
// El paso compartido de `createOrder` y `updateOrder`: resuelve las lineas del reparto que
// llegaron del borde contra el catalogo de presentaciones y el de unidades, corre
// `validateDistribution` (dominio puro, `order-distribution.ts`) y traduce su primer fallo al
// error de `pedidos` que le corresponde. No abre transaccion ni bloquea nada: quien llama ya
// decide donde encaja esta llamada dentro de la suya.

import {
  IncompatibleUnitsError,
  OrderDistributionExceedsQuantityError,
  OrderWithoutUnitError,
  PresentationNotFoundError,
  PresentationWithoutContentError,
  UnitNotFoundError,
} from './errors';
import { validateDistribution, type DistributionLine } from './order-distribution';

import type { PresentationCatalog } from '@/lib/modules/inventario';
import type { UnitCatalog } from '@/lib/modules/unidades';

import type { OrderPresentationLineWrite } from './order-view';

/** Una linea tal como sale del esquema del borde: solo la presentacion elegida y los envases. */
export type PresentationLineInput = {
  readonly presentationId: string;
  readonly packages: number;
};

/**
 * Resuelve, valida y traduce. Sin fallo, devuelve las lineas YA con el contenido copiado en
 * este instante (R3) y listas para el puerto de escritura. Con fallo, lanza sin haber devuelto
 * nada: quien llama no escribe ni la unidad ni las lineas.
 */
export async function resolveDistribution(
  presentations: PresentationCatalog,
  units: UnitCatalog,
  companyId: string,
  quantity: string,
  unitId: string,
  lines: readonly PresentationLineInput[],
): Promise<readonly OrderPresentationLineWrite[]> {
  const presentationIds = lines.map((line) => line.presentationId);
  const presentationRefs =
    presentationIds.length === 0 ? [] : await presentations.findRefs(presentationIds, companyId);
  if (presentationRefs.length !== presentationIds.length) throw new PresentationNotFoundError();
  const presentationById = new Map(presentationRefs.map((ref) => [ref.id, ref] as const));

  // UNA sola llamada al catalogo de unidades, con los ids UNICOS que hacen falta: la del pedido
  // y la de cada presentacion distinta del reparto (`design.md > 2.2 bis`).
  const unitIds = [...new Set([unitId, ...presentationRefs.map((ref) => ref.unitId)])];
  const unitById = new Map((await units.findRefs(unitIds, companyId)).map((ref) => [ref.id, ref] as const));

  const orderUnit = unitById.get(unitId);
  if (orderUnit === undefined) throw new UnitNotFoundError();

  const resolved = lines.map((line) => {
    const presentation = presentationById.get(line.presentationId);
    if (presentation === undefined) throw new PresentationNotFoundError();
    const presentationUnit = unitById.get(presentation.unitId);
    if (presentationUnit === undefined) throw new UnitNotFoundError();
    const write: OrderPresentationLineWrite = {
      presentationId: line.presentationId,
      packages: line.packages,
      content: presentation.content,
    };
    const distribution: DistributionLine = { ...write, unit: presentationUnit };
    return { write, distribution };
  });

  const result = validateDistribution(quantity, orderUnit, resolved.map((line) => line.distribution));
  switch (result.kind) {
    case 'ok':
      break;
    case 'without_unit':
      throw new OrderWithoutUnitError();
    case 'presentation_without_content':
      throw new PresentationWithoutContentError(result.presentationId);
    case 'incompatible_units':
      throw new IncompatibleUnitsError(result.presentationId);
    case 'exceeds_quantity':
      throw new OrderDistributionExceedsQuantityError(result.available);
  }

  return resolved.map((line) => line.write);
}
