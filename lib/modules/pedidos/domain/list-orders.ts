import { requireAdmin, type Actor } from './actor';
import { ValidationError } from './errors';
import { toOrderView } from './get-order';
import { listOrdersSchema } from './order-input';
import type { OrderFilters, OrderSummary } from './order-view';
import type { Page } from './page';

import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import type { OrderRepository } from '../ports/order-repository';

export type ListOrdersDeps = {
  readonly orders: OrderRepository;
  readonly recipes: RecipeCatalog;
  readonly units: UnitCatalog;
};

/**
 * Listado paginado de pedidos (R34-R46), en el ORDEN EXACTO de `design.md > 6.4`:
 *
 *   1. `requireAdmin` -antes de todo, tambien para consultar (R2, decision cerrada 1).
 *   2. `listOrdersSchema`: minimo e integridad de la pagina (R36) y los dos filtros (R38).
 *   3. UNA llamada al repositorio.
 *   4. Ids DEDUPLICADOS con `Set`.
 *   5. UNA llamada a cada catalogo, con todos los ids de la pagina a la vez (R45).
 *   6. Un `Map` por id y se compone cada fila.
 *
 * TRES consultas por pagina, tenga la pagina 1 fila o 25. El test lo demuestra CONTANDO
 * invocaciones: comprobar solo el resultado pasaria verde con un bucle de diez consultas.
 *
 * Este archivo NO calcula `offset`, `limit` ni `totalPages`, y no puede: `domain/` no importa
 * `lib/shared/**` y R37 prohibe reimplementar esa aritmetica dentro de `pedidos`. Quien la
 * hace es el adaptador driven con `lib/shared/pagination` (`design.md > 10` y la nota del
 * 2026-09-04 al final de `design.md > 7.4`), que es tambien quien aplica el defecto de 10, el
 * tope de 25, el filtro de los borrados (R40) y el orden de R41. El caso de uso solo mapea
 * `Page<OrderRow>` a `Page<OrderSummary>` CONSERVANDO `total`, `page`, `pageSize` y
 * `totalPages`.
 */
export function createListOrders(
  deps: ListOrdersDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<Page<OrderSummary>> {
  return async function listOrders(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<OrderSummary>> {
    requireAdmin(actor);

    const parsed = listOrdersSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { status, priority, ...query } = parsed.data;

    // Los dos filtros son OPCIONALES y COMBINABLES (R38); sin ninguno salen todos los vivos.
    // No hay filtro por «borrado»: eso es del puerto y no se puede olvidar (R40).
    const filters: OrderFilters = {};
    if (status !== undefined) Object.assign(filters, { status });
    if (priority !== undefined) Object.assign(filters, { priority });

    const page = await deps.orders.listAlive(filters, query);

    // R45: los ids se DEDUPLICAN antes de preguntar. Diez pedidos de la misma receta son UNA
    // sola entrada, y el numero de consultas no crece con el numero de filas.
    const recipeIds = [...new Set(page.items.map((row) => row.recipeId))];
    const unitIds = [...new Set(page.items.map((row) => row.unitId))];

    // R44: `findRefsIncludingDeleted` -y no una consulta de solo vivas- porque un pedido
    // conserva su receta aunque la den de baja y la fila tiene que seguir diciendo que se
    // pidio. La vigencia se exige al ESCRIBIR (R15, R25), no al leer.
    const recipes = await deps.recipes.findRefsIncludingDeleted(recipeIds);
    const units = await deps.units.findRefs(unitIds);

    const recipeNames = new Map(recipes.map((recipe) => [recipe.id, recipe.name]));
    const unitNames = new Map(units.map((unit) => [unit.id, unit.name]));

    return {
      items: page.items.map((row) => toOrderView(row, recipeNames, unitNames)),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: page.totalPages,
    };
  };
}
