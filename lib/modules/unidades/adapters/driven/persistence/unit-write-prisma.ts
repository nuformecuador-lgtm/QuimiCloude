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

/**
 * Columnas que protegen los cuatro indices unicos parciales que crea la migracion de QC-76
 * (`units_company_name_unique`, `units_system_name_unique`, `units_company_symbol_unique`,
 * `units_system_symbol_unique`; ver `db/migrations/20260907190000_units_equivalence_and_scope`).
 *
 * CORRECCION sobre lo que describia `design.md > 7.1`: aquel apartado comparaba
 * `error.meta.target` contra el NOMBRE del indice (`'units_company_name_unique'`, etc.), y
 * eso, verificado empiricamente contra Postgres real con `@prisma/client@6.19.3`, es falso:
 * `meta.target` trae las COLUMNAS afectadas (p. ej. `["company_id","name_normalized"]`),
 * nunca el nombre del indice. Con la comparacion original los dos `Set` de nombres jamas
 * hacian match, el `P2002` se relanzaba sin traducir y `createUnit`/`updateUnit` con nombre o
 * simbolo duplicado terminaban lanzando `PrismaClientKnownRequestError` en vez de
 * `UnitDuplicateNameError`/`DuplicateSymbolError` (R11, R12 rotos). La intencion de
 * `design.md > 7.1` -diferenciar duplicado de nombre de duplicado de simbolo a partir del
 * `P2002`- se conserva entera; lo que cambia es el mecanismo, para que sea el que Postgres
 * realmente expone.
 *
 * Es el MISMO hallazgo que QC-25 ya documento para este mismo motor y version en
 * `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`
 * (`RECIPE_NAME_UNIQUE_COLUMN`/`isUniqueNameViolation`) y que tambien sigue
 * `lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts`: se discrimina por
 * COLUMNA, no por indice.
 *
 * Las dos columnas son disjuntas -ninguna violacion real puede tocar `name_normalized` Y
 * `symbol` a la vez, son indices distintos sobre columnas distintas-, pero si algun dia
 * `meta.target` trajera ambas, `duplicateOutcomeOf` decide de forma determinista: `name`
 * gana sobre `symbol` (se comprueba primero).
 */
const NAME_UNIQUE_COLUMN = 'name_normalized';
const SYMBOL_UNIQUE_COLUMN = 'symbol';

/** `error.meta.target` puede llegar como cadena o como array de cadenas segun la version del
 *  motor de Prisma: se normaliza a un array antes de mirarlo. Si `target` no es inspeccionable
 *  -ausente, u otro tipo- se devuelve vacio: no se asume nada (mismo criterio que
 *  `isUniqueNameViolation` de `recipe-prisma.ts`). */
function targetsOf(error: Prisma.PrismaClientKnownRequestError): readonly string[] {
  const target = error.meta?.target;
  if (typeof target === 'string') return [target];
  if (Array.isArray(target)) return target.filter((item): item is string => typeof item === 'string');
  return [];
}

/**
 * Traduce una violacion de unicidad (`P2002`) al resultado discriminado del puerto, mirando QUE
 * COLUMNA dispara la violacion en `meta.target` (`design.md > 7.1`, corregido: ver el comentario
 * de las constantes de arriba).
 *
 * Un `target` que no incluya ninguna de las dos columnas conocidas se RELANZA, deliberadamente:
 * clasificarlo como duplicado de nombre haria que un indice nuevo, que nadie mapeo todavia, se
 * anunciara como "ya existe ese nombre", que seria mentira y no dejaria rastro
 * (`docs/conventions.md > Manejo de errores`).
 */
function duplicateOutcomeOf(
  error: Prisma.PrismaClientKnownRequestError,
): 'duplicate_name' | 'duplicate_symbol' | null {
  const targets = targetsOf(error);
  if (targets.includes(NAME_UNIQUE_COLUMN)) return 'duplicate_name';
  if (targets.includes(SYMBOL_UNIQUE_COLUMN)) return 'duplicate_symbol';
  return null;
}

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** `P2003` al borrar solo puede venir de las FK `ON DELETE RESTRICT` que apuntan a `units`:
 *  `presentations_unit_id_fkey`, `recipe_lines_unit_id_fkey`, `supplier_catalog_lines_unit_id_fkey`
 *  y `units_unit_id_fkey`. No hay ambiguedad que resolver por indice (R24).
 *
 *  ACTUALIZADO EL 2026-09-11 POR QC-80 (R7): donde este comentario nombraba
 *  `products_unit_id_fkey` va ahora `presentations_unit_id_fkey`. La columna `products.unit_id`
 *  se elimino; quien referencia el catalogo desde inventario es la PRESENTACION. El
 *  comportamiento no cambia -cualquiera de ellas sigue siendo «la unidad esta en uso»-, pero un
 *  comentario que nombra una FK inexistente manda a quien lo lee a buscarla. */
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
 * `UnitNotFoundError`), y un `where` que fundiera los dos casos devolveria `null` para ambos y
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
