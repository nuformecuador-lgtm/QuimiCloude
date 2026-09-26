/**
 * El DOWN de `db/migrations/*_order_packing_states/` contra Postgres REAL, cuando hay pedidos en
 * POR_EMPACAR o EN_EMPAQUE: la rama que aborta con `RAISE EXCEPTION`, que
 * `tests/unit/pedidos/schema/order-packing-states-migration.test.ts` solo comprueba de forma
 * estatica (que el `RAISE` va antes de cualquier DDL), nunca ejecutandola.
 *
 * AISLAMIENTO — mismo patron que `packer-role-migration.int.test.ts`: cada `it` corre dentro de
 * `prisma.$transaction` interactiva y termina lanzando `RollbackSignal`, asi que Prisma emite
 * `ROLLBACK` y ninguna fila escrita por un test sobrevive. La corrida entera va contra la base
 * efimera que el global setup crea para esta corrida de tests, nunca contra `QuimiCloude` ni
 * contra la base propia de la rama.
 *
 * SAVEPOINT — el `DO $$ ... RAISE EXCEPTION` deja la transaccion de Postgres abortada; se
 * envuelve en `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` para poder seguir consultando dentro del mismo
 * `tx` y comprobar que el esquema quedo intacto.
 *
 * EL SQL DEL DOWN SE LEE DEL ARCHIVO, no se copia a mano (patron de
 * `packer-role-migration.int.test.ts`): si alguien reordena el `down.sql` y saca el `RAISE` de su
 * sitio, este archivo lo nota ejecutando el SQL real.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

// ---------------------------------------------------------------------------
// Aislamiento (mismo patron que packer-role-migration.int.test.ts)
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

/**
 * Corre `run` esperando que la base lo rechace, envuelto en `SAVEPOINT`: deja el `tx` utilizable
 * para seguir comprobando que no quedo nada a medias.
 */
async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<{ readonly sqlState: string; readonly message: string }> {
  savepointSeq += 1;
  const savepoint = `qc168_sp_${String(savepointSeq)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return { sqlState: sqlStateOf(error), message: error instanceof Error ? error.message : String(error) };
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`);
}

// ---------------------------------------------------------------------------
// El SQL del DOWN, leido del archivo (no copiado)
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

function locateOrderPackingStatesMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations');
  const carpetas = readdirSync(migrationsDir).filter((name) => /_order_packing_states$/.test(name));
  expect(carpetas, 'debe existir exactamente una migracion de los estados de empaque').toHaveLength(1);
  return join(migrationsDir, carpetas[0] as string);
}

const migrationDir = locateOrderPackingStatesMigrationDir();
const DOWN_SQL_RAW = readFileSync(join(migrationDir, 'down.sql'), 'utf8');

/**
 * Solo la primera sentencia del `down.sql`: el bloque `DO $$ ... END $$` que aborta si hay filas
 * en los estados nuevos. Es la unica que este archivo necesita ejecutar -si aborta, ninguna de
 * las siguientes corre nunca de verdad, y comprobarlo es el propio objetivo del test-. Trocear
 * por `;` no sirve aqui: el bloque `DO $$` contiene sus propios `;` internos, asi que se recorta
 * hasta el primer `END $$;` inclusive, tal como aparece en el archivo.
 */
function extractAbortBlock(sql: string): string {
  const marker = 'END $$;';
  const index = sql.indexOf(marker);
  if (index === -1) throw new Error('down.sql no contiene el bloque DO $$ ... END $$ esperado');
  return sql.slice(0, index + marker.length);
}

const ABORT_BLOCK = extractAbortBlock(DOWN_SQL_RAW);
expect(ABORT_BLOCK, 'el bloque de aborto debe ser el RAISE EXCEPTION de POR_EMPACAR/EN_EMPAQUE').toContain(
  'ROLLBACK ABORTADO',
);

// ---------------------------------------------------------------------------
// Un pedido en un estado nuevo, sembrado DENTRO del tx
// ---------------------------------------------------------------------------

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

interface Fixtures {
  readonly companyId: string;
  readonly recipeId: string;
}

async function seedFixtures(tx: Prisma.TransactionClient): Promise<Fixtures> {
  const marca = token();
  const name = `Empresa qc168 ${marca}`;
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: company.id },
    select: { id: true },
  });
  return { companyId: company.id, recipeId: recipe.id };
}

/** Un usuario de la MISMA empresa: el unico valor que la FK compuesta `packed_by` admite. */
async function seedUser(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const marca = token();
  const documentType = await tx.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await tx.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const user = await tx.user.create({
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
      companyId,
    },
    select: { id: true },
  });
  return user.id;
}

let nextSequence = 800_000;
function freshSequence(): number {
  nextSequence += 1;
  return nextSequence;
}

async function seedOrderInState(
  tx: Prisma.TransactionClient,
  f: Fixtures,
  status: 'POR_EMPACAR' | 'EN_EMPAQUE',
  packedBy?: string,
): Promise<string> {
  const order = await tx.order.create({
    data: {
      companyId: f.companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: freshSequence(),
      recipeId: f.recipeId,
      quantity: new Prisma.Decimal('10'),
      status,
      packedBy,
    },
    select: { id: true },
  });
  return order.id;
}

async function enumValues(tx: Prisma.TransactionClient): Promise<readonly string[]> {
  const rows = await tx.$queryRaw<ReadonlyArray<{ value: string }>>(Prisma.sql`
    SELECT e.enumlabel AS value
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'OrderStatus'
     ORDER BY e.enumsortorder
  `);
  return rows.map((row) => row.value);
}

async function packedByColumnExists(tx: Prisma.TransactionClient): Promise<boolean> {
  const rows = await tx.$queryRaw<ReadonlyArray<{ exists: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'orders' AND column_name = 'packed_by'
    ) AS "exists"
  `);
  return rows[0]?.exists === true;
}

// ---------------------------------------------------------------------------

afterAll(async () => {
  await prisma.$disconnect();
});

describe('down.sql de order_packing_states, con pedidos en los estados nuevos', () => {
  it('R47: un pedido en POR_EMPACAR aborta el DOWN entero y deja el esquema intacto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);
      await seedOrderInState(tx, f, 'POR_EMPACAR');

      const enumAntes = await enumValues(tx);
      expect(enumAntes).toEqual(expect.arrayContaining(['POR_EMPACAR', 'EN_EMPAQUE']));
      expect(await packedByColumnExists(tx)).toBe(true);

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(ABORT_BLOCK),
        'DOWN de order_packing_states con un pedido en POR_EMPACAR',
      );
      expect(rechazo.message).toContain('ROLLBACK ABORTADO');
      expect(rechazo.message).toContain('POR_EMPACAR');

      // El tipo y la columna siguen exactamente como antes del intento: nada de la rama de
      // aborto llega a ejecutar DDL.
      expect(await enumValues(tx)).toEqual(enumAntes);
      expect(await packedByColumnExists(tx)).toBe(true);
    });
  });

  it('R47: un pedido en EN_EMPAQUE aborta el DOWN entero y deja el esquema intacto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);
      const packerId = await seedUser(tx, f.companyId);
      await seedOrderInState(tx, f, 'EN_EMPAQUE', packerId);

      const enumAntes = await enumValues(tx);
      expect(await packedByColumnExists(tx)).toBe(true);

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(ABORT_BLOCK),
        'DOWN de order_packing_states con un pedido en EN_EMPAQUE',
      );
      expect(rechazo.message).toContain('ROLLBACK ABORTADO');

      expect(await enumValues(tx)).toEqual(enumAntes);
      expect(await packedByColumnExists(tx)).toBe(true);
    });
  });
});
