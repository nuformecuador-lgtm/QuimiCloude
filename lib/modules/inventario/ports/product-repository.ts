import type { ListQuery } from '../domain/list-query';
import type { Page } from '../domain/page';
import type { NewProduct, ProductView } from '../domain/product-view';

/**
 * Puerto de acceso a datos de producto (`design.md > 7`). El sufijo `Alive` en los
 * nombres de metodo NO es adorno: el filtro `deleted_at IS NULL` es responsabilidad de
 * ESTE puerto/su adaptador, no del dominio (R16). No hay ninguna operacion de listar
 * borrados ni de restaurar (D5).
 *
 * Los resultados son booleanos/objetos discriminados, nunca excepciones de Prisma: el
 * dominio no ve ningun SQLSTATE. Traducirlos es responsabilidad del adaptador driven
 * (Grupo C).
 */
export interface ProductRepository {
  create(data: NewProduct, actorId: string, now: Date): Promise<{ id: string }>;
  findAliveById(id: string): Promise<ProductView | null>;
  updateAlive(id: string, data: NewProduct, actorId: string, now: Date): Promise<boolean>;
  softDeleteAlive(id: string, actorId: string, now: Date): Promise<boolean>;
  /** QC-57 (R24): recibe el CONTRATO GENERICO ya saneado por el caso de uso, no la
   *  consulta cruda del llamante. Traducir `columnId`/filtros a SQL es del adaptador. */
  listAlive(query: ListQuery): Promise<Page<ProductView>>;
}
