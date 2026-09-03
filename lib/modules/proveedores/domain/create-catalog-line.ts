import { requireAdmin, type Actor } from './actor';
import { createCatalogLineSchema } from './catalog-line-input';
import {
  DuplicateCatalogLineError,
  NotFoundError,
  ProductNotFoundError,
  ValidationError,
} from './errors';

import type { ProductCatalog } from '@/lib/modules/inventario';

import type { SupplierCatalogRepository } from '../ports/supplier-catalog-repository';

export type CreateCatalogLineDeps = {
  readonly catalog: SupplierCatalogRepository;
  /**
   * El contrato PUBLICO de `inventario` (`@/lib/modules/inventario`), nunca `prisma.product`
   * ni una ruta profunda (R26). Se importa por el BARREL y solo como TIPO: la
   * implementacion la ata `lib/composition` (T13).
   */
  readonly products: ProductCatalog;
  /** Ver el comentario identico de `create-supplier.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Alta de una linea del catalogo (R25, R26, R27, R31).
 *
 * El producto se comprueba con UNA sola llamada a `findRefs` (`design.md > 5.3`), no una
 * por linea. «No existe» y «esta dado de baja» son EL MISMO caso para este modulo:
 * `findRefs` solo devuelve productos vivos, asi que el id simplemente no vuelve.
 */
export function createCreateCatalogLine(
  deps: CreateCatalogLineDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  const now = deps.now ?? (() => new Date());

  return async function createCatalogLine(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    requireAdmin(actor);

    const parsed = createCatalogLineSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const refs = await deps.products.findRefs([parsed.data.productId]);
    if (refs.length === 0) throw new ProductNotFoundError();

    // R30: «no indicado» se convierte en AUSENCIA explicita antes de salir del dominio; el
    // puerto recibe `null`, nunca `undefined` (misma nota que en `update-catalog-line.ts`).
    //
    // R31: el actor viaja como un solo `actorId`; escribirlo en `created_by` Y `updated_by`
    // al nacer la linea es del adaptador (T12).
    const result = await deps.catalog.create(
      {
        supplierId: parsed.data.supplierId,
        productId: parsed.data.productId,
        cost: parsed.data.cost,
        minPurchase: parsed.data.minPurchase ?? null,
        deliveryTime: parsed.data.deliveryTime ?? null,
      },
      actor.id,
      now(),
    );

    // R27: la unicidad de la pareja la garantiza el indice de la base; el adaptador
    // tradujo su 23505 a un resultado discriminado.
    if (result === 'duplicate') throw new DuplicateCatalogLineError();
    // R25: la FK rechazo el proveedor. Para el dominio es «no encontrado», igual que un
    // proveedor dado de baja.
    if (result === 'supplier_not_found') throw new NotFoundError();

    return result;
  };
}
