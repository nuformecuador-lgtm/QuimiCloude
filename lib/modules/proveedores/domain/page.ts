import { z } from 'zod';

/**
 * Tipo de salida de las dos consultas paginadas -proveedores y catalogo- (R18, R35). El
 * `pageSize` es SIEMPRE el efectivo, ya acotado por `lib/shared/pagination` en el
 * adaptador driven, nunca el pedido.
 */
export type Page<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
};

/**
 * Esquema de entrada de las consultas paginadas (R20). Aqui solo se rechaza el minimo y
 * la integridad: el defecto de 10 (R19) y el tope de 25 (R19) los aplica el util de
 * `lib/shared/pagination`, no este esquema -el dominio no puede importar `lib/shared/`
 * (R44, `docs/architecture.md > La regla de dependencias`)-.
 */
export const pageQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).optional(),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
