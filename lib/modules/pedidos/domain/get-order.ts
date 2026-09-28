import { requirePermission, type Actor } from './actor';
import { OrderNotFoundError } from './errors';
import { formatOrderNumber } from './order-number';
import type { OrderScope } from './order-scope';
import type { OrderRow, OrderView } from './order-view';

import type { PresentationCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import type { OrderRepository } from '../ports/order-repository';

/**
 * [Q4] devuelve la unidad al pedido: `units` VUELVE a ser una dependencia de este caso de uso,
 * porque `quantity` se interpreta siempre en `unitId` y la ficha muestra su etiqueta. Sigue sin
 * haber ningun `unitPrice` que costear aqui.
 */
export type GetOrderDeps = {
  readonly orders: OrderRepository;
  readonly recipes: RecipeCatalog;
  /** Contrato PUBLICO de `inventario`: resuelve el nombre de la presentacion. */
  readonly presentations: PresentationCatalog;
  /** Contrato PUBLICO de `unidades`: resuelve la etiqueta de `unitId` (R42). */
  readonly units: UnitCatalog;
};

/** El simbolo de la unidad, o su nombre si no lo tiene (R42). Se exporta porque
 *  `list-orders.ts` la reutiliza para no divergir en el criterio. */
export function unitLabelOf(unit: { readonly name: string; readonly symbol: string | null }): string {
  return unit.symbol ?? unit.name;
}

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
  presentationNames: ReadonlyMap<string, string> = new Map(),
  unitLabels: ReadonlyMap<string, string> = new Map(),
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
    ingredientsCost: row.ingredientsCost,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    presentationId: row.presentationId,
    // `null` si el pedido esta sin presentacion; la FK compuesta con RESTRICT hace imposible
    // el caso «tiene id pero no vuelve del catalogo».
    presentationName: row.presentationId === null ? null : presentationNames.get(row.presentationId) ?? null,
    unitId: row.unitId,
    // `null` si el pedido esta sin unidad (R42); la FK con RESTRICT hace imposible el caso
    // «tiene id pero no vuelve del catalogo».
    unitLabel: row.unitId === null ? null : unitLabels.get(row.unitId) ?? null,
  };
}

/**
 * Ficha de un pedido (R42). Consultar exige `pedidos.consultar` (QC-74 R16): quien no lo tiene
 * ni siquiera lee, y el `requirePermission` va antes de tocar el repositorio y los catalogos
 * de recetas, presentaciones y unidades (R12).
 */
export function createGetOrder(
  deps: GetOrderDeps,
): (id: string, actor: Actor | null | undefined) => Promise<OrderView> {
  return async function getOrder(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<OrderView> {
    requirePermission(actor, 'pedidos.consultar');

    // La empresa sale del ACTOR y jamas de la entrada: nadie puede elegir consultar otra.
    const scope: OrderScope = { companyId: actor.companyId };

    // null = no existe o ya esta borrado: para el dominio son el mismo caso (R33), y el
    // filtro `deleted_at IS NULL` es del puerto, no de un `if` de aqui (R40).
    const row = await deps.orders.findAliveById(id, scope);
    if (row === null) throw new OrderNotFoundError();

    const recipes = await deps.recipes.findRefsIncludingDeleted([row.recipeId], actor.companyId);

    const presentations =
      row.presentationId === null
        ? []
        : await deps.presentations.findRefs([row.presentationId], actor.companyId);

    const units = row.unitId === null ? [] : await deps.units.findRefs([row.unitId], actor.companyId);

    return toOrderView(
      row,
      new Map(recipes.map((recipe) => [recipe.id, recipe.name])),
      new Map(presentations.map((presentation) => [presentation.id, presentation.name])),
      new Map(units.map((unit) => [unit.id, unitLabelOf(unit)])),
    );
  };
}
