// lib/modules/pedidos/domain/order-presentation-availability.ts
//
// «Cuanto queda disponible»: lectura pura para el formulario de `/pedidos` (alta, edicion y la
// edicion acotada de T25). Resuelve unidad y presentaciones contra los catalogos -mismo patron
// de dos llamadas de `resolve-distribution.ts`-, y REUTILIZA `validateDistribution` (T20) para
// el calculo. A diferencia de `resolveDistribution` (que lanza y detiene el guardado), esta
// funcion NUNCA lanza por el reparto: es de solo lectura, el rechazo lo hacen `createOrder`,
// `updateOrder` y `updateOrderPresentationLines` al guardar.

import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { orderPresentationAvailabilitySchema } from './order-input';
import { validateDistribution, type DistributionLine, type DistributionResult } from './order-distribution';

import type { PresentationCatalog } from '@/lib/modules/inventario';
import type { UnitCatalog } from '@/lib/modules/unidades';

export type OrderPresentationAvailabilityDeps = {
  /** Contrato PUBLICO de `inventario`: las presentaciones del reparto que se esta editando. */
  readonly presentations: PresentationCatalog;
  /** Contrato PUBLICO de `unidades`: la unidad del pedido y la de cada presentacion distinta. */
  readonly units: UnitCatalog;
};

/**
 * `DistributionResult` mas los dos fallos de RESOLUCION que `validateDistribution` no conoce
 * -recibe `UnitConversion` ya resueltas, no ids-: la unidad del pedido no visible para la
 * empresa, o una linea que nombra una presentacion que no vuelve del catalogo.
 */
export type OrderPresentationAvailability =
  | DistributionResult
  | { readonly kind: 'unit_not_found' }
  | { readonly kind: 'presentation_not_found' };

export function createQuoteOrderPresentationAvailability(
  deps: OrderPresentationAvailabilityDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<OrderPresentationAvailability> {
  return async function quoteOrderPresentationAvailability(input, actor) {
    requirePermission(actor, 'pedidos.modificar');

    const parsed = orderPresentationAvailabilitySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    const [orderUnitRef] = await deps.units.findRefs([data.unitId], actor.companyId);
    if (orderUnitRef === undefined) return { kind: 'unit_not_found' };

    const presentationIds = data.presentationLines.map((line) => line.presentationId);
    const presentationRefs =
      presentationIds.length === 0
        ? []
        : await deps.presentations.findRefs(presentationIds, actor.companyId);
    if (presentationRefs.length !== presentationIds.length) return { kind: 'presentation_not_found' };
    const presentationById = new Map(presentationRefs.map((ref) => [ref.id, ref] as const));

    // Unidades de las presentaciones: UNA sola llamada mas, con los ids UNICOS que le falten al
    // mapa que ya tiene la unidad del pedido (mismo patron que `updateOrderPresentationLines`).
    const missingUnitIds = [
      ...new Set(presentationRefs.map((ref) => ref.unitId).filter((id) => id !== data.unitId)),
    ];
    const presentationUnitRefs =
      missingUnitIds.length === 0 ? [] : await deps.units.findRefs(missingUnitIds, actor.companyId);
    const unitById = new Map(
      [orderUnitRef, ...presentationUnitRefs].map((ref) => [ref.id, ref] as const),
    );

    const distributionLines: DistributionLine[] = [];
    for (const line of data.presentationLines) {
      const presentation = presentationById.get(line.presentationId);
      // Defensa: ya se comprobo arriba que TODAS las presentaciones pedidas volvieron del
      // catalogo, asi que esto nunca deberia disparar.
      if (presentation === undefined) return { kind: 'presentation_not_found' };
      const presentationUnit = unitById.get(presentation.unitId);
      // Defensa: un catalogo de presentaciones consistente nunca apunta a una unidad que
      // `unidades` no conozca.
      if (presentationUnit === undefined) return { kind: 'unit_not_found' };
      distributionLines.push({
        presentationId: line.presentationId,
        packages: line.packages,
        content: presentation.content,
        unit: presentationUnit,
      });
    }

    // El disponible exacto o la marca de la linea que falla, nunca un rechazo -eso
    // lo hace quien guarda, con la fila del pedido bloqueada.
    return validateDistribution(data.quantity, orderUnitRef, distributionLines);
  };
}
