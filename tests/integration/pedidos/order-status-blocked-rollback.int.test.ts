/**
 * El DOWN de `db/migrations/*_order_status_blocked/` contra Postgres REAL, cuando hay pedidos en
 * BLOQUEADO: la rama que aborta con `RAISE EXCEPTION`, que
 * `tests/unit/pedidos/schema/pedidos-migration.test.ts` solo comprueba de forma estatica (que el
 * `RAISE` va antes de cualquier DDL), nunca ejecutandola.
 *
 * AISLAMIENTO — mismo patron que `order-packing-states-rollback.int.test.ts`: cada `it` corre
 * dentro de `prisma.$transaction` interactiva y termina lanzando `RollbackSignal`, asi que Prisma
 * emite `ROLLBACK` y ninguna fila escrita por un test sobrevive. La corrida entera va contra la
 * base efimera que el global setup crea para esta corrida de tests, nunca contra `QuimiCloude` ni
 * contra la base propia de la rama.
 *
 * SAVEPOINT — el `DO $$ ... RAISE EXCEPTION` deja la transaccion de Postgres abortada; se
 * envuelve en `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` para poder seguir consultando dentro del mismo
 * `tx` y comprobar que el esquema quedo intacto.
 *
 * EL SQL DEL DOWN SE LEE DEL ARCHIVO, no se copia a mano (mismo patron): si alguien reordena el
 * `down.sql` y saca el `RAISE` de su sitio, este archivo lo nota ejecutando el SQL real.
 *
 * ORDEN DE REVERSION — el indice parcial de `orders_blocked_index` se creo DESPUES de
 * `order_status_blocked` y compara contra el valor `BLOQUEADO` del enum, asi que revertir en el
 * caso exitoso sigue el mismo orden que una reversion real: primero el DOWN de
 * `orders_blocked_index`, despues el de `order_status_blocked`.
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
// Aislamiento (mismo patron que order-packing-states-rollback.int.test.ts)
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
  const savepoint = `qc138_sp_${String(savepointSeq)}`;
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
// El SQL, leido de los archivos (no copiado)
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

function locateMigrationDir(suffix: string, what: string): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations');
  const carpetas = readdirSync(migrationsDir).filter((name) => name.endsWith(suffix));
  expect(carpetas, `debe existir exactamente una migracion de ${what}`).toHaveLength(1);
  return join(migrationsDir, carpetas[0] as string);
}

const orderStatusBlockedDir = locateMigrationDir('_order_status_blocked', 'BLOQUEADO');
const ordersBlockedIndexDir = locateMigrationDir('_orders_blocked_index', 'el indice de bloqueados');

const ORDER_STATUS_BLOCKED_DOWN_SQL = readFileSync(join(orderStatusBlockedDir, 'down.sql'), 'utf8');
const ORDERS_BLOCKED_INDEX_DOWN_SQL = readFileSync(join(ordersBlockedIndexDir, 'down.sql'), 'utf8');

/**
 * Solo la primera sentencia del `down.sql`: el bloque `DO $$ ... END $$` que aborta si hay filas
 * BLOQUEADO. Es la unica que el caso de aborto necesita ejecutar -si aborta, ninguna de las
 * siguientes corre nunca de verdad, y comprobarlo es el propio objetivo del test-. Trocear por
 * `;` no sirve aqui: el bloque `DO $$` contiene sus propios `;` internos, asi que se recorta
 * hasta el primer `END $$;` inclusive, tal como aparece en el archivo.
 */
function extractAbortBlock(sql: string): string {
  const marker = 'END $$;';
  const index = sql.indexOf(marker);
  if (index === -1) throw new Error('down.sql no contiene el bloque DO $$ ... END $$ esperado');
  return sql.slice(0, index + marker.length);
}

const ABORT_BLOCK = extractAbortBlock(ORDER_STATUS_BLOCKED_DOWN_SQL);
expect(ABORT_BLOCK, 'el bloque de aborto debe ser el RAISE EXCEPTION de BLOQUEADO').toContain('ROLLBACK ABORTADO');

/** Trocea en sentencias ejecutables, en el mismo orden del archivo, quitando comentarios. */
function plainStatementsOf(sql: string): readonly string[] {
  return sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** El resto del archivo, DESPUES del bloque de aborto: ninguna de esas sentencias tiene `;`
 *  internos, asi que el troceado simple por `;` es correcto ahi. */
const REST_OF_ORDER_STATUS_BLOCKED_DOWN = plainStatementsOf(
  ORDER_STATUS_BLOCKED_DOWN_SQL.slice(ORDER_STATUS_BLOCKED_DOWN_SQL.indexOf(ABORT_BLOCK) + ABORT_BLOCK.length),
);
const ORDER_STATUS_BLOCKED_DOWN_STATEMENTS: readonly string[] = [
  ABORT_BLOCK,
  ...REST_OF_ORDER_STATUS_BLOCKED_DOWN,
];
const ORDERS_BLOCKED_INDEX_DOWN_STATEMENTS = plainStatementsOf(ORDERS_BLOCKED_INDEX_DOWN_SQL);

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
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
  const name = `Empresa qc138 ${marca}`;
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

let nextSequence = 900_000;
function freshSequence(): number {
  nextSequence += 1;
  return nextSequence;
}

async function seedBlockedOrder(tx: Prisma.TransactionClient, f: Fixtures): Promise<string> {
  const order = await tx.order.create({
    data: {
      companyId: f.companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: freshSequence(),
      recipeId: f.recipeId,
      quantity: new Prisma.Decimal('10'),
      status: 'BLOQUEADO',
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

async function indexExists(tx: Prisma.TransactionClient, indexName: string): Promise<boolean> {
  const rows = await tx.$queryRaw<ReadonlyArray<{ exists: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes WHERE tablename = 'orders' AND indexname = ${indexName}
    ) AS "exists"
  `);
  return rows[0]?.exists === true;
}

// ---------------------------------------------------------------------------

afterAll(async () => {
  await prisma.$disconnect();
});

describe('down.sql de order_status_blocked, con y sin pedidos BLOQUEADO', () => {
  it('R36: un pedido en BLOQUEADO aborta el DOWN entero y deja el esquema intacto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const f = await seedFixtures(tx);
      await seedBlockedOrder(tx, f);

      const enumAntes = await enumValues(tx);
      expect(enumAntes).toEqual(expect.arrayContaining(['BLOQUEADO']));
      expect(await indexExists(tx, 'orders_blocked_company_created_idx')).toBe(true);

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(ABORT_BLOCK),
        'DOWN de order_status_blocked con un pedido en BLOQUEADO',
      );
      expect(rechazo.message).toContain('ROLLBACK ABORTADO');
      expect(rechazo.message).toContain('BLOQUEADO');

      // El tipo y el indice siguen exactamente como antes del intento: nada de la rama de
      // aborto llega a ejecutar DDL.
      expect(await enumValues(tx)).toEqual(enumAntes);
      expect(await indexExists(tx, 'orders_blocked_company_created_idx')).toBe(true);
    });
  });

  it('R36: sin ningun pedido BLOQUEADO el DOWN revierte entero y el enum queda con los seis valores', async () => {
    await inRolledBackTransaction(async (tx) => {
      expect(await tx.order.count({ where: { status: 'BLOQUEADO' } })).toBe(0);
      expect(await indexExists(tx, 'orders_blocked_company_created_idx')).toBe(true);

      // Orden de una reversion real: primero el DOWN de la migracion posterior
      // (orders_blocked_index), despues el de order_status_blocked.
      await applyStatements(tx, ORDERS_BLOCKED_INDEX_DOWN_STATEMENTS);
      expect(await indexExists(tx, 'orders_blocked_company_created_idx')).toBe(false);

      await applyStatements(tx, ORDER_STATUS_BLOCKED_DOWN_STATEMENTS);

      expect(await enumValues(tx)).toEqual([
        'PENDIENTE',
        'EN_CURSO',
        'ENTREGADO',
        'CANCELADO',
        'POR_EMPACAR',
        'EN_EMPAQUE',
      ]);
    });
  });
});
