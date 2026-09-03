import { requireAdmin, type Actor } from './actor';
import { ValidationError } from './errors';
import { pageQuerySchema, type Page } from './page';
import type { SupplierView } from './supplier-view';

import type { SupplierRepository } from '../ports/supplier-repository';

export type ListSuppliersDeps = {
  readonly suppliers: SupplierRepository;
};

/**
 * Lista paginada de proveedores (R18, R19, R20, R21, R22, R35).
 *
 * El caso de uso valida SOLO el minimo y la integridad de la consulta (R20) y delega: el
 * defecto de 10, el tope de 25 y el orden name ASC, id ASC los aplica el adaptador driven
 * con `lib/shared/pagination`, que este archivo no puede importar (R44). El filtro de los
 * dados de baja tambien es del puerto (R22).
 *
 * El listado NO trae las lineas del catalogo (R35), por la misma razon que la ficha.
 */
export function createListSuppliers(
  deps: ListSuppliersDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<Page<SupplierView>> {
  return async function listSuppliers(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<SupplierView>> {
    requireAdmin(actor);

    const parsed = pageQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    return deps.suppliers.listAlive(parsed.data);
  };
}
