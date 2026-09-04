import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';

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
 * **Acotar aqui no duplica ninguna regla de negocio.** `pageQuerySchema` (dominio de
 * `proveedores`) *rechaza* `page: 0` con `ValidationError`, y la pantalla mostraria un error donde
 * el usuario solo esperaba la primera pagina. Acotar es de la capa de presentacion; validar sigue
 * siendo del dominio.
 */

/** Nombres de los dos parametros de consulta del catalogo. Constantes: los comparten parser, barra y tests. */
export const CATALOG_PAGE_PARAM = 'page';
export const CATALOG_PAGE_SIZE_PARAM = 'pageSize';

/**
 * Las DOS opciones de tamano de pagina (R8). Salen de `lib/shared/pagination` -10 es el defecto
 * del backend y 25 su tope-: si el backend moviera cualquiera de los dos, esta lista se mueve con el.
 */
export const CATALOG_PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE] as const;

export type CatalogPageSize = (typeof CATALOG_PAGE_SIZE_OPTIONS)[number];

export type CatalogListParams = {
  readonly page: number;
  readonly pageSize: CatalogPageSize;
};

/** La forma que entrega `searchParams` del App Router: repetir `?page=1&page=2` da un array. */
export type CatalogListSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

/** La primera pagina es siempre el destino seguro: ningun parametro invalido produce un error (R10). */
const FIRST_PAGE = 1;

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
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : undefined;
}

function isCatalogPageSize(value: number): value is CatalogPageSize {
  return CATALOG_PAGE_SIZE_OPTIONS.some((option) => option === value);
}

/**
 * Acota los parametros de la URL a un par siempre valido (R10): `page` entero >= 1 con defecto 1,
 * y `pageSize` una de las dos opciones con defecto `DEFAULT_PAGE_SIZE`.
 */
export function parseCatalogListParams(
  searchParams: CatalogListSearchParams | undefined,
): CatalogListParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[CATALOG_PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[CATALOG_PAGE_SIZE_PARAM]));

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize:
      rawPageSize !== undefined && isCatalogPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
  };
}

/**
 * Cadena de consulta canonica de unos parametros del catalogo. La comparten la barra de
 * herramientas (al navegar) y el estado vacio (al volver a la primera pagina), de modo que la URL
 * que produce la pantalla es siempre la misma forma que el parser sabe leer.
 */
export function buildCatalogListQuery(params: CatalogListParams): string {
  const query = new URLSearchParams();
  query.set(CATALOG_PAGE_PARAM, String(params.page));
  query.set(CATALOG_PAGE_SIZE_PARAM, String(params.pageSize));
  return query.toString();
}
