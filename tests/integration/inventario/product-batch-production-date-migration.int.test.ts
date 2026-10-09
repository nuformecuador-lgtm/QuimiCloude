/**
 * `*_product_batches_production_date` (QC-219) contra Postgres real: el UP no cambia ninguna fila,
 * la base rechaza un dia de produccion sin vencimiento, y el DOWN deja la tabla como antes (R24).
 *
 * AISLAMIENTO: cada `it` corre en una transaccion interactiva que termina en `RollbackSignal`. Lo
 * que se espera que falle va dentro de un SAVEPOINT. El `down.sql` y el `migration.sql` reales se
 * aplican dentro de la transaccion; Postgres deshace tambien ese DDL. Todo el SQL de lotes es
 * crudo: con la columna quitada, el cliente generado la nombraria.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
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

let savepointSeq = 0;

function sqlStateOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta;
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return `${error.code} ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function expectRejected(tx: Prisma.TransactionClient, run: () => Promise<unknown>): Promise<string> {
  savepointSeq += 1;
  const savepoint = `qc219_sp_${String(savepointSeq)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return `${sqlStateOf(error)}\n${error instanceof Error ? error.message : String(error)}`;
  }
  throw new Error('se esperaba un rechazo de la base y no lo hubo');
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
const carpetas = readdirSync(migrationsDir).filter((name) => name.endsWith('_product_batches_production_date'));
const migrationDir = join(migrationsDir, carpetas[0] ?? 'missing');

function statementsOf(sql: string): readonly string[] {
  return sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

const UP = statementsOf(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'));
const DOWN = statementsOf(readFileSync(join(migrationDir, 'down.sql'), 'utf8'));

async function apply(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) await tx.$executeRawUnsafe(statement);
}

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Fixture = { readonly companyId: string; readonly productId: string };

async function seed(tx: Prisma.TransactionClient): Promise<Fixture> {
  const name = `Empresa dia de produccion ${token()}`;
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  const kg = await tx.unit.findFirstOrThrow({ where: { companyId: null, nameNormalized: 'kilogramo' }, select: { id: true } });
  const productName = `Producto ${token()}`;
  const product = await tx.product.create({
    data: { name: productName, nameNormalized: productName.toLowerCase(), type: 'PRODUCT', companyId: company.id, unitId: kg.id },
    select: { id: true },
  });
  return { companyId: company.id, productId: product.id };
}

/** Un lote sin presentacion, por SQL crudo: vale con la columna y sin ella. */
async function insertBatch(tx: Prisma.TransactionClient, f: Fixture, expiryDate: string | null): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "product_batches"
      ("id", "product_id", "stock", "unit_cost", "lot", "purchase_date", "expiry_date", "company_id", "updated_at")
    VALUES
      (CAST(${id} AS uuid), CAST(${f.productId} AS uuid), 3, 10, ${`L-${token()}`}, DATE '2026-10-01',
       CAST(${expiryDate} AS date), CAST(${f.companyId} AS uuid), now())`;
  return id;
}

/** Las filas del lote, con TODAS sus columnas de antes de la migracion, como texto. */
async function snapshot(tx: Prisma.TransactionClient, ids: readonly string[]): Promise<unknown[]> {
  return tx.$queryRaw<unknown[]>`
    SELECT "id"::text, "product_id"::text, "presentation_id"::text, "stock"::text, "unit_cost"::text,
           "lot", "purchase_date"::text, "expiry_date"::text, "company_id"::text, "created_by"::text,
           "updated_by"::text, "created_at"::text, "updated_at"::text, "package_content"::text
      FROM "product_batches"
     WHERE "id" = ANY(CAST(${ids} AS uuid[]))
     ORDER BY "id"`;
}

async function columnExists(tx: Prisma.TransactionClient): Promise<boolean> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'product_batches' AND column_name = 'production_date'`;
  return Number(rows[0]?.n ?? 0) === 1;
}

async function checkExists(tx: Prisma.TransactionClient): Promise<boolean> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM pg_constraint WHERE conname = 'product_batches_production_date_requires_expiry'`;
  return Number(rows[0]?.n ?? 0) === 1;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('QC-219 — migracion product_batches_production_date contra Postgres real', () => {
  it('R24: existe exactamente una carpeta de la migracion', () => {
    expect(carpetas).toHaveLength(1);
  });

  it('R24: el UP anade la columna anulable y no cambia ninguna fila existente', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      await apply(tx, DOWN);
      expect(await columnExists(tx)).toBe(false);

      const conVencimiento = await insertBatch(tx, f, '2027-01-31');
      const sinVencimiento = await insertBatch(tx, f, null);
      const antes = await snapshot(tx, [conVencimiento, sinVencimiento]);
      const totalAntes = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "product_batches"`;

      await apply(tx, UP);

      expect(await columnExists(tx)).toBe(true);
      expect(await checkExists(tx)).toBe(true);
      expect(await snapshot(tx, [conVencimiento, sinVencimiento])).toEqual(antes);
      const totalDespues = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "product_batches"`;
      expect(totalDespues[0]?.n).toBe(totalAntes[0]?.n);
      const conDia = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM "product_batches" WHERE "production_date" IS NOT NULL`;
      expect(Number(conDia[0]?.n), 'ningun lote queda con dia de produccion').toBe(0);
    });
  });

  it('R24: la base rechaza con 23514 un lote con dia de produccion y sin vencimiento', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const sinVencimiento = await insertBatch(tx, f, null);

      const rechazo = await expectRejected(
        tx,
        () => tx.$executeRaw`
          UPDATE "product_batches" SET "production_date" = DATE '2026-10-01' WHERE "id" = CAST(${sinVencimiento} AS uuid)`,
      );
      expect(rechazo).toContain('23514');
      expect(rechazo).toContain('product_batches_production_date_requires_expiry');

      const conVencimiento = await insertBatch(tx, f, '2027-01-31');
      await tx.$executeRaw`
        UPDATE "product_batches" SET "production_date" = DATE '2026-10-01' WHERE "id" = CAST(${conVencimiento} AS uuid)`;

      const quitarVencimiento = await expectRejected(
        tx,
        () => tx.$executeRaw`
          UPDATE "product_batches" SET "expiry_date" = NULL WHERE "id" = CAST(${conVencimiento} AS uuid)`,
      );
      expect(quitarVencimiento).toContain('23514');
    });
  });

  it('R24: el DOWN quita la columna y la restriccion, y deja las demas columnas como estaban', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const lote = await insertBatch(tx, f, '2027-01-31');
      await tx.$executeRaw`
        UPDATE "product_batches" SET "production_date" = DATE '2026-10-01' WHERE "id" = CAST(${lote} AS uuid)`;
      const antes = await snapshot(tx, [lote]);

      await apply(tx, DOWN);

      expect(await columnExists(tx)).toBe(false);
      expect(await checkExists(tx)).toBe(false);
      expect(await snapshot(tx, [lote])).toEqual(antes);

      // Y el UP vuelve a aplicarse sobre lo que dejo el DOWN.
      await apply(tx, UP);
      expect(await columnExists(tx)).toBe(true);
      expect(await checkExists(tx)).toBe(true);
    });
  });
});
