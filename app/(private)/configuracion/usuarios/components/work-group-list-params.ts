import {
  PAGE_SIZE_OPTIONS,
  type DataTableParams,
  type DataTableSort,
} from '@/components/shared/data-table';
import { WORK_GROUP_QUERYABLE } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { USERS_ROUTE } from '@/lib/shared/routes';

import {
  FIRST_PAGE,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  SORT_SEPARATOR,
  type UserListSearchParams,
} from './user-list-params';
import { GROUPS_TAB, TAB_PARAM } from './usuarios-tabs';

/**
 * Parser y serializador puros de los parametros de lista de GRUPOS (R13, R15, R16, R17, R3, R7;
 * `design.md > 4.2`).
 *
 * **Sin DOM, sin React y sin `next/*` a proposito**, igual que su hermano `user-list-params.ts`:
 * el estado de lista vive en la cadena de consulta y no en React, asi que cerrar el panel lateral
 * devuelve a la lista con los mismos parametros sin guardarlos en ningun sitio, y recargar o
 * compartir el enlace conserva pagina, orden y busqueda. Que estas funciones sean puras es lo que
 * permite probar R17 —ninguna entrada produce una excepcion— sin montar la pantalla.
 *
 * **Es el hermano de `user-list-params.ts`, no un generico compartido** (`design.md > 11 F`): los
 * dos parsers difieren en lo que importa —grupos **no tiene filtros** y personas si; las listas
 * blancas son distintas— y un generico acabaria parametrizado por casi todo.
 *
 * **Los nombres de los parametros NO se redeclaran aqui.** `PAGE_PARAM`, `PAGE_SIZE_PARAM`,
 * `SORT_PARAM`, `SEARCH_PARAM`, `SORT_SEPARATOR` y `FIRST_PAGE` ya los declara el hermano y salen
 * del barrel desde EL: cada nombre publico de la ruta sale de un solo archivo. Que las dos
 * pestanas lean `page` y `pageSize` con el mismo nombre no es reutilizacion por pereza: es la
 * misma URL.
 *
 * **`filters` es SIEMPRE `{}`** (R16): `WORK_GROUP_QUERYABLE.filterable` esta vacio, asi que esta
 * pantalla no declara ningun filtro. No se amplia la lista blanca desde aqui; anadir un filtro
 * manana es una linea en `work-group-queryable.ts` y su propia ficha.
 *
 * **El orden se valida contra `WORK_GROUP_QUERYABLE.sortable`, LEIDA del contrato** (R15): no es
 * una copia de la lista, es la lista. Un campo que no este en ella no es un error, es «sin orden»,
 * y la consulta cae al orden por defecto del adaptador (`name ASC, id ASC`), que esta pantalla no
 * reproduce.
 *
 * **La cadena canonica conserva `tab=grupos`** (R3, R7): navegar dentro de la lista de grupos
 * —cambiar de pagina, de orden, de tamano o de termino— no puede devolver al usuario a la pestana
 * de personas. El destino se deriva de `USERS_ROUTE`; ningun archivo de producto incrusta la URL.
 */

/**
 * La forma que entrega `searchParams` del App Router. **Se toma del hermano** en vez de declararse
 * otra vez: es la misma URL leida por dos parsers, no dos formas distintas.
 */
export type WorkGroupListSearchParams = UserListSearchParams;

/**
 * De un parametro repetido se toma el PRIMER valor, la convencion de `URLSearchParams.get` y la
 * misma que siguen `parseUserListParams` y `parseUsuariosTab`.
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
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

function isPageSize(value: number): boolean {
  return PAGE_SIZE_OPTIONS.some((option) => option === value);
}

/**
 * Orden vigente a partir de `campo:asc` o `campo:desc` (R15, R17). Un campo que la lista blanca no
 * declare, o una direccion desconocida, dan `null`: sin orden, nunca un error.
 *
 * **`createdAt` SI se acota como valido** —esta en la lista blanca— aunque no sea una columna
 * visible (`design.md > 10.3`): la lista blanca dice lo que la consulta ADMITE, no lo que la tabla
 * MUESTRA. Un enlace con `sort=createdAt:desc` se respeta; la cabecera no lo ofrece.
 */
function parseSort(raw: string | undefined): DataTableSort | null {
  if (raw === undefined) return null;
  const separator = raw.indexOf(SORT_SEPARATOR);
  if (separator <= 0) return null;

  const columnId = raw.slice(0, separator);
  const direction = raw.slice(separator + SORT_SEPARATOR.length);
  if (!WORK_GROUP_QUERYABLE.sortable.includes(columnId)) return null;
  if (direction !== 'asc' && direction !== 'desc') return null;

  return { columnId, direction };
}

/**
 * Termino de busqueda (R14). Se lee porque `WORK_GROUP_QUERYABLE.searchable` es `true` y la caja
 * de busqueda de la tabla no miente. Se recortan los espacios: buscar solo espacios es no buscar,
 * y dejarlos produciria dos URLs distintas para la misma lista.
 *
 * Que columna toca la busqueda —el nombre— lo decide el adaptador driven, el unico que conoce la
 * base. Esta pantalla no lo reproduce.
 */
function parseSearch(raw: string | undefined): string {
  return raw === undefined ? '' : raw.trim();
}

/**
 * Acota los parametros de la URL a un `DataTableParams` **siempre valido** (R17): ninguna entrada
 * produce una excepcion, todas producen una lista.
 *
 * El resultado se pasa **entero y sin traducir** a `listWorkGroupsAction`: `DataTableParams` es
 * campo a campo la misma forma que `ListQuery` (`design.md > 4.1`), y `createListQuerySchema()` es
 * un `z.strictObject`, asi que una clave de mas romperia el `parse`. Por eso aqui no se inventa
 * ninguna propiedad.
 */
export function parseWorkGroupListParams(
  searchParams: WorkGroupListSearchParams | undefined,
): DataTableParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[PAGE_SIZE_PARAM]));

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize: rawPageSize !== undefined && isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
    sort: parseSort(firstValue(searchParams?.[SORT_PARAM])),
    // R16: la lista blanca de grupos no declara NINGUN campo filtrable, asi que aqui no hay ni un
    // filtro que leer. El objeto vacio no es un hueco pendiente: es el contrato.
    filters: {},
    search: parseSearch(firstValue(searchParams?.[SEARCH_PARAM])),
  };
}

/**
 * Cadena de consulta canonica de unos parametros de lista de grupos. La comparten la tabla (al
 * navegar), la `key` del `<Suspense>` y el estado vacio (al volver a la primera pagina), de modo
 * que la URL que produce la pantalla es siempre la forma que el parser sabe leer, y
 * `parse(build(p))` devuelve `p`.
 *
 * **`tab` va PRIMERO y siempre** (R3, R7): es lo que hace que paginar dentro de los grupos siga
 * mostrando grupos. Su valor sale de `GROUPS_TAB`, nunca de un literal.
 */
export function buildWorkGroupListQuery(params: DataTableParams): string {
  const query = new URLSearchParams();
  query.set(TAB_PARAM, GROUPS_TAB);
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
 * Destino de la lista de grupos con unos parametros dados. **Se deriva de `USERS_ROUTE`** (R3):
 * ningun archivo de esta ruta escribe la URL como literal, y por eso navegar, reintentar y volver
 * a la primera pagina pasan por aqui en vez de componer la cadena a mano.
 */
export function workGroupListHref(params: DataTableParams): string {
  return `${USERS_ROUTE}?${buildWorkGroupListQuery(params)}`;
}
