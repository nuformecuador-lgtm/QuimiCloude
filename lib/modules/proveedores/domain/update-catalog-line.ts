import { requireAdmin, type Actor } from './actor';
import { updateCatalogLineSchema } from './catalog-line-input';
import { NotFoundError, ValidationError } from './errors';

import type { SupplierCatalogRepository } from '../ports/supplier-catalog-repository';

export type UpdateCatalogLineDeps = {
  readonly catalog: SupplierCatalogRepository;
  /** Ver el comentario identico de `create-supplier.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Edicion de una linea del catalogo (R31, R33).
 *
 * SOLO las condiciones comerciales: costo, minimo de compra y plazo de entrega. Ni el
 * proveedor ni el producto son cambiables, y no por un `if` sino porque ni el esquema de
 * entrada ni el puerto pueden EXPRESARLO (`design.md > 6.3`). Cambiar de producto es dar de
 * baja la linea y crear otra, dos operaciones que ya existen.
 *
 * Este caso de uso NO consulta el catalogo de productos: el producto de la linea no cambia,
 * asi que no hay nada nuevo que validar contra `inventario` (una llamada de mas seria una
 * consulta inutil por edicion). Y no toca ningun dato del proveedor (R31).
 */
export function createUpdateCatalogLine(
  deps: UpdateCatalogLineDeps,
): (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void> {
  const now = deps.now ?? (() => new Date());

  return async function updateCatalogLine(
    id: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requireAdmin(actor);

    const parsed = updateCatalogLineSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    // R30: «no indicado» se convierte en AUSENCIA explicita antes de salir del dominio. El
    // puerto recibe `null`, nunca `undefined`: la diferencia entre «no lo mandaron» y «lo
    // pusieron a nulo» no existe en un reemplazo completo, y dejar pasar `undefined` haria
    // que el adaptador se saltara la columna en vez de vaciarla.
    const result = await deps.catalog.updateTerms(
      id,
      {
        cost: parsed.data.cost,
        minPurchase: parsed.data.minPurchase ?? null,
        deliveryTime: parsed.data.deliveryTime ?? null,
      },
      actor.id,
      now(),
    );
    if (result === 'not_found') throw new NotFoundError();
  };
}
