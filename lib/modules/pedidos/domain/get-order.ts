import { requirePermission, type Actor } from './actor';
import { NotFoundError } from './errors';
import { formatOrderNumber } from './order-number';
import type { OrderRow, OrderView } from './order-view';

import type { RecipeCatalog } from '@/lib/modules/recetas';

import type { OrderRepository } from '../ports/order-repository';

/**
 * QC-35bis (2026-09-07): `units` YA NO ES UNA DEPENDENCIA de este caso de uso. Al salir la
 * unidad del pedido no queda ningun id que resolver contra el catalogo de `unidades`, asi que
 * pedirlo aqui seria cablear una dependencia falsa -exactamente lo que `design.md > 9` evita en
 * `cancelOrder` y `deleteOrder`-. Es tambien una consulta menos por ficha y por pagina.
 */
export type GetOrderDeps = {
  readonly orders: OrderRepository;
  readonly recipes: RecipeCatalog;
};

/**
 * Compone la salida de una fila con los nombres ya resueltos (R42, R43, R44, R46).
 *
 * Vive aqui y lo IMPORTA `list-orders.ts` para que la ficha y el listado no puedan diverger:
 * `OrderSummary` es un alias de `OrderView` (`design.md > 7.3`) y una segunda copia de este
 * mapeo seria el sitio exacto por donde empezarian a diferir.
 *
 * `recipeName` es `null` solo si el id NO vuelve del catalogo -una receta borrada FISICAMENTE
 * por consola, que las FK `RESTRICT` de QC-33 hacen casi imposible-: la fila SIGUE saliendo
 * (mismo criterio que QC-25 R18 y QC-43 R37). Una receta dada de BAJA si vuelve, con su nombre
 * (R44).
 *
 * `numberText` lo compone `formatOrderNumber`, la UNICA definicion del formato (R14): no se
 * persiste ni se vuelve a formatear en ningun otro sitio. Los dos autores salen como
 * IDENTIFICADORES (R46): este modulo no consulta el modelo `User`.
 */
export function toOrderView(
  row: OrderRow,
  recipeNames: ReadonlyMap<string, string>,
): OrderView {
  return {
    id: row.id,
    number: row.number,
    numberText: formatOrderNumber(row.number),
    recipeId: row.recipeId,
    recipeName: recipeNames.get(row.recipeId) ?? null,
    quantity: row.quantity,
    priority: row.priority,
    status: row.status,
    // R29: el motivo se devuelve en la ficha Y en el listado mientras el pedido este
    // cancelado. Ningun caso de uso lo vacia ni lo sustituye.
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/**
 * Ficha de un pedido (R42). Consultar exige `pedidos.consultar` (QC-74 R16): quien no lo tiene
 * ni siquiera lee, y el `requirePermission` va antes de tocar el repositorio y el catalogo de
 * recetas (QC-74 R12). Era UN paso por DOS catalogos hasta QC-35bis: el de `unidades` se fue
 * con la unidad del pedido.
 */
export function createGetOrder(
  deps: GetOrderDeps,
): (id: string, actor: Actor | null | undefined) => Promise<OrderView> {
  return async function getOrder(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<OrderView> {
    requirePermission(actor, 'pedidos.consultar');

    // null = no existe o ya esta borrado: para el dominio son el mismo caso (R33), y el
    // filtro `deleted_at IS NULL` es del puerto, no de un `if` de aqui (R40).
    const row = await deps.orders.findAliveById(id);
    if (row === null) throw new NotFoundError();

    const recipes = await deps.recipes.findRefsIncludingDeleted([row.recipeId]);

    return toOrderView(row, new Map(recipes.map((recipe) => [recipe.id, recipe.name])));
  };
}
