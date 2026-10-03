/**
 * `*_packaging_products_in_distribution` contra Postgres real: el CHECK de identidad de
 * `products`, la FK compuesta del envase de la linea del reparto, la unidad de sistema de los
 * envases y que una linea anterior a la migracion queda intacta.
 *
 * AISLAMIENTO: cada `it` corre en una transaccion interactiva que termina en `RollbackSignal`.
 * Lo que se espera que falle va dentro de un SAVEPOINT. El caso de R32 aplica el `down.sql` y el
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
  const savepoint = `qc195_sp_${String(savepointSeq)}`;
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
  readdirSync(migrationsDir).find((name) => name.endsWith('_packaging_products_in_distribution')) ?? 'missing',
);
const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8');
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8');

/** Respeta el cuerpo `$$ ... $$` de un bloque `DO`. */
function statementsOf(sql: string): readonly string[] {
  const text = sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  const statements: string[] = [];
  let current = '';
  let inDollar = false;
  for (let i = 0; i < text.length; i += 1) {
    if (text.slice(i, i + 2) === '$$') {
      inDollar = !inDollar;
      current += '$$';
      i += 1;
      continue;
    }
    const char = text[i];
    if (char === ';' && !inDollar) {
      if (current.trim().length > 0) statements.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) statements.push(current.trim());
  return statements;
}

async function runScript(tx: Prisma.TransactionClient, source: string): Promise<void> {
  for (const statement of statementsOf(source)) {
    await tx.$executeRawUnsafe(statement);
  }
}

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

interface Fixtures {
  readonly companyId: string;
  readonly otherCompanyId: string;
  readonly recipeId: string;
  readonly unitId: string;
  readonly presentationId: string;
}

async function seedCompany(tx: Prisma.TransactionClient): Promise<string> {
  const name = `Empresa envases ${token()}`;
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  return company.id;
}

async function seed(tx: Prisma.TransactionClient): Promise<Fixtures> {
  const companyId = await seedCompany(tx);
  const otherCompanyId = await seedCompany(tx);
  const marca = token();
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  });
  const ml = await tx.unit.findFirstOrThrow({
    where: { companyId: null, nameNormalized: 'mililitro' },
    select: { id: true },
  });
  const presentationName = `Botella ${marca}`;
  const presentation = await tx.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: normalizePresentationName(presentationName),
      unitId: ml.id,
      companyId,
      content: '500',
    },
    select: { id: true },
  });
  return { companyId, otherCompanyId, recipeId: recipe.id, unitId: ml.id, presentationId: presentation.id };
}

async function insertProduct(
  tx: Prisma.TransactionClient,
  companyId: string,
  type: ProductType,
  ids: { readonly presentationId?: string; readonly recipeId?: string },
): Promise<string> {
  const name = `Producto ${token()}`;
  const product = await tx.product.create({
    data: {
      name,
      nameNormalized: name.toLowerCase(),
      type,
      companyId,
      presentationId: ids.presentationId ?? null,
      recipeId: ids.recipeId ?? null,
    },
    select: { id: true },
  });
  return product.id;
}

let nextSequence = 950_000;

async function insertOrder(tx: Prisma.TransactionClient, f: Fixtures): Promise<string> {
  nextSequence += 1;
  const order = await tx.order.create({
    data: {
      companyId: f.companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: nextSequence,
      recipeId: f.recipeId,
      quantity: new Prisma.Decimal('20'),
      unitId: f.unitId,
    },
    select: { id: true },
  });
  return order.id;
}

const CHECK = 'products_finished_identity_matches_type';

describe('QC-195 — restricciones de envases en la base', () => {
  it('R5 — un PRODUCT o un MACHINE con presentacion propia se rechaza por el CHECK de identidad', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      for (const type of ['PRODUCT', 'MACHINE'] as const) {
        const message = await expectRejected(tx, () =>
          insertProduct(tx, f.companyId, type, { presentationId: f.presentationId }),
        );
        expect(message, type).toContain(CHECK);
      }
    });
  });

  it('R1/R5 — un PACKAGING con presentacion entra, y uno sin ella (envase anterior) tambien', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const withPresentation = await insertProduct(tx, f.companyId, 'PACKAGING', { presentationId: f.presentationId });
      const legacy = await insertProduct(tx, f.companyId, 'PACKAGING', {});
      const rows = await tx.product.findMany({
        where: { id: { in: [withPresentation, legacy] } },
        select: { id: true, presentationId: true },
      });
      expect(rows.find((row) => row.id === withPresentation)?.presentationId).toBe(f.presentationId);
      expect(rows.find((row) => row.id === legacy)?.presentationId).toBeNull();
    });
  });

  it('R5 — un FINISHED_PRODUCT sin receta, o sin presentacion, se rechaza; un PACKAGING con receta tambien', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const sinReceta = await expectRejected(tx, () =>
        insertProduct(tx, f.companyId, 'FINISHED_PRODUCT', { presentationId: f.presentationId }),
      );
      expect(sinReceta).toContain(CHECK);
      const sinPresentacion = await expectRejected(tx, () =>
        insertProduct(tx, f.companyId, 'FINISHED_PRODUCT', { recipeId: f.recipeId }),
      );
      expect(sinPresentacion).toContain(CHECK);
      const envaseConReceta = await expectRejected(tx, () =>
        insertProduct(tx, f.companyId, 'PACKAGING', { presentationId: f.presentationId, recipeId: f.recipeId }),
      );
      expect(envaseConReceta).toContain(CHECK);
      await insertProduct(tx, f.companyId, 'FINISHED_PRODUCT', {
        recipeId: f.recipeId,
        presentationId: f.presentationId,
      });
    });
  });

  it('R11 — una linea del reparto con un envase de otra empresa se rechaza por la FK compuesta', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      const foreign = await insertProduct(tx, f.otherCompanyId, 'PACKAGING', {});
      const own = await insertProduct(tx, f.companyId, 'PACKAGING', { presentationId: f.presentationId });
      const orderId = await insertOrder(tx, f);
      const message = await expectRejected(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "order_presentation_lines"
            ("order_id", "company_id", "presentation_id", "packages", "presentation_content",
             "packaging_product_id", "updated_at")
          VALUES (CAST(${orderId} AS uuid), CAST(${f.companyId} AS uuid), CAST(${f.presentationId} AS uuid),
                  4, 500, CAST(${foreign} AS uuid), now())`,
      );
      expect(message).toContain('order_presentation_lines_company_id_packaging_product_id_fkey');
      const line = await tx.orderPresentationLine.create({
        data: {
          orderId,
          companyId: f.companyId,
          presentationId: f.presentationId,
          packages: 4,
          presentationContent: '500',
          packagingProductId: own,
        },
        select: { packagingProductId: true },
      });
      expect(line.packagingProductId).toBe(own);
    });
  });

  it('R6 — existe la unidad de sistema «unidad» (u), base y sin derivacion', async () => {
    const unit = await prisma.unit.findFirst({
      where: { companyId: null, nameNormalized: 'unidad' },
      select: { symbol: true, baseUnitId: true, factor: true },
    });
    expect(unit).toEqual({ symbol: 'u', baseUnitId: null, factor: null });
  });

  it('R32 — una linea guardada antes de la migracion queda intacta, sin envase y sin apartados', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seed(tx);
      await runScript(tx, downSource);
      const orderId = await insertOrder(tx, f);
      await tx.$executeRaw`
        INSERT INTO "order_presentation_lines"
          ("order_id", "company_id", "presentation_id", "packages", "presentation_content", "updated_at")
        VALUES (CAST(${orderId} AS uuid), CAST(${f.companyId} AS uuid), CAST(${f.presentationId} AS uuid),
                40, 500, now())`;
      const before = await tx.$queryRaw<ReadonlyArray<Record<string, unknown>>>`
        SELECT "id", "presentation_id", "packages", "presentation_content"::text AS content, "updated_at"
          FROM "order_presentation_lines" WHERE "order_id" = CAST(${orderId} AS uuid)`;

      await runScript(tx, upSource);

      const after = await tx.$queryRaw<ReadonlyArray<Record<string, unknown>>>`
        SELECT "id", "presentation_id", "packages", "presentation_content"::text AS content, "updated_at"
          FROM "order_presentation_lines" WHERE "order_id" = CAST(${orderId} AS uuid)`;
      expect(after).toEqual(before);
      const packaging = await tx.$queryRaw<ReadonlyArray<{ packaging_product_id: string | null }>>`
        SELECT "packaging_product_id" FROM "order_presentation_lines" WHERE "order_id" = CAST(${orderId} AS uuid)`;
      expect(packaging).toEqual([{ packaging_product_id: null }]);
      expect(await tx.reservationMovement.count({ where: { orderId } })).toBe(0);
    });
  });
});
