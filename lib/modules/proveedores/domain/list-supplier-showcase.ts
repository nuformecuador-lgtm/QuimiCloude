import { requirePermission, type Actor } from './actor';
import { toImageUrl } from './catalog-image-url';
import { ValidationError } from './errors';
import { showcaseQuerySchema } from './supplier-showcase';
import type { SupplierScope } from './supplier-scope';

import type {
  ShowcaseLineRecord,
  ShowcasePage,
  ShowcaseRowRecord,
} from './supplier-showcase';

import type { CatalogImageUrl } from '../ports/catalog-image-url';
import type { SupplierRepository } from '../ports/supplier-repository';

export type ListSupplierShowcaseDeps = {
  readonly suppliers: SupplierRepository;
  readonly images: CatalogImageUrl;
};

/** `ShowcaseRowRecord` -> `ShowcaseRow`: sus lineas ganan `imageUrl` y pierden `imagePath`. */
function toShowcaseRow(row: ShowcaseRowRecord, images: CatalogImageUrl) {
  return {
    id: row.id,
    name: row.name,
    lines: row.lines.map((line: ShowcaseLineRecord) => ({
      id: line.id,
      name: line.name,
      imageUrl: toImageUrl(line.imagePath, images),
    })),
    hasMoreLines: row.hasMoreLines,
  };
}

/**
 * Tanda de proveedores de la vista de catalogo visual.
 *
 * Mismo orden que el resto del modulo: `requirePermission` primero, despues zod, despues el
 * puerto con `scope` construido a partir del actor. El tamano de tanda y el orden son
 * constantes del dominio, no entrada: el puerto los aplica solo, esta funcion no los pasa. La
 * URL de cada linea se compone AQUI, despues del puerto: sin permiso no se llega a
 * `publicUrl`.
 */
export function createListSupplierShowcase(
  deps: ListSupplierShowcaseDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<ShowcasePage> {
  return async function listSupplierShowcase(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<ShowcasePage> {
    requirePermission(actor, 'proveedores.consultar');

    const scope: SupplierScope = { companyId: actor.companyId };

    const parsed = showcaseQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const page = await deps.suppliers.listShowcaseAlive(parsed.data, scope);

    return {
      items: page.items.map((row) => toShowcaseRow(row, deps.images)),
      page: page.page,
      hasMore: page.hasMore,
    };
  };
}
