/**
 * Tests de integracion de QC-20 (crud-de-productos) que verifican las DOS garantias que
 * viven en Postgres, no en el servicio (design.md > 2.2, R20, R21, R22): el indice unico
 * sobre `presentations.name_normalized` y el `ON DELETE RESTRICT` de
 * `product_batches_presentation_id_fkey` (la presentacion se mudo de `products` a
 * `product_batches` el 2026-09-09).
 *
 * AISLAMIENTO — mismo patron que `inventario-constraints.int.test.ts` y
 * `product-crud.int.test.ts`: cada `it` corre dentro de `prisma.$transaction` interactiva
 * que SIEMPRE termina en `ROLLBACK` (`RollbackSignal`), con `SAVEPOINT` para lo que se
 * espera que falle. Aqui SI se puede usar ese patron para todo el archivo (a diferencia de
 * `product-crud.int.test.ts`): estos tres requisitos son garantias de la BASE, no del
 * adaptador, asi que se ejercitan con `tx.presentation.*` / `tx.product.*` / SQL crudo
 * directamente contra Postgres, nunca a traves de `presentation-prisma.ts` (que ademas usa
 * el cliente global y no participaria de esta transaccion).
 *
 * SQLSTATE, nunca el texto del mensaje: en esta maquina Postgres responde en espanol.
 *
 * MUTACION DE ESQUEMA (ESTANDAR DE RIGOR pedido para esta task) — dos tests adicionales
 * (`describe('mutacion de esquema...')`) alteran DE VERDAD el indice unico y la FK dentro
 * de su propia transaccion, comprueban que la operacion que antes se rechazaba ahora se
 * acepta, y dejan que el `ROLLBACK` de `inRolledBackTransaction` deshaga la alteracion.
 * Cada uno vuelve a comprobar, con una consulta FUERA de la transaccion ya deshecha, que el
 * indice y la FK siguen en pie: la base no queda alterada al terminar el archivo.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/shared/db/prisma';

// ---------------------------------------------------------------------------
// Utilidades de aislamiento
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Datos de apoyo
// ---------------------------------------------------------------------------

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

async function createPresentation(
  tx: Prisma.TransactionClient,
  name: string,
): Promise<string> {
  const presentation = await tx.presentation.create({
    data: { name, nameNormalized: normalizeForTest(name) },
    select: { id: true },
  });
  return presentation.id;
}

/** Producto + lote con la presentacion dada. El lote es quien referencia la presentacion. */
async function createBatchFor(
  tx: Prisma.TransactionClient,
  presentationId: string,
  name = `Producto ${token()}`,
): Promise<{ productId: string; batchId: string }> {
  const product = await tx.product.create({
    data: { name, nameNormalized: normalizeForTest(name) },
    select: { id: true },
  });
  const batch = await tx.productBatch.create({
    data: { productId: product.id, presentationId, stock: 10, unitCost: '1.0000' },
    select: { id: true },
  });
  return { productId: product.id, batchId: batch.id };
}

// ---------------------------------------------------------------------------

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
      AND indexname = 'presentations_name_normalized_key'`;
  if (index.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene el indice unico "presentations_name_normalized_key" ' +
        '(migracion de QC-20 no aplicada, o aplicada a medias). Corre `pnpm run db:migrate`.',
    );
  }

  // El JOIN con `pg_namespace` acota la consulta al esquema `public` y NO es adorno:
  // `pg_constraint` es global a la BASE, no al esquema. La base de pruebas es
  // compartida y llego a tener un esquema espejo (`public_shadow_qc52`) con las
  // mismas tablas; sin este filtro cada FK aparecia DOS veces. No sirve confiar en
  // el `search_path` ni en `::regclass`, que solo cualifica cuando la tabla NO esta
  // en el path: por eso el sintoma era tan confuso.
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

// ---------------------------------------------------------------------------

describe('R20: el indice unico es la garantia real de la unicidad', () => {
  it('el indice unico rechaza con SQLSTATE 23505 la segunda insercion del mismo nombre normalizado', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token();
      const normalized = `bidon20l${marker}`;
      const firstId = await createPresentation(tx, `Bidon 20 L ${marker}`);

      // Nombre ORIGINAL distinto («BIDON-20L …» frente a «Bidon 20 L …»); lo que choca es
      // la clave normalizada, que es justo lo que R18/R19/R20 exigen juntos.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            INSERT INTO "presentations" ("name", "name_normalized", "updated_at")
            VALUES (${`BIDON-20L ${marker}`}, ${normalized}, CURRENT_TIMESTAMP)`,
        'segunda presentacion con el mismo nombre normalizado',
      );
      expect(sqlState).toBe(UNIQUE_VIOLATION);

      // «No crear ni modificar ninguna fila»: solo sobrevive la primera.
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
      const presentationId = await createPresentation(tx, `Tambor 200 L ${token()}`);
      const { batchId } = await createBatchFor(tx, presentationId);

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

      // «Conservar la presentacion y sus lotes sin modificar»: se relee TRAS el rechazo,
      // dentro de la misma transaccion (el SAVEPOINT deja todo lo demas vivo).
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
      const presentationId = await createPresentation(tx, `Presentacion huerfana ${token()}`);
      expect(await tx.productBatch.count({ where: { presentationId } })).toBe(0);

      const affected = await tx.$executeRaw`DELETE FROM "presentations" WHERE "id" = CAST(${presentationId} AS uuid)`;
      expect(affected).toBe(1);

      // Fisico de verdad: la fila deja de existir, no se marca como borrada (no hay
      // `deleted_at` que marcar: `presentations` no lo tiene, D6).
      const after = await tx.presentation.findUnique({ where: { id: presentationId } });
      expect(after).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// ESTANDAR DE RIGOR: mutacion de esquema. Cada test altera el constraint DE VERDAD dentro
// de su propia transaccion (que siempre termina en ROLLBACK), demuestra que sin el, la
// operacion que R20/R21 exigen que falle deja de fallar, y comprueba -con una consulta
// posterior a que la transaccion ya se deshizo- que el constraint sigue en pie.
// ---------------------------------------------------------------------------

describe('mutacion de esquema: sin el constraint, el requisito deja de cumplirse', () => {
  it('sin el indice unico, la segunda insercion del mismo nombre normalizado deja de fallar (R20)', async () => {
    let sawItAccepted = false;

    await inRolledBackTransaction(async (tx) => {
      const marker = token();
      const normalized = `sinindice${marker}`;
      await createPresentation(tx, `Sin indice ${marker}`);

      await tx.$executeRawUnsafe('DROP INDEX "presentations_name_normalized_key"');

      // Con el indice fuera, la segunda insercion con el mismo `name_normalized` YA NO
      // choca: es exactamente lo que el indice, cuando esta, impide.
      await tx.$executeRaw`
        INSERT INTO "presentations" ("name", "name_normalized", "updated_at")
        VALUES (${`Sin indice otra vez ${marker}`}, ${normalized}, CURRENT_TIMESTAMP)`;

      const rows = await tx.presentation.findMany({
        where: { nameNormalized: normalized },
        select: { id: true },
      });
      sawItAccepted = rows.length === 2;
      // La transaccion completa termina en ROLLBACK (`inRolledBackTransaction`), asi que
      // ni las dos filas ni el DROP INDEX sobreviven.
    });

    expect(sawItAccepted).toBe(true);

    // Verificacion FUERA de la transaccion ya deshecha: el indice sigue en pie.
    const indexAfter = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'presentations'
        AND indexname = 'presentations_name_normalized_key'`;
    expect(indexAfter).toHaveLength(1);
  });

  it('sin ON DELETE RESTRICT, borrar una presentacion con lotes asignados deja de estar bloqueado (R21)', async () => {
    let sawDeleteSucceed = false;

    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx, `Sin restrict ${token()}`);
      const { batchId } = await createBatchFor(tx, presentationId);

      await tx.$executeRawUnsafe(
        'ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_presentation_id_fkey"',
      );

      // Con la FK fuera, el DELETE que R21 exige que se rechace ahora se acepta: el lote
      // queda con un `presentation_id` que ya no apunta a ninguna fila viva (huerfano), y
      // eso es justo lo que la restriccion existe para impedir.
      const affected = await tx.$executeRaw`DELETE FROM "presentations" WHERE "id" = CAST(${presentationId} AS uuid)`;
      sawDeleteSucceed = affected === 1;

      const presentationAfter = await tx.presentation.findUnique({ where: { id: presentationId } });
      expect(presentationAfter).toBeNull();
      const batchAfter = await tx.productBatch.findUniqueOrThrow({ where: { id: batchId } });
      expect(batchAfter.presentationId).toBe(presentationId);
      // La transaccion entera termina en ROLLBACK: ni el DELETE ni el ALTER sobreviven.
    });

    expect(sawDeleteSucceed).toBe(true);

    // Verificacion FUERA de la transaccion ya deshecha: la FK sigue en pie.
    // Acotada a `public` por el mismo motivo que la del `beforeAll`.
    const fkAfter = await prisma.$queryRaw<{ conname: string; deleteAction: string }[]>`
      SELECT c.conname, c.confdeltype AS "deleteAction" FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE c.conname = 'product_batches_presentation_id_fkey' AND c.contype = 'f'
        AND n.nspname = 'public'`;
    expect(fkAfter).toHaveLength(1);
    // 'r' = RESTRICT, la accion original de la migracion de product_batches.
    expect(fkAfter[0]?.deleteAction).toBe('r');
  });
});
