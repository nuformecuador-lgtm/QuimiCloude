import {
  PAGE_SIZE_OPTIONS,
  type DataTableParams,
  type DataTableSort,
} from '@/components/shared/data-table';
import { PRESENTATION_QUERYABLE } from '@/lib/modules/inventario';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { PRESENTATIONS_ROUTE } from '@/lib/shared/routes';

/**
 * Parser y serializador puros de los parametros de lista de presentaciones (R2, R10, R11, R12,
 * R13, R14; `design.md > 5.2`).
 *
 * **Sin DOM, sin React y sin `next/*` a proposito.** El estado de lista vive en la cadena de
 * consulta y no en React (alternativa I, descartada): recargar, compartir el enlace o volver con
 * «atras» conserva pagina, tamano, orden y busqueda, que es justo lo que R21 exige al cerrar el
 * panel lateral. Que estas funciones sean puras es lo que permite probar R14 sin montar la
 * pantalla.
 *
 * Es la hermana corta de `order-list-params.ts` (QC-35): misma forma, **sin filtros** y **con**
 * busqueda.
 *
 * **Los conjuntos validos se IMPORTAN del contrato**, nunca se escriben a mano: el campo de orden
 * se valida contra `PRESENTATION_QUERYABLE.sortable` y el tamano contra `PAGE_SIZE_OPTIONS`, asi
 * que si manana el catalogo declara otro campo ordenable esta pantalla lo acepta sin tocarse.
 * Acotar es de la capa de presentacion; **validar sigue siendo del dominio**, que ademas no falla
 * ante un campo no declarado (QC-57 R5). Se acota igual por no depender de esa cortesia y para que
 * la URL que el usuario ve sea la que la consulta usa.
 */

/**
 * Nombres de los parametros de consulta. Constantes porque los comparten el parser, la tabla y los
 * tests: un literal repetido es como se acaba con `pagesize` y `pageSize` conviviendo.
 */
export const PAGE_PARAM = 'page';
export const PAGE_SIZE_PARAM = 'pageSize';
export const SORT_PARAM = 'sort';
export const SEARCH_PARAM = 'q';

/** Id de la unica columna de datos, que es tambien el unico campo por el que se ordena (R9, R11). */
export const NAME_COLUMN_ID = 'name';

/** Separador de `campo:direccion` en el parametro de orden. */
export const SORT_SEPARATOR = ':';

/** La primera pagina es siempre el destino seguro: ningun parametro invalido produce un error. */
export const FIRST_PAGE = 1;

/** La forma que entrega `searchParams` del App Router: repetir `?page=1&page=2` da un array. */
export type PresentationListSearchParams = Readonly<
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
 * comprobacion es sobre el TEXTO y no sobre el resultado de convertir: `'1.5'`, `'1e3'`, `'0x2'` y
 * `' 2 '` no son lo que el usuario escribio en una URL de paginacion.
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
 * `PRESENTATION_QUERYABLE.sortable` —o una direccion desconocida— no es un error: es «sin orden»,
 * y la lista cae al orden por defecto que aplica el adaptador driven (R14).
 */
function parseSort(raw: string | undefined): DataTableSort | null {
  if (raw === undefined) return null;
  const separator = raw.indexOf(SORT_SEPARATOR);
  if (separator <= 0) return null;

  const columnId = raw.slice(0, separator);
  const direction = raw.slice(separator + SORT_SEPARATOR.length);
  if (!PRESENTATION_QUERYABLE.sortable.includes(columnId)) return null;
  if (direction !== 'asc' && direction !== 'desc') return null;

  return { columnId, direction };
}

/**
 * Termino de busqueda (R10). **Aqui SI se lee**, al reves que en pedidos, porque
 * `PRESENTATION_QUERYABLE.searchable` es `true` y la caja de busqueda de la tabla no miente. Se
 * recortan los espacios: buscar `'  '` es no buscar, y dejar el espacio en la URL solo produciria
 * dos URLs distintas para la misma lista.
 */
function parseSearch(raw: string | undefined): string {
  return raw === undefined ? '' : raw.trim();
}

/**
 * Acota los parametros de la URL a un `DataTableParams` **siempre valido** (R14): ninguna entrada
 * produce un error, todas producen una lista.
 *
 * El resultado se pasa **entero y sin traducir** a `listPresentationsAction`: `DataTableParams` es
 * campo a campo la misma forma que `ListQuery` (`design.md > 5.2`), y `createListQuerySchema()` es
 * un `z.strictObject`, asi que una clave de mas romperia el `parse`. Por eso aqui no se inventa
 * ninguna propiedad.
 */
export function parsePresentationListParams(
  searchParams: PresentationListSearchParams | undefined,
): DataTableParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[PAGE_SIZE_PARAM]));

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize: rawPageSize !== undefined && isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
    sort: parseSort(firstValue(searchParams?.[SORT_PARAM])),
    // **Siempre vacio, y no por olvido:** la unica columna filtrable que declara el contrato es
    // `createdAt` (`PRESENTATION_QUERYABLE.filterable`), y esta pantalla no pinta esa columna (R9).
    // Ofrecer un filtro por un dato que no se ve seria ruido, y emitirlo en la URL haria creer que
    // la lista filtra por algo.
    filters: {},
    search: parseSearch(firstValue(searchParams?.[SEARCH_PARAM])),
  };
}

/**
 * Cadena de consulta canonica de unos parametros de lista. La comparten la tabla (al navegar), la
 * `key` del `<Suspense>` y el estado vacio (al volver a la primera pagina), de modo que la URL que
 * produce la pantalla es siempre la misma forma que el parser sabe leer, y `parse(build(p))`
 * devuelve `p`.
 */
export function buildPresentationListQuery(params: DataTableParams): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));

  if (params.sort !== null) {
    query.set(SORT_PARAM, `${params.sort.columnId}${SORT_SEPARATOR}${params.sort.direction}`);
  }

  // Una busqueda vacia no se emite: `?q=` y sin `q` son la misma lista, y una sola de las dos
  // formas es la canonica.
  const search = params.search.trim();
  if (search !== '') query.set(SEARCH_PARAM, search);

  return query.toString();
}

/**
 * Destino de la lista con unos parametros dados. **Se deriva de `PRESENTATIONS_ROUTE`** (R2):
 * ningun archivo de esta ruta escribe la URL como literal, y por eso navegar, reintentar y volver
 * a la primera pagina pasan por aqui en vez de componer la cadena a mano.
 */
export function presentationListHref(params: DataTableParams): string {
  return `${PRESENTATIONS_ROUTE}?${buildPresentationListQuery(params)}`;
}
