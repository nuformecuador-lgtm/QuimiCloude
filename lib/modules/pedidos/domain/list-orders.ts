import { requireAdmin, type Actor } from './actor';
import { ValidationError } from './errors';
import { toOrderView } from './get-order';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { ORDER_PRIORITY_VALUES, ORDER_STATUS_VALUES } from './order-classification';
import { ORDER_QUERYABLE } from './order-queryable';

import type { ListFilterValue, ListQuery } from './list-query';
import type { OrderSummary } from './order-view';
import type { Page } from './page';

import type { RecipeCatalog } from '@/lib/modules/recetas';

import type { ListQueryLog } from '../ports/list-query-log';
import type { OrderRepository } from '../ports/order-repository';

/** QC-35bis (2026-09-07): sin unidad en el pedido, `units` deja de ser dependencia del listado. */
export type ListOrdersDeps = {
  readonly orders: OrderRepository;
  readonly recipes: RecipeCatalog;
  readonly log: ListQueryLog;
};

/** Nombre con el que este listado se identifica en el log de campos omitidos (R6). */
const LIST_NAME = 'orders';

/** El esquema no depende del actor ni de la consulta: se construye una vez por modulo. */
const listQuerySchema = createListQuerySchema();

/**
 * Los conjuntos CERRADOS de los dos filtros de seleccion (R19 de QC-33, `design.md > 5`).
 * `status` y `priority` son enums de Postgres: un valor que no este aqui no existe en la base.
 */
const CLOSED_SELECT_VALUES: Readonly<Record<string, readonly string[]>> = {
  status: ORDER_STATUS_VALUES,
  priority: ORDER_PRIORITY_VALUES,
};

/**
 * Poda los valores de un `select` que no pertenecen al conjunto cerrado del campo (R5, R25).
 *
 * **Un valor de fuera NO hace fallar la consulta**: se trata igual que un campo no declarado
 * -se omite, se anota y la lista vuelve como si no se hubiera pedido-. Es lo que R5 exige y lo
 * que separa este contrato del `listOrdersSchema` de QC-34, que rechazaba con
 * `ValidationError`. Si no queda ningun valor valido, el filtro entero desaparece: una lista
 * vacia es «no he elegido nada» y no «ningun resultado» (`design.md > 3.3`).
 *
 * Devuelve el valor podado o `null` si el filtro ya no acota nada, mas si hubo que podar algo.
 */
function pruneClosedSelect(
  field: string,
  value: ListFilterValue,
): { readonly value: ListFilterValue | null; readonly pruned: boolean } {
  const allowed = CLOSED_SELECT_VALUES[field];
  if (allowed === undefined || value.kind !== 'select') return { value, pruned: false };

  const kept = value.values.filter((candidate) => allowed.includes(candidate));
  if (kept.length === value.values.length) return { value, pruned: false };
  return {
    value: kept.length === 0 ? null : { kind: 'select', values: kept },
    pruned: true,
  };
}

/**
 * Segunda poda, la que `sanitizeListQuery` no puede hacer: la lista blanca declara la FORMA de
 * cada filtro (`select`), no sus valores posibles. Los valores los conoce el dominio de
 * `pedidos` y solo el.
 */
function pruneClosedSelects(query: ListQuery): {
  readonly query: ListQuery;
  readonly ignored: readonly string[];
} {
  const filters: Record<string, ListFilterValue> = {};
  const ignored: string[] = [];

  for (const [field, value] of Object.entries(query.filters)) {
    const { value: kept, pruned } = pruneClosedSelect(field, value);
    if (kept !== null) filters[field] = kept;
    if (pruned) ignored.push(field);
  }

  return { query: { ...query, filters }, ignored };
}

/**
 * Listado paginado de pedidos con el CONTRATO GENERICO de consulta (QC-57 T13, R25, R30, R33;
 * QC-34 R34-R46), en el ORDEN EXACTO de `design.md > 1` y `> 6.4`:
 *
 *   1. `requireAdmin` PRIMERO, siempre (R33, R34, decision cerrada 1 de QC-34): antes de zod y
 *      antes de tocar el puerto.
 *   2. zod DENTRO del caso de uso (R30). Valida la FORMA; un campo no declarado no puede hacer
 *      fallar la consulta (R5).
 *   3. `sanitizeListQuery` contra `ORDER_QUERYABLE` (R4, R5, R7, R8), mas la poda de los
 *      valores de los dos `select` cerrados.
 *   4. el log de lo podado (R6).
 *   5. UNA llamada al repositorio, con la consulta YA SANEADA (R13).
 *   6. Ids DEDUPLICADOS con `Set` y UNA llamada al catalogo de recetas, con todos los ids de la
 *      pagina a la vez (R45).
 *
 * DOS consultas por pagina -eran tres hasta el 2026-09-07, cuando la unidad salio del pedido y
 * con ella la consulta a `unidades`-, tenga la pagina 1 fila o 25. El test lo demuestra CONTANDO
 * invocaciones: comprobar solo el resultado pasaria verde con un bucle de diez consultas.
 *
 * QC-57 R25: **`status` y `priority` dejan de ser parametros propios** y entran como filtros
 * `select` del contrato, opcionales y combinables como siempre. Se conserva que un pedido
 * **`CANCELADO` si se consulta**: los cancelados tienen estado propio en vez de desaparecer, y
 * los que no salen nunca son los BORRADOS, filtro que es del puerto (R40) y que no depende de
 * lo que traiga la consulta.
 *
 * QC-57 R17: **`orders` NO busca.** No tiene columna `name`, `ORDER_QUERYABLE.searchable` es
 * `false` y `sanitizeListQuery` omite la busqueda y la anota; la consulta devuelve la lista
 * como si no se hubiera buscado.
 *
 * Este archivo NO calcula `offset`, `limit` ni `totalPages`, y no puede: `domain/` no importa
 * `lib/shared/**` y R37 prohibe reimplementar esa aritmetica dentro de `pedidos`. Quien la
 * hace es el adaptador driven, que es tambien quien aplica el defecto de 10, el tope de 25, el
 * filtro de los borrados (R40) y el orden por defecto (R11, R41).
 */
export function createListOrders(
  deps: ListOrdersDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<Page<OrderSummary>> {
  return async function listOrders(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<OrderSummary>> {
    requireAdmin(actor);

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const saneada = sanitizeListQuery(parsed.data, ORDER_QUERYABLE);
    const podada = pruneClosedSelects(saneada.query);
    deps.log.ignoredFields(LIST_NAME, [...saneada.ignored, ...podada.ignored]);

    const page = await deps.orders.listAlive(podada.query);

    // R45: los ids se DEDUPLICAN antes de preguntar. Diez pedidos de la misma receta son UNA
    // sola entrada, y el numero de consultas no crece con el numero de filas.
    const recipeIds = [...new Set(page.items.map((row) => row.recipeId))];

    // R44: `findRefsIncludingDeleted` -y no una consulta de solo vivas- porque un pedido
    // conserva su receta aunque la den de baja y la fila tiene que seguir diciendo que se
    // pidio. La vigencia se exige al ESCRIBIR (R15, R25), no al leer.
    const recipes = await deps.recipes.findRefsIncludingDeleted(recipeIds);

    const recipeNames = new Map(recipes.map((recipe) => [recipe.id, recipe.name]));

    return {
      items: page.items.map((row) => toOrderView(row, recipeNames)),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: page.totalPages,
    };
  };
}
