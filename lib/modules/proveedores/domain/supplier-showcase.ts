// lib/modules/proveedores/domain/supplier-showcase.ts
import { z } from 'zod';

/**
 * Tipos, constantes y esquemas de la vista de catalogo visual.
 *
 * Los tamanos de tanda y el orden son CONSTANTES DEL DOMINIO, no entrada: el cliente no puede
 * pedir mas proveedores ni mas lineas de las que aqui se declaran, ni otro orden. Los tipos de
 * salida NO llevan `createdBy`, `updatedBy` ni fechas: la vista pinta imagen y nombre, y lo que
 * no viaja no se puede pintar por descuido.
 */

export const SHOWCASE_SUPPLIER_BATCH = 5;
export const SHOWCASE_LINE_BATCH = 10;

export const SHOWCASE_SUPPLIER_SORT = { columnId: 'name', direction: 'asc' } as const;
export const SHOWCASE_LINE_SORT = { columnId: 'name', direction: 'asc' } as const;

export type ShowcaseLine = {
  readonly id: string;
  readonly name: string;
  readonly imagePath: string | null;
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
