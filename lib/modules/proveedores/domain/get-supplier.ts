import { requireAdmin, type Actor } from './actor';
import { NotFoundError } from './errors';
import type { SupplierView } from './supplier-view';

import type { SupplierRepository } from '../ports/supplier-repository';

export type GetSupplierDeps = {
  readonly suppliers: SupplierRepository;
};

/**
 * Ficha de un proveedor (R22, R24, R35). Consultar TAMBIEN exige `requireAdmin` (decision
 * cerrada 1): la ficha no es menos sensible que el alta.
 *
 * La ficha NO trae las lineas del catalogo (R35, decision cerrada 5): el catalogo tiene su
 * propio listado paginado, y devolverlo aqui obligaria a traerlo entero.
 */
export function createGetSupplier(
  deps: GetSupplierDeps,
): (id: string, actor: Actor | null | undefined) => Promise<SupplierView> {
  return async function getSupplier(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<SupplierView> {
    requireAdmin(actor);

    // null = no existe o esta dado de baja (R22, R24): el puerto ya filtro los muertos.
    const supplier = await deps.suppliers.findAliveById(id);
    if (supplier === null) throw new NotFoundError();
    return supplier;
  };
}
