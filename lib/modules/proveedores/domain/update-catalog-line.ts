import { requirePermission, type Actor } from './actor';
import { updateCatalogLineSchema } from './catalog-line-input';
import { CatalogLineNotFoundError, DuplicateCatalogLineError, ValidationError } from './errors';

import type { SupplierCatalogRepository } from '../ports/supplier-catalog-repository';

export type UpdateCatalogLineDeps = {
  readonly catalog: SupplierCatalogRepository;
  /** Ver el comentario identico de `create-supplier.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

/**
 * Edicion de una linea del catalogo (R13, R15, R23, R24, R25, R31).
 *
 * REEMPLAZO COMPLETO de los siete campos de negocio (P6, decidido por el humano el
 * 2026-09-04): nombre, presentacion, unidad, ruta de imagen, costo, minimo de compra y
 * tiempo de entrega. QC-43 R33 lo limitaba a las tres condiciones comerciales porque la
 * identidad de la linea era su pareja con el articulo del inventario y esa no se tocaba; al
 * desaparecer esa columna el argumento desaparece con ella, y una errata en el nombre no
 * tendria forma de corregirse salvo dando de baja la linea y perdiendo su historial y su
 * autoria.
 *
 * Lo UNICO que nunca cambia es el proveedor, y no por un `if`: ni el esquema de entrada ni
 * el tipo del puerto (`CatalogLineFields`) pueden EXPRESARLO.
 *
 * Este caso de uso no consulta ningun catalogo de articulos, presentaciones ni unidades: la
 * existencia de la presentacion y la unidad la cierra la FK (`design.md > 6.2`). Y no toca
 * ningun dato del proveedor: no tiene repositorio con que hacerlo.
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
    requirePermission(actor, 'proveedores.modificar');

    const parsed = updateCatalogLineSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    // R10: «no indicado» se convierte en AUSENCIA explicita antes de salir del dominio. El
    // puerto recibe `null`, nunca `undefined`: la diferencia entre «no lo mandaron» y «lo
    // pusieron a nulo» no existe en un reemplazo completo, y dejar pasar `undefined` haria
    // que el adaptador se saltara la columna en vez de vaciarla.
    const result = await deps.catalog.replaceAlive(
      id,
      {
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

    // R24, R15: renombrar hacia una combinacion que ya usa otra linea VIVA del mismo
    // proveedor es el mismo duplicado que en el alta, con el mismo `code` (R32).
    if (result === 'duplicate') throw new DuplicateCatalogLineError();
    // R23: `'not_found'` llega igual con la linea inexistente, con la ya dada de baja y con
    // la de un proveedor dado de baja. Lo decide el puerto -es quien define «vivo»-, no un
    // `if` de aqui.
    if (result === 'not_found') throw new CatalogLineNotFoundError();
  };
}
