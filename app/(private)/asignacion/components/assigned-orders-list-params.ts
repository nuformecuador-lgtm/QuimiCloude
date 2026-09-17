import { PAGE_SIZE_OPTIONS, type DataTableParams } from '@/components/shared/data-table';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';

/**
 * Parser y serializador puros de los parametros de la lista de pedidos asignados (R31,
 * `design.md > 8.1`, `> 9.1`).
 *
 * **Sin DOM, sin React y sin `next/*` a proposito**, calcado de `order-list-params.ts` pero MUY
 * simplificado: esta lista **no ordena, no filtra y no busca** (`design.md > 9.1`), asi que solo
 * hay dos parametros: `page` y `pageSize`.
 *
 * **El resultado sigue siendo un `DataTableParams` completo**, porque `<DataTable>` lo exige:
 * `sort: null`, `filters: {}` y `search: ''` viajan SIEMPRE con esos valores fijos, nunca se leen
 * de la URL y nunca se escriben en ella (`buildOrderListQuery` de `pedidos` es la referencia de lo
 * que aqui NO se hace).
 */

/** Nombres de los dos unicos parametros de esta pantalla. */
export const PAGE_PARAM = 'page';
export const PAGE_SIZE_PARAM = 'pageSize';

/** La primera pagina es siempre el destino seguro: ningun parametro invalido produce un error. */
export const FIRST_PAGE = 1;

/** La forma que entrega `searchParams` del App Router: repetir `?page=1&page=2` da un array. */
export type AssignedOrdersSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

/**
 * De un parametro repetido se toma el PRIMER valor, igual que `order-list-params.ts`.
 */
function firstValue(raw: string | readonly string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' ? raw : raw[0];
}

/**
 * Entero decimal sin signo. La comprobacion es sobre el TEXTO y no sobre el resultado de
 * convertir: `'1.5'`, `'1e3'`, `'0x2'` y `' 2 '` no son lo que el usuario escribio en una URL de
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
 * Acota los parametros de la URL a un `DataTableParams` **siempre valido** (R31): ninguna entrada
 * produce un error, todas producen una lista. `sort`, `filters` y `search` viajan siempre con su
 * valor «sin efecto»: esta pantalla no tiene con que expresar orden, filtro ni busqueda.
 */
export function parseAssignedOrdersListParams(
  searchParams: AssignedOrdersSearchParams | undefined,
): DataTableParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[PAGE_SIZE_PARAM]));

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize: rawPageSize !== undefined && isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
    sort: null,
    filters: {},
    search: '',
  };
}

/**
 * Cadena de consulta canonica de unos parametros de lista: SOLO `page` y `pageSize`. Nunca escribe
 * `sort`, `filters` ni `search`: no existen para esta pantalla y escribirlos, aunque fuera con su
 * valor vacio, invitaria a creer que la lista los usa.
 */
export function buildAssignedOrdersListQuery(params: DataTableParams): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));
  return query.toString();
}

/**
 * Destino de la lista con unos parametros dados. **Se deriva de `ASSIGNED_ORDERS_ROUTE`**: ningun
 * archivo de esta ruta escribe la URL como literal.
 */
export function assignedOrdersListHref(params: DataTableParams): string {
  return `${ASSIGNED_ORDERS_ROUTE}?${buildAssignedOrdersListQuery(params)}`;
}

/**
 * Traduce un `DataTableParams` a la entrada de `listAssignedOrdersAction`: SOLO `page` y
 * `pageSize`, porque el esquema del dominio es `z.strictObject` y una clave de mas lo rechazaria
 * (`design.md > 9.1`).
 */
export function toAssignedOrdersQuery(params: DataTableParams): { page: number; pageSize: number } {
  return { page: params.page, pageSize: params.pageSize };
}
