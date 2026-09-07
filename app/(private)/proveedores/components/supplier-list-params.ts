import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/**
 * Parser puro de los parametros de lista de la pantalla de proveedores (R8, R10,
 * `design.md > 5.1`).
 *
 * **Sin DOM, sin React y sin `next/*` a proposito**: el estado de lista vive en la cadena de
 * consulta, asi que quien lo lee es el Server Component de la pagina *antes* de que exista nada
 * de cliente. Que este archivo sea una funcion pura es lo que permite probar R10 sin montar la
 * pantalla.
 *
 * **Acotar aqui no duplica ninguna regla de negocio.** Quien valida la consulta de lista es
 * `createListQuerySchema()`, dentro del caso de uso `listSuppliers` (QC-57), y *rechaza* `page: 0`
 * con `ValidationError`: esta pantalla mostraria un error donde el usuario solo esperaba la
 * primera pagina. Acotar es de la capa de presentacion; validar sigue siendo del dominio.
 *
 * **Que este parser lea SOLO `page` y `pageSize` es decision de esta pantalla, no un limite del
 * dominio.** Desde QC-57 el contrato de lista acepta ademas `sort`, `filters` y `search`, podados
 * contra la lista blanca `SUPPLIER_QUERYABLE`; `pageQuerySchema` sigue existiendo pero ya no es
 * quien valida este listado. QC-44 dejo `buscar y ordenar` fuera de esta pantalla por escrito, y
 * QC-57 no las anade (`specs/QC-57-orden-y-filtro-en-listados/tasks.md > Lo que esta ficha NO
 * hace`).
 *
 * **Es un parser propio y no el de la ruta de inventario** aunque la forma coincida: importar el
 * de otra ruta ataria dos rutas por sus componentes internos, y el precedente del repo es que
 * cada ruta tenga el suyo (`design.md > 6.1`).
 */

/**
 * Nombres de los dos parametros de consulta. Constantes porque las comparten el parser, la barra
 * de herramientas y los tests: un literal repetido es como se acaba con `pagesize` y `pageSize`
 * conviviendo.
 */
export const PAGE_PARAM = 'page';
export const PAGE_SIZE_PARAM = 'pageSize';

/**
 * Las DOS opciones de tamano de pagina que fijo la decision del 2026-09-04 (R8). Salen de
 * `lib/shared/pagination` —10 es el defecto del backend y 25 su tope— en vez de escribirse a
 * mano: si el backend moviera cualquiera de los dos, esta lista se mueve con el.
 */
export const PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE] as const;

export type SupplierPageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export type SupplierListParams = {
  readonly page: number;
  readonly pageSize: SupplierPageSize;
};

/** La forma que entrega `searchParams` del App Router: repetir `?page=1&page=2` da un array. */
export type SupplierListSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

/** La primera pagina es siempre el destino seguro: ningun parametro invalido produce un error. */
const FIRST_PAGE = 1;

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

function isPageSize(value: number): value is SupplierPageSize {
  return PAGE_SIZE_OPTIONS.some((option) => option === value);
}

/**
 * Acota los parametros de la URL a un par siempre valido (R10): `page` entero >= 1 con defecto 1,
 * y `pageSize` una de las dos opciones con defecto `DEFAULT_PAGE_SIZE`. Un tamano POR ENCIMA del
 * tope (`MAX_PAGE_SIZE`) tampoco es un error: cae al defecto como cualquier otro valor que no
 * este en la lista.
 */
export function parseSupplierListParams(
  searchParams: SupplierListSearchParams | undefined,
): SupplierListParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[PAGE_SIZE_PARAM]));

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize: rawPageSize !== undefined && isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
  };
}

/**
 * Cadena de consulta canonica de unos parametros de lista. La comparten la barra de herramientas
 * (al navegar) y el estado vacio (al volver a la primera pagina), de modo que la URL que produce
 * la pantalla es siempre la misma forma que el parser sabe leer.
 */
export function buildSupplierListQuery(params: SupplierListParams): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));
  return query.toString();
}
