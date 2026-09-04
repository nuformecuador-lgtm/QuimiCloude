import { requireAdmin, type Actor } from './actor';
import type { UnitRef } from './unit-catalog';

import type { UnitRepository } from '../ports/unit-repository';

/**
 * Cota que SIEMPRE se pasa al repositorio (R40): ninguna consulta sin limite declarado.
 * El catalogo es corto y cerrado (`design.md > 9`); si algun dia crece mas alla de esta
 * cota, la paginacion es de QC-38.
 */
export const MAX_UNITS = 200;

export type ListUnitsDeps = {
  readonly units: UnitRepository;
};

/**
 * Caso de uso de lectura del catalogo completo de unidades (`design.md > 9`, R40, R41).
 * `requireAdmin(actor)` es la PRIMERA LINEA, antes de tocar el repositorio: falla
 * cerrado sin actor, con rol nulo/vacio/desconocido o distinto de Administrador, sin
 * leer nada.
 */
export function createListUnits(
  deps: ListUnitsDeps,
): (actor: Actor | null) => Promise<readonly UnitRef[]> {
  return async function listUnits(actor: Actor | null): Promise<readonly UnitRef[]> {
    requireAdmin(actor);

    return deps.units.listAll(MAX_UNITS);
  };
}
