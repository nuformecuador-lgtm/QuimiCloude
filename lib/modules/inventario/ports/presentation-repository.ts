import type { PageQuery, Page } from '../domain/page';
import type { PresentationView } from '../domain/presentation-view';

/**
 * Puerto de acceso a datos de presentacion (`design.md > 7`). `presentations` no lleva
 * `deleted_at` (D6): el borrado es fisico y por eso no hay ningun `…Alive` aqui, a
 * diferencia de `ProductRepository`.
 *
 * Resultados discriminados, no excepciones de Prisma: el adaptador driven traduce el
 * SQLSTATE `23505` (indice unico) a `'duplicate'` y el `23503` (FK de producto) a
 * `'in_use'`. La garantia de unicidad de R20 la da **solo** el indice unico
 * `presentations_name_normalized_key`: este puerto no expone ningun metodo de busqueda
 * (ni `findBy`, ni `search`, ni `exists`) y deliberadamente no hay comprobacion previa por
 * `nameNormalized` -- entre un `SELECT` previo y el `INSERT` cabe otra transaccion, asi que
 * no cerraria la carrera (`design.md > 11.4`). El mensaje al usuario sale de traducir el
 * `'duplicate'` que devuelve el adaptador cuando Postgres rechaza la escritura (el
 * `INSERT` de `create` o el `UPDATE` de `rename`) por chocar contra el indice unico.
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
