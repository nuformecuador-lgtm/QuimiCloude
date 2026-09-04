import { z } from 'zod';

/**
 * Tipo de salida del listado paginado (R34). El `pageSize` es SIEMPRE el efectivo, ya
 * acotado por `lib/shared/pagination` en el adaptador driven, nunca el pedido. Declarado
 * aqui de forma ESTRUCTURAL, copia literal de `recetas/domain/page.ts` y de
 * `proveedores/domain/page.ts`: el dominio no puede importar `lib/shared/`
 * (`docs/architecture.md > La regla de dependencias`), asi que el tipo no se importa de
 * ningun sitio.
 */
export type Page<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
};

/**
 * Esquema de entrada de la consulta paginada (R36). Aqui solo se rechaza el minimo y la
 * integridad —enteros mayores o iguales a 1—; el defecto de 10 y el tope de 25 (R35) los
 * aplica el util de `lib/shared/pagination` en el adaptador driven, no este esquema. Esa
 * aritmetica NO se reimplementa dentro de `pedidos` (R37).
 */
export const pageQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).optional(),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
