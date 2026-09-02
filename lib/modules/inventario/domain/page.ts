import { z } from 'zod';

/**
 * Tipo de salida de las dos consultas paginadas (`design.md > 6.3`). El `pageSize`
 * siempre es el efectivo, ya acotado por `lib/shared/pagination` -nunca el pedido-.
 */
export type Page<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
};

/**
 * Esquema de entrada de la consulta paginada (R25). Aqui solo se rechaza el minimo y
 * la integridad: el defecto de 10 (R24) y el tope de 25 (R36) los aplica el util de
 * `lib/shared/pagination`, no este esquema -el dominio no puede importar `lib/shared/`
 * (`docs/architecture.md > La regla de dependencias`)-.
 */
export const pageQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).optional(),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
