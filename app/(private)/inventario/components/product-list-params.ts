import {
  PAGE_SIZE_OPTIONS as SHARED_PAGE_SIZE_OPTIONS,
  type DataTableFilterValue,
  type DataTableParams,
  type DataTableSort,
} from '@/components/shared/data-table';
import { PRODUCT_QUERYABLE } from '@/lib/modules/inventario';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';

/**
 * Parser y serializador puros de los parametros de lista de la pantalla de productos (R10, R11,
 * R12, `design.md > 4.2`).
 *
 * **AMPLIADO EL 2026-09-07 (decision humana)**: la pantalla estrena la tabla compartida, asi que
 * estos parametros pasan de `{ page, pageSize }` al `DataTableParams` completo -pagina, tamano,
 * orden, filtros y busqueda-. Lo que la ficha original dejo escrito como «emitir esos campos es
 * de QC-56, no de aqui» ocurre AHORA.
 *
 * **Sin DOM, sin React y sin `next/*` a proposito**: el estado de lista vive en la cadena de
 * consulta, asi que quien lo lee es el Server Component de la pagina *antes* de que exista nada
 * de cliente. Que este archivo sea una funcion pura es lo que permite probar R12 sin montar la
 * pantalla.
 *
 * **Acotar aqui no duplica ninguna regla de negocio.** Quien valida la consulta de lista es
 * `createListQuerySchema()`, dentro del caso de uso `listProducts` (QC-57), y *rechaza* `page: 0`
 * con `ValidationError`: esta pantalla mostraria un error donde el usuario solo esperaba la
 * primera pagina. Acotar es de la capa de presentacion; validar sigue siendo del dominio.
 *
 * **Lo ordenable y lo filtrable se comprueba contra `PRODUCT_QUERYABLE`**, la lista blanca del
 * modulo, nunca contra una copia escrita aqui: si el modulo dejara de ordenar por un campo, esta
 * pantalla deja de emitirlo sin tocarse. El dominio ademas **no falla** ante un campo no
 * declarado (QC-57 R5); se acota igual por no depender de esa cortesia y para que la URL que el
 * usuario ve sea la que la consulta usa.
 *
 * **`search` SI se lee y se escribe**, al contrario que en pedidos: `PRODUCT_QUERYABLE.searchable`
 * es `true` y `listProducts` resuelve la busqueda contra la columna normalizada con su indice de
 * trigramas (QC-57 R16, R18, R19). Una caja de busqueda en esta pantalla no miente.
 */

/**
 * Nombres de los parametros de consulta. Constantes porque las comparten el parser, la tabla y
 * los tests: un literal repetido es como se acaba con `pagesize` y `pageSize` conviviendo.
 */
export const PAGE_PARAM = 'page';
export const PAGE_SIZE_PARAM = 'pageSize';
export const SORT_PARAM = 'sort';
export const SEARCH_PARAM = 'q';
export const STOCK_MIN_PARAM = 'stockMin';
export const STOCK_MAX_PARAM = 'stockMax';
export const QTY_ALERT_MIN_PARAM = 'alertMin';
export const QTY_ALERT_MAX_PARAM = 'alertMax';

/** Ids de las columnas filtrables, que son tambien las claves de `DataTableParams.filters`. */
export const STOCK_COLUMN_ID = 'stock';
export const QTY_ALERT_COLUMN_ID = 'qtyAlert';

/** Separador de `campo:direccion` en el parametro de orden. */
export const SORT_SEPARATOR = ':';

/**
 * Las DOS opciones de tamano de pagina que fijo la decision del 2026-09-03 (R10). Salen de
 * `lib/shared/pagination` -10 es el defecto del backend y 25 su tope- en vez de escribirse a
 * mano: si el backend moviera cualquiera de los dos, esta lista se mueve con el.
 *
 * La tabla compartida publica su propia lista (`SHARED_PAGE_SIZE_OPTIONS`) y es la que pinta su
 * selector; esta se conserva porque es la que el PARSER acota, y el test que las ata comprueba
 * que no divergen.
 */
export const PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE] as const;

export type ProductPageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/** La forma que entrega `searchParams` del App Router: repetir `?page=1&page=2` da un array. */
export type ProductListSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

/** La primera pagina es siempre el destino seguro: ningun parametro invalido produce un error. */
export const FIRST_PAGE = 1;

/**
 * De un parametro repetido se toma el PRIMER valor. Cualquier otra convencion (el ultimo, o
 * descartar el parametro) es igual de arbitraria; esta se elige por ser la de `URLSearchParams.get`.
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

function isPageSize(value: number): value is ProductPageSize {
  return PAGE_SIZE_OPTIONS.some((option) => option === value);
}

/**
 * Orden vigente a partir de `campo:asc` o `campo:desc`. Un campo que no este en
 * `PRODUCT_QUERYABLE.sortable` -o una direccion desconocida- no es un error: es «sin orden», y la
 * lista cae al orden por defecto que aplica el adaptador driven.
 */
function parseSort(raw: string | undefined): DataTableSort | null {
  if (raw === undefined) return null;
  const separator = raw.indexOf(SORT_SEPARATOR);
  if (separator <= 0) return null;

  const columnId = raw.slice(0, separator);
  const direction = raw.slice(separator + SORT_SEPARATOR.length);
  if (!PRODUCT_QUERYABLE.sortable.includes(columnId)) return null;
  if (direction !== 'asc' && direction !== 'desc') return null;

  return { columnId, direction };
}

/**
 * Rango numerico a partir de sus dos extremos. Los dos ausentes es «sin filtro»: un rango abierto
 * por los dos lados no acota nada y solo ensuciaria la consulta. Un extremo que no es entero
 * positivo se descarta SOLO el, no el filtro entero.
 */
function parseNumberRange(
  rawMin: string | undefined,
  rawMax: string | undefined,
): DataTableFilterValue | null {
  const min = parsePositiveInt(rawMin);
  const max = parsePositiveInt(rawMax);
  if (min === undefined && max === undefined) return null;
  return { kind: 'numberRange', min: min ?? null, max: max ?? null };
}

/**
 * Acota los parametros de la URL a un `DataTableParams` **siempre valido** (R12): ninguna entrada
 * produce un error, todas producen una lista.
 *
 * El resultado se pasa **entero y sin traducir** a `listProductsAction`: `DataTableParams` es
 * campo a campo la misma forma que `ListQuery` (QC-57), y `createListQuerySchema()` es un
 * `z.strictObject`, asi que una clave de mas romperia el `parse`. Por eso aqui no se inventa
 * ninguna propiedad.
 */
export function parseProductListParams(
  searchParams: ProductListSearchParams | undefined,
): DataTableParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[PAGE_SIZE_PARAM]));

  const filters: Record<string, DataTableFilterValue> = {};

  const stock = parseNumberRange(
    firstValue(searchParams?.[STOCK_MIN_PARAM]),
    firstValue(searchParams?.[STOCK_MAX_PARAM]),
  );
  if (stock !== null) filters[STOCK_COLUMN_ID] = stock;

  const qtyAlert = parseNumberRange(
    firstValue(searchParams?.[QTY_ALERT_MIN_PARAM]),
    firstValue(searchParams?.[QTY_ALERT_MAX_PARAM]),
  );
  if (qtyAlert !== null) filters[QTY_ALERT_COLUMN_ID] = qtyAlert;

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize: rawPageSize !== undefined && isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
    sort: parseSort(firstValue(searchParams?.[SORT_PARAM])),
    filters,
    // El termino se recorta aqui: `'  '` es «sin busqueda», no una busqueda de espacios.
    search: (firstValue(searchParams?.[SEARCH_PARAM]) ?? '').trim(),
  };
}

/**
 * Cadena de consulta canonica de unos parametros de lista. La comparten la tabla (al navegar), la
 * `key` del `<Suspense>` y el estado vacio (al volver a la primera pagina), de modo que la URL
 * que produce la pantalla es siempre la misma forma que el parser sabe leer, y `parse(build(p))`
 * devuelve `p`.
 */
export function buildProductListQuery(params: DataTableParams): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));

  if (params.sort !== null) {
    query.set(SORT_PARAM, `${params.sort.columnId}${SORT_SEPARATOR}${params.sort.direction}`);
  }

  const search = params.search.trim();
  if (search !== '') query.set(SEARCH_PARAM, search);

  const stock = params.filters[STOCK_COLUMN_ID];
  if (stock?.kind === 'numberRange') {
    if (stock.min !== null) query.set(STOCK_MIN_PARAM, String(stock.min));
    if (stock.max !== null) query.set(STOCK_MAX_PARAM, String(stock.max));
  }

  const qtyAlert = params.filters[QTY_ALERT_COLUMN_ID];
  if (qtyAlert?.kind === 'numberRange') {
    if (qtyAlert.min !== null) query.set(QTY_ALERT_MIN_PARAM, String(qtyAlert.min));
    if (qtyAlert.max !== null) query.set(QTY_ALERT_MAX_PARAM, String(qtyAlert.max));
  }

  return query.toString();
}

/**
 * Destino de la lista con unos parametros dados. **Se deriva de `INVENTORY_ROUTE`** (R2): ningun
 * archivo de esta ruta escribe la URL como literal.
 */
export function productListHref(params: DataTableParams): string {
  return `${INVENTORY_ROUTE}?${buildProductListQuery(params)}`;
}

/**
 * Las dos listas de tamanos -la que acota el parser y la que pinta el selector de la tabla
 * compartida- tienen que decir lo mismo. Se expone para que el test lo afirme sin importar el
 * barrel de la tabla compartida desde el test de esta ruta.
 */
export const SHARED_PAGE_SIZES: readonly number[] = SHARED_PAGE_SIZE_OPTIONS;
