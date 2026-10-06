/**
 * `*_product_batches_require_product_unit` contra Postgres real: que el disparador
 * `product_batches_check_unit` rechaza el lote sin presentacion de un insumo sin unidad, deja
 * pasar los de instrumento y envase, y sigue rechazando el lote con presentacion de otra unidad.
 *
 * AISLAMIENTO: cada `it` corre en una transaccion interactiva que termina en `RollbackSignal`.
 * Lo que se espera que falle va dentro de un SAVEPOINT. El caso de R14 aplica el `down.sql` y el
 * `migration.sql` reales dentro de la transaccion; Postgres deshace tambien ese DDL.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma, type ProductType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { normalizePresentationName } from '@/lib/modules/inventario';
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

async function expectRejected(tx: Prisma.TransactionClient, run: () => Promise<unknown>): Promise<string> {
  savepointSeq += 1;
  const savepoint = `qc199_sp_${String(savepointSeq)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return error instanceof Error ? error.message : String(error);
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
const migrationDir = join(
  migrationsDir,
  readdirSync(migrationsDir).find((name) => name.endsWith('_product_batches_require_product_unit')) ?? 'missing',
);
// Cada archivo es una sola sentencia (`CREATE OR REPLACE FUNCTION`): se ejecuta entero.
const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8');
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8');

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

interface Fixtures {
  readonly companyId: string;
  readonly kgId: string;
  readonly mlId: string;
  readonly packageUnitId: string;
  readonly mlPresentationId: string;
}

async function seed(tx: Prisma.TransactionClient): Promise<Fixtures> {
  const name = `Empresa disparador ${token()}`;
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  const systemUnit = (nameNormalized: string) =>
    tx.unit.findFirstOrThrow({ where: { companyId: null, nameNormalized }, select: { id: true } });
  const kg = await systemUnit('kilogramo');
  const ml = await systemUnit('mililitro');
  const unidad = await systemUnit('unidad');
  const presentationName = `Botella ${token()}`;
  const presentation = await tx.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: normalizePresentationName(presentationName),
      unitId: ml.id,
      companyId: company.id,
      content: '500',
    },
    select: { id: true },
  });
  return {
    companyId: company.id,
    kgId: kg.id,
    mlId: ml.id,
    packageUnitId: unidad.id,
    mlPresentationId: presentation.id,
  };
}

async function insertProduct(
  tx: Prisma.TransactionClient,
  f: Fixtures,
  type: ProductType,
  ids: { readonly unitId?: string | null; readonly presentationId?: string | null } = {},
): Promise<string> {
  const name = `Producto ${token()}`;
  const product = await tx.product.create({
    data: {
      name,
      nameNormalized: name.toLowerCase(),
      type,
      companyId: f.companyId,
      unitId: ids.unitId ?? null,
      presentationId: ids.presentationId ?? null,
    },
    select: { id: true },
  });
  return product.id;
}

function insertBatch(
  tx: Prisma.TransactionClient,
  f: Fixtures,
  productId: string,
  presentationId: string | null,
): Promise<{ id: string }> {
  return tx.productBatch.create({
    data: {
      productId,
      presentationId,
      stock: new Prisma.Decimal('3'),
      unitCost: new Prisma.Decimal('10'),
      lot: `L-${token()}`,
      purchaseDate: new Date('2026-10-01T00:00:00.000Z'),
      companyId: f.companyId,
    },
    select: { id: true },
  });
}

describe('QC-199 — el disparador de unidad del lote', () => {
  it('R12 un lote sin presentacion de un insumo sin unidad se rechaza', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const productId = await insertProduct(tx, f, 'PRODUCT');

      const message = await expectRejected(tx, () => insertBatch(tx, f, productId, null));

      expect(message).toContain('product_batches_product_without_unit');
      expect(await tx.productBatch.count({ where: { productId } })).toBe(0);
    });
  });

  it('R12 el rechazo lleva el codigo 23514', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const productId = await insertProduct(tx, f, 'PRODUCT');
      savepointSeq += 1;
      const savepoint = `qc199_sp_${String(savepointSeq)}`;
      await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
      const code = await tx
        .$executeRaw`
          INSERT INTO "product_batches" ("product_id", "stock", "lot", "purchase_date", "company_id", "updated_at")
          VALUES (CAST(${productId} AS uuid), 1, ${`L-${token()}`}, DATE '2026-10-01', CAST(${f.companyId} AS uuid), now())`
        .then(
          () => null,
          (error: unknown) =>
            error instanceof Prisma.PrismaClientKnownRequestError
              ? (error.meta as { code?: string } | undefined)?.code ?? error.message
              : String(error),
        );
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      expect(code).toContain('23514');
    });
  });

  it('R12 un lote sin presentacion de un insumo con unidad entra', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const productId = await insertProduct(tx, f, 'PRODUCT', { unitId: f.kgId });

      await insertBatch(tx, f, productId, null);

      expect(await tx.productBatch.count({ where: { productId, presentationId: null } })).toBe(1);
    });
  });

  it('R13 un lote sin presentacion de un instrumento sin unidad entra', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const productId = await insertProduct(tx, f, 'MACHINE');

      await insertBatch(tx, f, productId, null);

      expect(await tx.productBatch.count({ where: { productId } })).toBe(1);
    });
  });

  it('R13 un lote sin presentacion de un envase entra', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const productId = await insertProduct(tx, f, 'PACKAGING', {
        unitId: f.packageUnitId,
        presentationId: f.mlPresentationId,
      });

      await insertBatch(tx, f, productId, null);

      expect(await tx.productBatch.count({ where: { productId } })).toBe(1);
    });
  });

  it('R13 un lote con presentacion de otra unidad sigue rechazandose', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const productId = await insertProduct(tx, f, 'PRODUCT', { unitId: f.kgId });

      const message = await expectRejected(tx, () => insertBatch(tx, f, productId, f.mlPresentationId));

      expect(message).toContain('product_batches_unit_differs_from_product');
    });
  });

  it('R13 un lote con presentacion cuyo producto no tiene unidad sigue rechazandose', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const productId = await insertProduct(tx, f, 'PRODUCT');

      const message = await expectRejected(tx, () => insertBatch(tx, f, productId, f.mlPresentationId));

      expect(message).toContain('product_batches_unit_differs_from_product');
    });
  });

  it('R13 un lote con presentacion de la misma unidad entra', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const productId = await insertProduct(tx, f, 'PRODUCT', { unitId: f.mlId });

      await insertBatch(tx, f, productId, f.mlPresentationId);

      expect(await tx.productBatch.count({ where: { productId } })).toBe(1);
    });
  });

  it('R14 tras aplicar down.sql, el lote sin presentacion de un insumo sin unidad vuelve a entrar', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const productId = await insertProduct(tx, f, 'PRODUCT');

      await tx.$executeRawUnsafe(downSource);
      await insertBatch(tx, f, productId, null);
      expect(await tx.productBatch.count({ where: { productId } })).toBe(1);

      await tx.$executeRawUnsafe(upSource);
      const otherProductId = await insertProduct(tx, f, 'PRODUCT');
      const message = await expectRejected(tx, () => insertBatch(tx, f, otherProductId, null));
      expect(message).toContain('product_batches_product_without_unit');
    });
  });
});
