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

/**
 * QC-57 (R24, T8): `productQuerySchema` y `ProductQuery` YA NO EXISTEN. El listado de
 * productos dejo de tener parametro de busqueda propio y acepta el contrato generico de
 * `domain/list-query.ts` -el mismo de las siete listas-, asi que una segunda forma de pedir
 * la lista de productos ya no puede existir por descuido.
 *
 * `pageQuerySchema` y `Page<T>` SIGUEN aqui: `Page<T>` es la salida de las siete listas
 * (`design.md > 3.2`), y `pageQuerySchema` se queda publicado en el contrato aunque YA NO
 * valide ninguna de las siete consultas de lista -de eso se ocupa `createListQuerySchema()`
 * dentro de cada caso de uso-: su forma de `page`/`pageSize` es la que el contrato de lista
 * repite.
 */
