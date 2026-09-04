import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/**
 * Parser puro de los parametros de lista de la pantalla de recetas (R11, R12, R13,
 * `design.md > 4.2`).
 *
 * **Sin DOM, sin React y sin `next/*` a proposito**: el estado de lista vive en la cadena de
 * consulta, asi que quien lo lee es el Server Component de la pagina *antes* de que exista nada
 * de cliente. Que este archivo sea una funcion pura es lo que permite probar R13 sin montar la
 * pantalla. Copia casi literal de `app/(private)/inventario/components/product-list-params.ts`
 * (QC-22), mismo criterio.
 *
 * **Acotar aqui no duplica ninguna regla de negocio.** `pageQuerySchema` (dominio de `recetas`)
 * *rechaza* `page: 0` con `ValidationError`, y esta pantalla mostraria un error donde el usuario
 * solo esperaba la primera pagina. Acotar es de la capa de presentacion; validar sigue siendo del
 * dominio.
 */

/**
 * Nombres de los dos parametros de consulta. Constantes porque las comparten el parser, la
 * barra de herramientas y los tests: un literal repetido es como se acaba con `pagesize` y
 * `pageSize` conviviendo.
 */
export const PAGE_PARAM = 'page';
export const PAGE_SIZE_PARAM = 'pageSize';

/**
 * Las DOS opciones de tamano de pagina (R11). Salen de `lib/shared/pagination` -10 es el
 * defecto del backend y 25 su tope- en vez de escribirse a mano: si el backend moviera
 * cualquiera de los dos, esta lista se mueve con el.
 */
export const PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE] as const;

export type RecipePageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export type RecipeListParams = {
  readonly page: number;
  readonly pageSize: RecipePageSize;
};

/** La forma que entrega `searchParams` del App Router: repetir `?page=1&page=2` da un array. */
export type RecipeListSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

/** La primera pagina es siempre el destino seguro: ningun parametro invalido produce un error. */
const FIRST_PAGE = 1;

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

function isPageSize(value: number): value is RecipePageSize {
  return PAGE_SIZE_OPTIONS.some((option) => option === value);
}

/**
 * Acota los parametros de la URL a un par siempre valido (R13): `page` entero >= 1 con defecto
 * 1, y `pageSize` una de las dos opciones con defecto `DEFAULT_PAGE_SIZE`.
 */
export function parseRecipeListParams(
  searchParams: RecipeListSearchParams | undefined,
): RecipeListParams {
  const rawPage = parsePositiveInt(firstValue(searchParams?.[PAGE_PARAM]));
  const rawPageSize = parsePositiveInt(firstValue(searchParams?.[PAGE_SIZE_PARAM]));

  return {
    page: rawPage === undefined || rawPage < FIRST_PAGE ? FIRST_PAGE : rawPage,
    pageSize: rawPageSize !== undefined && isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE,
  };
}

/**
 * Cadena de consulta canonica de unos parametros de lista. La comparten la barra de
 * herramientas (al navegar) y el estado vacio (al volver a la primera pagina), de modo que la
 * URL que produce la pantalla es siempre la misma forma que el parser sabe leer.
 */
export function buildRecipeListQuery(params: RecipeListParams): string {
  const query = new URLSearchParams();
  query.set(PAGE_PARAM, String(params.page));
  query.set(PAGE_SIZE_PARAM, String(params.pageSize));
  return query.toString();
}
