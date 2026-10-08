import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { toOrderView } from './get-order';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { ORDER_PRIORITY_VALUES, ORDER_STATUS_VALUES } from './order-classification';
import {
  isCustomerIdShape,
  ORDER_CUSTOMER_FILTER_FIELD,
  ORDER_CUSTOMER_PRESENCE_FILTER_FIELD,
  ORDER_CUSTOMER_PRESENCE_VALUES,
} from './order-customer';
import { ORDER_QUERYABLE } from './order-queryable';
import type { OrderScope } from './order-scope';

import type { ListFilterValue, ListQuery } from './list-query';
import type { OrderSummary } from './order-view';
import type { Page } from './page';

import type { CustomerCatalog } from '@/lib/modules/clientes';
import type { PackagingCatalog, PresentationCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

import {
  findOrderCustomers,
  findPackagingNames,
  orderPackagingIds,
  orderPresentationIds,
  unitLabelOf,
} from './get-order';

import type { ListQueryLog } from '../ports/list-query-log';
import type { OrderRepository } from '../ports/order-repository';

/** La unidad vuelve al pedido: `units` VUELVE a ser dependencia del listado, UNA sola
 *  llamada por pagina con los ids UNICOS. */
export type ListOrdersDeps = {
  readonly orders: OrderRepository;
  readonly recipes: RecipeCatalog;
  /** Contrato PUBLICO de `inventario`: resuelve los nombres de presentacion de la pagina. */
  readonly presentations: PresentationCatalog;
  /** Contrato PUBLICO de `inventario`: resuelve los nombres de los envases de la pagina. */
  readonly packaging: PackagingCatalog;
  /** Contrato PUBLICO de `unidades`: resuelve la etiqueta de unidad de la pagina. */
  readonly units: UnitCatalog;
  /** Contrato PUBLICO de `clientes`: los clientes de la pagina, una llamada por pagina. */
  readonly customerCatalog: Pick<CustomerCatalog, 'findRefsIncludingDeleted'>;
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
  [ORDER_CUSTOMER_PRESENCE_FILTER_FIELD]: ORDER_CUSTOMER_PRESENCE_VALUES,
};

/** Los valores que admite cada `select`: un conjunto cerrado, o la forma de uuid en el del
 *  cliente, cuyos valores no se conocen aqui pero uno sin forma no puede existir en la base. */
function selectValueRule(field: string): ((candidate: string) => boolean) | undefined {
  if (field === ORDER_CUSTOMER_FILTER_FIELD) return isCustomerIdShape;
  const allowed = CLOSED_SELECT_VALUES[field];
  return allowed === undefined ? undefined : (candidate) => allowed.includes(candidate);
}

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
  const isAllowed = selectValueRule(field);
  if (isAllowed === undefined || value.kind !== 'select') return { value, pruned: false };

  const kept = value.values.filter(isAllowed);
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
 *   1. `requirePermission(actor, 'pedidos.consultar')` PRIMERO, siempre (QC-74 R12, R16): antes
 *      de zod y antes de tocar el puerto.
 *   2. zod DENTRO del caso de uso (R30). Valida la FORMA; un campo no declarado no puede hacer
 *      fallar la consulta (R5).
 *   3. `sanitizeListQuery` contra `ORDER_QUERYABLE` (R4, R5, R7, R8), mas la poda de los
 *      valores de los dos `select` cerrados.
 *   4. el log de lo podado (R6).
 *   5. UNA llamada al repositorio, con la consulta YA SANEADA (R13).
 *   6. Ids DEDUPLICADOS con `Set` y UNA llamada al catalogo de recetas, con todos los ids de la
 *      pagina a la vez; lo mismo con las presentaciones y con las
 *      unidades: una llamada por catalogo y por pagina, nunca por fila.
 *
 * El repositorio, el catalogo de recetas, el de presentaciones y el de unidades se llaman UNA
 * vez cada uno por pagina, tenga 1 fila o 25 -mas el catalogo de ids si hay busqueda-. El test
 * lo demuestra CONTANDO invocaciones: comprobar solo el resultado pasaria verde con un bucle de
 * diez consultas.
 *
 * QC-57 R25: **`status` y `priority` dejan de ser parametros propios** y entran como filtros
 * `select` del contrato, opcionales y combinables como siempre. Se conserva que un pedido
 * **`CANCELADO` si se consulta**: los cancelados tienen estado propio en vez de desaparecer, y
 * los que no salen nunca son los BORRADOS, filtro que es del puerto (R40) y que no depende de
 * lo que traiga la consulta.
 *
 * `orders` no tiene columna de nombre propia, asi que la busqueda casa por el nombre de la
 * receta del pedido: el termino se traduce a una lista de ids de receta con el catalogo de
 * `recetas` ANTES de llamar al repositorio, y esa lista es la que acota el `where`.
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
    requirePermission(actor, 'pedidos.consultar');

    // La empresa sale del ACTOR y jamas de la entrada: nadie puede elegir consultar otra.
    const scope: OrderScope = { companyId: actor.companyId };

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const saneada = sanitizeListQuery(parsed.data, ORDER_QUERYABLE);
    const podada = pruneClosedSelects(saneada.query);
    deps.log.ignoredFields(LIST_NAME, [...saneada.ignored, ...podada.ignored]);

    // El termino se resuelve a ids de receta ANTES de tocar el repositorio: `orders` no tiene
    // columna de nombre y no puede buscar por si sola. `null` (sin busqueda) y `''` (sin
    // termino) llegan igual a `listAlive`: ninguno de los dos filtra nada.
    const searchRecipeIds =
      podada.query.search === ''
        ? null
        : await deps.recipes.findIdsMatchingName(podada.query.search, actor.companyId);

    const page = await deps.orders.listAlive(podada.query, searchRecipeIds, scope);

    // R45: los ids se DEDUPLICAN antes de preguntar. Diez pedidos de la misma receta son UNA
    // sola entrada, y el numero de consultas no crece con el numero de filas.
    const recipeIds = [...new Set(page.items.map((row) => row.recipeId))];

    // R44: `findRefsIncludingDeleted` -y no una consulta de solo vivas- porque un pedido
    // conserva su receta aunque la den de baja y la fila tiene que seguir diciendo que se
    // pidio. La vigencia se exige al ESCRIBIR (R15, R25), no al leer.
    const recipes = await deps.recipes.findRefsIncludingDeleted(recipeIds, actor.companyId);

    const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

    // Las presentaciones de TODAS las lineas de la pagina, deduplicadas: una sola llamada.
    const presentationIds = orderPresentationIds(page.items);
    const presentations =
      presentationIds.length === 0 ? [] : await deps.presentations.findRefs(presentationIds, actor.companyId);
    const presentationNames = new Map(presentations.map((presentation) => [presentation.id, presentation.name]));

    // Una sola llamada al catalogo de unidades por pagina, con los ids UNICOS.
    const unitIds = [
      ...new Set(page.items.map((row) => row.unitId).filter((id): id is string => id !== null)),
    ];
    const units = unitIds.length === 0 ? [] : await deps.units.findRefs(unitIds, actor.companyId);
    const unitLabels = new Map(units.map((unit) => [unit.id, unitLabelOf(unit)]));

    // Los envases de la pagina, deduplicados: una sola llamada.
    const packagingNames = await findPackagingNames(deps.packaging, orderPackagingIds(page.items), actor.companyId);

    const orderCustomers = await findOrderCustomers(deps.customerCatalog, page.items, actor.companyId);

    return {
      items: page.items.map((row) =>
        toOrderView(row, recipesById, presentationNames, unitLabels, packagingNames, orderCustomers),
      ),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: page.totalPages,
    };
  };
}
