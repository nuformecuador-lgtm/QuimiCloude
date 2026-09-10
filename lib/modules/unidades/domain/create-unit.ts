import { requirePermission, type Actor } from './actor';
import {
  DuplicateSymbolError,
  InvalidDerivationError,
  UnitDuplicateNameError,
  ValidationError,
} from './errors';
import { createUnitSchema } from './unit-input';
import { normalizeUnitName } from './unit-name';

import type { UnitWriteRepository, UnitWriteRow } from '../ports/unit-write-repository';

export type CreateUnitDeps = {
  readonly units: UnitWriteRepository;
};

/**
 * La equivalencia (`design.md > 6.4`), COMPARTIDA por el alta y la edicion: se escribe UNA
 * sola vez aqui y `update-unit.ts` la importa, en vez de duplicarla.
 *
 * Con `baseUnitId` presente, lee la unidad declarada como base con `findOwnership` y rechaza
 * con `InvalidDerivationError` (R15, R16) si:
 *   - no existe (`parent === null`);
 *   - deriva a su vez de otra (`parent.baseUnitId !== null`) — un solo nivel;
 *   - es la propia unidad que se edita (`parent.id === currentId`) — SOLO aplica en edicion,
 *     por eso `currentId` es `null` en el alta (una unidad recien creada no puede referirse a
 *     si misma con su propio id, que todavia no existe);
 *   - es de otra empresa (`parent.companyId !== null && parent.companyId !== actor.companyId`).
 *
 * Se ACEPTA el padre de la propia empresa del actor y el de sistema (`companyId === null`).
 *
 * Por que se valida aqui y no en el disparador `units_check_derivation` de la base (`design.md
 * > 9`, alternativa B): un `RAISE EXCEPTION` de plpgsql llega a Prisma como
 * `PrismaClientUnknownRequestError`, cuyo unico discriminante seria el TEXTO del mensaje —que
 * en esta maquina Postgres responde en espanol—, y `docs/conventions.md > Manejo de errores`
 * prohibe discriminar por texto. El disparador se queda como defensa en profundidad, no como
 * el mecanismo.
 */
export async function assertValidDerivation(
  units: UnitWriteRepository,
  baseUnitId: string,
  actor: Actor,
  currentId: string | null,
): Promise<void> {
  const parent = await units.findOwnership(baseUnitId);
  if (parent === null) throw new InvalidDerivationError();
  if (parent.baseUnitId !== null) throw new InvalidDerivationError();
  if (currentId !== null && parent.id === currentId) throw new InvalidDerivationError();
  if (parent.companyId !== null && parent.companyId !== actor.companyId) {
    throw new InvalidDerivationError();
  }
}

/**
 * Alta de unidad (`design.md > 6.1`; R6-R14, R28, R36). El orden es el requisito:
 *
 *   1. `requirePermission(actor, 'unidades.modificar')` — PRIMERA linea, antes de zod y antes
 *      de tocar el puerto (R3).
 *   2. `createUnitSchema.safeParse(input)` -> `ValidationError` si la forma no es valida (R28).
 *   3. Equivalencia (`assertValidDerivation`), SOLO si viene `baseUnitId`.
 *   4. `nameNormalized = normalizeUnitName(name)` — la unica definicion (QC-32 R4).
 *   5. `units.create(actor.companyId, row)` — la empresa sale del ACTOR, nunca de la entrada
 *      (R7): `create` la recibe como argumento propio y obligatorio, fuera de `UnitWriteRow`,
 *      asi que una llamada que se olvide de la empresa no compila.
 *   6. Devuelve `{ id }` (R6).
 *
 * NO hay ningun `SELECT` previo de unicidad (`design.md > 6.1`, alternativa C descartada):
 * entre el `SELECT` y el `INSERT` cabe otra transaccion, asi que esa comprobacion no cerraria
 * la carrera y daria una falsa sensacion de garantia. La garantia real es el indice unico de
 * la base, y lo que este caso de uso hace es traducir su choque (`'duplicate_name'` /
 * `'duplicate_symbol'`) a un error de dominio, nunca anticiparlo.
 */
export function createCreateUnit(
  deps: CreateUnitDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  return async function createUnit(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'unidades.modificar');

    const parsed = createUnitSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { name, symbol, baseUnitId, factor } = parsed.data;

    if (baseUnitId !== undefined) {
      await assertValidDerivation(deps.units, baseUnitId, actor, null);
    }

    const nameNormalized = normalizeUnitName(name);

    const row: UnitWriteRow = {
      name,
      nameNormalized,
      symbol: symbol ?? null,
      baseUnitId: baseUnitId ?? null,
      factor: factor ?? null,
    };

    const result = await deps.units.create(actor.companyId, row);
    if (result === 'duplicate_name') throw new UnitDuplicateNameError();
    if (result === 'duplicate_symbol') throw new DuplicateSymbolError();

    return result;
  };
}
