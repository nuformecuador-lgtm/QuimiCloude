// Contrato estatico del SQL de `*_packaging_products_in_distribution` y de `db/schema.prisma`.
// El comportamiento contra Postgres real lo cubre
// `tests/integration/inventario/qc195-packaging-constraints.int.test.ts`.
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
const candidates = readdirSync(migrationsDir).filter((name) => name.endsWith('_packaging_products_in_distribution'));
const migrationDir = join(migrationsDir, candidates[0] ?? 'missing');
const up = (): string => readFileSync(join(migrationDir, 'migration.sql'), 'utf8');
const down = (): string => readFileSync(join(migrationDir, 'down.sql'), 'utf8');
const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8');

/** Quita comentarios y colapsa espacios para comparar sentencias sin depender del formato. */
function code(sql: string): string {
  return sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ');
}

function modelBlock(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  expect(start, `model ${name}`).toBeGreaterThanOrEqual(0);
  return schema.slice(start, schema.indexOf('\n}', start));
}

describe('migracion packaging_products_in_distribution', () => {
  it('existe exactamente una, con migration.sql y down.sql', () => {
    expect(candidates).toHaveLength(1);
    expect(up().length).toBeGreaterThan(0);
    expect(down().length).toBeGreaterThan(0);
  });

  it('R5 — reescribe el CHECK con el mismo nombre: solo FINISHED_PRODUCT y PACKAGING llevan presentacion, y solo FINISHED_PRODUCT receta', () => {
    const sql = code(up());
    expect(sql).toContain('DROP CONSTRAINT "products_finished_identity_matches_type"');
    expect(sql).toContain(
      `ADD CONSTRAINT "products_finished_identity_matches_type" CHECK ( ("type" = 'FINISHED_PRODUCT') = ("recipe_id" IS NOT NULL) AND ("type" <> 'FINISHED_PRODUCT' OR "presentation_id" IS NOT NULL) AND ("type" IN ('FINISHED_PRODUCT', 'PACKAGING') OR "presentation_id" IS NULL) )`,
    );
  });

  it('R14 — la linea del reparto gana packaging_product_id anulable, con FK compuesta a products e indice', () => {
    const sql = code(up());
    expect(sql).toContain('ADD CONSTRAINT "products_company_id_id_key" UNIQUE ("company_id", "id")');
    expect(sql).toContain('ALTER TABLE "order_presentation_lines" ADD COLUMN "packaging_product_id" UUID;');
    expect(sql).not.toMatch(/"packaging_product_id" UUID NOT NULL/);
    expect(sql).toContain(
      'FOREIGN KEY ("company_id", "packaging_product_id") REFERENCES "products"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE',
    );
    expect(sql).toContain('CREATE INDEX "order_presentation_lines_packaging_product_id_idx"');
  });

  it('R32 — no toca ninguna fila de order_presentation_lines ni de reservation_movements', () => {
    const sql = code(up());
    expect(sql).not.toMatch(/UPDATE "order_presentation_lines"/);
    expect(sql).not.toMatch(/INSERT INTO "order_presentation_lines"/);
    expect(sql).not.toMatch(/reservation_movements/);
  });

  it('R6 — siembra la unidad de sistema «unidad» (u), base e idempotente, dentro del parentesis de RLS', () => {
    const sql = code(up());
    expect(sql).toContain(`SELECT 'unidad', 'unidad', 'u', CURRENT_TIMESTAMP WHERE NOT EXISTS`);
    const noForce = sql.indexOf('ALTER TABLE "units" NO FORCE ROW LEVEL SECURITY');
    const insert = sql.indexOf('INSERT INTO "units"');
    const force = sql.lastIndexOf('ALTER TABLE "units" FORCE ROW LEVEL SECURITY');
    expect(noForce).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(noForce);
    expect(force).toBeGreaterThan(insert);
  });

  it('down.sql revierte en orden inverso y repone el CHECK literal anterior', () => {
    const sql = code(down());
    const fk = sql.indexOf('DROP CONSTRAINT "order_presentation_lines_company_id_packaging_product_id_fkey"');
    const key = sql.indexOf('DROP CONSTRAINT "products_company_id_id_key"');
    expect(fk).toBeGreaterThanOrEqual(0);
    expect(key).toBeGreaterThan(fk);
    expect(sql).toContain('DROP INDEX "order_presentation_lines_packaging_product_id_idx"');
    expect(sql).toContain('DROP COLUMN "packaging_product_id"');
    expect(sql).toContain(
      `ADD CONSTRAINT "products_finished_identity_matches_type" CHECK ( ("type" = 'FINISHED_PRODUCT') = ("recipe_id" IS NOT NULL AND "presentation_id" IS NOT NULL) AND ("recipe_id" IS NULL) = ("presentation_id" IS NULL) )`,
    );
    expect(sql).toContain('WHEN foreign_key_violation THEN');
  });

  it('db/schema.prisma declara la clave candidata de Product y el envase de la linea', () => {
    expect(modelBlock('Product')).toContain('@@unique([companyId, id], map: "products_company_id_id_key")');
    const line = modelBlock('OrderPresentationLine');
    expect(line).toMatch(/packagingProductId\s+String\?\s+@map\("packaging_product_id"\) @db\.Uuid/);
    expect(line).toContain('@@index([packagingProductId], map: "order_presentation_lines_packaging_product_id_idx")');
  });
});
