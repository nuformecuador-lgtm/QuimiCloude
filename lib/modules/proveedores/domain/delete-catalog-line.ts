import { requirePermission, type Actor } from './actor';
import { CatalogLineNotFoundError } from './errors';
import type { SupplierScope } from './supplier-scope';

import type { SupplierCatalogRepository } from '../ports/supplier-catalog-repository';

export type DeleteCatalogLineDeps = {
  readonly catalog: SupplierCatalogRepository;
  /** Ver el comentario identico de `create-supplier.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Baja de una linea del catalogo (R13, R21, R22, R23, R25).
 *
 * Es un borrado LOGICO: la fila se conserva entera y se marca el instante de la baja. QC-52
 * deroga el borrado FISICO que fijaba QC-43 R34 (decision cerrada 5): la linea gana
 * `deleted_at` en esta ficha, y nada de este modulo borra filas nunca. Por eso este caso de
 * uso SI recibe reloj -hay `deleted_at` y `updated_at` que sellar- y SI registra al actor
 * como autor de la ultima modificacion, sin tocar el de la creacion (R13).
 *
 * **QC-43 R48 queda derogada entera** (P5): dar de baja la linea de un proveedor dado de
 * baja responde «no encontrado», igual que las otras tres operaciones (R23). Aquella
 * excepcion existia para que esas filas no quedaran «atrapadas sin ninguna operacion capaz
 * de eliminarlas»; desde que la baja del proveedor arrastra sus lineas (R20), ya estan
 * dadas de baja y no hay nada que atrapar.
 */
export function createDeleteCatalogLine(
  deps: DeleteCatalogLineDeps,
): (id: string, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function deleteCatalogLine(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'proveedores.modificar');

    const scope: SupplierScope = { companyId: actor.companyId };

    const dadaDeBaja = await deps.catalog.softDeleteAlive(id, actor.id, now(), scope);
    if (!dadaDeBaja) throw new CatalogLineNotFoundError();
  };
}
