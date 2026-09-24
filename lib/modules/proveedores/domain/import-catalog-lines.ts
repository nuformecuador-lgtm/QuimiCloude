import { requirePermission, type Actor } from './actor';
import { updateCatalogLineSchema } from './catalog-line-input';
import { SupplierNotFoundError, ValidationError } from './errors';
import type { SupplierScope } from './supplier-scope';

import type { SupplierCatalogImportRepository } from '../ports/supplier-catalog-import-repository';

export type ImportCatalogLinesDeps = {
  readonly catalog: SupplierCatalogImportRepository;
  /** Ver el comentario identico de `create-supplier.ts` sobre el origen de este reloj. */
  readonly now?: () => Date;
};

export type ImportCatalogLinesSummary = { created: number; updated: number; unchanged: number };

/**
 * Escritura por identidad de una confirmacion de importacion. Cada linea trae los MISMOS
 * nueve campos de negocio que el alta y la edicion manuales -`updateCatalogLineSchema` es
 * exactamente esa forma, sin `supplierId`- y se valida uno a uno ANTES de escribir nada: una
 * sola linea invalida hace que la operacion entera rechace sin tocar el puerto (el modulo que
 * clasifica ya exige esto mismo; aqui se repite la validacion de forma porque este caso de
 * uso es el borde real de la escritura y no puede confiar en lo que le manden).
 *
 * Permiso `proveedores.modificar` como PRIMERA operacion, antes de leer o escribir nada. La
 * atomicidad TODO O NADA y la idempotencia frente a dos confirmaciones simultaneas las
 * garantiza el adaptador, en una sola transaccion con el indice unico parcial como arbitro;
 * este caso de uso no abre ninguna transaccion propia.
 */
export function createImportCatalogLines(
  deps: ImportCatalogLinesDeps,
): (
  supplierId: string,
  lines: readonly unknown[],
  actor: Actor | null | undefined,
) => Promise<ImportCatalogLinesSummary> {
  const now = deps.now ?? (() => new Date());

  return async function importCatalogLines(
    supplierId: string,
    lines: readonly unknown[],
    actor: Actor | null | undefined,
  ): Promise<ImportCatalogLinesSummary> {
    requirePermission(actor, 'proveedores.modificar');

    const scope: SupplierScope = { companyId: actor.companyId };

    // Cada linea se valida de forma independiente y ANTES de tocar el puerto: la primera que
    // no encaje en el esquema hace que la operacion entera rechace sin escribir nada (el
    // modulo que clasifica ya exige esto mismo; aqui se repite porque este caso de uso es el
    // borde real de la escritura).
    const fields = lines.map((line) => {
      const parsed = updateCatalogLineSchema.safeParse(line);
      if (!parsed.success) throw new ValidationError();
      return {
        name: parsed.data.name,
        presentationId: parsed.data.presentationId,
        unitId: parsed.data.unitId ?? null,
        imagePath: parsed.data.imagePath ?? null,
        cost: parsed.data.cost,
        minPurchase: parsed.data.minPurchase ?? null,
        deliveryTime: parsed.data.deliveryTime ?? null,
        material: parsed.data.material ?? null,
        measurements: parsed.data.measurements ?? null,
      };
    });

    const result = await deps.catalog.upsertCostByIdentity(supplierId, fields, actor.id, now(), scope);
    if (result === 'supplier_not_found') throw new SupplierNotFoundError();

    return result;
  };
}
