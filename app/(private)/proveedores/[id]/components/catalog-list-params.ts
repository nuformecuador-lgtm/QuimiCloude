import {
  PAGE_SIZE_OPTIONS as SHARED_PAGE_SIZE_OPTIONS,
  type DataTableFilterValue,
  type DataTableParams,
  type DataTableSort,
} from '@/components/shared/data-table';
import { SUPPLIER_CATALOG_LINE_QUERYABLE } from '@/lib/modules/proveedores';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { supplierDetailRoute } from '@/lib/shared/routes';

/**
 * Parser puro de los parametros de lista del CATALOGO de un proveedor (R8, R10,
 * `design.md > 6.1`).
 *
 * **Es propio de esta ruta y NO importa el de la lista de proveedores** (`design.md > 6.1`):
 * importar el parser de la otra ruta ataria dos rutas por sus componentes internos, que es justo
 * lo que el barrel por ruta existe para impedir. Los nombres de parametro y las dos opciones de
 * tamano son los mismos porque los fija la misma decision (R8), no porque el codigo se comparta;
 * y lo que si se comparte -el defecto y el tope- llega **importado** de `lib/shared/pagination`,
 * nunca escrito a mano.
 *
 * **Sin DOM, sin React y sin `next/*` a proposito**: lo lee el Server Component de la pagina de
 * detalle *antes* de que exista nada de cliente, y ser una funcion pura es lo que permite probar
 * R10 sin montar la pantalla.
 *
 * **Acotar aqui no duplica ninguna regla de negocio.** Quien valida la consulta de lista es
 * `createListQuerySchema()`, dentro del caso de uso `listCatalogLines` (QC-57), y *rechaza*
 * `page: 0` con `ValidationError`: la pantalla mostraria un error donde el usuario solo esperaba
 * la primera pagina. Acotar es de la capa de presentacion; validar sigue siendo del dominio.
 *
 * **AMPLIADO EL 2026-09-07 (decision humana)**: la pantalla estrena la tabla compartida, asi que
 * estos parametros pasan de `{ page, pageSize }` al `DataTableParams` completo -pagina, tamano,
 * orden, filtros y busqueda-. QC-44 habia dejado «buscar y ordenar» fuera por escrito; esta
 * decision lo revierte, y puede hacerlo porque el BACKEND ya lo soporta: la lista blanca
 * `SUPPLIER_CATALOG_LINE_QUERYABLE` declara `searchable: true`, cinco campos ordenables y cuatro
 * filtrables desde QC-57.
 *
 * Lo ordenable se comprueba **contra esa lista blanca**, nunca contra una copia escrita aqui: si
 * el modulo dejara de ordenar por un campo, esta pantalla deja de emitirlo sin tocarse.
 */

/** Nombres de los parametros de consulta del catalogo. Constantes: los comparten parser, tabla y tests. */
export const CATALOG_PAGE_PARAM = 'page';
export const CATALOG_PAGE_SIZE_PARAM = 'pageSize';
export const CATALOG_SORT_PARAM = 'sort';
export const CATALOG_SEARCH_PARAM = 'q';
export const CATALOG_COST_MIN_PARAM = 'costMin';
export const CATALOG_COST_MAX_PARAM = 'costMax';
export const CATALOG_DELIVERY_MIN_PARAM = 'deliveryMin';
export const CATALOG_DELIVERY_MAX_PARAM = 'deliveryMax';

/** Ids de las columnas filtrables, que son tambien las claves de `DataTableParams.filters`. */
export const COST_COLUMN_ID = 'cost';
export const DELIVERY_TIME_COLUMN_ID = 'deliveryTime';

/** Separador de `campo:direccion` en el parametro de orden. */
export const CATALOG_SORT_SEPARATOR = ':';

/**
 * Las DOS opciones de tamano de pagina (R8). Salen de `lib/shared/pagination` -10 es el defecto
 * del backend y 25 su tope-: si el backend moviera cualquiera de los dos, esta lista se mueve con el.
 */
export const CATALOG_PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE] as const;

export type CatalogPageSize = (typeof CATALOG_PAGE_SIZE_OPTIONS)[number];



/** La forma que entrega `searchParams` del App Router: repetir `?page=1&page=2` da un array. */
export type CatalogListSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

/** La primera pagina es siempre el destino seguro: ningun parametro invalido produce un error (R10). */
export const FIRST_PAGE = 1;

/**
 * De un parametro repetido se toma el PRIMER valor, la misma convencion que
 * `URLSearchParams.get`.
 */
function firstValue(raw: string | readonly string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' ? raw : raw[0];
}

/**
 * Entero decimal sin signo. La comprobacion es sobre el TEXTO y no sobre el resultado de
 * convertir: `'1.5'`, `'1e3'`, `'0x2'` y `' 2 '` no son lo que nadie escribio en una URL de
 * paginacion.
 */
function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
  // `parseInt` con base EXPLICITA y no `Number(`: este archivo nombra `cost` y la guardia de R41
  // prohibe el literal `Number(` en cualquier archivo que hable de importes, precisamente para
  // que nadie convierta uno a coma flotante por descuido. Aqui lo que se convierte es un ENTERO
  // de paginacion o un extremo de rango, nunca un importe -el importe viaja como cadena de punta
  // a punta y esta pantalla no lo toca-, pero la guardia no puede distinguirlo y se respeta.
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) ? value : undefined;
}

function isCatalogPageSize(value: number): value is CatalogPageSize {
  return CATALOG_PAGE_SIZE_OPTIONS.some((option) => option === value);
}

/**
 * Orden vigente a partir de `campo:asc` o `campo:desc`. Un campo que no este en la lista blanca
 * -o una direccion desconocida- no es un error: es «sin orden», y la lista cae al orden por
 * defecto que aplica el adaptador driven.
 */
function parseSort(raw: string | undefined): DataTableSort | null {
  if (raw === undefined) return null;
  const separator = raw.indexOf(CATALOG_SORT_SEPARATOR);
  if (separator <= 0) return null;

  const columnId = raw.slice(0, separator);
  const direction = raw.slice(separator + CATALOG_SORT_SEPARATOR.length);
  if (!SUPPLIER_CATALOG_LINE_QUERYABLE.sortable.includes(columnId)) return null;
  if (direction !== 'asc' && direction !== 'desc') return null;

  return { columnId, direction };
}

/**
 * Rango numerico a partir de sus dos extremos. Los dos ausentes es «sin filtro»: un rango abierto
 * por los dos lados no acota nada. Un extremo que no es entero positivo se descarta SOLO el.
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
 * Acota los parametros de la URL a un `DataTableParams` **siempre valido** (R10): ninguna entrada
 * produce un error, todas producen una lista.
 *
 * El resultado se pasa **entero y sin traducir** a `listCatalogLinesAction`: `DataTableParams` es
 * campo a campo la misma forma que `ListQuery` (QC-57), y `createListQuerySchema()` es un
 * `z.strictObject`, asi que una clave de mas romperia el `parse`.
 */
export function parseCatalogListParams(
  searchParams: CatalogListSearchParams | undefined,
): DataTableParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[CATALOG_PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[CATALOG_PAGE_SIZE_PARAM]));

  const filters: Record<string, DataTableFilterValue> = {};

  const cost = parseNumberRange(
    firstValue(searchParams?.[CATALOG_COST_MIN_PARAM]),
    firstValue(searchParams?.[CATALOG_COST_MAX_PARAM]),
  );
  if (cost !== null) filters[COST_COLUMN_ID] = cost;

  const delivery = parseNumberRange(
    firstValue(searchParams?.[CATALOG_DELIVERY_MIN_PARAM]),
    firstValue(searchParams?.[CATALOG_DELIVERY_MAX_PARAM]),
  );
  if (delivery !== null) filters[DELIVERY_TIME_COLUMN_ID] = delivery;

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize:
      rawPageSize !== undefined && isCatalogPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
    sort: parseSort(firstValue(searchParams?.[CATALOG_SORT_PARAM])),
    filters,
    // El termino se recorta aqui: `'  '` es «sin busqueda», no una busqueda de espacios.
    search: (firstValue(searchParams?.[CATALOG_SEARCH_PARAM]) ?? '').trim(),
  };
}

/**
 * Cadena de consulta canonica de unos parametros del catalogo. La comparten la tabla (al navegar),
 * la `key` del `<Suspense>` y el estado vacio (al volver a la primera pagina), de modo que la URL
 * que produce la pantalla es siempre la misma forma que el parser sabe leer, y `parse(build(p))`
 * devuelve `p`.
 */
export function buildCatalogListQuery(params: DataTableParams): string {
  const query = new URLSearchParams();
  query.set(CATALOG_PAGE_PARAM, String(params.page));
  query.set(CATALOG_PAGE_SIZE_PARAM, String(params.pageSize));

  if (params.sort !== null) {
    query.set(
      CATALOG_SORT_PARAM,
      `${params.sort.columnId}${CATALOG_SORT_SEPARATOR}${params.sort.direction}`,
    );
  }

  const search = params.search.trim();
  if (search !== '') query.set(CATALOG_SEARCH_PARAM, search);

  const cost = params.filters[COST_COLUMN_ID];
  if (cost?.kind === 'numberRange') {
    if (cost.min !== null) query.set(CATALOG_COST_MIN_PARAM, String(cost.min));
    if (cost.max !== null) query.set(CATALOG_COST_MAX_PARAM, String(cost.max));
  }

  const delivery = params.filters[DELIVERY_TIME_COLUMN_ID];
  if (delivery?.kind === 'numberRange') {
    if (delivery.min !== null) query.set(CATALOG_DELIVERY_MIN_PARAM, String(delivery.min));
    if (delivery.max !== null) query.set(CATALOG_DELIVERY_MAX_PARAM, String(delivery.max));
  }

  return query.toString();
}

/**
 * Destino de la lista del catalogo de un proveedor con unos parametros dados. **Se deriva de
 * `supplierDetailRoute`**: ningun archivo de esta ruta escribe la URL como literal.
 */
export function catalogListHref(supplierId: string, params: DataTableParams): string {
  return `${supplierDetailRoute(supplierId)}?${buildCatalogListQuery(params)}`;
}

/**
 * Las dos listas de tamanos -la que acota el parser y la que pinta el selector de la tabla
 * compartida- tienen que decir lo mismo. Se expone para que el test lo afirme sin importar el
 * barrel de la tabla compartida desde el test de esta ruta.
 */
export const CATALOG_SHARED_PAGE_SIZES: readonly number[] = SHARED_PAGE_SIZE_OPTIONS;
