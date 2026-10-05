// Contrato estatico del SQL de `*_product_batches_require_product_unit`. El comportamiento contra
// Postgres real lo cubre `tests/integration/inventario/product-batch-require-unit.int.test.ts`.
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
const candidates = readdirSync(migrationsDir).filter((name) => name.endsWith('_product_batches_require_product_unit'));
const migrationDir = join(migrationsDir, candidates[0] ?? 'missing');
const up = (): string => readFileSync(join(migrationDir, 'migration.sql'), 'utf8');
const down = (): string => readFileSync(join(migrationDir, 'down.sql'), 'utf8');
const previous = (): string =>
  readFileSync(join(migrationsDir, '20260918130000_product_unit_and_stored_stock', 'migration.sql'), 'utf8');

/** Quita comentarios y colapsa espacios para comparar sentencias sin depender del formato. */
function code(sql: string): string {
  return sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** La sentencia `CREATE OR REPLACE FUNCTION product_batches_check_unit()` completa. */
function checkUnitFunction(sql: string): string {
  const text = code(sql);
  const start = text.indexOf('CREATE OR REPLACE FUNCTION product_batches_check_unit()');
  expect(start, 'CREATE OR REPLACE FUNCTION product_batches_check_unit').toBeGreaterThanOrEqual(0);
  const endMarker = '$product_batches_check_unit$ LANGUAGE plpgsql;';
  const end = text.indexOf(endMarker, start);
  expect(end, 'fin de la funcion').toBeGreaterThan(start);
  return text.slice(start, end + endMarker.length);
}

/** Lo que va desde la lectura de la presentacion hasta el final: la rama con presentacion. */
function presentationBranch(fn: string): string {
  const start = fn.indexOf('SELECT parent."unit_id" INTO presentation_unit_id');
  expect(start, 'lectura de la presentacion').toBeGreaterThanOrEqual(0);
  return fn.slice(start);
}

describe('migracion product_batches_require_product_unit', () => {
  it('existe exactamente una, con migration.sql y down.sql', () => {
    expect(candidates).toHaveLength(1);
    expect(up().length).toBeGreaterThan(0);
    expect(down().length).toBeGreaterThan(0);
  });

  it('R12 la rama sin presentacion rechaza el insumo sin unidad con 23514 y product_batches_product_without_unit', () => {
    const fn = checkUnitFunction(up());
    expect(fn).toContain('SELECT parent."unit_id", parent."type" INTO product_unit_id, product_type');
    const branch = fn.slice(fn.indexOf('IF NEW."presentation_id" IS NULL THEN'));
    expect(branch).toMatch(
      /^IF NEW\."presentation_id" IS NULL THEN IF product_type = 'PRODUCT' AND product_unit_id IS NULL THEN RAISE EXCEPTION 'product_batches_product_without_unit: [^']*', NEW\."id", NEW\."product_id" USING ERRCODE = '23514'; END IF; RETURN NEW; END IF;/,
    );
  });

  it('R13 la rama con presentacion conserva el cuerpo vigente', () => {
    expect(presentationBranch(checkUnitFunction(up()))).toBe(presentationBranch(checkUnitFunction(previous())));
  });

  it('R13 el disparador no se toca', () => {
    expect(code(up())).not.toMatch(/TRIGGER "product_batches_check_unit_trigger"/);
    expect(code(up())).not.toMatch(/DROP /);
  });

  it('R14 down.sql restituye la funcion anterior identica', () => {
    expect(checkUnitFunction(down())).toBe(checkUnitFunction(previous()));
    expect(code(down())).toBe(checkUnitFunction(previous()));
  });

  it('R15 la migracion no escribe datos ni toca presentations', () => {
    for (const sql of [code(up()), code(down())]) {
      expect(sql).not.toMatch(/\bUPDATE\s+"/);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\b/);
      expect(sql).not.toMatch(/\bINSERT\s+INTO\b/);
      expect(sql).not.toMatch(/ALTER TABLE "presentations"/);
      expect(sql).not.toMatch(/ALTER TABLE/);
    }
  });
});
