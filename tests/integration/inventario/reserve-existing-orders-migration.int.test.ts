/**
 * La migracion `db/migrations/*_reserve_existing_orders` contra Postgres REAL.
 *
 * AISLAMIENTO -- una unica transaccion interactiva que termina en `RollbackSignal`, mismo patron
 * que `reservations-and-decimal-stock-migration.int.test.ts`: siembra dos empresas, varios
 * pedidos (vivos, cancelados, entregados y borrados) con recetas en porcentaje, aplica el SQL del
 * archivo REAL dentro de esa transaccion y comprueba el resultado; nada sobrevive.
 *
 * La PARIDAD con `planReservation` se comprueba simulando en TypeScript, pedido a pedido y en el
 * mismo orden que recorre la migracion, el mismo reparto que ella hace en SQL: el disponible de
 * cada lote descuenta lo que ya tomo un pedido anterior de la simulacion, igual que la migracion
 * descuenta `tmp_migration_reserved`.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { consumedQuantity } from '@/lib/modules/recetas';
import { planReservation, type ReservationCandidateBatch, type ReservationPlan } from '@/lib/modules/inventario';
import { subtractQuantities } from '@/lib/modules/inventario/domain/decimal-quantity';
import { prisma } from '@/lib/shared/db/prisma';

import type { ProductId } from '@/lib/modules/inventario/domain/product-catalog';
import type { UnitId } from '@/lib/modules/unidades';

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
// El SQL, leido del archivo (no copiado)
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
  const carpetas = readdirSync(migrationsDir).filter((name) => name.endsWith('_reserve_existing_orders'));
  expect(carpetas, 'debe existir exactamente una migracion *_reserve_existing_orders').toHaveLength(1);
  return join(migrationsDir, carpetas[0] as string);
}

const migrationDir = locateMigrationDir();
const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8');

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

async function applyMigration(tx: Prisma.TransactionClient): Promise<void> {
  for (const statement of statementsOf(upSource)) {
    await tx.$executeRawUnsafe(statement);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '');
}

async function systemUnitId(tx: Prisma.TransactionClient): Promise<string> {
  const unit = await tx.unit.findFirstOrThrow({ where: { nameNormalized: 'kilogramo', companyId: null }, select: { id: true } });
  return unit.id;
}

type CompanyFixture = {
  readonly companyId: string;
  readonly actorId: string;
  readonly unitId: string;
  readonly presentationId: string;
};

async function createCompanyFixture(tx: Prisma.TransactionClient): Promise<CompanyFixture> {
  const marker = token();
  const companyName = `Empresa ${marker}`;
  const company = await tx.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  const documentType = await tx.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await tx.role.create({ data: { name: `rol-${marker}`, description: 'Rol de prueba' }, select: { id: true } });
  const user = await tx.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marker}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marker.slice(0, 12),
      username: `ana.${marker}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  const unitId = await systemUnitId(tx);
  const presentation = await tx.presentation.create({
    data: { name: `Bidon ${marker}`, nameNormalized: normalizeForTest(`bidon ${marker}`), unitId, companyId: company.id },
    select: { id: true },
  });
  return { companyId: company.id, actorId: user.id, unitId, presentationId: presentation.id };
}

async function createProduct(
  tx: Prisma.TransactionClient,
  fixture: CompanyFixture,
  options: { readonly withUnit: boolean } = { withUnit: true },
): Promise<string> {
  const marker = token();
  const product = await tx.product.create({
    data: {
      name: `Producto ${marker}`,
      nameNormalized: normalizeForTest(`producto ${marker}`),
      unitId: options.withUnit ? fixture.unitId : null,
      companyId: fixture.companyId,
    },
    select: { id: true },
  });
  return product.id;
}

let lotSequence = 0;

async function createBatch(
  tx: Prisma.TransactionClient,
  fixture: CompanyFixture,
  productId: string,
  data: { readonly stock: string; readonly purchaseDate: string },
): Promise<{ readonly id: string; readonly lot: string; readonly purchaseDate: string }> {
  // `(company_id, lot)` es unico: cada lote de este test se numera aparte, sin que su valor
  // importe para el reparto (cada escenario usa un solo lote por producto).
  lotSequence += 1;
  const lot = String(lotSequence);
  const batch = await tx.productBatch.create({
    data: {
      productId,
      presentationId: fixture.presentationId,
      stock: new Prisma.Decimal(data.stock),
      unitCost: new Prisma.Decimal('1.0000'),
      lot,
      purchaseDate: new Date(`${data.purchaseDate}T00:00:00.000Z`),
      companyId: fixture.companyId,
      createdBy: fixture.actorId,
      updatedBy: fixture.actorId,
    },
    select: { id: true },
  });
  return { id: batch.id, lot, purchaseDate: data.purchaseDate };
}

async function createRecipe(tx: Prisma.TransactionClient, fixture: CompanyFixture): Promise<string> {
  const marker = token();
  const recipe = await tx.recipe.create({
    data: {
      name: `Receta ${marker}`,
      nameNormalized: normalizeForTest(`receta ${marker}`),
      companyId: fixture.companyId,
      createdBy: fixture.actorId,
    },
    select: { id: true },
  });
  return recipe.id;
}

async function addRecipeLine(
  tx: Prisma.TransactionClient,
  recipeId: string,
  productId: string,
  percentage: string,
): Promise<void> {
  await tx.recipeLine.create({ data: { recipeId, productId, percentage: new Prisma.Decimal(percentage) } });
}

let orderSequence = 0;

async function createOrder(
  tx: Prisma.TransactionClient,
  fixture: CompanyFixture,
  recipeId: string,
  quantity: string,
  options: {
    readonly status?: 'PENDIENTE' | 'EN_CURSO' | 'ENTREGADO' | 'CANCELADO';
    readonly createdAt?: Date;
    readonly deletedAt?: Date;
  } = {},
): Promise<string> {
  orderSequence += 1;
  const order = await tx.order.create({
    data: {
      orderYear: 2026,
      orderSequence,
      recipeId,
      quantity: new Prisma.Decimal(quantity),
      status: options.status ?? 'PENDIENTE',
      cancellationReason: options.status === 'CANCELADO' ? 'pedido de prueba' : null,
      companyId: fixture.companyId,
      createdBy: fixture.actorId,
      updatedBy: fixture.actorId,
      createdAt: options.createdAt,
      deletedAt: options.deletedAt,
    },
    select: { id: true },
  });
  return order.id;
}

async function reservedAtOf(tx: Prisma.TransactionClient, orderId: string): Promise<Date | null> {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { reservedAt: true } });
  return order.reservedAt;
}

type ReservationRow = { readonly batchId: string; readonly quantity: string; readonly createdBy: string | null };

async function reservationsOf(tx: Prisma.TransactionClient, orderId: string): Promise<readonly ReservationRow[]> {
  const rows = await tx.reservationMovement.findMany({
    where: { orderId, kind: 'reserve' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { batchId: true, quantity: true, createdBy: true },
  });
  return rows.map((row) => ({ batchId: row.batchId, quantity: row.quantity.toFixed(4), createdBy: row.createdBy }));
}

/** Simula, en TypeScript y en el mismo orden que la migracion, lo que `planReservation` reparte
 *  pedido a pedido: el disponible de cada lote descuenta lo que ya tomo un pedido anterior de
 *  ESTA MISMA simulacion, igual que `tmp_migration_reserved` en la migracion. */
function candidatesOf(
  batches: readonly { readonly id: string; readonly productId: string; readonly lot: string; readonly purchaseDate: string; readonly stock: string }[],
  taken: ReadonlyMap<string, string>,
): readonly ReservationCandidateBatch[] {
  return batches.map((batch) => ({
    id: batch.id,
    productId: batch.productId as ProductId,
    lot: batch.lot,
    purchaseDate: batch.purchaseDate,
    available: subtractQuantities(batch.stock, taken.get(batch.id) ?? '0'),
  }));
}

function applyPlan(plan: ReservationPlan, taken: Map<string, string>): void {
  if (plan.kind !== 'reserved') return;
  for (const allocation of plan.allocations) {
    const previous = taken.get(allocation.batchId) ?? '0';
    taken.set(allocation.batchId, (Number(previous) + Number(allocation.quantity)).toFixed(4));
  }
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migracion reserve_existing_orders contra Postgres real', () => {
  it('R43, R44, R49: aparta los pedidos vivos que alcanzan, respeta el orden, solo vivos y no aparta con receta vacia; paridad con planReservation', async () => {
    // Cota inferior de `reserved_at`: capturada ANTES de abrir la transaccion, porque `now()`
    // dentro de Postgres es el instante en que la transaccion empezo, no el de cada sentencia.
    const testStart = new Date();
    await inRolledBackTransaction(async (tx) => {
      const companyA = await createCompanyFixture(tx);
      const companyB = await createCompanyFixture(tx);

      // --- Escenario 1: un pedido solo, cubre de sobra. ---
      const productSolo = await createProduct(tx, companyA);
      const batchSolo = await createBatch(tx, companyA, productSolo, { stock: '20', purchaseDate: '2026-09-01' });
      const recipeSolo = await createRecipe(tx, companyA);
      await addRecipeLine(tx, recipeSolo, productSolo, '100.00');
      const orderSolo = await createOrder(tx, companyA, recipeSolo, '10', { createdAt: new Date('2026-01-01T00:00:00.000Z') });

      // --- Escenario 2: dos pedidos compiten por el mismo lote; solo el mas antiguo cubre. ---
      const productCompite = await createProduct(tx, companyA);
      const batchCompite = await createBatch(tx, companyA, productCompite, { stock: '15', purchaseDate: '2026-09-01' });
      const recipeCompite = await createRecipe(tx, companyA);
      await addRecipeLine(tx, recipeCompite, productCompite, '100.00');
      const orderCompiteViejo = await createOrder(tx, companyA, recipeCompite, '10', {
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const orderCompiteNuevo = await createOrder(tx, companyA, recipeCompite, '10', {
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      // --- Escenario 3 (E2): receta sin lineas no aparta y no da error. ---
      const recipeVacia = await createRecipe(tx, companyA);
      const orderVacio = await createOrder(tx, companyA, recipeVacia, '5', { createdAt: new Date('2026-01-01T00:00:00.000Z') });

      // --- Escenario 4 (E1): producto sin unidad no cubre. ---
      const productSinUnidad = await createProduct(tx, companyA, { withUnit: false });
      const recipeSinUnidad = await createRecipe(tx, companyA);
      await addRecipeLine(tx, recipeSinUnidad, productSinUnidad, '100.00');
      const orderSinUnidad = await createOrder(tx, companyA, recipeSinUnidad, '5', { createdAt: new Date('2026-01-01T00:00:00.000Z') });

      // --- Escenario 5: solo vivos (PENDIENTE/EN_CURSO sin borrar). ---
      const productEstados = await createProduct(tx, companyA);
      await createBatch(tx, companyA, productEstados, { stock: '100', purchaseDate: '2026-09-01' });
      const recipeEstados = await createRecipe(tx, companyA);
      await addRecipeLine(tx, recipeEstados, productEstados, '100.00');
      const orderCancelado = await createOrder(tx, companyA, recipeEstados, '5', { status: 'CANCELADO' });
      const orderEntregado = await createOrder(tx, companyA, recipeEstados, '5', { status: 'ENTREGADO' });
      const orderBorrado = await createOrder(tx, companyA, recipeEstados, '5', { deletedAt: new Date() });
      const orderEnCurso = await createOrder(tx, companyA, recipeEstados, '5', { status: 'EN_CURSO' });

      // --- Escenario 6: techo a 4 decimales (R11, N1). ---
      const productTecho = await createProduct(tx, companyA);
      const batchTecho = await createBatch(tx, companyA, productTecho, { stock: '1', purchaseDate: '2026-09-01' });
      const recipeTecho = await createRecipe(tx, companyA);
      await addRecipeLine(tx, recipeTecho, productTecho, '0.01');
      const orderTecho = await createOrder(tx, companyA, recipeTecho, '0.0001', { createdAt: new Date('2026-01-01T00:00:00.000Z') });

      // --- Escenario 7: aislamiento por empresa (misma forma, otra empresa). ---
      const productB = await createProduct(tx, companyB);
      const batchB = await createBatch(tx, companyB, productB, { stock: '8', purchaseDate: '2026-09-01' });
      const recipeB = await createRecipe(tx, companyB);
      await addRecipeLine(tx, recipeB, productB, '100.00');
      const orderB = await createOrder(tx, companyB, recipeB, '8', { createdAt: new Date('2026-01-01T00:00:00.000Z') });

      await applyMigration(tx);
      const after = new Date();

      // Escenario 1
      expect(await reservationsOf(tx, orderSolo)).toEqual([{ batchId: batchSolo.id, quantity: '10.0000', createdBy: null }]);
      const reservedAtSolo = await reservedAtOf(tx, orderSolo);
      expect(reservedAtSolo).not.toBeNull();
      expect((reservedAtSolo as Date).getTime()).toBeGreaterThanOrEqual(testStart.getTime());
      expect((reservedAtSolo as Date).getTime()).toBeLessThanOrEqual(after.getTime());

      // Escenario 2: el mas viejo aparta todo, el mas nuevo no aparta nada.
      expect(await reservationsOf(tx, orderCompiteViejo)).toEqual([
        { batchId: batchCompite.id, quantity: '10.0000', createdBy: null },
      ]);
      expect(await reservationsOf(tx, orderCompiteNuevo)).toEqual([]);
      expect(await reservedAtOf(tx, orderCompiteNuevo)).toBeNull();

      // Escenario 3 (E2, R49)
      expect(await reservationsOf(tx, orderVacio)).toEqual([]);
      expect(await reservedAtOf(tx, orderVacio)).toBeNull();

      // Escenario 4 (E1)
      expect(await reservationsOf(tx, orderSinUnidad)).toEqual([]);
      expect(await reservedAtOf(tx, orderSinUnidad)).toBeNull();

      // Escenario 5: solo los vivos apartan.
      expect(await reservationsOf(tx, orderCancelado)).toEqual([]);
      expect(await reservationsOf(tx, orderEntregado)).toEqual([]);
      expect(await reservationsOf(tx, orderBorrado)).toEqual([]);
      const reservacionesEnCurso = await reservationsOf(tx, orderEnCurso);
      expect(reservacionesEnCurso).toHaveLength(1);
      expect(reservacionesEnCurso[0]?.quantity).toBe('5.0000');

      // Escenario 6: techo al cuarto decimal (0.0001 x 0.01% aparta 0.0001).
      expect(await reservationsOf(tx, orderTecho)).toEqual([{ batchId: batchTecho.id, quantity: '0.0001', createdBy: null }]);

      // Escenario 7: aislamiento por empresa.
      const reservacionesB = await reservationsOf(tx, orderB);
      expect(reservacionesB).toEqual([{ batchId: batchB.id, quantity: '8.0000', createdBy: null }]);

      // --- Paridad con planReservation, pedido a pedido y en el mismo orden que la migracion. ---
      const taken = new Map<string, string>();

      const planSolo = planReservation({
        requirement: [{ productId: productSolo as ProductId, quantity: consumedQuantity('10', '100.00') }],
        products: new Map([[productSolo as ProductId, companyA.unitId as UnitId]]),
        batches: candidatesOf([{ ...batchSolo, productId: productSolo, stock: '20' }], taken),
      });
      applyPlan(planSolo, taken);
      expect(planSolo).toEqual({ kind: 'reserved', allocations: [{ batchId: batchSolo.id, quantity: '10.0000' }] });

      const planViejo = planReservation({
        requirement: [{ productId: productCompite as ProductId, quantity: consumedQuantity('10', '100.00') }],
        products: new Map([[productCompite as ProductId, companyA.unitId as UnitId]]),
        batches: candidatesOf([{ ...batchCompite, productId: productCompite, stock: '15' }], taken),
      });
      applyPlan(planViejo, taken);
      expect(planViejo).toEqual({ kind: 'reserved', allocations: [{ batchId: batchCompite.id, quantity: '10.0000' }] });

      const planNuevo = planReservation({
        requirement: [{ productId: productCompite as ProductId, quantity: consumedQuantity('10', '100.00') }],
        products: new Map([[productCompite as ProductId, companyA.unitId as UnitId]]),
        batches: candidatesOf([{ ...batchCompite, productId: productCompite, stock: '15' }], taken),
      });
      expect(planNuevo).toEqual({ kind: 'insufficient', productIds: [productCompite] });

      const planSinUnidad = planReservation({
        requirement: [{ productId: productSinUnidad as ProductId, quantity: consumedQuantity('5', '100.00') }],
        products: new Map([[productSinUnidad as ProductId, null]]),
        batches: [],
      });
      expect(planSinUnidad).toEqual({ kind: 'insufficient', productIds: [productSinUnidad] });

      const planTecho = planReservation({
        requirement: [{ productId: productTecho as ProductId, quantity: consumedQuantity('0.0001', '0.01') }],
        products: new Map([[productTecho as ProductId, companyA.unitId as UnitId]]),
        batches: candidatesOf([{ ...batchTecho, productId: productTecho, stock: '1' }], new Map()),
      });
      expect(planTecho).toEqual({ kind: 'reserved', allocations: [{ batchId: batchTecho.id, quantity: '0.0001' }] });
    });
  });
});
