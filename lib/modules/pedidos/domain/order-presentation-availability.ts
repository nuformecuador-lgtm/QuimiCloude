// lib/modules/pedidos/domain/order-presentation-availability.ts
//
// «Cuanto queda disponible»: lectura pura para el formulario de `/pedidos` (alta, edicion y la
// edicion acotada «Reparto y unidad»). Resuelve con `resolveDistributionLines`, la misma de los
// guardados, y calcula con `validateDistribution`. Nunca rechaza por el reparto: el rechazo lo
// hacen `createOrder`, `updateOrder` y `updateOrderPresentationLines` al guardar.

import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { orderPresentationAvailabilitySchema } from './order-input';
import { validateDistribution, type DistributionResult } from './order-distribution';
import { resolveDistributionLines, type DistributionCatalogs } from './resolve-distribution';

/** Los catalogos del reparto: envases, presentaciones de las lineas antiguas y unidades. */
export type OrderPresentationAvailabilityDeps = DistributionCatalogs;

/**
 * `DistributionResult` mas los dos fallos de RESOLUCION que `validateDistribution` no conoce
 * -recibe `UnitConversion` ya resueltas, no ids-: la unidad del pedido no visible para la
 * empresa, o una linea que nombra una presentacion que no vuelve del catalogo.
 */
export type OrderPresentationAvailability =
  | DistributionResult
  | { readonly kind: 'unit_not_found' }
  | { readonly kind: 'presentation_not_found' };

/** Lo anterior mas el envase que no vuelve del catalogo. */
export type OrderPresentationAvailabilityNext =
  | OrderPresentationAvailability
  | { readonly kind: 'packaging_not_found'; readonly packagingProductId: string };

export function createQuoteOrderPresentationAvailability(
  deps: OrderPresentationAvailabilityDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<OrderPresentationAvailabilityNext> {
  return async function quoteOrderPresentationAvailability(input, actor) {
    requirePermission(actor, 'pedidos.modificar');

    const parsed = orderPresentationAvailabilitySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    // Sin las lineas guardadas: una consulta no rechaza una linea antigua, eso lo hace el guardado.
    const resolution = await resolveDistributionLines(deps, actor.companyId, data.unitId, data.presentationLines);
    switch (resolution.kind) {
      case 'resolved':
        break;
      case 'invalid_lines':
        throw new ValidationError();
      default:
        return resolution;
    }

    // El disponible exacto o la marca de la linea que falla, nunca un rechazo -eso
    // lo hace quien guarda, con la fila del pedido bloqueada.
    return validateDistribution(
      data.quantity,
      resolution.orderUnit,
      resolution.lines.map((line) => line.distribution),
    );
  };
}
