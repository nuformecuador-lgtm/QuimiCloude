import type { UnitCatalog, UnitRef } from '@/lib/modules/unidades';

import { requirePermission, type Actor } from './actor';

/** Unidades que ofrece el selector del alta de insumo. */
export type ProductFormUnits = readonly UnitRef[];

export type ListProductFormUnitsDeps = {
  readonly units: Pick<UnitCatalog, 'listVisibleRefs'>;
};

export type ListProductFormUnits = (actor: Actor | null | undefined) => Promise<ProductFormUnits>;

/**
 * Con el permiso del alta y no con `unidades.consultar`: quien da de alta un insumo tiene que
 * poder elegir su unidad aunque no pueda abrir la pantalla de unidades.
 */
export function createListProductFormUnits(deps: ListProductFormUnitsDeps): ListProductFormUnits {
  return async function listProductFormUnits(actor) {
    requirePermission(actor, 'inventario.modificar');
    return deps.units.listVisibleRefs(actor.companyId);
  };
}
