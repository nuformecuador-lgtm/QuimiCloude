import {
  PAGE_SIZE_OPTIONS,
  type DataTableFilterValue,
  type DataTableParams,
  type DataTableSort,
} from '@/components/shared/data-table';
import { ORDER_PRIORITY_VALUES, ORDER_QUERYABLE, ORDER_STATUS_VALUES } from '@/lib/modules/pedidos';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

/**
 * Parser y serializador puros de los parametros de lista de pedidos (R15, R16, R17, R18, R20,
 * `design.md > 5`).
 *
 * **Sin DOM, sin React y sin `next/*` a proposito.** El estado de lista vive en la cadena de
 * consulta y no en React (alternativa H, descartada): asi recargar, compartir el enlace o volver
 * con «atras» conserva pagina, orden y filtros, que es justo lo que R25 exige al cerrar el panel
 * lateral. Que estas dos funciones sean puras es lo que permite probar R18 sin montar la
 * pantalla.
 *
 * **Nada de JSON serializado en un solo parametro** (alternativa I, descartada): las claves son
 * explicitas y legibles, y cada una se acota por su cuenta sin `try/catch` que decida entre
 * «acotar» y «fallar».
 *
 * **Los conjuntos validos se IMPORTAN del contrato publico de `pedidos`**, nunca se escriben a
 * mano: si manana aparece un quinto estado, esta pantalla lo acepta sin tocarse. Acotar es de la
 * capa de presentacion; validar sigue siendo del dominio, que ademas **no falla** ante un campo
 * no declarado (QC-57 R5). Se acota igual por no depender de esa cortesia y para que la URL que
 * el usuario ve sea la que la consulta usa.
 *
 * **`search` no se lee ni se escribe todavia**. Esta pantalla no tiene caja de busqueda: el campo
 * existe en `DataTableParams` porque el contrato de lista lo tiene, y esta pantalla lo emite
 * **siempre** como cadena vacia, que es «sin busqueda».
 */

/**
 * Nombres de los parametros de consulta. Constantes porque los comparten el parser, la tabla y
 * los tests: un literal repetido es como se acaba con `pagesize` y `pageSize` conviviendo.
 */
export const PAGE_PARAM = 'page';
export const PAGE_SIZE_PARAM = 'pageSize';
export const SORT_PARAM = 'sort';
export const STATUS_PARAM = 'status';
export const PRIORITY_PARAM = 'priority';
export const CREATED_FROM_PARAM = 'createdFrom';
export const CREATED_TO_PARAM = 'createdTo';

/**
 * Ids de las columnas filtrables, que son tambien las claves de `DataTableParams.filters`.
 * Coinciden con los campos que declara `ORDER_QUERYABLE.filterable`; se exportan para que la
 * declaracion de columnas (T7) no los reescriba.
 */
export const STATUS_COLUMN_ID = 'status';
export const PRIORITY_COLUMN_ID = 'priority';
export const CREATED_AT_COLUMN_ID = 'createdAt';

/** Separador de `campo:direccion` en el parametro de orden. */
export const SORT_SEPARATOR = ':';

/** Separador de una lista de valores de un filtro de seleccion. */
export const FILTER_SEPARATOR = ',';

/** La primera pagina es siempre el destino seguro: ningun parametro invalido produce un error. */
export const FIRST_PAGE = 1;

/** La forma que entrega `searchParams` del App Router: repetir `?page=1&page=2` da un array. */
export type OrderListSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

/**
 * De un parametro repetido se toma el PRIMER valor. Cualquier otra convencion (el ultimo, o
 * descartar el parametro) es igual de arbitraria; esta se elige por ser la de
 * `URLSearchParams.get`.
 */
function firstValue(raw: string | readonly string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' ? raw : raw[0];
}

/**
 * Entero decimal sin signo. `Number('1.5')` da `1.5` y `Number(' 2 ')` da `2`, asi que la
 * comprobacion es sobre el TEXTO y no sobre el resultado de convertir: `'1.5'`, `'1e3'`, `'0x2'`
 * y `' 2 '` no son lo que el usuario escribio en una URL de paginacion.
 */
function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

function isPageSize(value: number): boolean {
  return PAGE_SIZE_OPTIONS.some((option) => option === value);
}

/**
 * Orden vigente a partir de `campo:asc` o `campo:desc`. Un campo que no este en
 * `ORDER_QUERYABLE.sortable` —o una direccion desconocida— no es un error: es «sin orden», y la
 * lista cae al orden por defecto que aplica el adaptador driven (R13).
 */
function parseSort(raw: string | undefined): DataTableSort | null {
  if (raw === undefined) return null;
  const separator = raw.indexOf(SORT_SEPARATOR);
  if (separator <= 0) return null;

  const columnId = raw.slice(0, separator);
  const direction = raw.slice(separator + SORT_SEPARATOR.length);
  if (!ORDER_QUERYABLE.sortable.includes(columnId)) return null;
  if (direction !== 'asc' && direction !== 'desc') return null;

  return { columnId, direction };
}

/**
 * Filtro de seleccion a partir de una lista separada por comas. Los valores que no esten en el
 * conjunto cerrado del contrato **se descartan uno a uno** en vez de invalidar la lista entera; y
 * una lista que se queda vacia es «sin filtro», no un filtro que no case con nada.
 */
function parseSelectFilter(
  raw: string | undefined,
  allowed: readonly string[],
): DataTableFilterValue | null {
  if (raw === undefined) return null;

  const values = raw
    .split(FILTER_SEPARATOR)
    .map((value) => value.trim())
    .filter((value) => allowed.includes(value));
  const unique = [...new Set(values)];

  return unique.length === 0 ? null : { kind: 'select', values: unique };
}

/**
 * Un extremo del rango de fechas. Se exige forma ISO **y** que la fecha exista: `2026-13-45` casa
 * con el patron pero `Date.parse` la rechaza, y una fecha imposible en la URL no puede acabar en
 * la consulta. Vacio o no parseable, ese extremo queda a `null`.
 */
function parseIsoDate(raw: string | undefined): string | null {
  if (raw === undefined) return null;

  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/**
 * Acota los parametros de la URL a un `DataTableParams` **siempre valido** (R18): ninguna entrada
 * produce un error, todas producen una lista.
 *
 * El resultado se pasa **entero y sin traducir** a `listOrdersAction`: `DataTableParams` es campo
 * a campo la misma forma que `ListQuery` (`design.md > 0` y `> 5`), y `createListQuerySchema()`
 * es un `z.strictObject`, asi que una clave de mas romperia el `parse`. Por eso aqui no se
 * inventa ninguna propiedad.
 */
export function parseOrderListParams(
  searchParams: OrderListSearchParams | undefined,
): DataTableParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[PAGE_SIZE_PARAM]));

  const filters: Record<string, DataTableFilterValue> = {};

  const status = parseSelectFilter(firstValue(searchParams?.[STATUS_PARAM]), ORDER_STATUS_VALUES);
  if (status !== null) filters[STATUS_COLUMN_ID] = status;

  const priority = parseSelectFilter(
    firstValue(searchParams?.[PRIORITY_PARAM]),
    ORDER_PRIORITY_VALUES,
  );
  if (priority !== null) filters[PRIORITY_COLUMN_ID] = priority;

  const from = parseIsoDate(firstValue(searchParams?.[CREATED_FROM_PARAM]));
  const to = parseIsoDate(firstValue(searchParams?.[CREATED_TO_PARAM]));
  // Los dos extremos a `null` es «sin filtro»: un rango abierto por los dos lados no filtra nada
  // y solo serviria para ensuciar la consulta.
  if (from !== null || to !== null) {
    filters[CREATED_AT_COLUMN_ID] = { kind: 'dateRange', from, to };
  }

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize: rawPageSize !== undefined && isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
    sort: parseSort(firstValue(searchParams?.[SORT_PARAM])),
    filters,
    search: '',
  };
}

/**
 * Cadena de consulta canonica de unos parametros de lista. La comparten la tabla (al navegar), la
 * `key` del `<Suspense>` y el estado vacio (al volver a la primera pagina), de modo que la URL
 * que produce la pantalla es siempre la misma forma que el parser sabe leer, y `parse(build(p))`
 * devuelve `p`.
 *
 * **Nunca escribe `search`** (R20), ni siquiera vacio: un parametro que la pantalla ignora en la
 * URL invita a creer que la lista busca.
 */
export function buildOrderListQuery(params: DataTableParams): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));

  if (params.sort !== null) {
    query.set(SORT_PARAM, `${params.sort.columnId}${SORT_SEPARATOR}${params.sort.direction}`);
  }

  const status = params.filters[STATUS_COLUMN_ID];
  if (status?.kind === 'select' && status.values.length > 0) {
    query.set(STATUS_PARAM, status.values.join(FILTER_SEPARATOR));
  }

  const priority = params.filters[PRIORITY_COLUMN_ID];
  if (priority?.kind === 'select' && priority.values.length > 0) {
    query.set(PRIORITY_PARAM, priority.values.join(FILTER_SEPARATOR));
  }

  const createdAt = params.filters[CREATED_AT_COLUMN_ID];
  if (createdAt?.kind === 'dateRange') {
    if (createdAt.from !== null) query.set(CREATED_FROM_PARAM, createdAt.from);
    if (createdAt.to !== null) query.set(CREATED_TO_PARAM, createdAt.to);
  }

  return query.toString();
}

/**
 * Destino de la lista con unos parametros dados. **Se deriva de `ORDERS_ROUTE`** (R2): ningun
 * archivo de esta ruta escribe la URL como literal, y por eso navegar y volver a la primera
 * pagina pasan por aqui en vez de componer la cadena a mano.
 */
export function orderListHref(params: DataTableParams): string {
  return `${ORDERS_ROUTE}?${buildOrderListQuery(params)}`;
}
