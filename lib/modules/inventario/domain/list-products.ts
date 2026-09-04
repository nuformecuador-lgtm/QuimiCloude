import { requireAdmin, type Actor } from './actor';
import { ValidationError } from './errors';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { PRODUCT_QUERYABLE } from './product-queryable';

import type { Page } from './page';
import type { ProductView } from './product-view';

import type { ListQueryLog } from '../ports/list-query-log';
import type { ProductRepository } from '../ports/product-repository';

export type ListProductsDeps = {
  readonly products: ProductRepository;
  readonly log: ListQueryLog;
};

/** Nombre con el que este listado se identifica en el log de campos omitidos (R6). */
const LIST_NAME = 'products';

/** El esquema no depende del actor ni de la consulta: se construye una vez por modulo. */
const listQuerySchema = createListQuerySchema();

/**
 * Lista paginada de productos con el CONTRATO GENERICO de consulta (QC-57 R24, R30, R33).
 * `productQuerySchema` -la busqueda propia de productos- ya no existe: la busqueda entra por
 * `search` del contrato, igual que en las otras seis listas (R24).
 *
 * Los cinco pasos van en ESTE orden y el orden es el requisito (`design.md > 1`):
 *
 *   1. `requireAdmin` PRIMERO, siempre (R33, R34). Antes de zod y antes de tocar el puerto: si
 *      validara primero, un actor no autorizado con una consulta rota recibiria
 *      `ValidationError` y sabria algo del sistema sin tener permiso para preguntarlo.
 *   2. zod DENTRO del caso de uso (R30). Valida la FORMA; un campo no declarado no puede
 *      hacer fallar la consulta (R5), asi que de eso no se ocupa el esquema.
 *   3. `sanitizeListQuery` contra `PRODUCT_QUERYABLE` (R4, R5, R7, R8): lo que no esta
 *      declarado se poda y la consulta NO falla.
 *   4. el log de lo podado (R6). Sin esto, una pantalla que pidiera `nombre` en vez de `name`
 *      mostraria datos sin filtrar y nadie se enteraria nunca.
 *   5. el repositorio, con la consulta YA SANEADA (R13): el filtro, el orden y la busqueda los
 *      aplica el motor sobre el conjunto completo, nunca sobre la pagina ya traida.
 *
 * El defecto de 10, el tope de 25 (R29) y el orden por defecto (R11) siguen siendo del
 * adaptador driven, que es el unico que puede importar `lib/shared/pagination`.
 */
export function createListProducts(
  deps: ListProductsDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<Page<ProductView>> {
  return async function listProducts(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<ProductView>> {
    requireAdmin(actor);

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { query, ignored } = sanitizeListQuery(parsed.data, PRODUCT_QUERYABLE);
    deps.log.ignoredFields(LIST_NAME, ignored);

    return deps.products.listAlive(query);
  };
}
