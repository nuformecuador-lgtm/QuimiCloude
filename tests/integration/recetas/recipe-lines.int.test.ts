/**
 * Tests de integracion de QC-25 (crud-de-recetas), Grupo D (T14), sobre las LINEAS de
 * receta, contra una base Postgres REAL.
 *
 * Cubre R14 (CHECK de cantidad positiva), R16 (unico `(recipe_id, product_id)`) y R18
 * (la linea de un producto borrado logicamente se conserva y el detalle la trae).
 *
 * R14 y R16 se verifican en DOS NIVELES:
 *   1) contra la base cruda, con `SAVEPOINT` + `ROLLBACK TO SAVEPOINT` dentro de una
 *      transaccion que termina siempre en `ROLLBACK` (mismo patron que
 *      `recetas-constraints.int.test.ts`), afirmando sobre el SQLSTATE;
 *   2) a traves del ADAPTADOR real (`createRecipe` de `recipe-prisma.ts`), confirmando que
 *      la traduccion de SQLSTATE -> error del dominio (`translateWriteError`) funciona de
 *      verdad contra Postgres, no solo en un doble.
 *
 * R18 ejercita el adaptador (`findAliveRecipeById`) despues de un borrado logico REAL de
 * `products`, con datos propios creados y borrados por este archivo.
 *
 * SQLSTATE, nunca el texto del mensaje (Postgres en esta maquina responde en espanol).
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRecipe, findAliveRecipeById } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma';
import { ValidationError } from '@/lib/modules/recetas/domain/errors';
import { prisma } from '@/lib/shared/db/prisma';

import type { NewRecipe } from '@/lib/modules/recetas/ports/recipe-repository';

// ---------------------------------------------------------------------------
// Utilidades de aislamiento (estrategia 1: tx + ROLLBACK + SAVEPOINT).
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

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

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

type Db = Prisma.TransactionClient;

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

async function createTestProduct(db: Db, name = `Producto ${token()}`): Promise<string> {
  const marker = token();
  const presentation = await db.presentation.create({
    data: { name: `Presentacion ${marker}`, nameNormalized: `presentacion${marker}` },
    select: { id: true },
  });
  const product = await db.product.create({
    data: { name, presentationId: presentation.id, minPurchase: 0 },
    select: { id: true },
  });
  return product.id;
}

async function deleteTestProduct(db: Db, productId: string): Promise<void> {
  const product = await db.product.findUniqueOrThrow({
    where: { id: productId },
    select: { presentationId: true },
  });
  await db.product.delete({ where: { id: productId } });
  await db.presentation.delete({ where: { id: product.presentationId } });
}

async function createTestRecipe(db: Db, name = `Receta ${token()}`): Promise<string> {
  const recipe = await db.recipe.create({
    data: { name, nameNormalized: name.toLowerCase().replace(/\s+/gu, '') },
    select: { id: true },
  });
  return recipe.id;
}

function baseRecipeInput(overrides: Partial<NewRecipe> = {}): NewRecipe {
  return {
    name: `Receta ${token()}`,
    description: null,
    steps: [],
    lines: [],
    imagePath: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

/** Unidad real, sembrada por la migracion `..._units_catalog` (QC-32, R25): `RecipeLine.unitId`
 *  es una FK real a `units`, asi que las lineas de estos tests necesitan un id existente. */
let sharedUnitId: string;

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('recipes', 'recipe_lines')`;
  if (tables.length !== 2) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-24 (recipes y recipe_lines). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    );
  }

  sharedUnitId = (await prisma.unit.findFirstOrThrow()).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe('R14: el CHECK de cantidad positiva', () => {
  it('rechaza con SQLSTATE 23514 la cantidad no positiva, en crudo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const recipeId = await createTestRecipe(tx);
      const productId = await createTestProduct(tx);

      const cero = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`INSERT INTO "recipe_lines" ("recipe_id", "product_id", "quantity", "unit_id", "updated_at")
            VALUES (CAST(${recipeId} AS uuid), CAST(${productId} AS uuid), 0.0000, CAST(${sharedUnitId} AS uuid), CURRENT_TIMESTAMP)`,
        'linea con cantidad cero',
      );
      expect(cero).toBe(CHECK_VIOLATION);

      const negativa = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`INSERT INTO "recipe_lines" ("recipe_id", "product_id", "quantity", "unit_id", "updated_at")
            VALUES (CAST(${recipeId} AS uuid), CAST(${productId} AS uuid), -1.5000, CAST(${sharedUnitId} AS uuid), CURRENT_TIMESTAMP)`,
        'linea con cantidad negativa',
      );
      expect(negativa).toBe(CHECK_VIOLATION);

      const survivors = await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } });
      expect(survivors).toEqual([]);
    });
  });

  it('el adaptador traduce el CHECK a ValidationError contra Postgres real', async () => {
    // IMPORTANTE: este caso ejercita `createRecipe` de `recipe-prisma.ts` de verdad, no un
    // doble. Verifica empiricamente que `translateWriteError`/`isQuantityCheckViolation`
    // reconocen el SQLSTATE 23514 que Postgres devuelve de verdad en esta maquina.
    const productId = await createTestProduct(prisma);
    let recipeId: string | null = null;

    try {
      const input = baseRecipeInput({
        lines: [{ productId, quantity: '0.0000', unitId: sharedUnitId }],
      });

      await expect(createRecipe(input, null as unknown as string, new Date())).rejects.toBeInstanceOf(
        ValidationError,
      );

      // Y no quedo ninguna receta a medio crear: `create` con lineas anidadas es una sola
      // sentencia -si la linea falla, la receta tampoco se creo-.
      const orphan = await prisma.recipe.findFirst({ where: { name: input.name } });
      expect(orphan).toBeNull();
      recipeId = null;
    } finally {
      await deleteTestProduct(prisma, productId);
      if (recipeId !== null) await prisma.recipe.delete({ where: { id: recipeId } });
    }
  });
});

describe('R16: unicidad de (recipe_id, product_id)', () => {
  it('rechaza con SQLSTATE 23505 la segunda linea del mismo producto en la misma receta', async () => {
    await inRolledBackTransaction(async (tx) => {
      const recipeId = await createTestRecipe(tx);
      const productId = await createTestProduct(tx);

      const first = await tx.recipeLine.create({
        data: { recipeId, productId, quantity: new Prisma.Decimal('1.0000'), unitId: sharedUnitId },
        select: { id: true },
      });

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`INSERT INTO "recipe_lines" ("recipe_id", "product_id", "quantity", "unit_id", "updated_at")
            VALUES (CAST(${recipeId} AS uuid), CAST(${productId} AS uuid), 3.0000, CAST(${sharedUnitId} AS uuid), CURRENT_TIMESTAMP)`,
        'segunda linea del mismo producto en la misma receta',
      );
      expect(sqlState).toBe(UNIQUE_VIOLATION);

      const lines = await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true, unitId: true } });
      expect(lines).toEqual([{ id: first.id, unitId: sharedUnitId }]);
    });
  });
});

describe('R18: la linea de un producto borrado logicamente se conserva', () => {
  it('el producto borrado logicamente conserva su linea y el detalle la sigue trayendo', async () => {
    const productId = await createTestProduct(prisma, 'Insumo que se descataloga');
    let recipeId: string | null = null;

    try {
      const input = baseRecipeInput({
        lines: [{ productId, quantity: '3.0000', unitId: sharedUnitId }],
      });
      const created = await createRecipe(input, null as unknown as string, new Date());
      expect(created).not.toBe('duplicate');
      recipeId = (created as { id: string }).id;

      // Borrado LOGICO del producto (QC-20 D5): un UPDATE, no un DELETE.
      await prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date() } });

      const detail = await findAliveRecipeById(recipeId);
      expect(detail).not.toBeNull();
      expect(detail?.lines).toHaveLength(1);
      expect(detail?.lines[0]?.productId).toBe(productId);
      expect(detail?.lines[0]?.quantity).toBe('3.0000');
      expect(detail?.lines[0]?.unitId).toBe(sharedUnitId);

      // Y el producto sigue existiendo (borrado logico, no fisico): es justo lo que hace
      // que la linea no apunte al vacio.
      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(product.deletedAt).toBeInstanceOf(Date);
    } finally {
      if (recipeId !== null) await prisma.recipe.delete({ where: { id: recipeId } });
      await deleteTestProduct(prisma, productId);
    }
  });
});
