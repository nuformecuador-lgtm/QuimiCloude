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

async function applyMigration(tx: Prisma.TransactionClient): Promise<void> {
  for (const statement of statementsOf(upSource)) {
    await tx.$executeRawUnsafe(statement);
  }
}

async function applyDownMigration(tx: Prisma.TransactionClient): Promise<void> {
  for (const statement of statementsOf(downSource)) {
    await tx.$executeRawUnsafe(statement);
  }
}

/** Aplica el `down.sql` dentro de un SAVEPOINT y espera que falle: como el `RAISE EXCEPTION`
 *  aborta la transaccion Postgres en curso, sin el SAVEPOINT ninguna sentencia posterior -ni
 *  siquiera un SELECT de comprobacion- podria correr dentro del mismo test. */
async function expectDownMigrationToFail(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRawUnsafe('SAVEPOINT before_down');
  try {
    await applyDownMigration(tx);
  } catch {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT before_down');
    return;
  }
  throw new Error('el down.sql debia fallar y no fallo');
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

/** Como `createBatch`, pero con un numero de lote explicito -- para probar el desempate de
 *  `lot_precedes` entre lotes de una misma fecha de compra. */
async function createBatchWithLot(
  tx: Prisma.TransactionClient,
  fixture: CompanyFixture,
  productId: string,
  data: { readonly stock: string; readonly purchaseDate: string; readonly lot: string },
): Promise<{ readonly id: string; readonly lot: string; readonly purchaseDate: string }> {
  const batch = await tx.productBatch.create({
    data: {
      productId,
      presentationId: fixture.presentationId,
      stock: new Prisma.Decimal(data.stock),
      unitCost: new Prisma.Decimal('1.0000'),
      lot: data.lot,
      purchaseDate: new Date(`${data.purchaseDate}T00:00:00.000Z`),
      companyId: fixture.companyId,
      createdBy: fixture.actorId,
      updatedBy: fixture.actorId,
    },
    select: { id: true },
  });
  return { id: batch.id, lot: data.lot, purchaseDate: data.purchaseDate };
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

      // --- Escenario 3: receta sin lineas no aparta y no da error. ---
      const recipeVacia = await createRecipe(tx, companyA);
      const orderVacio = await createOrder(tx, companyA, recipeVacia, '5', { createdAt: new Date('2026-01-01T00:00:00.000Z') });

      // --- Escenario 4: producto sin unidad no cubre. ---
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

      // --- Escenario 6: techo a 4 decimales. ---
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

      // Escenario 3
      expect(await reservationsOf(tx, orderVacio)).toEqual([]);
      expect(await reservedAtOf(tx, orderVacio)).toBeNull();

      // Escenario 4
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

  it('R56: dentro de una misma fecha de compra, la migracion desempata los lotes en el mismo orden que compareBatchesOldestFirst', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Una empresa por escenario: `(company_id, lot)` es unico y '-X' y 'B' se repiten entre
      // escenarios.

      // --- '-X' contra '5': ninguno de los dos es solo digitos, se compara como texto por
      // unidad de codigo ('-' es U+002D, '5' es U+0035), asi que '-X' precede a '5'. Sin este
      // desempate, la collation de la base pondria primero el lote numerico ('5').
      const companyDashVsDigit = await createCompanyFixture(tx);
      const productDashVsDigit = await createProduct(tx, companyDashVsDigit);
      const batchDash = await createBatchWithLot(tx, companyDashVsDigit, productDashVsDigit, { stock: '6', purchaseDate: '2026-09-01', lot: '-X' });
      const batchDigit = await createBatchWithLot(tx, companyDashVsDigit, productDashVsDigit, { stock: '10', purchaseDate: '2026-09-01', lot: '5' });
      const recipeDashVsDigit = await createRecipe(tx, companyDashVsDigit);
      await addRecipeLine(tx, recipeDashVsDigit, productDashVsDigit, '100.00');
      const orderDashVsDigit = await createOrder(tx, companyDashVsDigit, recipeDashVsDigit, '8', { createdAt: new Date('2026-01-01T00:00:00.000Z') });

      // --- 'a' contra 'B': texto por unidad de codigo ('B' es U+0042, 'a' es U+0061), asi que
      // 'B' precede a 'a'. Una collation case-insensitive de la base los pondria en otro orden.
      const companyCase = await createCompanyFixture(tx);
      const productCase = await createProduct(tx, companyCase);
      const batchLowerA = await createBatchWithLot(tx, companyCase, productCase, { stock: '10', purchaseDate: '2026-09-01', lot: 'a' });
      const batchUpperB = await createBatchWithLot(tx, companyCase, productCase, { stock: '6', purchaseDate: '2026-09-01', lot: 'B' });
      const recipeCase = await createRecipe(tx, companyCase);
      await addRecipeLine(tx, recipeCase, productCase, '100.00');
      const orderCase = await createOrder(tx, companyCase, recipeCase, '8', { createdAt: new Date('2026-01-02T00:00:00.000Z') });

      // --- Mezcla de cuatro lotes de la misma fecha, sin ciclo: '-X' < '2' < '10' < 'B'. '2' y
      // '10' se comparan por numero (ambos son solo digitos); el resto, como texto. El disponible
      // de cada lote se fija para que el reparto cruce el limite de los tres primeros y deje 'B'
      // intacto, y asi el test distingue un orden correcto de uno solo parcialmente correcto.
      const companyMix = await createCompanyFixture(tx);
      const productMix = await createProduct(tx, companyMix);
      const batchTwo = await createBatchWithLot(tx, companyMix, productMix, { stock: '1', purchaseDate: '2026-09-01', lot: '2' });
      const batchTen = await createBatchWithLot(tx, companyMix, productMix, { stock: '5', purchaseDate: '2026-09-01', lot: '10' });
      const batchDashMix = await createBatchWithLot(tx, companyMix, productMix, { stock: '1', purchaseDate: '2026-09-01', lot: '-X' });
      const batchB = await createBatchWithLot(tx, companyMix, productMix, { stock: '5', purchaseDate: '2026-09-01', lot: 'B' });
      const recipeMix = await createRecipe(tx, companyMix);
      await addRecipeLine(tx, recipeMix, productMix, '100.00');
      const orderMix = await createOrder(tx, companyMix, recipeMix, '2.5', { createdAt: new Date('2026-01-03T00:00:00.000Z') });

      await applyMigration(tx);

      // `reservationsOf` desempata por `id` cuando dos filas comparten `created_at` (el mismo
      // `now()` de la migracion): se compara por `batchId`, no por el orden de llegada.
      const byBatchId = (rows: readonly ReservationRow[]): readonly ReservationRow[] =>
        [...rows].sort((a, b) => (a.batchId < b.batchId ? -1 : a.batchId > b.batchId ? 1 : 0));

      expect(byBatchId(await reservationsOf(tx, orderDashVsDigit))).toEqual(
        byBatchId([
          { batchId: batchDash.id, quantity: '6.0000', createdBy: null },
          { batchId: batchDigit.id, quantity: '2.0000', createdBy: null },
        ]),
      );

      expect(byBatchId(await reservationsOf(tx, orderCase))).toEqual(
        byBatchId([
          { batchId: batchUpperB.id, quantity: '6.0000', createdBy: null },
          { batchId: batchLowerA.id, quantity: '2.0000', createdBy: null },
        ]),
      );

      // '2' (1) + '10' (1 de 5) cubre 2, y sobran 0.5 de '10'; 'B' no se toca.
      expect(byBatchId(await reservationsOf(tx, orderMix))).toEqual(
        byBatchId([
          { batchId: batchDashMix.id, quantity: '1.0000', createdBy: null },
          { batchId: batchTwo.id, quantity: '1.0000', createdBy: null },
          { batchId: batchTen.id, quantity: '0.5000', createdBy: null },
        ]),
      );

      // Paridad con `planReservation` (que ordena con el mismo `compareBatchesOldestFirst`
      // que replica `lot_precedes`): mismo resultado que la migracion en SQL, en los tres casos.
      const planDashVsDigit = planReservation({
        requirement: [{ productId: productDashVsDigit as ProductId, quantity: consumedQuantity('8', '100.00') }],
        products: new Map([[productDashVsDigit as ProductId, companyDashVsDigit.unitId as UnitId]]),
        batches: candidatesOf(
          [
            { ...batchDash, productId: productDashVsDigit, stock: '6' },
            { ...batchDigit, productId: productDashVsDigit, stock: '10' },
          ],
          new Map(),
        ),
      });
      expect(planDashVsDigit).toEqual({
        kind: 'reserved',
        allocations: [
          { batchId: batchDash.id, quantity: '6.0000' },
          { batchId: batchDigit.id, quantity: '2.0000' },
        ],
      });

      const planCase = planReservation({
        requirement: [{ productId: productCase as ProductId, quantity: consumedQuantity('8', '100.00') }],
        products: new Map([[productCase as ProductId, companyCase.unitId as UnitId]]),
        batches: candidatesOf(
          [
            { ...batchLowerA, productId: productCase, stock: '10' },
            { ...batchUpperB, productId: productCase, stock: '6' },
          ],
          new Map(),
        ),
      });
      expect(planCase).toEqual({
        kind: 'reserved',
        allocations: [
          { batchId: batchUpperB.id, quantity: '6.0000' },
          { batchId: batchLowerA.id, quantity: '2.0000' },
        ],
      });

      const planMix = planReservation({
        requirement: [{ productId: productMix as ProductId, quantity: consumedQuantity('2.5', '100.00') }],
        products: new Map([[productMix as ProductId, companyMix.unitId as UnitId]]),
        batches: candidatesOf(
          [
            { ...batchTwo, productId: productMix, stock: '1' },
            { ...batchTen, productId: productMix, stock: '5' },
            { ...batchDashMix, productId: productMix, stock: '1' },
            { ...batchB, productId: productMix, stock: '5' },
          ],
          new Map(),
        ),
      });
      expect(planMix).toEqual({
        kind: 'reserved',
        allocations: [
          { batchId: batchDashMix.id, quantity: '1.0000' },
          { batchId: batchTwo.id, quantity: '1.0000' },
          { batchId: batchTen.id, quantity: '0.5000' },
        ],
      });

      // Unica diferencia teorica entre `lot_precedes` (COLLATE "C", bytes UTF-8) y
      // `compareBatchesOldestFirst` (unidades de codigo UTF-16 de JS): un caracter fuera del
      // plano basico (>U+FFFF, dos unidades de codigo en UTF-16) comparado contra uno del rango
      // U+E000-U+FFFF. Ningun escenario de este test usa esos caracteres.
    });
  });

  // Cada caso va en su propia transaccion: `now()` en Postgres es el instante en que
  // empezo la transaccion (no el de cada sentencia), asi que dos llamadas a `applyMigration`
  // dentro de la misma transaccion compartirian el mismo `created_at` y el `max(created_at)`
  // del down ya no distinguiria una migracion de otra.

  it('R57: el down.sql falla sin cambiar nada si un pedido apartado por la migracion registro otro movimiento', async () => {
    await inRolledBackTransaction(async (tx) => {
      const company = await createCompanyFixture(tx);
      const product = await createProduct(tx, company);
      const batch = await createBatch(tx, company, product, { stock: '20', purchaseDate: '2026-09-01' });
      const recipe = await createRecipe(tx, company);
      await addRecipeLine(tx, recipe, product, '100.00');
      const order = await createOrder(tx, company, recipe, '10', { createdAt: new Date('2026-01-01T00:00:00.000Z') });

      await applyMigration(tx);

      const reservationsBeforeDown = await reservationsOf(tx, order);
      const reservedAtBeforeDown = await reservedAtOf(tx, order);
      expect(reservationsBeforeDown).toEqual([{ batchId: batch.id, quantity: '10.0000', createdBy: null }]);
      expect(reservedAtBeforeDown).not.toBeNull();

      // Un `release` posterior -- lo unico que hace falta para que el down deje de ver el pedido
      // como intacto.
      await tx.reservationMovement.create({
        data: {
          companyId: company.companyId,
          orderId: order,
          batchId: batch.id,
          kind: 'release',
          quantity: new Prisma.Decimal('3.0000'),
          createdBy: company.actorId,
        },
      });

      await expectDownMigrationToFail(tx);

      expect(await reservationsOf(tx, order)).toEqual([{ batchId: batch.id, quantity: '10.0000', createdBy: null }]);
      expect(await reservedAtOf(tx, order)).toEqual(reservedAtBeforeDown);
      const releaseRows = await tx.reservationMovement.findMany({ where: { orderId: order, kind: 'release' } });
      expect(releaseRows).toHaveLength(1);
    });
  });

  it('R57: el down.sql revierte limpio si ningun pedido apartado por la migracion tuvo actividad', async () => {
    await inRolledBackTransaction(async (tx) => {
      const company = await createCompanyFixture(tx);
      const product = await createProduct(tx, company);
      const batch = await createBatch(tx, company, product, { stock: '20', purchaseDate: '2026-09-01' });
      const recipe = await createRecipe(tx, company);
      await addRecipeLine(tx, recipe, product, '100.00');
      const order = await createOrder(tx, company, recipe, '10', { createdAt: new Date('2026-01-01T00:00:00.000Z') });

      await applyMigration(tx);
      expect(await reservationsOf(tx, order)).toEqual([{ batchId: batch.id, quantity: '10.0000', createdBy: null }]);

      await applyDownMigration(tx);

      expect(await reservationsOf(tx, order)).toEqual([]);
      expect(await reservedAtOf(tx, order)).toBeNull();
    });
  });
});
