/**
 * El insumo que se cuenta en una unidad elegida, sin presentacion en sus lotes, contra Postgres
 * real: la escritura (`createWithFirstBatch` con `unitId`), la busqueda del homonimo por unidad
 * y la traduccion del rechazo del disparador.
 *
 * AISLAMIENTO: el adaptador usa el cliente Prisma GLOBAL, asi que lo sembrado queda confirmado.
 * Cada caso crea su empresa efimera y la borra en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { PRODUCT_TYPES, ValidationError } from '@/lib/modules/inventario';
import {
  addBatchToAlive,
  createWithFirstBatch,
  findAliveIdByNameInUnit,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Fixture = {
  readonly companyId: string;
  readonly actorId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly kgId: string;
  readonly mlId: string;
  readonly mlPresentationId: string;
  readonly recipeId: string;
};

async function createFixture(): Promise<Fixture> {
  const marca = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const companyName = `Empresa ${marca}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  const user = await prisma.user.create({
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
  const systemUnit = (nameNormalized: string) =>
    prisma.unit.findFirstOrThrow({ where: { companyId: null, nameNormalized }, select: { id: true } });
  const kg = await systemUnit('kilogramo');
  const ml = await systemUnit('mililitro');
  const presentation = await prisma.presentation.create({
    data: { name: `Botella ${marca}`, nameNormalized: `botella${marca}`, unitId: ml.id, companyId: company.id },
    select: { id: true },
  });
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: company.id },
    select: { id: true },
  });
  return {
    companyId: company.id,
    actorId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    kgId: kg.id,
    mlId: ml.id,
    mlPresentationId: presentation.id,
    recipeId: recipe.id,
  };
}

async function dropFixture(fixture: Fixture): Promise<void> {
  const { companyId } = fixture;
  await prisma.reservationMovement.deleteMany({ where: { companyId } });
  await prisma.order.deleteMany({ where: { companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId } });
  await prisma.productBatch.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.recipe.deleteMany({ where: { id: fixture.recipeId } });
  await prisma.presentation.deleteMany({ where: { id: fixture.mlPresentationId } });
  await prisma.user.delete({ where: { id: fixture.actorId } });
  await prisma.role.delete({ where: { id: fixture.roleId } });
  await prisma.documentType.delete({ where: { code: fixture.documentTypeCode } });
  await prisma.company.delete({ where: { id: companyId } });
}

function scopeOf(fixture: Fixture): InventoryScope {
  return { companyId: fixture.companyId };
}

function batchOf(fixture: Fixture, overrides: Partial<NewProductBatch> = {}): NewProductBatch {
  return {
    presentationId: null,
    stock: '3',
    unitCost: '2.5000',
    lot: null,
    purchaseDate: '2026-09-01',
    expiryDate: null,
    createdBy: fixture.actorId,
    ...overrides,
  };
}

async function withFixture(body: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await createFixture();
  try {
    await body(fixture);
  } finally {
    await dropFixture(fixture);
  }
}

describe('QC-199 — escritura y busqueda del insumo por unidad', () => {
  it('R9 createWithFirstBatch con unitId crea producto con esa unidad y lote sin presentacion con su asiento', async () => {
    await withFixture(async (fixture) => {
      const created = await createWithFirstBatch(
        { name: `Sosa ${token()}`, qtyAlert: '1', type: PRODUCT_TYPES.PRODUCT, unitId: fixture.kgId },
        batchOf(fixture, { stock: '7.5' }),
        new Date(),
        scopeOf(fixture),
      );

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: created.id },
        select: { unitId: true, type: true, stock: true, presentationId: true },
      });
      expect(product).toMatchObject({ unitId: fixture.kgId, type: 'PRODUCT', presentationId: null });
      expect(product.stock.toFixed(4)).toBe('7.5000');

      const batch = await prisma.productBatch.findUniqueOrThrow({
        where: { id: created.batchId },
        select: { presentationId: true, stock: true },
      });
      expect(batch.presentationId).toBeNull();
      expect(batch.stock.toFixed(4)).toBe('7.5000');

      const movements = await prisma.inventoryMovement.findMany({
        where: { batchId: created.batchId },
        select: { kind: true, quantity: true },
      });
      expect(movements.map((m) => ({ kind: m.kind, quantity: m.quantity.toFixed(4) }))).toEqual([
        { kind: 'opening', quantity: '7.5000' },
      ]);
    });
  });

  it('R10 findAliveIdByNameInUnit encuentra el homonimo de la misma unidad y no el de otra', async () => {
    await withFixture(async (fixture) => {
      const name = `Acido ${token()}`;
      const enKg = await createWithFirstBatch(
        { name, qtyAlert: '1', type: PRODUCT_TYPES.PRODUCT, unitId: fixture.kgId },
        batchOf(fixture),
        new Date(),
        scopeOf(fixture),
      );

      // El nombre se normaliza: mayusculas y espacios de mas no cambian el producto.
      expect(await findAliveIdByNameInUnit(`  ${name.toUpperCase()} `, fixture.kgId, scopeOf(fixture))).toEqual({
        id: enKg.id,
        type: PRODUCT_TYPES.PRODUCT,
      });
      expect(await findAliveIdByNameInUnit(name, fixture.mlId, scopeOf(fixture))).toBeNull();

      // Otra empresa con el mismo nombre y la misma unidad no lo ve.
      expect(await findAliveIdByNameInUnit(name, fixture.kgId, { companyId: randomUUID() })).toBeNull();

      // Un lote mas por el camino del homonimo: tambien sin presentacion.
      const added = await addBatchToAlive(enKg.id, batchOf(fixture, { stock: '2' }), new Date(), scopeOf(fixture));
      expect(added).not.toBeNull();
      const product = await prisma.product.findUniqueOrThrow({ where: { id: enKg.id }, select: { stock: true } });
      expect(product.stock.toFixed(4)).toBe('5.0000');
      expect(await prisma.productBatch.count({ where: { productId: enKg.id, presentationId: null } })).toBe(2);
    });
  });

  it('R12 el rechazo product_batches_product_without_unit se traduce a ValidationError', async () => {
    await withFixture(async (fixture) => {
      // Un insumo sin unidad escrito fuera del caso de uso: el lote sin presentacion lo rechaza la base.
      const product = await prisma.product.create({
        data: {
          name: `Sin unidad ${token()}`,
          nameNormalized: `sinunidad${token()}`,
          type: 'PRODUCT',
          companyId: fixture.companyId,
        },
        select: { id: true },
      });

      await expect(
        addBatchToAlive(product.id, batchOf(fixture), new Date(), scopeOf(fixture)),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(await prisma.productBatch.count({ where: { productId: product.id } })).toBe(0);
    });
  });
});

