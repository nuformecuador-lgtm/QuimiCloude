import type { PageQuery, Page } from '../domain/page';
import type { PresentationView } from '../domain/presentation-view';

/**
 * Puerto de acceso a datos de presentacion (`design.md > 7`). `presentations` no lleva
 * `deleted_at` (D6): el borrado es fisico y por eso no hay ningun `…Alive` aqui, a
 * diferencia de `ProductRepository`.
 *
 * Resultados discriminados, no excepciones de Prisma: el adaptador driven traduce el
 * SQLSTATE `23505` (indice unico) a `'duplicate'` y el `23503` (FK de producto) a
 * `'in_use'`. La garantia de unicidad de R20 sigue siendo del indice unico -esta
 * comprobacion previa por `nameNormalized` es solo una cortesia de mensaje-.
 */
export interface PresentationRepository {
  create(name: string, nameNormalized: string): Promise<{ id: string } | 'duplicate'>;
  rename(
    id: string,
    name: string,
    nameNormalized: string,
  ): Promise<'ok' | 'not_found' | 'duplicate'>;
  deleteById(id: string): Promise<'deleted' | 'not_found' | 'in_use'>;
  list(query: PageQuery): Promise<Page<PresentationView>>;
}
