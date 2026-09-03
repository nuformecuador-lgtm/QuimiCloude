import { requireAdmin, type Actor } from './actor';
import { DuplicateNameError, NotFoundError, ValidationError } from './errors';
import { updateSupplierSchema } from './supplier-input';
import { normalizeSupplierName } from './supplier-name';

import type { SupplierRepository } from '../ports/supplier-repository';

export type UpdateSupplierDeps = {
  readonly suppliers: SupplierRepository;
  /** Ver el comentario identico de `create-supplier.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Edicion de proveedor (R8, R14, R15, R16, R24).
 *
 * REEMPLAZO COMPLETO de los campos de negocio, no PATCH campo a campo (R14): el esquema de
 * edicion es el mismo del alta, y por eso no existe ninguna operacion por campo suelto.
 *
 * R8: el actor queda como autor de la ULTIMA MODIFICACION sin tocar el de creacion. Esa
 * mitad la cierra el adaptador -`data` no lleva `createdBy` y el `updateMany` tampoco-, y
 * su prueba real es la de integracion (T17).
 */
export function createUpdateSupplier(
  deps: UpdateSupplierDeps,
): (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function updateSupplier(
    id: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requireAdmin(actor);

    const parsed = updateSupplierSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const result = await deps.suppliers.updateAlive(
      id,
      { ...parsed.data, nameNormalized: normalizeSupplierName(parsed.data.name) },
      actor.id,
      now(),
    );

    // R24: no existe y ya esta dado de baja son el mismo caso; el filtro
    // deleted_at IS NULL vive en el puerto (R22), no en un if de aqui.
    if (result === 'not_found') throw new NotFoundError();
    if (result === 'duplicate') throw new DuplicateNameError();
  };
}
