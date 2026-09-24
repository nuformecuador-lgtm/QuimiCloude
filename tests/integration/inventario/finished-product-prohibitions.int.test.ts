/**
 * QC-150 T10 (R28, R31, R32), contra Postgres real: `addBatchToAlive` y `adjustBatchStock` de
 * `product-prisma.ts` usan el cliente Prisma GLOBAL y abren su propia `prisma.$transaction` con
 * un `FOR NO KEY UPDATE` dentro -mismo criterio que `product-type-lock.int.test.ts`-, asi que una
 * transaccion del test no las envolveria. Cada caso siembra su propia empresa efimera con
 * randomUUID (unidad, presentacion, receta y producto terminado, que exige el CHECK
 * `products_finished_identity_matches_type`) y la limpia en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import {
  addBatchToAlive,
  adjustBatchStock,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function ambito(companyId: string): InventoryScope {
  return { companyId };
}

async function crearEmpresa(): Promise<string> {
  const nombre = `Empresa terminado-prohibido ${token()}`;
  const { id } = await prisma.company.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, '') },
    select: { id: true },
  });
  return id;
}

async function crearUnidad(): Promise<string> {
  const marca = token();
  const { id } = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  return id;
}

async function crearPresentacion(companyId: string, unitId: string): Promise<string> {
  const marca = token();
  const { id } = await prisma.presentation.create({
    data: {
      name: `Presentacion ${marca}`,
      nameNormalized: `presentacion${marca}`,
      unitId,
      companyId,
    },
    select: { id: true },
  });
  return id;
}

async function crearReceta(companyId: string): Promise<string> {
  const marca = token();
  const { id } = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  });
  return id;
}

type FixtureTerminado = {
  readonly companyId: string;
  readonly unitId: string;
  readonly presentationId: string;
  readonly recipeId: string;
  readonly productId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
};

/** Un producto terminado vivo, con un lote vivo listo para ajustar. */
async function crearFixtureTerminado(stockInicial = '10'): Promise<FixtureTerminado> {
  const companyId = await crearEmpresa();
  const unitId = await crearUnidad();
  const presentationId = await crearPresentacion(companyId, unitId);
  const recipeId = await crearReceta(companyId);
  const marca = token();

  const { id: productId } = await prisma.product.create({
    data: {
      name: `Terminado ${marca}`,
      nameNormalized: `terminado${marca}`,
      type: 'FINISHED_PRODUCT',
      unitId,
      companyId,
      recipeId,
      presentationId,
      stock: stockInicial,
    },
    select: { id: true },
  });

  // `created_by`/`updated_by` son FK reales a `users`: se necesita un usuario de verdad.
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const { id: userId } = await prisma.user.create({
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

  return {
    companyId,
    unitId,
    presentationId,
    recipeId,
    productId,
    userId,
    roleId: role.id,
    documentTypeCode: documentType.code,
  };
}

async function crearLote(fixture: FixtureTerminado, stock: string): Promise<string> {
  const { id } = await prisma.productBatch.create({
    data: {
      productId: fixture.productId,
      presentationId: fixture.presentationId,
      stock,
      unitCost: '5.0000',
      lot: `L-${token()}`,
      purchaseDate: new Date('2026-09-01T00:00:00Z'),
      companyId: fixture.companyId,
      createdBy: fixture.userId,
      updatedBy: fixture.userId,
    },
    select: { id: true },
  });
  return id;
}

async function limpiar(fixture: FixtureTerminado): Promise<void> {
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { productId: fixture.productId } });
  await prisma.product.deleteMany({ where: { id: fixture.productId } });
  await prisma.recipe.deleteMany({ where: { id: fixture.recipeId } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.unit.deleteMany({ where: { id: fixture.unitId } });
  await prisma.user.deleteMany({ where: { id: fixture.userId } });
  await prisma.role.deleteMany({ where: { id: fixture.roleId } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

function newBatch(fixture: FixtureTerminado, overrides: Partial<NewProductBatch> = {}): NewProductBatch {
  return {
    presentationId: fixture.presentationId,
    stock: '1',
    unitCost: '1.0000',
    lot: null,
    purchaseDate: '2026-09-01',
    expiryDate: null,
    createdBy: fixture.userId,
    ...overrides,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('R28 — addBatchToAlive cierra la carrera bajo la fila bloqueada', () => {
  it("devuelve 'finished_product' sin escribir lote ni asiento cuando el productId es un producto terminado", async () => {
    const fixture = await crearFixtureTerminado();
    try {
      const lotesAntes = await prisma.productBatch.count({ where: { productId: fixture.productId } });
      const asientosAntes = await prisma.inventoryMovement.count({ where: { companyId: fixture.companyId } });

      const resultado = await addBatchToAlive(
        fixture.productId,
        newBatch(fixture),
        new Date(),
        ambito(fixture.companyId),
      );

      expect(resultado).toBe('finished_product');
      expect(await prisma.productBatch.count({ where: { productId: fixture.productId } })).toBe(
        lotesAntes,
      );
      expect(
        await prisma.inventoryMovement.count({ where: { companyId: fixture.companyId } }),
      ).toBe(asientosAntes);
    } finally {
      await limpiar(fixture);
    }
  });
});

describe('R31 — un ajuste que suma sobre un producto terminado no escribe nada', () => {
  it("delta positivo devuelve 'increase_not_allowed' sin UPDATE ni asiento", async () => {
    const fixture = await crearFixtureTerminado('10');
    const batchId = await crearLote(fixture, '10');
    try {
      const antes = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId } });
      const asientosAntes = await prisma.inventoryMovement.count({ where: { batchId } });

      const resultado = await adjustBatchStock(
        batchId,
        '1',
        'conteo_fisico',
        fixture.userId,
        new Date(),
        ambito(fixture.companyId),
      );

      expect(resultado).toBe('increase_not_allowed');
      const despues = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId } });
      expect(despues.stock.toFixed(4)).toBe(antes.stock.toFixed(4));
      expect(despues.updatedAt.toISOString()).toBe(antes.updatedAt.toISOString());
      expect(await prisma.inventoryMovement.count({ where: { batchId } })).toBe(asientosAntes);
    } finally {
      await limpiar(fixture);
    }
  });
});

describe('R32 — un ajuste que resta sobre un producto terminado sigue las reglas de cualquier lote', () => {
  it('delta negativo se aplica y deja su asiento', async () => {
    const fixture = await crearFixtureTerminado('10');
    const batchId = await crearLote(fixture, '10');
    try {
      const resultado = await adjustBatchStock(
        batchId,
        '-3',
        'merma',
        fixture.userId,
        new Date(),
        ambito(fixture.companyId),
      );

      expect(resultado).toEqual({ stock: '7.0000', reserved: '0.0000', overReserved: false });
      const fila = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId } });
      expect(fila.stock.toFixed(4)).toBe('7.0000');
      expect(await prisma.inventoryMovement.count({ where: { batchId, kind: 'adjustment' } })).toBe(
        1,
      );
    } finally {
      await limpiar(fixture);
    }
  });

  it('un delta que dejaria la existencia negativa se rechaza igual que en cualquier otro lote', async () => {
    const fixture = await crearFixtureTerminado('10');
    const batchId = await crearLote(fixture, '10');
    try {
      await expect(
        adjustBatchStock(batchId, '-11', 'merma', fixture.userId, new Date(), ambito(fixture.companyId)),
      ).rejects.toMatchObject({ code: 'batch_stock_negative' });

      const fila = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId } });
      expect(fila.stock.toFixed(4)).toBe('10.0000');
    } finally {
      await limpiar(fixture);
    }
  });
});
