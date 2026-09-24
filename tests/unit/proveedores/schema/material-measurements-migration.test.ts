// Contrato ESTATICO del SQL de `*_supplier_catalog_line_material_and_measurements`.
//
// Patron de `suppliers-company-scope-migration.test.ts`: cada afirmacion es un predicado puro
// sobre el texto SQL, aplicado al archivo REAL (pasa) y a una copia MUTADA EN MEMORIA (falla). El
// archivo en disco no se toca nunca.
//
// El `down.sql` revierte EXACTAMENTE las dos columnas y los dos CHECK que agrega el
// `migration.sql`, ni una restriccion de mas ni de menos.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const migrationsDir = join(repoRoot, 'db', 'migrations');

function findMigrationDir(suffix: string): string {
  const candidates = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort();
  if (candidates.length !== 1) {
    throw new Error(
      `se esperaba exactamente una migracion terminada en "${suffix}"; hay ${String(candidates.length)}: ${candidates.join(', ')}`,
    );
  }
  return join(migrationsDir, candidates[0] as string);
}

const MIGRACION = '_supplier_catalog_line_material_and_measurements';
const migrationDir = findMigrationDir(MIGRACION);

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0);
}

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8');
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8');
const up = statements(upSource);
const down = statements(downSource);

/** ¿El UP agrega exactamente las dos columnas anulables, sin `DEFAULT`? */
function addsBothNullableColumns(sql: string): boolean {
  const source = statements(sql);
  const material = source.some((statement) =>
    /^ALTER TABLE "supplier_catalog_lines" ADD COLUMN "material" TEXT$/i.test(statement),
  );
  const measurements = source.some((statement) =>
    /^ALTER TABLE "supplier_catalog_lines" ADD COLUMN "measurements" JSONB$/i.test(statement),
  );
  return material && measurements;
}

/** ¿El UP agrega el CHECK de `material` no-en-blanco y el de `measurements` objeto-o-nulo? */
function addsBothChecks(sql: string): boolean {
  const source = statements(sql);
  const materialCheck = source.some(
    (statement) =>
      /^ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_material_check"/i.test(
        statement,
      ) && /"material" IS NULL OR btrim\("material"\) <> ''/i.test(statement),
  );
  const measurementsCheck = source.some(
    (statement) =>
      /^ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_measurements_check"/i.test(
        statement,
      ) && /"measurements" IS NULL OR jsonb_typeof\("measurements"\) = 'object'/i.test(statement),
    );
  return materialCheck && measurementsCheck;
}

/** El DOWN quita los DOS CHECK antes que las DOS columnas, todo con `IF EXISTS`. */
function dropsChecksBeforeColumnsWithIfExists(sql: string): boolean {
  const source = statements(sql);
  const dropMeasurementsCheck = source.findIndex((statement) =>
    /^ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_measurements_check"$/i.test(
      statement,
    ),
  );
  const dropMaterialCheck = source.findIndex((statement) =>
    /^ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_material_check"$/i.test(
      statement,
    ),
  );
  const dropMeasurementsColumn = source.findIndex((statement) =>
    /^ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "measurements"$/i.test(statement),
  );
  const dropMaterialColumn = source.findIndex((statement) =>
    /^ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "material"$/i.test(statement),
  );
  if ([dropMeasurementsCheck, dropMaterialCheck, dropMeasurementsColumn, dropMaterialColumn].includes(-1)) {
    return false;
  }
  return (
    dropMeasurementsCheck < dropMeasurementsColumn &&
    dropMaterialCheck < dropMaterialColumn &&
    dropMeasurementsCheck < dropMaterialColumn &&
    dropMaterialCheck < dropMeasurementsColumn
  );
}

/** El DOWN no toca ninguna restriccion ni columna que el UP de esta ficha no haya creado. */
function downTouchesOnlyItsOwnFourNames(sql: string): boolean {
  const source = statements(sql);
  const nombresPropios = new Set([
    'supplier_catalog_lines_measurements_check',
    'supplier_catalog_lines_material_check',
    'measurements',
    'material',
  ]);
  return source.every((statement) => {
    const nombrado = /"(\w+)"$/.exec(statement);
    if (nombrado === null) return false;
    return nombresPropios.has(nombrado[1] as string);
  });
}

describe('migration.sql — lo que agrega', () => {
  it('R30: agrega EXACTAMENTE las dos columnas anulables, sin DEFAULT', () => {
    expect(addsBothNullableColumns(upSource)).toBe(true);
    expect(up).toHaveLength(4);

    const conDefault = upSource.replace(
      'ADD COLUMN "material" TEXT;',
      'ADD COLUMN "material" TEXT DEFAULT \'\';',
    );
    expect(conDefault, 'la mutacion no se aplico').not.toBe(upSource);
    expect(addsBothNullableColumns(conDefault)).toBe(false);
  });

  it('R30: agrega el CHECK de material no-en-blanco y el de measurements objeto-o-nulo', () => {
    expect(addsBothChecks(upSource)).toBe(true);

    const sinBtrim = upSource.replace('btrim("material") <> \'\'', "\"material\" <> ''");
    expect(sinBtrim, 'la mutacion no se aplico').not.toBe(upSource);
    expect(addsBothChecks(sinBtrim)).toBe(false);

    const sinJsonbTypeof = upSource.replace(
      "jsonb_typeof(\"measurements\") = 'object'",
      '"measurements" IS NOT NULL',
    );
    expect(sinJsonbTypeof, 'la mutacion no se aplico').not.toBe(upSource);
    expect(addsBothChecks(sinJsonbTypeof)).toBe(false);
  });
});

describe('down.sql — revierte EXACTAMENTE lo que agrega el UP, R30', () => {
  it('quita los dos CHECK antes que las dos columnas, y todo con IF EXISTS', () => {
    expect(dropsChecksBeforeColumnsWithIfExists(downSource)).toBe(true);
    expect(down).toHaveLength(4);

    const alReves = downSource.replace(
      'ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_measurements_check";\nALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_material_check";\nALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "measurements";\nALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "material";',
      'ALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "measurements";\nALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "material";\nALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_measurements_check";\nALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT IF EXISTS "supplier_catalog_lines_material_check";',
    );
    expect(alReves, 'la mutacion no reordeno las sentencias').not.toBe(downSource);
    expect(dropsChecksBeforeColumnsWithIfExists(alReves)).toBe(false);

    const sinIfExists = downSource.replace(
      'DROP COLUMN IF EXISTS "material"',
      'DROP COLUMN "material"',
    );
    expect(sinIfExists, 'la mutacion no se aplico').not.toBe(downSource);
    expect(sinIfExists).not.toContain('DROP COLUMN IF EXISTS "material"');
  });

  it('no toca ninguna restriccion o columna ajena a las dos que esta ficha agrego', () => {
    expect(downTouchesOnlyItsOwnFourNames(downSource)).toBe(true);

    const tocandoDeMas = `${downSource}\nALTER TABLE "supplier_catalog_lines" DROP COLUMN IF EXISTS "cost";`;
    expect(downTouchesOnlyItsOwnFourNames(tocandoDeMas)).toBe(false);
  });
});
