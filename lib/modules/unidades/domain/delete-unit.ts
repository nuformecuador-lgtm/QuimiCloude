import { requirePermission, type Actor } from './actor';
import { NotFoundError, SystemUnitError, UnitInUseError } from './errors';

import type { UnitWriteRepository } from '../ports/unit-write-repository';

export type DeleteUnitDeps = {
  readonly units: UnitWriteRepository;
};

/**
 * Borrado de unidad (`design.md > 6.3`; R23-R26). El orden es el requisito:
 *
 *   1. `requirePermission(actor, 'unidades.modificar')` — PRIMERA linea. Sin zod: la entrada
 *      es un identificador, no hay forma que validar.
 *   2. `findOwnership(id)`:
 *        - `null` o de otra empresa -> `NotFoundError` (R26);
 *        - `companyId === null` -> `SystemUnitError` (R25), EN EL SERVICE y ANTES de intentar
 *          ningun borrado.
 *   3. `units.deleteById(id)` -> `'in_use'` -> `UnitInUseError` (R24); `'not_found'` ->
 *      `NotFoundError`.
 *
 * FISICO, no logico (R23): `units` no tiene `deleted_at`.
 *
 * NINGUNA consulta de uso previa (R24): no se llama a `hasDerivedUnits` ni se cuenta cuantos
 * productos o lineas de receta usan la unidad antes de borrar. La garantia real son las tres
 * FK `ON DELETE RESTRICT` (`products`, `recipe_lines` y otra `units` que derive de esta), y el
 * adaptador traduce esa violacion (`P2003`) a `'in_use'`; este caso de uso solo traduce el
 * resultado discriminado del puerto, nunca anticipa el choque.
 */
export function createDeleteUnit(
  deps: DeleteUnitDeps,
): (id: string, actor: Actor | null | undefined) => Promise<void> {
  return async function deleteUnit(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'unidades.modificar');

    const ownership = await deps.units.findOwnership(id);
    if (ownership === null) throw new NotFoundError();
    if (ownership.companyId === null) throw new SystemUnitError();
    if (ownership.companyId !== actor.companyId) throw new NotFoundError();

    const result = await deps.units.deleteById(id);
    if (result === 'not_found') throw new NotFoundError();
    if (result === 'in_use') throw new UnitInUseError();
  };
}
