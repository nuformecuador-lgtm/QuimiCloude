// lib/modules/pedidos/domain/review-blocked-orders.ts
/**
 * Revisa los pedidos `BLOQUEADO` de una empresa despues de que entre material y desbloquea los
 * que ya alcanzan: aparta, pasa a `PENDIENTE`, fija `reserved_at` y sustituye el importe.
 *
 * Del mas antiguo al mas nuevo, para que el material que entra se aparte antes para el que lleva
 * mas tiempo esperando. Cada pedido va en su propia transaccion: un fallo deja ese pedido como
 * estaba, queda en `failed` y la revision sigue con el siguiente.
 *
 * Sin actor ni permiso, como la caducidad: lo dispara el sistema despues de una operacion de
 * inventario que ya exigio el suyo, y lo escrito queda sin autor.
 */
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';

import { OrderNotFoundError } from './errors';
import { buildRequirement } from './order-requirement';
import { resolveIngredientsCost } from './resolve-ingredients-cost';

import type { OrderScope } from './order-scope';
import type { ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';
import type { OrderRepository } from '../ports/order-repository';
import type { OrderUnitOfWork } from '../ports/order-unit-of-work';

export type ReviewBlockedOrdersDeps = {
  readonly orders: Pick<OrderRepository, 'findBlockedIds' | 'findAliveById'>;
  readonly recipes: RecipeCatalog;
  readonly products: ProductCatalog;
  readonly units: UnitCatalog;
  readonly unitOfWork: OrderUnitOfWork;
};

export type ReviewBlockedOrdersInput = {
  readonly companyId: string;
  readonly now: Date;
};

/** Sin mensaje ni datos del pedido: solo su identificador y el codigo del catalogo. */
export type BlockedOrderReviewFailure = {
  readonly orderId: string;
  readonly code: string;
};

export type ReviewBlockedOrdersResult = {
  readonly unblocked: number;
  readonly failed: readonly BlockedOrderReviewFailure[];
};

function codeOf(error: unknown): string {
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code;
  }
  return UNEXPECTED_ERROR_CODE;
}

export function createReviewBlockedOrders(
  deps: ReviewBlockedOrdersDeps,
): (input: ReviewBlockedOrdersInput) => Promise<ReviewBlockedOrdersResult> {
  return async function reviewBlockedOrders(
    input: ReviewBlockedOrdersInput,
  ): Promise<ReviewBlockedOrdersResult> {
    const { companyId, now } = input;
    const scope: OrderScope = { companyId };

    const ids = await deps.orders.findBlockedIds(scope);

    let unblocked = 0;
    const failed: BlockedOrderReviewFailure[] = [];

    for (const id of ids) {
      try {
        if (await reviewOne(deps, id, scope, now)) unblocked += 1;
      } catch (e) {
        failed.push({ orderId: id, code: codeOf(e) });
      }
    }

    return { unblocked, failed };
  };
}

async function reviewOne(
  deps: ReviewBlockedOrdersDeps,
  id: string,
  scope: OrderScope,
  now: Date,
): Promise<boolean> {
  const row = await deps.orders.findAliveById(id, scope);
  if (row === null || row.status !== 'BLOQUEADO') return false;

  // Fuera de la transaccion, igual que en la edicion: el pedido no tiene nada apartado, asi que
  // es el coste con el disponible general de este instante.
  const ingredientsCost = await resolveIngredientsCost(
    deps.recipes,
    deps.products,
    deps.units,
    row.recipeId,
    row.quantity,
    scope.companyId,
    { orderId: id },
  );

  return deps.unitOfWork.run(async (transaction) => {
    const locked = await transaction.orders.lockAliveById(id, scope);
    // Otra operacion lo cancelo, lo desbloqueo o lo borro entre la lista y el candado. Si lo
    // editaron sin desbloquearlo, el importe calculado ya no es el suyo: se deja para la
    // siguiente revision.
    if (
      locked === null ||
      locked.status !== 'BLOQUEADO' ||
      locked.recipeId !== row.recipeId ||
      locked.quantity !== row.quantity
    ) {
      return false;
    }

    const content = await transaction.recipes.findExecutionContentById(locked.recipeId, scope.companyId);
    const requirement = buildRequirement(content?.lines ?? [], locked.quantity);

    const outcome = await transaction.reservations.syncForOrder({
      orderId: id,
      companyId: scope.companyId,
      requirement,
      actorId: null,
      now,
    });
    if (outcome.kind === 'insufficient') return false;

    const moved = await transaction.orders.setStatus(id, 'BLOQUEADO', 'PENDIENTE', null, now, scope);
    // Con la fila bloqueada no deberia pasar; si pasa, lanzar deshace lo apartado.
    if (moved !== 'ok') throw new OrderNotFoundError();

    const costed = await transaction.orders.setIngredientsCost(id, ingredientsCost, null, now, scope);
    if (costed !== 'ok') throw new OrderNotFoundError();

    await transaction.orders.setReservedAt(id, outcome.kind === 'reserved' ? now : null, scope);
    return true;
  });
}
