import { requireAdmin, type Actor } from './actor';
import { NotFoundError } from './errors';

import type { SupplierCatalogRepository } from '../ports/supplier-catalog-repository';

export type DeleteCatalogLineDeps = {
  readonly catalog: SupplierCatalogRepository;
};

/**
 * Baja de una linea del catalogo (R34).
 *
 * Es un borrado FISICO -la fila deja de existir-, y no contradice
 * `docs/architecture.md > Anti-patrones`: la linea no es transaccional -no mueve
 * existencias ni dinero- y QC-42 la dejo a proposito sin `deleted_at` (su decision 11), asi
 * que no hay donde marcar una baja logica. Por eso este caso de uso no recibe reloj: no hay
 * `updated_at` que sellar en una fila que desaparece.
 */
export function createDeleteCatalogLine(
  deps: DeleteCatalogLineDeps,
): (id: string, actor: Actor | null | undefined) => Promise<void> {
  return async function deleteCatalogLine(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requireAdmin(actor);

    const result = await deps.catalog.deleteById(id);
    if (result === 'not_found') throw new NotFoundError();
  };
}
