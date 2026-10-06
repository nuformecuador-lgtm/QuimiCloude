/**
 * `*_recipe_packing_steps` contra Postgres real: el UP deja toda receta existente con
 * `packing_steps = []` y sus `steps` intactos; el DOWN quita la columna y no toca nada mas.
 *
 * AISLAMIENTO: cada `it` corre en una transaccion interactiva que termina en `RollbackSignal`.
 * Los casos aplican el `down.sql` y el `migration.sql` reales dentro de la transaccion; Postgres
 * deshace tambien ese DDL. Las filas se escriben con SQL crudo porque, sin la columna, el cliente
 * Prisma generado no puede leer ni escribir `recipes`.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { normalizeRecipeName } from '@/lib/modules/recetas';
import { prisma } from '@/lib/shared/db/prisma';

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test');
    this.name = 'RollbackSignal';
  }
}

async function inRolledBackTransaction(body: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx);
        throw new RollbackSignal();
      },
      { maxWait: 20_000, timeout: 60_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
}

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

const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations');
const migrationDir = join(
  migrationsDir,
  readdirSync(migrationsDir).find((name) => name.endsWith('_recipe_packing_steps')) ?? 'missing',
);
// Cada archivo es una sola sentencia: se ejecuta entero.
const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8');
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8');

const OPERATOR_STEPS = [
  { blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar en frio', marks: ['bold'] }] }] },
  { blocks: [{ kind: 'checklist', items: [{ spans: [{ text: 'Guantes puestos' }] }] }] },
];
const PACKING_STEPS = [{ blocks: [{ kind: 'paragraph', spans: [{ text: 'Envasar en garrafas de 5 L' }] }] }];

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

async function seedCompany(tx: Prisma.TransactionClient): Promise<string> {
  const name = `Empresa envasado ${token()}`;
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  return company.id;
}

/** Original, version y receta dada de baja, escritas sin nombrar `packing_steps`. */
async function insertRecipes(tx: Prisma.TransactionClient, companyId: string): Promise<void> {
  const insert = async (name: string, parentId: string | null, deleted: boolean): Promise<string> => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "recipes" ("name", "name_normalized", "description", "steps", "company_id",
                             "updated_at", "deleted_at", "parent_recipe_id")
      VALUES (${name}, ${normalizeRecipeName(name)}, 'Base', ${JSON.stringify(OPERATOR_STEPS)}::jsonb,
              ${companyId}::uuid, now(), ${deleted ? new Date() : null}::timestamptz, ${parentId}::uuid)
      RETURNING "id"::text AS "id"`;
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('el INSERT no devolvio id');
    return id;
  };
  const originalId = await insert(`Crema ${token()}`, null, false);
  await insert(`Crema version ${token()}`, originalId, false);
  await insert(`Crema baja ${token()}`, null, true);
}

/** Cada fila de la empresa como JSON completo, sin la columna nueva, ordenada por id. */
async function snapshotWithoutPackingSteps(tx: Prisma.TransactionClient, companyId: string): Promise<unknown[]> {
  const rows = await tx.$queryRaw<{ row: unknown }[]>`
    SELECT to_jsonb(r) - 'packing_steps' AS "row" FROM "recipes" r
     WHERE r."company_id" = ${companyId}::uuid ORDER BY r."id"`;
  return rows.map((r) => r.row);
}

async function recipeColumns(tx: Prisma.TransactionClient): Promise<string[]> {
  const rows = await tx.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'recipes' ORDER BY column_name`;
  return rows.map((r) => r.column_name);
}

describe('migracion recipe_packing_steps', () => {
  it('R5: el UP deja packing_steps = [] en toda receta existente y sus steps sin cambios', async () => {
    await inRolledBackTransaction(async (tx) => {
      await tx.$executeRawUnsafe(downSource);
      const companyId = await seedCompany(tx);
      await insertRecipes(tx, companyId);
      const before = await snapshotWithoutPackingSteps(tx, companyId);
      expect(before).toHaveLength(3);

      await tx.$executeRawUnsafe(upSource);

      const packing = await tx.$queryRaw<{ packing_steps: unknown; steps: unknown }[]>`
        SELECT "packing_steps", "steps" FROM "recipes" WHERE "company_id" = ${companyId}::uuid`;
      expect(packing).toHaveLength(3);
      for (const row of packing) {
        expect(row.packing_steps).toEqual([]);
        expect(row.steps).toEqual(OPERATOR_STEPS);
      }
      expect(await snapshotWithoutPackingSteps(tx, companyId)).toEqual(before);
    });
  });

  it('R5: el DOWN quita packing_steps y deja intactas las demas columnas y datos', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await seedCompany(tx);
      await insertRecipes(tx, companyId);
      await tx.$executeRaw`
        UPDATE "recipes" SET "packing_steps" = ${JSON.stringify(PACKING_STEPS)}::jsonb
         WHERE "company_id" = ${companyId}::uuid`;
      const columnsBefore = await recipeColumns(tx);
      expect(columnsBefore).toContain('packing_steps');
      const before = await snapshotWithoutPackingSteps(tx, companyId);

      await tx.$executeRawUnsafe(downSource);

      expect(await recipeColumns(tx)).toEqual(columnsBefore.filter((name) => name !== 'packing_steps'));
      expect(await snapshotWithoutPackingSteps(tx, companyId)).toEqual(before);
    });
  });
});
