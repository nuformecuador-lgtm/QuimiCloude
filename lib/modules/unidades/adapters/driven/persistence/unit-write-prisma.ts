import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import type { UnitOwnership, UnitWriteRow, WriteOutcome } from '../../../ports/unit-write-repository';

/**
 * Implementa los cinco metodos de `UnitWriteRepository` (`design.md > 7`, T8). Se exportan
 * funciones SUELTAS -no un objeto ya construido-: quien ata el puerto a esta implementacion es
 * SOLO `lib/composition/index.ts`, igual que hace `presentation-prisma.ts` con
 * `PresentationRepository`.
 *
 * Es, junto con `unit-prisma.ts` (lectura, R33) y `unit-catalog-prisma.ts` (R33, QC-76 R36), el
 * TERCER y UNICO OTRO archivo del modulo que importa `@prisma/client`: ninguno de los dos se
 * toca aqui.
 *
 * `factor` viaja como CADENA (`design.md > 3.1`) y se le pasa tal cual a Prisma -que acepta
 * `string` para una columna `Decimal`- sin convertirlo a `number` en ningun punto.
 */

/** Los cuatro indices unicos parciales que crea la migracion de QC-76, y NINGUN otro
 *  (`design.md > 7.1`, vigilado por `tests/unit/unidades/schema/unidades-schema.test.ts`). */
const DUPLICATE_NAME_INDEXES = new Set(['units_company_name_unique', 'units_system_name_unique']);
const DUPLICATE_SYMBOL_INDEXES = new Set([
  'units_company_symbol_unique',
  'units_system_symbol_unique',
]);

/** `error.meta.target` puede llegar como cadena o como array de cadenas segun la version del
 *  motor de Prisma: se normaliza a un array antes de mirarlo. */
function targetsOf(error: Prisma.PrismaClientKnownRequestError): readonly string[] {
  const target = error.meta?.target;
  if (typeof target === 'string') return [target];
  if (Array.isArray(target)) return target.filter((item): item is string => typeof item === 'string');
  return [];
}

/**
 * Traduce una violacion de unicidad (`P2002`) al resultado discriminado del puerto, mirando el
 * nombre del indice en `meta.target` (`design.md > 7.1`).
 *
 * Un indice que NO sea ninguno de los cuatro conocidos se RELANZA, deliberadamente: clasificarlo
 * como duplicado de nombre haria que un indice nuevo, que nadie mapeo todavia, se anunciara como
 * "ya existe ese nombre", que seria mentira y no dejaria rastro
 * (`docs/conventions.md > Manejo de errores`).
 */
function duplicateOutcomeOf(
  error: Prisma.PrismaClientKnownRequestError,
): 'duplicate_name' | 'duplicate_symbol' | null {
  const targets = targetsOf(error);
  if (targets.some((target) => DUPLICATE_NAME_INDEXES.has(target))) return 'duplicate_name';
  if (targets.some((target) => DUPLICATE_SYMBOL_INDEXES.has(target))) return 'duplicate_symbol';
  return null;
}

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** `P2003` al borrar solo puede venir de las tres FK `ON DELETE RESTRICT` que apuntan a
 *  `units`: `products_unit_id_fkey`, `recipe_lines_unit_id_fkey` y `units_unit_id_fkey`. No
 *  hay ambiguedad que resolver por indice (R24). */
function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/** R6, R7, R11, R12: la empresa llega como argumento propio, fuera de `row` -una llamada que
 *  se olvide de la empresa no compila-. `'duplicate_name'`/`'duplicate_symbol'` salen de
 *  `duplicateOutcomeOf`; cualquier otro `P2002` desconocido se relanza. */
export async function create(
  companyId: string,
  row: UnitWriteRow,
): Promise<{ id: string } | 'duplicate_name' | 'duplicate_symbol'> {
  try {
    const created = await prisma.unit.create({
      data: {
        companyId,
        name: row.name,
        nameNormalized: row.nameNormalized,
        symbol: row.symbol,
        baseUnitId: row.baseUnitId,
        factor: row.factor,
      },
      select: { id: true },
    });
    return { id: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const outcome = duplicateOutcomeOf(error);
      if (outcome !== null) return outcome;
    }
    throw error;
  }
}

/** `updateMany`, NO `update`: distingue "no existe" (`count === 0`) sin depender de `P2025`,
 *  mismo criterio que `renamePresentation` (R17, R19: `row` no lleva `companyId`, asi que este
 *  `UPDATE` no puede tocar la columna de empresa). */
export async function update(id: string, row: UnitWriteRow): Promise<WriteOutcome> {
  try {
    const result = await prisma.unit.updateMany({
      where: { id },
      data: {
        name: row.name,
        nameNormalized: row.nameNormalized,
        symbol: row.symbol,
        baseUnitId: row.baseUnitId,
        factor: row.factor,
      },
    });
    if (result.count === 0) return 'not_found';
    return 'ok';
  } catch (error) {
    if (isUniqueViolation(error)) {
      const outcome = duplicateOutcomeOf(error);
      if (outcome !== null) return outcome;
    }
    throw error;
  }
}

/** `deleteMany`, NO `delete`: mismo criterio que `update`, para distinguir "no existe" de una
 *  violacion de FK sin depender de `P2025` (R23: borrado FISICO, sin ninguna marca de vida). */
export async function deleteById(id: string): Promise<'deleted' | 'not_found' | 'in_use'> {
  try {
    const result = await prisma.unit.deleteMany({ where: { id } });
    if (result.count === 0) return 'not_found';
    return 'deleted';
  } catch (error) {
    if (isForeignKeyViolation(error)) return 'in_use';
    throw error;
  }
}

/**
 * SIN `companyScopeWhere` (`design.md > 7`): la comparacion de empresa la hace el SERVICE,
 * porque necesita distinguir "de sistema" (-> `SystemUnitError`) de "de otra empresa" (->
 * `NotFoundError`), y un `where` que fundiera los dos casos devolveria `null` para ambos y
 * perderia R21.
 */
export async function findOwnership(id: string): Promise<UnitOwnership | null> {
  return prisma.unit.findUnique({
    where: { id },
    select: { id: true, companyId: true, baseUnitId: true },
  });
}

/** R15: "ya soy base de alguien" -alguna otra unidad declara a esta como su base-. */
export async function hasDerivedUnits(id: string): Promise<boolean> {
  const count = await prisma.unit.count({ where: { baseUnitId: id } });
  return count > 0;
}
