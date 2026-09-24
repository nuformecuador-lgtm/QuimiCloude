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
 * Escritura por identidad de una confirmacion de importacion, reutilizando `updateCatalogLineSchema`
 * -la misma forma que el alta y la edicion manuales, sin `supplierId`- porque este caso de uso es
 * el borde real de la escritura y no puede confiar en lo que le manden, aunque el clasificador ya
 * lo haya validado antes. La atomicidad y la idempotencia frente a confirmaciones simultaneas las
 * garantiza el adaptador; aqui no se abre ninguna transaccion propia.
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
