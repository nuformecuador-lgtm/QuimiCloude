import { requirePermission, type Actor } from './actor';
import {
  InsufficientMaterialError,
  OrderNotFoundError,
  OrderWouldBlockError,
  ValidationError,
} from './errors';
import type { OrderStatus } from './order-classification';
import { updateOrderSchema } from './order-input';
import { orderRecipeIds, requireOrderRecipe } from './order-recipe';
import { buildOrderRequirement } from './order-requirement';
import { packagingLinesOfInput, resolveDistribution } from './resolve-distribution';
import type { OrderScope } from './order-scope';
import { assertTransition } from './order-transitions';
import { resolveStoredOrderCost } from './resolve-ingredients-cost';

import type { PackagingCatalog, PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import type { OrderUnitOfWork } from '../ports/order-unit-of-work';
import type { OrderRepository } from '../ports/order-repository';
import type { OrderWriteRepository } from '../ports/order-write-repository';

/** Recupera `products` y `units` porque cada escritura recalcula el coste de los ingredientes:
 *  hace falta leer los lotes disponibles y convertir entre la unidad de la receta y la del
 *  lote. `orders` sigue siendo `OrderRepository`: solo lee la fila previa. La escritura y el
 *  apartado viven en `unitOfWork`. */
export type UpdateOrderDeps = {
  readonly orders: OrderRepository;
  readonly recipes: RecipeCatalog;
  readonly products: ProductCatalog;
  readonly units: UnitCatalog;
  /** Contrato PUBLICO de `inventario`: las presentaciones del reparto. No se le pasan al
   *  coste, ver el comentario identico de `create-order.ts`. */
  readonly presentations: PresentationCatalog;
  /** Contrato PUBLICO de `inventario`: los envases del reparto y su presentacion fija. */
  readonly packaging: PackagingCatalog;
  readonly unitOfWork: OrderUnitOfWork;
  /** Ver el comentario identico de `create-order.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Edicion de pedido.
 *
 * REEMPLAZO COMPLETO del conjunto de datos de negocio (R20), como QC-25 y QC-43: no hay
 * edicion parcial campo a campo. Es la pregunta abierta 5 del spec, con su posicion por
 * defecto escrita y su coste (subir la prioridad obliga a reenviar todo el pedido).
 *
 * `status` muere ANTES, en `updateOrderSchema`: la edicion no puede ni EXPRESAR un cambio
 * de estado, porque `updateOrderSchema` no lo declara y `OrderEdit` no tiene el campo.
 *
 * R6: el actor queda como autor de la ULTIMA MODIFICACION y el de creacion NO se toca. Esa
 * mitad la cierra el adaptador -`data` no lleva `createdBy` y el `UPDATE` tampoco-, y su
 * prueba real es la de integracion.
 *
 * La transicion se comprueba DOS VECES: aqui, sobre la lectura previa, para fallar rapido sin
 * abrir la transaccion; y otra vez dentro de `unitOfWork.run`, sobre la fila que acaba de
 * bloquear `lockAliveById`, porque otra operacion pudo moverla entre las dos lecturas.
 *
 * La edicion no consume: recalcula lo apartado con los datos nuevos y sincroniza el libro,
 * nunca lo baja de existencia. Consumir de verdad es cosa del Finalizar de la planta
 * (`transition-order.ts`), el unico camino a `ENTREGADO`.
 */
export function createUpdateOrder(
  deps: UpdateOrderDeps,
): (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function updateOrder(
    id: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'pedidos.modificar');

    // La empresa sale del ACTOR y jamas de la entrada: nadie puede elegir consultar otra.
    const scope: OrderScope = { companyId: actor.companyId };

    const parsed = updateOrderSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { confirmBlocked, ...data } = parsed.data;

    // R33: no existe y ya esta borrado son el mismo caso. La comprobacion de estado se hace
    // sobre la fila que se acaba de leer y NO en el `where` del `UPDATE` (`design.md > 7.4`):
    // si viviera en el `where`, «no existe» y «esta entregado» devolverian lo mismo y el
    // usuario recibiria `not_found` ante un pedido que esta viendo en pantalla.
    const row = await deps.orders.findAliveById(id, scope);
    if (row === null) throw new OrderNotFoundError();

    // La edicion ya no mueve el estado, asi que la comprobacion es «¿puede el pedido
    // quedarse en el mismo estado?» -legal en `PENDIENTE`/`EN_CURSO`, vacio en los finales-.
    // Va antes de preguntar a los catalogos: una edicion rechazada no lee nada mas y no
    // modifica ninguna fila.
    assertTransition(row.status, row.status);

    // Si la receta del pedido no cambia se acepta aunque este dada de baja o por revisar:
    // corregir la cantidad de un pedido viejo no puede obligar a cambiarle la formula. Si
    // cambia, se exige lo mismo que en el alta.
    let effectiveId = data.recipeVersionId ?? data.recipeId;
    if (effectiveId !== row.recipeId) {
      const refs = await deps.recipes.findRefsIncludingDeleted(
        orderRecipeIds(data.recipeId, data.recipeVersionId),
        actor.companyId,
      );
      effectiveId = requireOrderRecipe(refs, data.recipeId, data.recipeVersionId);
    }

    // El coste se recalcula con la receta del DATO ENTRANTE, no con la de la fila vieja: una
    // edicion que solo cambia la cantidad o la prioridad tambien reescribe el importe con los
    // lotes de HOY. `orderId: id` cuenta lo que este mismo pedido tiene apartado como
    // disponible para si mismo: editarlo sin cambiar nada no le hace perder de su propio
    // promedio el lote que el mismo aparto entero.
    const cost = await resolveStoredOrderCost(
      deps,
      effectiveId,
      data.quantity,
      data.unitId,
      packagingLinesOfInput(data.presentationLines),
      actor.companyId,
      { orderId: id },
    );

    const instant = now();

    await deps.unitOfWork.run(async (transaction) => {
      const locked = await transaction.orders.lockAliveById(id, scope);
      if (locked === null) throw new OrderNotFoundError();

      // Repetida sobre la fila BLOQUEADA: otra operacion pudo moverla entre la lectura de
      // arriba y este bloqueo.
      assertTransition(locked.status, locked.status);

      // La unidad y el reparto se resuelven y se validan contra
      // el total con la fila del pedido YA BLOQUEADA, para que dos ediciones simultaneas no
      // dejen ninguna pasar del total. Una linea antigua solo se conserva si llega igual.
      const distribution = await resolveDistribution(
        deps,
        actor.companyId,
        data.quantity,
        data.unitId,
        data.presentationLines,
        { savedLines: locked.presentationLines },
      );

      // La receta se lee con el cliente de ESTA transaccion, para ver la misma instantanea que
      // acaba de bloquear `lockAliveById`. La edicion solo llega antes de consumir la receta.
      const content = await transaction.recipes.findExecutionContentById(effectiveId, actor.companyId);
      const requirement = buildOrderRequirement({
        recipeLines: content?.lines ?? [],
        quantity: data.quantity,
        packagingLines: distribution.packagingLines,
        phase: 'before_consumption',
        units: { orderUnitId: null, orderUnit: null, bridge: null, productUnits: new Map() },
      });
      if (requirement.kind !== 'ok') throw new Error('updateOrder: necesidad no convertible sin tratar');

      const result = await transaction.orders.updateAlive(
        id,
        {
          recipeId: effectiveId,
          quantity: data.quantity,
          priority: data.priority,
          unitId: data.unitId,
          presentationLines: distribution.lines,
        },
        actor.id,
        instant,
        cost,
        scope,
      );
      if (result === 'not_found') throw new OrderNotFoundError();

      const outcome = await transaction.reservations.syncForOrder({
        orderId: id,
        companyId: actor.companyId,
        requirement: requirement.lines,
        actorId: actor.id,
        now: instant,
      });

      if (outcome.kind === 'insufficient') {
        // Un pedido en curso tiene que seguir teniendo con que producirse.
        if (locked.status === 'EN_CURSO') throw new InsufficientMaterialError();
        if (!confirmBlocked) throw new OrderWouldBlockError();
        if (locked.status !== 'BLOQUEADO') {
          await moveStatus(transaction.orders, id, locked.status, 'BLOQUEADO', actor.id, instant, scope);
        }
        if (cost !== null) {
          await transaction.orders.setIngredientsCost(id, null, actor.id, instant, scope);
        }
      } else if (locked.status === 'BLOQUEADO') {
        await moveStatus(transaction.orders, id, 'BLOQUEADO', 'PENDIENTE', actor.id, instant, scope);
      }

      await transaction.orders.setReservedAt(
        id,
        outcome.kind === 'reserved' ? instant : null,
        scope,
      );
    });
  };
}

/** La fila ya esta bloqueada por `lockAliveById`, asi que cualquier resultado distinto de `ok`
 *  es que el pedido dejo de existir para esta empresa. */
async function moveStatus(
  orders: OrderWriteRepository,
  id: string,
  from: OrderStatus,
  to: OrderStatus,
  actorId: string,
  now: Date,
  scope: OrderScope,
): Promise<void> {
  const result = await orders.setStatus(id, from, to, actorId, now, scope);
  if (result !== 'ok') throw new OrderNotFoundError();
}
