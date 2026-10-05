/**
 * El envase como producto de inventario contra Postgres real: alta con presentacion fija y
 * existencia en la unidad de envases, lotes sin presentacion, homonimo, ajuste entero.
 *
 * AISLAMIENTO: commit. `createWithFirstBatch`, `addBatchToAlive` y `adjustBatchStock` usan el
 * cliente Prisma global y abren su propia transaccion. Cada caso fabrica su empresa efimera y la
 * limpia en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import {
  addBatchToAlive,
  adjustBatchStock,
  createProduct,
  createWithFirstBatch,
  findAliveIdByNameInPresentationUnit,
  findAliveIdByNameInUnit,
  findAlivePackagingByName,
  findAliveProductById,
  findBatchesOfAliveProduct,
  listAliveProducts,
  softDeleteAliveProduct,
  updateAliveProduct,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { findBatchMovements } from '@/lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma';
import { findPackageUnitId } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { createAdjustBatchStock } from '@/lib/modules/inventario/domain/adjust-batch-stock';
import { createCreateProduct } from '@/lib/modules/inventario/domain/create-product';
import { ActionNotAllowedError, ValidationError } from '@/lib/modules/inventario/domain/errors';
import { prisma } from '@/lib/shared/db/prisma';

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

const repositorio: ProductRepository = {
  create: createProduct,
  findAliveById: findAliveProductById,
  updateAlive: updateAliveProduct,
  softDeleteAlive: softDeleteAliveProduct,
  listAlive: listAliveProducts,
  findAliveIdByNameInPresentationUnit,
  findAliveIdByNameInUnit,
  findAlivePackagingByName,
  createWithFirstBatch,
  addBatchToAlive,
  adjustBatchStock,
  findBatchesOfAliveProduct,
  findBatchMovements,
};

const altaDeProducto = createCreateProduct({ products: repositorio, packageUnit: { findPackageUnitId } });
const ajusteDeLote = createAdjustBatchStock({ products: repositorio });

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Fixture = {
  readonly actor: Actor;
  readonly companyId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly ml: string;
  readonly litro: string;
  readonly p500: string;
  readonly p1l: string;
};

async function presentation(companyId: string, unitId: string, content: string): Promise<string> {
  const name = `Botella ${token()}`;
  const row = await prisma.presentation.create({
    data: { name, nameNormalized: name.toLowerCase(), unitId, companyId, content },
    select: { id: true },
  });
  return row.id;
}

async function createFixture(): Promise<Fixture> {
  const marker = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({ data: { name: `rol-${marker}`, description: 'Rol de prueba' }, select: { id: true } });
  const companyName = `Empresa envases ${marker}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  const user = await prisma.user.create({
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
  const ml = (await prisma.unit.findFirstOrThrow({ where: { companyId: null, nameNormalized: 'mililitro' } })).id;
  const litro = (await prisma.unit.findFirstOrThrow({ where: { companyId: null, nameNormalized: 'litro' } })).id;
  return {
    actor: { id: user.id, companyId: company.id, permissions: ['inventario.consultar', 'inventario.modificar'] },
    companyId: company.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    ml,
    litro,
    p500: await presentation(company.id, ml, '500'),
    p1l: await presentation(company.id, litro, '1'),
  };
}

async function dropFixture(f: Fixture): Promise<void> {
  await prisma.inventoryMovement.deleteMany({ where: { companyId: f.companyId } });
  await prisma.productBatch.deleteMany({ where: { companyId: f.companyId } });
  await prisma.product.deleteMany({ where: { companyId: f.companyId } });
  await prisma.presentation.deleteMany({ where: { companyId: f.companyId } });
  await prisma.user.deleteMany({ where: { companyId: f.companyId } });
  await prisma.company.delete({ where: { id: f.companyId } });
  await prisma.role.delete({ where: { id: f.roleId } });
  await prisma.documentType.delete({ where: { code: f.documentTypeCode } });
}

async function packageUnitId(): Promise<string> {
  const id = await findPackageUnitId();
  if (id === null) throw new Error('falta la unidad de sistema de envases');
  return id;
}

function altaEnvase(name: string, presentationId: string, stock: string, unitCost = '0.5000') {
  return { name, type: PRODUCT_TYPES.PACKAGING, qtyAlert: '0', presentationId, stock, unitCost };
}

async function productRow(id: string) {
  return prisma.product.findUniqueOrThrow({
    where: { id },
    select: { presentationId: true, unitId: true, stock: true, type: true },
  });
}

async function batchesOf(productId: string) {
  return prisma.productBatch.findMany({
    where: { productId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, presentationId: true, stock: true, unitCost: true },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('QC-195 — el envase como producto de inventario', () => {
  it('R1, R6 — el alta guarda la presentacion en el producto, la existencia en «u» y el lote sin presentacion', async () => {
    const f = await createFixture();
    try {
      const { id } = await altaDeProducto(altaEnvase(`Botella PET ${token()}`, f.p500, '100'), f.actor);
      const product = await productRow(id);
      expect(product).toEqual({
        presentationId: f.p500,
        unitId: await packageUnitId(),
        stock: expect.objectContaining({}),
        type: PRODUCT_TYPES.PACKAGING,
      });
      expect(product.stock.toFixed(4)).toBe('100.0000');
      const batches = await batchesOf(id);
      expect(batches).toHaveLength(1);
      expect(batches[0]?.presentationId).toBeNull();
      expect(batches[0]?.stock.toFixed(4)).toBe('100.0000');
    } finally {
      await dropFixture(f);
    }
  });

  it('R6 — con una unidad propia de la empresa llamada «unidad» y simbolo «u», el alta del envase toma la de sistema y no choca', async () => {
    const f = await createFixture();
    try {
      const sistema = await packageUnitId();
      const propia = await prisma.unit.create({
        data: { name: 'unidad', nameNormalized: 'unidad', symbol: 'u', companyId: f.companyId },
        select: { id: true },
      });
      try {
        expect(propia.id).not.toBe(sistema);
        expect(await findPackageUnitId()).toBe(sistema);

        const { id } = await altaDeProducto(altaEnvase(`Botella PET ${token()}`, f.p500, '100'), f.actor);
        const product = await productRow(id);
        expect(product.unitId).toBe(sistema);
        expect(product.stock.toFixed(4)).toBe('100.0000');
        const batches = await batchesOf(id);
        expect(batches).toHaveLength(1);
        expect(batches[0]?.presentationId).toBeNull();

        const sinTocar = await prisma.unit.findUniqueOrThrow({
          where: { id: propia.id },
          select: { name: true, symbol: true, companyId: true },
        });
        expect(sinTocar).toEqual({ name: 'unidad', symbol: 'u', companyId: f.companyId });
      } finally {
        await prisma.inventoryMovement.deleteMany({ where: { companyId: f.companyId } });
        await prisma.productBatch.deleteMany({ where: { companyId: f.companyId } });
        await prisma.product.deleteMany({ where: { companyId: f.companyId } });
        await prisma.unit.delete({ where: { id: propia.id } });
      }
    } finally {
      await dropFixture(f);
    }
  });

  it('R1 — el alta de un envase sin presentacion, o con una de otra empresa, se rechaza sin escribir nada', async () => {
    const f = await createFixture();
    const other = await createFixture();
    try {
      const sinPresentacion = { ...altaEnvase(`Botella ${token()}`, f.p500, '10'), presentationId: undefined };
      await expect(altaDeProducto(sinPresentacion, f.actor)).rejects.toBeInstanceOf(ValidationError);
      await expect(altaDeProducto(altaEnvase(`Botella ${token()}`, other.p500, '10'), f.actor)).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(await prisma.product.count({ where: { companyId: f.companyId } })).toBe(0);
    } finally {
      await dropFixture(f);
      await dropFixture(other);
    }
  });

  it('R3 — un lote sobre un envase homonimo entra en su presentacion fija, sin presentacion propia', async () => {
    const f = await createFixture();
    try {
      const name = `Botella PET ${token()}`;
      const first = await altaDeProducto(altaEnvase(name, f.p500, '100', '0.5000'), f.actor);
      const second = await altaDeProducto(altaEnvase(name, f.p500, '50', '0.7000'), f.actor);
      expect(second.id).toBe(first.id);
      const batches = await batchesOf(first.id);
      expect(batches.map((b) => [b.presentationId, b.stock.toFixed(4), b.unitCost?.toFixed(4)])).toEqual([
        [null, '100.0000', '0.5000'],
        [null, '50.0000', '0.7000'],
      ]);
      expect((await productRow(first.id)).stock.toFixed(4)).toBe('150.0000');
    } finally {
      await dropFixture(f);
    }
  });

  it('R2, R3 — un lote sobre un envase homonimo con otra presentacion se rechaza con action_not_allowed sin escribir nada', async () => {
    const f = await createFixture();
    try {
      const name = `Botella PET ${token()}`;
      const first = await altaDeProducto(altaEnvase(name, f.p500, '100'), f.actor);
      await expect(altaDeProducto(altaEnvase(name, f.p1l, '10'), f.actor)).rejects.toBeInstanceOf(ActionNotAllowedError);
      expect(await productRow(first.id)).toEqual(expect.objectContaining({ presentationId: f.p500 }));
      expect(await batchesOf(first.id)).toHaveLength(1);
      expect(await prisma.product.count({ where: { companyId: f.companyId } })).toBe(1);
    } finally {
      await dropFixture(f);
    }
  });

  it('R2 — bajo el bloqueo, el adaptador rechaza un lote con otra presentacion o con presentacion propia sobre un envase', async () => {
    const f = await createFixture();
    try {
      const { id } = await altaDeProducto(altaEnvase(`Botella ${token()}`, f.p500, '10'), f.actor);
      const lote = {
        presentationId: null,
        stock: '5',
        unitCost: '1.0000',
        lot: null,
        purchaseDate: '2026-09-01',
        expiryDate: null,
        createdBy: f.actor.id,
      };
      const scope = { companyId: f.companyId };
      await expect(addBatchToAlive(id, lote, new Date(), scope, { presentationId: f.p1l })).rejects.toBeInstanceOf(
        ActionNotAllowedError,
      );
      await expect(addBatchToAlive(id, { ...lote, presentationId: f.p500 }, new Date(), scope)).rejects.toBeInstanceOf(
        ActionNotAllowedError,
      );
      expect(await productRow(id)).toEqual(expect.objectContaining({ presentationId: f.p500 }));
      expect(await batchesOf(id)).toHaveLength(1);
    } finally {
      await dropFixture(f);
    }
  });

  it('R4 — dos envases con presentaciones distintas son productos distintos, con su existencia, sus lotes y su costo', async () => {
    const f = await createFixture();
    try {
      const a = await altaDeProducto(altaEnvase(`Botella PET 500 ml ${token()}`, f.p500, '100', '0.5000'), f.actor);
      const b = await altaDeProducto(altaEnvase(`Botella PET 1 L ${token()}`, f.p1l, '40', '0.9000'), f.actor);
      expect(a.id).not.toBe(b.id);
      expect((await productRow(a.id)).presentationId).toBe(f.p500);
      expect((await productRow(b.id)).presentationId).toBe(f.p1l);
      expect((await productRow(a.id)).stock.toFixed(4)).toBe('100.0000');
      expect((await productRow(b.id)).stock.toFixed(4)).toBe('40.0000');
      expect((await batchesOf(a.id)).map((x) => x.unitCost?.toFixed(4))).toEqual(['0.5000']);
      expect((await batchesOf(b.id)).map((x) => x.unitCost?.toFixed(4))).toEqual(['0.9000']);
    } finally {
      await dropFixture(f);
    }
  });

  it('R7 — la existencia del alta y el ajuste de un envase son enteros: lo fraccionario se rechaza sin escribir', async () => {
    const f = await createFixture();
    try {
      await expect(altaDeProducto(altaEnvase(`Botella ${token()}`, f.p500, '2.5'), f.actor)).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(await prisma.product.count({ where: { companyId: f.companyId } })).toBe(0);

      const { id } = await altaDeProducto(altaEnvase(`Botella ${token()}`, f.p500, '10'), f.actor);
      const [batch] = await batchesOf(id);
      if (batch === undefined) throw new Error('sin lote');
      await expect(
        ajusteDeLote({ batchId: batch.id, delta: '1.5', reason: 'conteo_fisico' }, f.actor),
      ).rejects.toBeInstanceOf(ValidationError);
      expect((await batchesOf(id))[0]?.stock.toFixed(4)).toBe('10.0000');

      const ok = await ajusteDeLote({ batchId: batch.id, delta: '-3', reason: 'conteo_fisico' }, f.actor);
      expect(ok.stock).toBe('7.0000');
    } finally {
      await dropFixture(f);
    }
  });
});
