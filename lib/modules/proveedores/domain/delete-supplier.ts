import { requirePermission, type Actor } from './actor';
import { SupplierNotFoundError } from './errors';

import type { SupplierRepository } from '../ports/supplier-repository';

export type DeleteSupplierDeps = {
  readonly suppliers: SupplierRepository;
  /** Ver el comentario identico de `create-supplier.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Baja de proveedor (R8, R22, R23, R24). Baja LOGICA y sin restaurar (decision cerrada 6):
 * `softDeleteAlive`, jamas un borrado fisico. El proveedor conserva su fila entera y solo
 * gana `deleted_at`; su nombre queda libre para otro proveedor porque el indice unico es
 * PARCIAL sobre los vivos (R15).
 */
export function createDeleteSupplier(
  deps: DeleteSupplierDeps,
): (id: string, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function deleteSupplier(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'proveedores.modificar');

    // false = no existe o ya estaba dado de baja: mismo caso (R24).
    const deleted = await deps.suppliers.softDeleteAlive(id, actor.id, now());
    if (!deleted) throw new SupplierNotFoundError();
  };
}
