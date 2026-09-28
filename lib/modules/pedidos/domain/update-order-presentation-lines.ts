// lib/modules/pedidos/domain/update-order-presentation-lines.ts — R7, R11-R14, R35, R36, R38,
// R41, R42, R46, R48, [D3'].
//
// Edicion ACOTADA del reparto y la unidad del pedido, aparte de `updateOrder` (`design.md > 4.2`):
// [D2']/[D3'] permiten tocar reparto y unidad hasta Comenzar empaque, `POR_EMPACAR` incluido,
// donde `updateOrder` no deja tocar nada (R32, `ALLOWED.POR_EMPACAR` sin «quedarse
// igual»). Por eso este caso de uso NO pasa por `assertTransition`: `REPARTO_EDITABLE_STATUSES`
// es su propia ventana de estados, deliberadamente distinta de la matriz de transiciones.
//
// La AUTORIZACION (`pedidos.modificar`) la comprueba QUIEN LLAMA (T25), no este caso de uso —
// mismo criterio que `finishAssignedOrder` con `startAssignedOrder`—: solo hay un llamador.
//
// No abre la unidad de trabajo compartida con `inventario` (R30, R46): no toca `quantity`, la
// receta ni la reserva. La transaccion la abre `OrderDistributionTransaction`, mas corta que
// `OrderUnitOfWork`.

import { validateDistribution, type DistributionLine } from './order-distribution';
import type { OrderStatus } from './order-classification';
import type { OrderScope } from './order-scope';
import type { OrderPresentationLineWrite } from './order-view';
import type { PresentationLineInput } from './resolve-distribution';

import type { PresentationCatalog } from '@/lib/modules/inventario';
import type { UnitCatalog } from '@/lib/modules/unidades';

import type { OrderDistributionTransaction } from '../ports/order-distribution-transaction';

/**
 * [D3']: el reparto y la unidad se pueden editar hasta Comenzar empaque. `'BLOQUEADO'` se anade
 * SOLO si T0 lo encuentra en el enum de `db/schema.prisma`; `design.md > 13` (C5)
 * confirma que hoy no existe, asi que esta lista queda sin condicional para ese caso futuro.
 */
export const REPARTO_EDITABLE_STATUSES: readonly OrderStatus[] = [
  'PENDIENTE',
  'EN_CURSO',
  'POR_EMPACAR',
];

export type UpdateOrderPresentationLinesInput = {
  readonly unitId: string;
  readonly lines: readonly PresentationLineInput[];
};

/**
 * Discriminado, NO lanzado (`design.md > 4.2`): a diferencia de `createOrder`/`updateOrder`, que
 * dejan subir los errores de `resolveDistribution`, este caso de uso devuelve el resultado para
 * que quien llama (T25) lo traduzca a su codigo. El orden de las comprobaciones es el de
 * `design.md > 4.2`: `not_found` -> `not_editable` -> `unit_not_found` -> `without_unit` ->
 * `presentation_not_found` -> `presentation_without_content` -> `incompatible_units` ->
 * `exceeds_quantity` -> escribir. El primer fallo aborta SIN escribir nada, ni la unidad ni las
 * lineas.
 */
export type UpdateOrderPresentationLinesResult =
  | 'ok'
  | 'not_found'
  | 'not_editable'
  | 'unit_not_found'
  | 'without_unit'
  | 'presentation_not_found'
  | 'presentation_without_content'
  | 'incompatible_units'
  | 'exceeds_quantity';

export type UpdateOrderPresentationLinesDeps = {
  /** Contrato PUBLICO de `inventario`: las presentaciones del reparto nuevo. */
  readonly presentations: PresentationCatalog;
  /** Contrato PUBLICO de `unidades`: la unidad nueva del pedido y las de cada presentacion. */
  readonly units: UnitCatalog;
  readonly transaction: OrderDistributionTransaction;
  /** Ver el comentario identico de `create-order.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

export function createUpdateOrderPresentationLines(
  deps: UpdateOrderPresentationLinesDeps,
): (
  orderId: string,
  companyId: string,
  actorId: string,
  input: UpdateOrderPresentationLinesInput,
) => Promise<UpdateOrderPresentationLinesResult> {
  const now = deps.now ?? (() => new Date());

  return async function updateOrderPresentationLines(orderId, companyId, actorId, input) {
    const scope: OrderScope = { companyId };
    const instant = now();

    return deps.transaction.run(async (orders) => {
      // R37, R48: la fila se bloquea ANTES de leer o escribir nada mas, asi que Comenzar y este
      // guardado se serializan sobre la MISMA fila (`design.md > 4.5`).
      const locked = await orders.lockAliveById(orderId, scope);
      if (locked === null) return 'not_found';

      if (!REPARTO_EDITABLE_STATUSES.includes(locked.status)) return 'not_editable';

      // R41: la unidad NUEVA tiene que ser visible para la empresa de quien edita. Se resuelve
      // ANTES que las presentaciones (`design.md > 4.2`): sin unidad de pedido no hay a que
      // convertir ninguna linea.
      const [orderUnitRef] = await deps.units.findRefs([input.unitId], companyId);
      if (orderUnitRef === undefined) return 'unit_not_found';

      const presentationIds = input.lines.map((line) => line.presentationId);
      const presentationRefs =
        presentationIds.length === 0
          ? []
          : await deps.presentations.findRefs(presentationIds, companyId);
      if (presentationRefs.length !== presentationIds.length) return 'presentation_not_found';
      const presentationById = new Map(presentationRefs.map((ref) => [ref.id, ref] as const));

      // Unidades de las presentaciones: UNA sola llamada mas, con los ids UNICOS que le falten
      // al mapa que ya tiene la unidad del pedido (`design.md > 2.2 bis`).
      const missingUnitIds = [
        ...new Set(presentationRefs.map((ref) => ref.unitId).filter((id) => id !== input.unitId)),
      ];
      const presentationUnitRefs =
        missingUnitIds.length === 0 ? [] : await deps.units.findRefs(missingUnitIds, companyId);
      const unitById = new Map(
        [orderUnitRef, ...presentationUnitRefs].map((ref) => [ref.id, ref] as const),
      );

      const distributionLines: DistributionLine[] = [];
      for (const line of input.lines) {
        const presentation = presentationById.get(line.presentationId);
        // Defensa: ya se comprobo arriba que TODAS las presentaciones pedidas volvieron del
        // catalogo, asi que esto nunca deberia disparar.
        if (presentation === undefined) return 'presentation_not_found';
        const presentationUnit = unitById.get(presentation.unitId);
        // Defensa: un catalogo de presentaciones consistente nunca apunta a una unidad que
        // `unidades` no conozca.
        if (presentationUnit === undefined) return 'unit_not_found';
        distributionLines.push({
          presentationId: line.presentationId,
          packages: line.packages,
          content: presentation.content,
          unit: presentationUnit,
        });
      }

      // R5-R8, R35, R36, R38, R42: el disponible o el primer fallo, con la CANTIDAD del pedido
      // ya bloqueado -este caso de uso no la cambia-.
      const result = validateDistribution(locked.quantity, orderUnitRef, distributionLines);
      switch (result.kind) {
        case 'without_unit':
          return 'without_unit';
        case 'presentation_without_content':
          return 'presentation_without_content';
        case 'incompatible_units':
          return 'incompatible_units';
        case 'exceeds_quantity':
          return 'exceeds_quantity';
        case 'ok':
          break;
      }

      const writeLines: readonly OrderPresentationLineWrite[] = distributionLines.map((line) => ({
        presentationId: line.presentationId,
        packages: line.packages,
        content: line.content,
      }));

      const outcome = await orders.updatePresentationLinesAlive(
        orderId,
        input.unitId,
        writeLines,
        actorId,
        instant,
        scope,
      );
      // La fila esta bloqueada desde `lockAliveById` en ESTA misma transaccion: `'not_found'`
      // aqui significaria que otra conexion la borro pese al bloqueo, algo que Postgres no
      // permite. Se traduce igual, sin distinguirlo, en vez de lanzar un `Error` que nadie pide.
      return outcome === 'ok' ? 'ok' : 'not_found';
    });
  };
}
