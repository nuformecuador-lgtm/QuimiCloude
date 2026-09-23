import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

/**
 * Parser puro de los dos filtros del catalogo visual de proveedores.
 *
 * Solo los DOS terminos de busqueda viven en la URL. La pagina de cada tanda no: la carga
 * perezosa es estado del cliente y siempre arranca desde la primera tanda cuando cambia un
 * filtro, asi que no hay nada de paginacion que este archivo tenga que leer ni escribir.
 *
 * Sin DOM, sin React y sin `next/*`: lo lee el Server Component de la pagina antes de que
 * exista nada de cliente.
 */

export const SUPPLIER_SEARCH_PARAM = 'supplier';
export const PRODUCT_SEARCH_PARAM = 'product';

export type ShowcaseSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

export type ShowcaseFilters = {
  readonly supplierSearch: string;
  readonly productSearch: string;
};

export const EMPTY_SHOWCASE_FILTERS: ShowcaseFilters = { supplierSearch: '', productSearch: '' };

// Mismo criterio que `URLSearchParams.get`: gana el primero.
function firstValue(raw: string | readonly string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' ? raw : raw[0];
}

// Un termino de solo espacios se recorta a cadena vacia, que es como cuenta como ausente.
function readSearch(raw: string | readonly string[] | undefined): string {
  return (firstValue(raw) ?? '').trim();
}

export function parseShowcaseParams(searchParams: ShowcaseSearchParams | undefined): ShowcaseFilters {
  return {
    supplierSearch: readSearch(searchParams?.[SUPPLIER_SEARCH_PARAM]),
    productSearch: readSearch(searchParams?.[PRODUCT_SEARCH_PARAM]),
  };
}

// Sin claves vacias: `?supplier=` haria creer que la vista esta filtrada.
export function buildShowcaseQuery(filters: ShowcaseFilters): string {
  const query = new URLSearchParams();
  const supplierSearch = filters.supplierSearch.trim();
  const productSearch = filters.productSearch.trim();
  if (supplierSearch !== '') query.set(SUPPLIER_SEARCH_PARAM, supplierSearch);
  if (productSearch !== '') query.set(PRODUCT_SEARCH_PARAM, productSearch);
  return query.toString();
}

// Se deriva de `SUPPLIERS_ROUTE`: ningun archivo de esta ruta escribe la URL como literal.
export function showcaseHref(filters: ShowcaseFilters): string {
  const query = buildShowcaseQuery(filters);
  return query === '' ? SUPPLIERS_ROUTE : `${SUPPLIERS_ROUTE}?${query}`;
}
