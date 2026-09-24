/**
 * Estas garantias viven en Postgres y no en el servicio, asi que se ejercitan directamente contra
 * la base dentro de transacciones que se deshacen, sin pasar por el adaptador: este usa el
 * cliente global y no participaria de la transaccion.
 * Los casos de mutacion quitan el indice o la FK dentro de la transaccion para demostrar que sin
 * ellos la operacion deja de fallar, y comprueban despues, ya fuera, que siguen en pie.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/shared/db/prisma';

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test');
    this.name = 'RollbackSignal';
  }
}

async function inRolledBackTransaction(
  body: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx);
        throw new RollbackSignal();
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
}

let savepointSeq = 0;

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/** SQLSTATE y no el texto: el mensaje sale en el idioma del servidor. */
function sqlStateOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta;
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1;
  const savepoint = `sp_${String(savepointSeq)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return sqlStateOf(error);
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`);
}

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** Misma normalizacion de cuatro pasos que `domain/presentation-name.ts` y el backfill. */
function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^a-z0-9]/gu, '');
}

/**
 * Por nombre normalizado y no por uuid: los identificadores los genera `gen_random_uuid()` y
 * cambian en cada base.
 */
async function unidadDeSistema(db: Prisma.TransactionClient): Promise<string> {
  const unit = await db.unit.findFirstOrThrow({
    where: { nameNormalized: 'kilogramo', companyId: null },
    select: { id: true },
  });
  return unit.id;
}

/** La unicidad de nombre de presentacion es por empresa: el choque se monta dentro de una. */
async function createCompany(tx: Prisma.TransactionClient, marker: string): Promise<string> {
  const company = await tx.company.create({
    data: { name: `Empresa ${marker}`, nameNormalized: `empresa${marker}` },
    select: { id: true },
  });
  return company.id;
}

async function createPresentation(
  tx: Prisma.TransactionClient,
  name: string,
  companyId: string,
): Promise<string> {
  const presentation = await tx.presentation.create({
    data: {
      name,
      nameNormalized: normalizeForTest(name),
      unitId: await unidadDeSistema(tx),
      companyId,
    },
    select: { id: true },
  });
  return presentation.id;
}

/** El lote es quien referencia la presentacion. */
async function createBatchFor(
  tx: Prisma.TransactionClient,
  presentationId: string,
  companyId: string,
  name = `Producto ${token()}`,
): Promise<{ productId: string; batchId: string }> {
  // La unidad de la presentacion: sin ella, `product_batches_check_unit` rechazaria el lote
  // de mas abajo.
  const presentation = await tx.presentation.findUniqueOrThrow({
    where: { id: presentationId },
    select: { unitId: true },
  });
  const product = await tx.product.create({
    data: { name, nameNormalized: normalizeForTest(name), unitId: presentation.unitId, companyId },
    select: { id: true },
  });
  const batch = await tx.productBatch.create({
    // `product_batches_check_company` exige la misma empresa en lote, producto y presentacion,
    // y `lot` es unico por empresa.
    data: {
      productId: product.id,
      presentationId,
      stock: 10,
      unitCost: '1.0000',
      lot: `L-${randomUUID()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      companyId,
    },
    select: { id: true },
  });
  return { productId: product.id, batchId: batch.id };
}

beforeAll(async () => {
  const columns = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'presentations' AND column_name = 'name_normalized'`;
  if (columns.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene "presentations.name_normalized" (migracion de QC-20 ' +
        '`product_audit_and_presentation_uniqueness` no aplicada). Corre `pnpm run db:migrate`.',
    );
  }

  const index = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'presentations'
      AND indexname = 'presentations_company_name_unique'`;
  if (index.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene el indice unico "presentations_company_name_unique" ' +
        '(migracion de QC-49 `inventory_company_scope` no aplicada, o aplicada a medias). ' +
        'Corre `pnpm run db:migrate`.',
    );
  }

  // Si el indice global conviviera con el de empresa, dos empresas seguirian sin poder repetir
  // nombre.
  const indiceGlobal = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'presentations'
      AND indexname = 'presentations_name_normalized_key'`;
  if (indiceGlobal.length !== 0) {
    throw new Error(
      'la base de pruebas conserva el indice unico GLOBAL "presentations_name_normalized_key", ' +
        'que QC-49 sustituye por uno por empresa. Corre `pnpm run db:migrate`.',
    );
  }

  // `pg_constraint` abarca toda la base, no un esquema: sin acotar `public`, un esquema espejo
  // con las mismas tablas duplicaria la FK. `search_path` y `::regclass` no bastan.
  const fk = await prisma.$queryRaw<{ conname: string }[]>`
    SELECT c.conname FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'product_batches_presentation_id_fkey' AND c.contype = 'f'
      AND n.nspname = 'public'`;
  if (fk.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene la FK "product_batches_presentation_id_fkey" (migracion de ' +
        'product_batches no aplicada). Corre `pnpm run db:migrate`.',
    );
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('R20: el indice unico es la garantia real de la unicidad', () => {
  it('el indice unico rechaza con SQLSTATE 23505 la segunda insercion del mismo nombre normalizado', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token();
      const normalized = `bidon20l${marker}`;
      // Misma empresa: entre empresas distintas no hay choque y el caso no probaria nada.
      const companyId = await createCompany(tx, marker);
      const firstId = await createPresentation(tx, `Bidon 20 L ${marker}`, companyId);
      // `unit_id` es NOT NULL: sin ella el rechazo seria 23502 y no probaria la unicidad.
      const unidadSistema = await unidadDeSistema(tx);

      // El nombre original es distinto: lo que choca es la clave normalizada.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            INSERT INTO "presentations" ("name", "name_normalized", "unit_id", "company_id", "updated_at")
            VALUES (${`BIDON-20L ${marker}`}, ${normalized}, CAST(${unidadSistema} AS uuid), CAST(${companyId} AS uuid), CURRENT_TIMESTAMP)`,
        'segunda presentacion con el mismo nombre normalizado en la MISMA empresa',
      );
      expect(sqlState).toBe(UNIQUE_VIOLATION);

      const rows = await tx.presentation.findMany({
        where: { nameNormalized: normalized },
        select: { id: true },
      });
      expect(rows).toEqual([{ id: firstId }]);
    });
  });
});

describe('R21: el borrado de una presentacion en uso queda bloqueado', () => {
  it('rechaza con SQLSTATE 23503 borrar una presentacion con lotes asignados', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token();
      const companyId = await createCompany(tx, marker);
      const presentationId = await createPresentation(tx, `Tambor 200 L ${marker}`, companyId);
      const { batchId } = await createBatchFor(tx, presentationId, companyId);

      const presentationBefore = await tx.presentation.findUniqueOrThrow({
        where: { id: presentationId },
      });
      const batchBefore = await tx.productBatch.findUniqueOrThrow({ where: { id: batchId } });

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "presentations" WHERE "id" = CAST(${presentationId} AS uuid)`,
        'borrado de una presentacion con un lote asignado',
      );
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION);

      // El SAVEPOINT deja la transaccion viva para releer tras el rechazo.
      const presentationAfter = await tx.presentation.findUniqueOrThrow({
        where: { id: presentationId },
      });
      expect(presentationAfter).toEqual(presentationBefore);
      const batchAfter = await tx.productBatch.findUniqueOrThrow({ where: { id: batchId } });
      expect(batchAfter).toEqual(batchBefore);
    });
  });
});

describe('R22: el borrado de una presentacion sin lotes es fisico', () => {
  it('borra fisicamente la presentacion sin lotes asignados', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token();
      const presentationId = await createPresentation(
        tx,
        `Presentacion huerfana ${marker}`,
        await createCompany(tx, marker),
      );
      expect(await tx.productBatch.count({ where: { presentationId } })).toBe(0);

      const affected = await tx.$executeRaw`DELETE FROM "presentations" WHERE "id" = CAST(${presentationId} AS uuid)`;
      expect(affected).toBe(1);

      const after = await tx.presentation.findUnique({ where: { id: presentationId } });
      expect(after).toBeNull();
    });
  });
});

describe('mutacion de esquema: sin el constraint, el requisito deja de cumplirse', () => {
  it('sin el indice unico, la segunda insercion del mismo nombre normalizado deja de fallar (R20)', async () => {
    let sawItAccepted = false;

    await inRolledBackTransaction(async (tx) => {
      const marker = token();
      const normalized = `sinindice${marker}`;
      const companyId = await createCompany(tx, marker);
      await createPresentation(tx, `Sin indice ${marker}`, companyId);
      // `unit_id` es NOT NULL: sin ella el INSERT fallaria por otra razon.
      const unidadSistema = await unidadDeSistema(tx);

      await tx.$executeRawUnsafe('DROP INDEX "presentations_company_name_unique"');

      await tx.$executeRaw`
        INSERT INTO "presentations" ("name", "name_normalized", "unit_id", "company_id", "updated_at")
        VALUES (${`Sin indice otra vez ${marker}`}, ${normalized}, CAST(${unidadSistema} AS uuid), CAST(${companyId} AS uuid), CURRENT_TIMESTAMP)`;

      const rows = await tx.presentation.findMany({
        where: { nameNormalized: normalized },
        select: { id: true },
      });
      sawItAccepted = rows.length === 2;
      // El ROLLBACK final deshace tambien el DROP INDEX.
    });

    expect(sawItAccepted).toBe(true);

    // Fuera de la transaccion ya deshecha.
    const indexAfter = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'presentations'
        AND indexname = 'presentations_company_name_unique'`;
    expect(indexAfter).toHaveLength(1);
  });

  it('sin ON DELETE RESTRICT, borrar una presentacion con lotes asignados deja de estar bloqueado (R21)', async () => {
    let sawDeleteSucceed = false;

    await inRolledBackTransaction(async (tx) => {
      const marker = token();
      const companyId = await createCompany(tx, marker);
      const presentationId = await createPresentation(tx, `Sin restrict ${marker}`, companyId);
      const { batchId } = await createBatchFor(tx, presentationId, companyId);

      await tx.$executeRawUnsafe(
        'ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_presentation_id_fkey"',
      );

      // El lote queda huerfano, que es justo lo que la FK impide.
      const affected = await tx.$executeRaw`DELETE FROM "presentations" WHERE "id" = CAST(${presentationId} AS uuid)`;
      sawDeleteSucceed = affected === 1;

      const presentationAfter = await tx.presentation.findUnique({ where: { id: presentationId } });
      expect(presentationAfter).toBeNull();
      const batchAfter = await tx.productBatch.findUniqueOrThrow({ where: { id: batchId } });
      expect(batchAfter.presentationId).toBe(presentationId);
      // El ROLLBACK final deshace tambien el DELETE y el ALTER.
    });

    expect(sawDeleteSucceed).toBe(true);

    // Fuera de la transaccion ya deshecha, y acotada a `public` como la del `beforeAll`.
    const fkAfter = await prisma.$queryRaw<{ conname: string; deleteAction: string }[]>`
      SELECT c.conname, c.confdeltype AS "deleteAction" FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE c.conname = 'product_batches_presentation_id_fkey' AND c.contype = 'f'
        AND n.nspname = 'public'`;
    expect(fkAfter).toHaveLength(1);
    // 'r' = RESTRICT.
    expect(fkAfter[0]?.deleteAction).toBe('r');
  });
});
