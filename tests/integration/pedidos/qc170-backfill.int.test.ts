/**
 * La migracion `db/migrations/*_order_presentation_lines_backfill_and_drop` contra Postgres REAL:
 * el paso de la presentacion unica del pedido a su reparto, la unidad del pedido, los dos abortos
 * y su `down.sql`.
 *
 * AISLAMIENTO -- cada `it` corre en una transaccion interactiva que termina en `RollbackSignal`
 * (patron de `reserve-existing-orders-migration.int.test.ts`). Postgres deshace tambien el DDL,
 * asi que la base efimera de la corrida queda como estaba: con la migracion aplicada.
 *
 * ESTADO PREVIO -- la base de la corrida ya tiene esta migracion aplicada. Para probar el UP,
 * cada caso aplica primero el `down.sql` REAL dentro de la transaccion (vuelven
 * `orders.presentation_id`/`presentation_content`), siembra con SQL crudo -el cliente Prisma ya
 * no conoce esas columnas- y aplica el `migration.sql` REAL. Los dos archivos se leen del disco,
 * no se copian.
 *
 * SAVEPOINT -- un `RAISE EXCEPTION` deja abortada la transaccion de Postgres; se envuelve en
 * `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` para seguir comprobando que no quedo nada a medias.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { normalizeUnitName } from '@/lib/modules/unidades';
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

// ---------------------------------------------------------------------------
// El SQL, leido del archivo
// ---------------------------------------------------------------------------

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

function locateMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations');
  const carpetas = readdirSync(migrationsDir).filter((name) =>
    name.endsWith('_order_presentation_lines_backfill_and_drop'),
  );
  expect(carpetas, 'debe existir exactamente una migracion *_order_presentation_lines_backfill_and_drop').toHaveLength(1);
  return join(migrationsDir, carpetas[0] as string);
}

const migrationDir = locateMigrationDir();
const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8');
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8');

/** Respeta el cuerpo `$$ ... $$` de un bloque `DO`: un `split(';')` ingenuo lo rompe. */
function statementsOf(sql: string): readonly string[] {
  const withoutComments = sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

  const statements: string[] = [];
  let current = '';
  let inDollarBlock = false;
  let i = 0;
  while (i < withoutComments.length) {
    if (withoutComments.slice(i, i + 2) === '$$') {
      inDollarBlock = !inDollarBlock;
      current += '$$';
      i += 2;
      continue;
    }
    const char = withoutComments[i];
    if (char === ';' && !inDollarBlock) {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      i += 1;
      continue;
    }
    current += char;
    i += 1;
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);
  return statements;
}

async function runScript(tx: Prisma.TransactionClient, source: string): Promise<void> {
  for (const statement of statementsOf(source)) {
    await tx.$executeRawUnsafe(statement);
  }
}

let savepointSeq = 0;

/** Corre `run` esperando que falle, dentro de un SAVEPOINT; devuelve el mensaje del error. */
async function expectScriptToFail(tx: Prisma.TransactionClient, run: () => Promise<void>, what: string): Promise<string> {
  savepointSeq += 1;
  const savepoint = `qc170_backfill_sp_${String(savepointSeq)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`se esperaba que fallara y no fallo: ${what}`);
}

/** Lleva la base de la transaccion al estado de ANTES de la migracion. */
async function toStateBeforeMigration(tx: Prisma.TransactionClient): Promise<void> {
  await runScript(tx, downSource);
  expect(await orderColumnExists(tx, 'presentation_id'), 'el down.sql debe reponer la columna').toBe(true);
}

// ---------------------------------------------------------------------------
// Lectura del esquema
// ---------------------------------------------------------------------------

async function orderColumnExists(tx: Prisma.TransactionClient, column: string): Promise<boolean> {
  const rows = await tx.$queryRaw<ReadonlyArray<{ exists: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = ${column}
    ) AS "exists"
  `);
  return rows[0]?.exists === true;
}

async function orderConstraintNames(tx: Prisma.TransactionClient): Promise<readonly string[]> {
  const rows = await tx.$queryRaw<ReadonlyArray<{ conname: string }>>(Prisma.sql`
    SELECT conname FROM pg_constraint WHERE conrelid = 'public.orders'::regclass ORDER BY conname
  `);
  return rows.map((row) => row.conname);
}

async function orderIndexNames(tx: Prisma.TransactionClient): Promise<readonly string[]> {
  const rows = await tx.$queryRaw<ReadonlyArray<{ indexname: string }>>(Prisma.sql`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'orders' ORDER BY indexname
  `);
  return rows.map((row) => row.indexname);
}

async function forcedRls(tx: Prisma.TransactionClient, table: string): Promise<boolean> {
  const rows = await tx.$queryRaw<ReadonlyArray<{ enabled: boolean; forced: boolean }>>(Prisma.sql`
    SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
      FROM pg_class WHERE oid = ${`public.${table}`}::regclass
  `);
  return rows[0]?.enabled === true && rows[0]?.forced === true;
}

const DROPPED_CONSTRAINTS = [
  'orders_company_id_presentation_id_fkey',
  'orders_presentation_content_positive',
  'orders_presentation_content_requires_presentation',
] as const;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

interface Fixtures {
  readonly companyId: string;
  readonly recipeId: string;
  readonly packerId: string;
  /** Unidad de `withContent`. */
  readonly unitA: string;
  /** Unidad de `withoutContent`: distinta, para ver que cada pedido toma la de SU presentacion. */
  readonly unitB: string;
  /** Presentacion con contenido 2.5. */
  readonly withContent: string;
  /** Presentacion sin contenido. */
  readonly withoutContent: string;
}

async function seedUnit(tx: Prisma.TransactionClient, label: string): Promise<string> {
  const marca = token();
  const name = `Unidad ${label} ${marca}`;
  const unit = await tx.unit.create({
    data: { name, nameNormalized: normalizeUnitName(name), symbol: `${label}${marca.slice(0, 6)}` },
    select: { id: true },
  });
  return unit.id;
}

async function seedPresentation(
  tx: Prisma.TransactionClient,
  companyId: string,
  unitId: string,
  content: string | null,
): Promise<string> {
  const name = `Envase ${token()}`;
  const presentation = await tx.presentation.create({
    data: { name, nameNormalized: normalizePresentationName(name), unitId, companyId, content },
    select: { id: true },
  });
  return presentation.id;
}

async function seedFixtures(tx: Prisma.TransactionClient): Promise<Fixtures> {
  const marca = token();
  const companyName = `Empresa backfill ${marca}`;
  const company = await tx.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: company.id },
    select: { id: true },
  });
  const documentType = await tx.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await tx.role.create({ data: { name: `rol-${marca}`, description: 'Rol de prueba' }, select: { id: true } });
  const packer = await tx.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marca.slice(0, 12),
      username: `ana.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  const unitA = await seedUnit(tx, 'a');
  const unitB = await seedUnit(tx, 'b');
  return {
    companyId: company.id,
    recipeId: recipe.id,
    packerId: packer.id,
    unitA,
    unitB,
    withContent: await seedPresentation(tx, company.id, unitA, '2.5'),
    withoutContent: await seedPresentation(tx, company.id, unitB, null),
  };
}

let nextSequence = 900_000;

type LegacyStatus = 'PENDIENTE' | 'EN_CURSO' | 'POR_EMPACAR' | 'EN_EMPAQUE' | 'CANCELADO';

/**
 * Un pedido con la forma de ANTES de la migracion. Prisma escribe lo que conoce y las dos
 * columnas retiradas van por SQL crudo.
 */
async function seedLegacyOrder(
  tx: Prisma.TransactionClient,
  f: Fixtures,
  seed: {
    readonly quantity: string;
    readonly status?: LegacyStatus;
    readonly presentationId?: string;
    readonly presentationContent?: string;
  },
): Promise<string> {
  nextSequence += 1;
  const status = seed.status ?? 'PENDIENTE';
  const order = await tx.order.create({
    data: {
      companyId: f.companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: nextSequence,
      recipeId: f.recipeId,
      quantity: new Prisma.Decimal(seed.quantity),
      status,
      packedBy: status === 'EN_EMPAQUE' ? f.packerId : undefined,
      cancellationReason: status === 'CANCELADO' ? 'motivo de prueba' : undefined,
    },
    select: { id: true },
  });
  if (seed.presentationId !== undefined) {
    await tx.$executeRaw`
      UPDATE "orders"
         SET "presentation_id" = CAST(${seed.presentationId} AS uuid),
             "presentation_content" = CAST(${seed.presentationContent ?? null} AS decimal(14,4))
       WHERE "id" = CAST(${order.id} AS uuid)`;
  }
  return order.id;
}

interface LineRow {
  readonly companyId: string;
  readonly presentationId: string;
  readonly packages: number;
  readonly presentationContent: string | null;
}

async function linesOf(tx: Prisma.TransactionClient, orderId: string): Promise<readonly LineRow[]> {
  const rows = await tx.orderPresentationLine.findMany({
    where: { orderId },
    select: { companyId: true, presentationId: true, packages: true, presentationContent: true },
  });
  return rows.map((row) => ({ ...row, presentationContent: row.presentationContent?.toFixed(4) ?? null }));
}

async function unitOf(tx: Prisma.TransactionClient, orderId: string): Promise<string | null> {
  const row = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { unitId: true } });
  return row.unitId;
}

/** Ningun pedido ajeno a la transaccion puede disparar los guardias: si los hubiera, el fallo
 *  diria «base sucia», no «migracion rota». */
async function expectNoForeignBlockers(tx: Prisma.TransactionClient, companyId: string): Promise<void> {
  const blockers = await tx.order.count({
    where: { companyId: { not: companyId }, status: { in: ['POR_EMPACAR', 'EN_EMPAQUE'] } },
  });
  expect(blockers, 'la base de la corrida tiene pedidos ajenos en POR_EMPACAR/EN_EMPAQUE').toBe(0);
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe('el UP sobre los cuatro tipos de pedido', () => {
  it('R22, R23, R24, R43: cada pedido migra segun su presentacion y su contenido, y las columnas se retiran', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);
      await expectNoForeignBlockers(tx, f.companyId);
      await toStateBeforeMigration(tx);

      // R22: presentacion + contenido. 10 / 2.5 = 4 envases exactos.
      const exacto = await seedLegacyOrder(tx, f, {
        quantity: '10',
        presentationId: f.withContent,
        presentationContent: '2.5',
      });
      // R22: division entera sin redondeo, con la COPIA del pedido (3), no el contenido vigente
      // de la presentacion (2.5). 10 / 3 = 3,33 -> 3.
      const conResto = await seedLegacyOrder(tx, f, {
        quantity: '10',
        status: 'EN_CURSO',
        presentationId: f.withContent,
        presentationContent: '3',
      });
      // R22, R43: un pedido cancelado tambien conserva su reparto y gana su unidad.
      const cancelado = await seedLegacyOrder(tx, f, {
        quantity: '5',
        status: 'CANCELADO',
        presentationId: f.withContent,
        presentationContent: '2.5',
      });
      // R23: presentacion sin contenido copiado.
      const sinContenido = await seedLegacyOrder(tx, f, { quantity: '10', presentationId: f.withoutContent });
      // R23: sin presentacion.
      const sinPresentacion = await seedLegacyOrder(tx, f, { quantity: '10' });
      // R24: no llena ni un envase. 2 / 2.5 -> 0.
      const resto0 = await seedLegacyOrder(tx, f, {
        quantity: '2',
        presentationId: f.withContent,
        presentationContent: '2.5',
      });

      await runScript(tx, upSource);

      expect(await linesOf(tx, exacto)).toEqual([
        { companyId: f.companyId, presentationId: f.withContent, packages: 4, presentationContent: '2.5000' },
      ]);
      expect(await linesOf(tx, conResto)).toEqual([
        { companyId: f.companyId, presentationId: f.withContent, packages: 3, presentationContent: '3.0000' },
      ]);
      expect(await linesOf(tx, cancelado)).toEqual([
        { companyId: f.companyId, presentationId: f.withContent, packages: 2, presentationContent: '2.5000' },
      ]);
      expect(await linesOf(tx, sinContenido)).toEqual([]);
      expect(await linesOf(tx, sinPresentacion)).toEqual([]);
      expect(await linesOf(tx, resto0)).toEqual([]);

      // R43: la unidad es la de la presentacion que tenia cada pedido; sin presentacion, NULL.
      expect(await unitOf(tx, exacto)).toBe(f.unitA);
      expect(await unitOf(tx, conResto)).toBe(f.unitA);
      expect(await unitOf(tx, cancelado)).toBe(f.unitA);
      expect(await unitOf(tx, sinContenido)).toBe(f.unitB);
      expect(await unitOf(tx, resto0)).toBe(f.unitA);
      expect(await unitOf(tx, sinPresentacion)).toBeNull();

      // El retiro: columnas, FK compuesta, CHECK e indice.
      expect(await orderColumnExists(tx, 'presentation_id')).toBe(false);
      expect(await orderColumnExists(tx, 'presentation_content')).toBe(false);
      const constraints = await orderConstraintNames(tx);
      for (const name of DROPPED_CONSTRAINTS) expect(constraints).not.toContain(name);
      expect(await orderIndexNames(tx)).not.toContain('orders_presentation_id_idx');

      // El parentesis de RLS se cierra: las tres tablas siguen con RLS activada y forzada.
      expect(await forcedRls(tx, 'orders')).toBe(true);
      expect(await forcedRls(tx, 'presentations')).toBe(true);
      expect(await forcedRls(tx, 'order_presentation_lines')).toBe(true);
    });
  });

  it('R49: un pedido POR_EMPACAR con presentacion pero sin linea posible NO aborta y queda sin reparto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);
      await expectNoForeignBlockers(tx, f.companyId);
      await toStateBeforeMigration(tx);

      const sinContenido = await seedLegacyOrder(tx, f, {
        quantity: '10',
        status: 'POR_EMPACAR',
        presentationId: f.withoutContent,
      });
      const resto0 = await seedLegacyOrder(tx, f, {
        quantity: '2',
        status: 'POR_EMPACAR',
        presentationId: f.withContent,
        presentationContent: '2.5',
      });

      await runScript(tx, upSource);

      expect(await linesOf(tx, sinContenido)).toEqual([]);
      expect(await linesOf(tx, resto0)).toEqual([]);
      expect(await unitOf(tx, sinContenido)).toBe(f.unitB);
      expect(await unitOf(tx, resto0)).toBe(f.unitA);
      expect(await orderColumnExists(tx, 'presentation_id')).toBe(false);
    });
  });
});

describe('los abortos: la migracion falla entera, sin aplicar nada', () => {
  /** Lo que no debe cambiar si la migracion aborta: el pedido testigo sigue sin linea ni unidad
   *  y las dos columnas siguen en su sitio. */
  async function expectNothingApplied(tx: Prisma.TransactionClient, testigo: string): Promise<void> {
    expect(await orderColumnExists(tx, 'presentation_id')).toBe(true);
    expect(await orderColumnExists(tx, 'presentation_content')).toBe(true);
    expect(await linesOf(tx, testigo)).toEqual([]);
    expect(await unitOf(tx, testigo)).toBeNull();
    expect(await forcedRls(tx, 'orders')).toBe(true);
  }

  for (const status of ['POR_EMPACAR', 'EN_EMPAQUE'] as const) {
    it(`R45: un pedido ${status} sin presentacion aborta la migracion`, async () => {
      await inRolledBackTransaction(async (tx) => {
        const f = await seedFixtures(tx);
        await expectNoForeignBlockers(tx, f.companyId);
        await toStateBeforeMigration(tx);

        const testigo = await seedLegacyOrder(tx, f, {
          quantity: '10',
          presentationId: f.withContent,
          presentationContent: '2.5',
        });
        await seedLegacyOrder(tx, f, { quantity: '10', status });

        const message = await expectScriptToFail(tx, () => runScript(tx, upSource), `UP con un pedido ${status} sin presentacion`);
        expect(message).toContain('MIGRACION ABORTADA');
        expect(message).toContain('sin presentacion');

        await expectNothingApplied(tx, testigo);
      });
    });
  }

  it('R49: un pedido EN_EMPAQUE con presentacion sin contenido aborta la migracion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);
      await expectNoForeignBlockers(tx, f.companyId);
      await toStateBeforeMigration(tx);

      const testigo = await seedLegacyOrder(tx, f, {
        quantity: '10',
        presentationId: f.withContent,
        presentationContent: '2.5',
      });
      await seedLegacyOrder(tx, f, { quantity: '10', status: 'EN_EMPAQUE', presentationId: f.withoutContent });

      const message = await expectScriptToFail(tx, () => runScript(tx, upSource), 'UP con un pedido EN_EMPAQUE sin contenido');
      expect(message).toContain('MIGRACION ABORTADA');
      expect(message).toContain('EN_EMPAQUE');

      await expectNothingApplied(tx, testigo);
    });
  });

  it('R49: un pedido EN_EMPAQUE que no llena un envase aborta la migracion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);
      await expectNoForeignBlockers(tx, f.companyId);
      await toStateBeforeMigration(tx);

      const testigo = await seedLegacyOrder(tx, f, {
        quantity: '10',
        presentationId: f.withContent,
        presentationContent: '2.5',
      });
      await seedLegacyOrder(tx, f, {
        quantity: '2',
        status: 'EN_EMPAQUE',
        presentationId: f.withContent,
        presentationContent: '2.5',
      });

      const message = await expectScriptToFail(tx, () => runScript(tx, upSource), 'UP con un pedido EN_EMPAQUE sin envase');
      expect(message).toContain('MIGRACION ABORTADA');
      expect(message).toContain('EN_EMPAQUE');

      await expectNothingApplied(tx, testigo);
    });
  });
});

describe('R25: aplicarla dos veces falla, no duplica', () => {
  it('R25: la segunda aplicacion falla porque la columna ya no existe y no anade ninguna linea', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);
      await expectNoForeignBlockers(tx, f.companyId);
      await toStateBeforeMigration(tx);

      const pedido = await seedLegacyOrder(tx, f, {
        quantity: '10',
        presentationId: f.withContent,
        presentationContent: '2.5',
      });
      await runScript(tx, upSource);
      const lineasTrasLaPrimera = await tx.orderPresentationLine.count();

      // Los guardias del paso 0 leen `presentation_id` antes que el `DROP COLUMN`, asi que la
      // segunda aplicacion se cae ahi, con el mismo 42703 (columna inexistente) que daria el
      // `DROP COLUMN`: lo que importa es que se cae, y antes de escribir. El texto del mensaje
      // depende del idioma del servidor; el SQLSTATE no.
      const message = await expectScriptToFail(tx, () => runScript(tx, upSource), 'segunda aplicacion del UP');
      expect(message).toContain('42703');
      expect(message).toContain('presentation_id');

      // Y el `DROP COLUMN` del archivo, solo, tambien se cae: no hay forma de reaplicarla a medias.
      const dropColumns = statementsOf(upSource).filter((statement) => statement.includes('DROP COLUMN'));
      expect(dropColumns).toHaveLength(2);
      for (const statement of dropColumns) {
        const dropMessage = await expectScriptToFail(
          tx,
          () => tx.$executeRawUnsafe(statement).then(() => undefined),
          `segundo ${statement}`,
        );
        expect(dropMessage).toContain('42703');
      }

      expect(await tx.orderPresentationLine.count()).toBe(lineasTrasLaPrimera);
      expect(await linesOf(tx, pedido)).toHaveLength(1);
    });
  });
});

describe('down.sql', () => {
  it('down: un pedido con mas de una linea aborta la reversion y deja todo como estaba', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);
      nextSequence += 1;
      const repartido = await tx.order.create({
        data: {
          companyId: f.companyId,
          orderYear: new Date().getUTCFullYear(),
          orderSequence: nextSequence,
          recipeId: f.recipeId,
          quantity: new Prisma.Decimal('10'),
          unitId: f.unitA,
          presentationLines: {
            create: [
              { companyId: f.companyId, presentationId: f.withContent, packages: 2, presentationContent: '2.5' },
              { companyId: f.companyId, presentationId: f.withoutContent, packages: 1 },
            ],
          },
        },
        select: { id: true },
      });

      const message = await expectScriptToFail(tx, () => runScript(tx, downSource), 'DOWN con un pedido de dos lineas');
      expect(message).toContain('ROLLBACK ABORTADO');

      expect(await orderColumnExists(tx, 'presentation_id')).toBe(false);
      expect(await linesOf(tx, repartido.id)).toHaveLength(2);
      expect(await forcedRls(tx, 'orders')).toBe(true);
    });
  });

  it('down: con una sola linea por pedido revierte, devuelve la linea a las columnas y la borra', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);
      nextSequence += 1;
      const unaLinea = await tx.order.create({
        data: {
          companyId: f.companyId,
          orderYear: new Date().getUTCFullYear(),
          orderSequence: nextSequence,
          recipeId: f.recipeId,
          quantity: new Prisma.Decimal('10'),
          unitId: f.unitA,
          presentationLines: {
            create: [{ companyId: f.companyId, presentationId: f.withContent, packages: 4, presentationContent: '2.5' }],
          },
        },
        select: { id: true },
      });

      await runScript(tx, downSource);

      const [row] = await tx.$queryRaw<ReadonlyArray<{ presentation_id: string | null; presentation_content: string | null }>>`
        SELECT "presentation_id"::text AS presentation_id, "presentation_content"::text AS presentation_content
          FROM "orders" WHERE "id" = CAST(${unaLinea.id} AS uuid)`;
      expect(row).toEqual({ presentation_id: f.withContent, presentation_content: '2.5000' });
      expect(await tx.orderPresentationLine.count({ where: { orderId: unaLinea.id } })).toBe(0);

      const constraints = await orderConstraintNames(tx);
      for (const name of DROPPED_CONSTRAINTS) expect(constraints).toContain(name);
      expect(await orderIndexNames(tx)).toContain('orders_presentation_id_idx');
      expect(await forcedRls(tx, 'orders')).toBe(true);
      expect(await forcedRls(tx, 'order_presentation_lines')).toBe(true);
    });
  });
});
