import { requirePermission, type Actor } from './actor';
import type { MassVolumeBridge } from './convert-with-approximation';
import type { UnitCatalog } from './unit-catalog';

export type GetMassVolumeBridgeDeps = {
  readonly units: Pick<UnitCatalog, 'findMassVolumeBridge'>;
};

export type GetMassVolumeBridge = (actor: Actor | null) => Promise<MassVolumeBridge | null>;

/** Mismo permiso que el listado de unidades: quien puede ver el catalogo puede ver el puente. */
export function createGetMassVolumeBridge(deps: GetMassVolumeBridgeDeps): GetMassVolumeBridge {
  return async (actor) => {
    requirePermission(actor, 'unidades.consultar');
    return deps.units.findMassVolumeBridge();
  };
}
