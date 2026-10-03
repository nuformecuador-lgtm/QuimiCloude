// lib/modules/pedidos/domain/update-order-presentation-lines.ts
//
// Edicion ACOTADA del reparto y la unidad del pedido, aparte de `updateOrder`:
// se permite tocar reparto y unidad hasta Comenzar empaque, `POR_EMPACAR` incluido,
// donde `updateOrder` no deja tocar nada (`ALLOWED.POR_EMPACAR` sin «quedarse
// igual»). Por eso este caso de uso NO pasa por `assertTransition`: `REPARTO_EDITABLE_STATUSES`
// es su propia ventana de estados, deliberadamente distinta de la matriz de transiciones.
//
// La AUTORIZACION (`pedidos.modificar`) la comprueba QUIEN LLAMA
// (`updateOrderDistributionAction`), no este caso de uso —mismo criterio que
// `finishAssignedOrder` con `startAssignedOrder`—: solo hay un llamador.
//
// No abre la unidad de trabajo compartida con `inventario`: no toca `quantity`, la
// receta ni la reserva. La transaccion la abre `OrderDistributionTransaction`, mas corta que
// `OrderUnitOfWork`.

import type { Actor } from './actor';
import { validateDistribution } from './order-distribution';
import type { OrderStatus } from './order-classification';
import type { OrderScope } from './order-scope';
import {
  resolveDistributionLines,
  type DistributionCatalogs,
  type DistributionLineInput,
} from './resolve-distribution';

import type { OrderDistributionTransaction } from '../ports/order-distribution-transaction';

/**
 * El reparto y la unidad se pueden editar hasta Comenzar empaque. `'BLOQUEADO'` entra porque
 * QC-138 lo anadio al enum (R9, R11): el bloqueo es por material y el reparto no participa en la
 * reserva (R30).
 */
export const REPARTO_EDITABLE_STATUSES: readonly OrderStatus[] = [
  'PENDIENTE',
  'EN_CURSO',
  'POR_EMPACAR',
  'BLOQUEADO',
];

export type UpdateOrderPresentationLinesInput = {
  readonly unitId: string;
  readonly lines: readonly DistributionLineInput[];
};

/**
 * Discriminado, NO lanzado: a diferencia de `createOrder`/`updateOrder`, que
 * dejan subir los errores de `resolveDistribution`, este caso de uso devuelve el resultado para
 * que quien llama lo traduzca a su codigo. El primer fallo aborta SIN escribir nada, ni la
 * unidad ni las lineas. `invalid_lines`: dos lineas con la misma presentacion, o una linea
 * antigua que el pedido no tenia tal cual.
 */
export type UpdateOrderPresentationLinesResult =
  | 'ok'
  | 'not_found'
  | 'not_editable'
  | 'unit_not_found'
  | 'without_unit'
  | 'presentation_not_found'
  | 'packaging_not_found'
  | 'invalid_lines'
  | 'presentation_without_content'
  | 'incompatible_units'
  | 'exceeds_quantity';

export type UpdateOrderPresentationLinesDeps = DistributionCatalogs & {
  readonly transaction: OrderDistributionTransaction;
  /** Ver el comentario identico de `create-order.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

export function createUpdateOrderPresentationLines(
  deps: UpdateOrderPresentationLinesDeps,
): (
  orderId: string,
  actor: Actor,
  input: UpdateOrderPresentationLinesInput,
) => Promise<UpdateOrderPresentationLinesResult> {
  const now = deps.now ?? (() => new Date());

  return async function updateOrderPresentationLines(orderId, actor, input) {
    const companyId = actor.companyId;
    const actorId = actor.id;
    const scope: OrderScope = { companyId };
    const instant = now();

    return deps.transaction.run(async (orders) => {
      // La fila se bloquea ANTES de leer o escribir nada mas, asi que Comenzar y este
      // guardado se serializan sobre la MISMA fila.
      const locked = await orders.lockAliveById(orderId, scope);
      if (locked === null) return 'not_found';

      if (!REPARTO_EDITABLE_STATUSES.includes(locked.status)) return 'not_editable';

      // Una linea antigua solo se conserva si llega igual que una de las que el pedido ya tiene.
      const resolution = await resolveDistributionLines(deps, companyId, input.unitId, input.lines, {
        savedLines: locked.presentationLines,
      });
      if (resolution.kind !== 'resolved') return resolution.kind;

      // El disponible o el primer fallo, con la CANTIDAD del pedido
      // ya bloqueado -este caso de uso no la cambia-.
      const result = validateDistribution(
        locked.quantity,
        resolution.orderUnit,
        resolution.lines.map((line) => line.distribution),
      );
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

      const writeLines = resolution.lines.map((line) => line.write);

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
