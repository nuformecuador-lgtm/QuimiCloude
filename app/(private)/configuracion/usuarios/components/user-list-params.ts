import {
  PAGE_SIZE_OPTIONS,
  type DataTableFilterValue,
  type DataTableParams,
  type DataTableSort,
} from '@/components/shared/data-table';
import { USER_ACCOUNT_STATUSES, USER_QUERYABLE } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { USERS_ROUTE } from '@/lib/shared/routes';

/**
 * Parser y serializador puros de los parametros de lista de usuarios (R13, R14, R16, R17;
 * `design.md > 5`).
 *
 * **Sin DOM, sin React y sin `next/*` a proposito.** El estado de lista vive en la cadena de
 * consulta y no en React (alternativa G del diseno, descartada): cerrar el panel lateral tiene
 * que devolver a la lista con los mismos parametros (R22) sin guardarlos en ningun sitio, y
 * recargar o compartir el enlace conserva pagina, filtro, orden y busqueda. Que estas funciones
 * sean puras es lo que permite probar R17 sin montar la pantalla.
 *
 * Es la hermana de `order-list-params.ts` —el precedente del filtro `select` **multivalor**— y de
 * `unit-list-params.ts` —el precedente de la busqueda—. Aqui conviven las dos cosas: esta lista
 * busca (`USER_QUERYABLE.searchable` es `true`) y filtra por un solo campo, multivalor.
 *
 * **Los conjuntos validos se IMPORTAN del contrato de `identity`**, nunca se escriben a mano: el
 * campo de orden se valida contra `USER_QUERYABLE.sortable`, los valores del filtro contra
 * `USER_ACCOUNT_STATUSES` y el tamano contra `PAGE_SIZE_OPTIONS`. Esta pantalla **no amplia la
 * lista blanca** (R15): si manana el catalogo declara otro campo ordenable, lo acepta sin
 * tocarse; y si alguien reescribiera la lista aqui, seria una segunda definicion libre de
 * divergir en silencio.
 *
 * Acotar es de la capa de presentacion; **validar sigue siendo del dominio**, que ademas no falla
 * ante un campo no declarado (QC-57 R5). Se acota igual por no depender de esa cortesia y para
 * que la URL que el usuario ve sea la que la consulta usa.
 */

/**
 * Nombres de los parametros de consulta. Constantes porque los comparten el parser, la tabla y
 * los tests: un literal repetido es como se acaba con `pagesize` y `pageSize` conviviendo.
 */
export const PAGE_PARAM = 'page';
export const PAGE_SIZE_PARAM = 'pageSize';
export const SORT_PARAM = 'sort';
export const STATUS_PARAM = 'status';
export const SEARCH_PARAM = 'q';

/**
 * Id de la UNICA columna filtrable, que es tambien la clave de `DataTableParams.filters`.
 * Coincide con el unico campo que declara `USER_QUERYABLE.filterable` (R13); se exporta para que
 * la declaracion de columnas no lo reescriba, y un test lo ata a esa clave.
 */
export const ACCOUNT_STATUS_COLUMN_ID = 'accountStatus';

/** Separador de `campo:direccion` en el parametro de orden. */
export const SORT_SEPARATOR = ':';

/** Separador de una lista de valores de un filtro de seleccion. */
export const FILTER_SEPARATOR = ',';

/** La primera pagina es siempre el destino seguro: ningun parametro invalido produce un error. */
export const FIRST_PAGE = 1;

/** La forma que entrega `searchParams` del App Router: repetir `?page=1&page=2` da un array. */
export type UserListSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

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
 * `USER_QUERYABLE.sortable` —el nombre mostrable, que no es una columna real sino una
 * composicion, o el rol, que no esta en la lista— o una direccion desconocida no son un error:
 * son «sin orden», y la lista cae al orden por defecto que aplica el adaptador driven
 * (`lastNames ASC, firstNames ASC, id ASC`), que esta pantalla no reproduce.
 */
function parseSort(raw: string | undefined): DataTableSort | null {
  if (raw === undefined) return null;
  const separator = raw.indexOf(SORT_SEPARATOR);
  if (separator <= 0) return null;

  const columnId = raw.slice(0, separator);
  const direction = raw.slice(separator + SORT_SEPARATOR.length);
  if (!USER_QUERYABLE.sortable.includes(columnId)) return null;
  if (direction !== 'asc' && direction !== 'desc') return null;

  return { columnId, direction };
}

/**
 * Filtro de seleccion a partir de una lista separada por comas (R13, R17). Los valores que no
 * esten en el conjunto cerrado del contrato **se descartan uno a uno** en vez de invalidar la
 * lista entera; y una lista que se queda vacia es «sin filtro», no un filtro que no case con
 * nada. Mismo criterio que `parseSelectFilter` de pedidos.
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
 * Termino de busqueda (R12). **Aqui SI se lee**, porque `USER_QUERYABLE.searchable` es `true` y
 * la caja de busqueda de la tabla no miente. Se recortan los espacios: buscar solo espacios es no
 * buscar, y dejarlos en la URL produciria dos URLs distintas para la misma lista.
 *
 * Que columnas toca la busqueda —nombres, apellidos, correo y nombre de usuario— lo decide el
 * adaptador driven, el unico que conoce la base. Esta pantalla no lo reproduce.
 */
function parseSearch(raw: string | undefined): string {
  return raw === undefined ? '' : raw.trim();
}

/**
 * Acota los parametros de la URL a un `DataTableParams` **siempre valido** (R17): ninguna entrada
 * produce un error, todas producen una lista.
 *
 * El resultado se pasa **entero y sin traducir** a `listUsersAction`: `DataTableParams` es campo
 * a campo la misma forma que `ListQuery` (`design.md > 4.1`), y `createListQuerySchema()` es un
 * `z.strictObject`, asi que una clave de mas romperia el `parse`. Por eso aqui no se inventa
 * ninguna propiedad.
 */
export function parseUserListParams(
  searchParams: UserListSearchParams | undefined,
): DataTableParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[PAGE_SIZE_PARAM]));

  const filters: Record<string, DataTableFilterValue> = {};

  // El UNICO filtro de la pantalla (R13). No hay filtro por rol, y no por olvido: el contrato no
  // lo declara filtrable y R15 prohibe ampliar la lista blanca desde aqui.
  const accountStatus = parseSelectFilter(
    firstValue(searchParams?.[STATUS_PARAM]),
    USER_ACCOUNT_STATUSES,
  );
  if (accountStatus !== null) filters[ACCOUNT_STATUS_COLUMN_ID] = accountStatus;

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize: rawPageSize !== undefined && isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
    sort: parseSort(firstValue(searchParams?.[SORT_PARAM])),
    filters,
    search: parseSearch(firstValue(searchParams?.[SEARCH_PARAM])),
  };
}

/**
 * Cadena de consulta canonica de unos parametros de lista. La comparten la tabla (al navegar), la
 * `key` del `<Suspense>` y el estado vacio (al volver a la primera pagina), de modo que la URL
 * que produce la pantalla es siempre la misma forma que el parser sabe leer, y `parse(build(p))`
 * devuelve `p`.
 */
export function buildUserListQuery(params: DataTableParams): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));

  if (params.sort !== null) {
    query.set(SORT_PARAM, `${params.sort.columnId}${SORT_SEPARATOR}${params.sort.direction}`);
  }

  const accountStatus = params.filters[ACCOUNT_STATUS_COLUMN_ID];
  if (accountStatus?.kind === 'select' && accountStatus.values.length > 0) {
    query.set(STATUS_PARAM, accountStatus.values.join(FILTER_SEPARATOR));
  }

  // Una busqueda vacia no se emite: `?q=` y sin `q` son la misma lista, y una sola de las dos
  // formas es la canonica.
  const search = params.search.trim();
  if (search !== '') query.set(SEARCH_PARAM, search);

  return query.toString();
}

/**
 * Destino de la lista con unos parametros dados. **Se deriva de `USERS_ROUTE`** (R1): ningun
 * archivo de esta ruta escribe la URL como literal, y por eso navegar, reintentar y volver a la
 * primera pagina pasan por aqui en vez de componer la cadena a mano.
 */
export function userListHref(params: DataTableParams): string {
  return `${USERS_ROUTE}?${buildUserListQuery(params)}`;
}
