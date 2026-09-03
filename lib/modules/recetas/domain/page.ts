import { z } from 'zod';

/**
 * Tipo de salida del listado paginado (`design.md > 7.2`). El `pageSize` siempre es el
 * efectivo, ya acotado por `lib/shared/pagination` -nunca el pedido-. Declarado aqui de
 * forma ESTRUCTURAL: no se importa de `lib/modules/inventario/domain/page` ni de
 * `lib/shared/` (el dominio no puede importar `lib/shared/`,
 * `docs/architecture.md > La regla de dependencias`).
 */
export type Page<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
};

/**
 * Esquema de entrada de la consulta paginada (R30). Aqui solo se rechaza el minimo y la
 * integridad: el defecto de 10 y el tope de 25 los aplica el util de
 * `lib/shared/pagination` en el adaptador driven, no este esquema.
 */
export const pageQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).optional(),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
