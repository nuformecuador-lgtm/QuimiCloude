// tests/integration/proveedores/material-measurements-migration.int.test.ts
/**
 * Migracion `*_supplier_catalog_line_material_and_measurements` contra Postgres REAL (R27).
 *
 * AISLAMIENTO: `transaccion` (censo `tests/integration/aislamiento.json`) — mismo patron que
 * `catalog-line.int.test.ts`: `prisma.$transaction` interactiva que SIEMPRE termina en
 * `ROLLBACK`, con `SAVEPOINT` para lo que debe fallar y el SQLSTATE crudo de `meta.code`.
 *
 * Lo que se prueba aqui es SOLO lo que la BASE garantiza (los dos CHECK de la migracion):
 * `material` en blanco y `measurements` que no es un objeto se rechazan; `NULL` en las dos
 * columnas y un objeto valido de `measurements` se aceptan. La FORMA de `measurements`
 * -diametro, alto y boca- la valida `measurementsSchema` en la aplicacion
 * (`tests/unit/proveedores/catalog-line-input.test.ts`): la base solo sabe «objeto o nulo».
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeSupplierName } from '@/lib/modules/proveedores/domain/supplier-name';
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

const CHECK_VIOLATION = '23514';

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
  const savepoint = `qc158_sp_${String(savepointSeq)}`;
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

type Db = Prisma.TransactionClient;

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

async function andamiajeCompanyId(db: Db): Promise<string> {
  const company = await db.company.findFirstOrThrow({ select: { id: true } });
  return company.id;
}

async function unidadDeSistema(db: Db): Promise<string> {
  const unit = await db.unit.findFirstOrThrow({
    where: { nameNormalized: 'kilogramo', companyId: null },
    select: { id: true },
  });
  return unit.id;
}

async function createTestSupplier(db: Db, companyId: string): Promise<string> {
  const name = `Proveedor ${token()}`;
  const supplier = await db.supplier.create({
    data: {
      name,
      nameNormalized: normalizeSupplierName(name),
      phone: '+57 300 000 0000',
      companyId,
    },
    select: { id: true },
  });
  return supplier.id;
}

async function createTestPresentation(db: Db, companyId: string): Promise<string> {
  const name = `Bidon ${token()}`;
  const presentation = await db.presentation.create({
    data: {
      name,
      nameNormalized: name.toLowerCase(),
      unitId: await unidadDeSistema(db),
      companyId,
    },
    select: { id: true },
  });
  return presentation.id;
}

/**
 * `INSERT INTO supplier_catalog_lines` crudo con `material`/`measurements`: el unico camino
 * que propaga el SQLSTATE de un CHECK de la base, sin pasar por `zod`.
 */
async function rawInsertLine(
  tx: Prisma.TransactionClient,
  supplierId: string,
  companyId: string,
  presentationId: string,
  material: string | null,
  measurements: string | null,
): Promise<void> {
  const name = `Linea ${token()}`;
  await tx.$executeRaw`
    INSERT INTO "supplier_catalog_lines"
      ("supplier_id", "company_id", "name", "name_normalized", "presentation_id", "cost",
       "material", "measurements", "updated_at")
    VALUES (
      CAST(${supplierId} AS uuid),
      CAST(${companyId} AS uuid),
      ${name},
      ${normalizeSupplierName(name)},
      CAST(${presentationId} AS uuid),
      10.0000,
      ${material},
      CAST(${measurements} AS jsonb),
      CURRENT_TIMESTAMP)`;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migracion material y measurements contra Postgres real (R27)', () => {
  it('el CHECK de material rechaza el texto en blanco y acepta NULL y un texto real', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await andamiajeCompanyId(tx);
      const supplierId = await createTestSupplier(tx, companyId);
      const presentationId = await createTestPresentation(tx, companyId);

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsertLine(tx, supplierId, companyId, presentationId, '  ', null),
        'material en blanco',
      );
      expect(sqlState).toBe(CHECK_VIOLATION);

      await rawInsertLine(tx, supplierId, companyId, presentationId, null, null);
      await rawInsertLine(tx, supplierId, companyId, presentationId, 'Polietileno', null);

      const filas = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        select: { material: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(filas).toEqual([{ material: null }, { material: 'Polietileno' }]);
    });
  });

  it('el CHECK de measurements rechaza lo que no es objeto y acepta NULL y un objeto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await andamiajeCompanyId(tx);
      const supplierId = await createTestSupplier(tx, companyId);
      const presentationId = await createTestPresentation(tx, companyId);

      for (const noEsObjeto of ['[]', '"texto"', '5', 'true']) {
        const sqlState = await expectRejectedByDatabase(
          tx,
          () => rawInsertLine(tx, supplierId, companyId, presentationId, null, noEsObjeto),
          `measurements = ${noEsObjeto}`,
        );
        expect(sqlState, `measurements ${noEsObjeto} deberia caer`).toBe(CHECK_VIOLATION);
      }

      await rawInsertLine(tx, supplierId, companyId, presentationId, null, null);
      await rawInsertLine(
        tx,
        supplierId,
        companyId,
        presentationId,
        null,
        JSON.stringify({ diameter: { value: '7.5000', unit: 'cm' }, height: null, mouth: null }),
      );

      const filas = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        select: { measurements: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(filas).toEqual([
        { measurements: null },
        { measurements: { diameter: { value: '7.5000', unit: 'cm' }, height: null, mouth: null } },
      ]);
    });
  });
});
