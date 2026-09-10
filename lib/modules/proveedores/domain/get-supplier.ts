import { requirePermission, type Actor } from './actor';
import { SupplierNotFoundError } from './errors';
import type { SupplierView } from './supplier-view';

import type { SupplierRepository } from '../ports/supplier-repository';

export type GetSupplierDeps = {
  readonly suppliers: SupplierRepository;
};

/**
 * Ficha de un proveedor (R22, R24, R35). Consultar TAMBIEN exige un permiso —
 * `proveedores.consultar`, QC-74 R16— (decision cerrada 1): la ficha no es menos sensible
 * que el alta. Y `proveedores.modificar` NO la abre: no hay implicacion entre permisos
 * (R13).
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
    requirePermission(actor, 'proveedores.consultar');

    // null = no existe o esta dado de baja (R22, R24): el puerto ya filtro los muertos.
    const supplier = await deps.suppliers.findAliveById(id);
    if (supplier === null) throw new SupplierNotFoundError();
    return supplier;
  };
}
