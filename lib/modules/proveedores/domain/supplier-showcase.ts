import { z } from 'zod';

/**
 * Tamanos de tanda y orden son CONSTANTES DEL DOMINIO: el cliente no puede pedir mas
 * proveedores ni lineas de las declaradas, ni otro orden.
 */

export const SHOWCASE_SUPPLIER_BATCH = 5;
export const SHOWCASE_LINE_BATCH = 10;

export const SHOWCASE_SUPPLIER_SORT = { columnId: 'name', direction: 'asc' } as const;
export const SHOWCASE_LINE_SORT = { columnId: 'name', direction: 'asc' } as const;

export type ShowcaseLine = {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string | null;
};

/** `lines` es como maximo `SHOWCASE_LINE_BATCH`; vacio pinta «Sin productos todavia». */
export type ShowcaseRow = {
  readonly id: string;
  readonly name: string;
  readonly lines: readonly ShowcaseLine[];
  readonly hasMoreLines: boolean;
};

export type ShowcasePage = {
  readonly items: readonly ShowcaseRow[];
  readonly page: number;
  readonly hasMore: boolean;
};

export type ShowcaseLinesPage = {
  readonly items: readonly ShowcaseLine[];
  readonly page: number;
  readonly hasMore: boolean;
};

/**
 * Lo que el repositorio devuelve de verdad: la ruta guardada, no la URL. El
 * dominio mapea esto a `ShowcaseLine` con `toImageUrl`; el puerto no conoce la URL publica.
 */
export type ShowcaseLineRecord = {
  readonly id: string;
  readonly name: string;
  readonly imagePath: string | null;
};

export type ShowcaseRowRecord = {
  readonly id: string;
  readonly name: string;
  readonly lines: readonly ShowcaseLineRecord[];
  readonly hasMoreLines: boolean;
};

export type ShowcasePageRecord = {
  readonly items: readonly ShowcaseRowRecord[];
  readonly page: number;
  readonly hasMore: boolean;
};

/** Mismo tope que el resto de busquedas del modulo, para que no discrepen entre si. */
const SEARCH_MAX_LENGTH = 120;

/**
 * Entrada de la tanda de proveedores. Un termino de solo espacios se recorta a cadena vacia
 * con `trim()`, que es como el filtro cuenta como ausente.
 */
export const showcaseQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  supplierSearch: z.string().trim().max(SEARCH_MAX_LENGTH).default(''),
  productSearch: z.string().trim().max(SEARCH_MAX_LENGTH).default(''),
});

export type ShowcaseQuery = z.infer<typeof showcaseQuerySchema>;

/**
 * Entrada de «cargar mas» de una fila. La pagina 1 de una fila la trae siempre la tanda de
 * proveedores, asi que aqui el minimo es 2.
 */
export const showcaseLinesQuerySchema = z.object({
  page: z.number().int().min(2),
  productSearch: z.string().trim().max(SEARCH_MAX_LENGTH).default(''),
});

export type ShowcaseLinesQuery = z.infer<typeof showcaseLinesQuerySchema>;
