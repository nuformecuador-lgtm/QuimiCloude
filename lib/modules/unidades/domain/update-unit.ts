import { requirePermission, type Actor } from './actor';
import { assertValidDerivation } from './create-unit';
import {
  DuplicateSymbolError,
  InvalidDerivationError,
  SystemUnitError,
  UnitDuplicateNameError,
  UnitNotFoundError,
  ValidationError,
} from './errors';
import { updateUnitSchema } from './unit-input';
import { normalizeUnitName } from './unit-name';

import type { UnitWriteRepository, UnitWriteRow } from '../ports/unit-write-repository';

export type UpdateUnitDeps = {
  readonly units: UnitWriteRepository;
};

/**
 * Edicion de unidad (`design.md > 6.2`; R15-R22, R28, R36). El orden es el requisito:
 *
 *   1. `requirePermission(actor, 'unidades.modificar')` — PRIMERA linea.
 *   2. `updateUnitSchema.safeParse(input)` — el MISMO esquema que el alta (R18): reemplazo
 *      completo de los cuatro campos, sin `.partial()`.
 *   3. `findOwnership(id)`:
 *        - `null` -> `UnitNotFoundError` (R22);
 *        - `companyId === null` -> `SystemUnitError` (R21, EN EL SERVICE: ninguna restriccion
 *          de la base ni ninguna policy de RLS lo impide,
 *          `docs/architecture.md > Acceso a datos y autorizacion`);
 *        - `companyId !== actor.companyId` -> `UnitNotFoundError` (R22): «de otra empresa» se
 *          responde igual que «no existe», nunca con `UnauthorizedError` — distinguirlos seria
 *          un oraculo de existencia sobre datos ajenos.
 *   4. Equivalencia (`assertValidDerivation`, compartida con el alta) MAS las dos
 *      comprobaciones que solo existen al editar, las dos -> `InvalidDerivationError` (R15):
 *        - auto-referencia (`baseUnitId === id`) — la cubre `assertValidDerivation` al pasarle
 *          `currentId = id`;
 *        - «ya soy base de alguien» (`hasDerivedUnits(id)`) — una unidad que ya es base no
 *          puede convertirse en derivada sin dejar huerfana a la que dependia de ella.
 *   5. `units.update(id, row)` -> `'not_found'` -> `UnitNotFoundError`; los dos `duplicate_*` ->
 *      su error.
 *   6. Un simbolo AUSENTE BORRA el simbolo (`null`, R36); `baseUnitId`/`factor` ausentes dejan
 *      la unidad BASE (R17). `companyId` NO viaja en `UnitWriteRow` (R19): el `UPDATE` no
 *      puede tocar la columna de empresa porque el tipo que se le pasa no la lleva.
 */
export function createUpdateUnit(
  deps: UpdateUnitDeps,
): (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void> {
  return async function updateUnit(
    id: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'unidades.modificar');

    const parsed = updateUnitSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const ownership = await deps.units.findOwnership(id);
    if (ownership === null) throw new UnitNotFoundError();
    if (ownership.companyId === null) throw new SystemUnitError();
    if (ownership.companyId !== actor.companyId) throw new UnitNotFoundError();

    const { name, symbol, baseUnitId, factor } = parsed.data;

    if (baseUnitId !== undefined) {
      // «Ya soy base de alguien» (R15): no se cuenta CUANTAS unidades derivan de esta, basta
      // con que exista una para rechazar que esta unidad pase a ser ella misma derivada.
      if (await deps.units.hasDerivedUnits(id)) throw new InvalidDerivationError();
      // La auto-referencia (`baseUnitId === id`) la cubre esta misma llamada, pasando el id
      // que se edita como `currentId`.
      await assertValidDerivation(deps.units, baseUnitId, actor, id);
    }

    const nameNormalized = normalizeUnitName(name);

    const row: UnitWriteRow = {
      name,
      nameNormalized,
      symbol: symbol ?? null,
      baseUnitId: baseUnitId ?? null,
      factor: factor ?? null,
    };

    const result = await deps.units.update(id, row);
    if (result === 'not_found') throw new UnitNotFoundError();
    if (result === 'duplicate_name') throw new UnitDuplicateNameError();
    if (result === 'duplicate_symbol') throw new DuplicateSymbolError();
  };
}
