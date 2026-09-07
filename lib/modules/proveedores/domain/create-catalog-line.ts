import { requirePermission, type Actor } from './actor';
import { createCatalogLineSchema } from './catalog-line-input';
import { DuplicateCatalogLineError, NotFoundError, ValidationError } from './errors';

import type { SupplierCatalogRepository } from '../ports/supplier-catalog-repository';

export type CreateCatalogLineDeps = {
  readonly catalog: SupplierCatalogRepository;
  /** Ver el comentario identico de `create-supplier.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Alta de una linea del catalogo (R10, R13, R14, R15, R23, R25, R31).
 *
 * QC-52 le quita la dependencia hacia el catalogo de articulos de `inventario` y la
 * consulta que resolvia sus referencias (R18, decision cerrada 3): la linea ya no conoce
 * ningun articulo del inventario, asi que no hay nada que preguntarle a ese modulo. Sus
 * UNICAS dependencias son el repositorio del catalogo y el reloj, y eso es lo que hace
 * cierta la independencia entre las dos tablas: no es que se evite la consulta, es que no
 * hay ningun puerto por el que hacerla.
 *
 * Que la presentacion y la unidad EXISTAN no lo comprueba este caso de uso: lo garantiza la
 * clave foranea, y el adaptador traduce su `P2003` a entrada invalida (`design.md > 6.2`).
 * Un `SELECT` previo tampoco seria atomico -entre la lectura y el `INSERT` cabe un
 * borrado-, y volver a atar `proveedores` a `inventario` por esa puerta contradiria la
 * ficha entera.
 */
export function createCreateCatalogLine(
  deps: CreateCatalogLineDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  const now = deps.now ?? (() => new Date());

  return async function createCatalogLine(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'proveedores.modificar');

    const parsed = createCatalogLineSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    // R10: «no indicado» se convierte en AUSENCIA explicita antes de salir del dominio; el
    // puerto recibe `null`, nunca `undefined` (misma nota que en `update-catalog-line.ts`).
    //
    // R13: el actor viaja como un solo `actorId`; escribirlo en `created_by` Y `updated_by`
    // al nacer la linea es del adaptador.
    const result = await deps.catalog.create(
      {
        supplierId: parsed.data.supplierId,
        name: parsed.data.name,
        presentationId: parsed.data.presentationId,
        unitId: parsed.data.unitId ?? null,
        imagePath: parsed.data.imagePath ?? null,
        cost: parsed.data.cost,
        minPurchase: parsed.data.minPurchase ?? null,
        deliveryTime: parsed.data.deliveryTime ?? null,
      },
      actor.id,
      now(),
    );

    // R15: la unicidad de (proveedor, nombre normalizado, presentacion) la garantiza el
    // indice unico PARCIAL de la base; el adaptador tradujo su 23505 a un resultado
    // discriminado. No hay ningun `SELECT` previo, y el puerto no lo permitiria.
    if (result === 'duplicate') throw new DuplicateCatalogLineError();
    // R23: no hay proveedor VIVO con ese id -ni inexistente ni dado de baja-. Los dos casos
    // son «no encontrado» para el dominio: no se inventa un `code` nuevo para algo que el
    // usuario ya lee igual (R32).
    if (result === 'supplier_not_found') throw new NotFoundError();

    return result;
  };
}
