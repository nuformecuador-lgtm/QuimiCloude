/**
 * `PackagingCatalog` (`packaging-catalog-prisma.ts`) contra Postgres real: que envases vuelven,
 * su presentacion, su disponible en envases y los lotes con que se costean.
 *
 * AISLAMIENTO: commit. Los adaptadores usan el cliente Prisma global y `createWithFirstBatch` abre
 * su propia transaccion. Cada caso fabrica sus empresas efimeras y las limpia en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { PRODUCT_TYPES } from '@/lib/modules/inventario';
import {
  findPackagingCostingBatches,
  findPackagingRefs,
} from '@/lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma';
import {
  addBatchToAlive,
  createWithFirstBatch,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { createMaterialReservations } from '@/lib/modules/inventario/adapters/driven/persistence/reservation-prisma';
import { calculatePackagingCost } from '@/lib/modules/pedidos/domain/order-cost';
import { findPackageUnitId } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Company = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly recipeId: string;
  readonly p500: string;
};

async function createCompany(): Promise<Company> {
  const marker = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({ data: { name: `rol-${marker}`, description: 'Rol de prueba' }, select: { id: true } });
  const name = `Empresa envases ${marker}`;
  const company = await prisma.company.create({ data: { name, nameNormalized: normalizeCompanyName(name) }, select: { id: true } });
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
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marker}`, nameNormalized: `receta${marker}`, companyId: company.id },
    select: { id: true },
  });
  const ml = await prisma.unit.findFirstOrThrow({ where: { companyId: null, nameNormalized: 'mililitro' } });
  const presentationName = `Botella 500 ${marker}`;
  const presentation = await prisma.presentation.create({
    data: { name: presentationName, nameNormalized: presentationName.toLowerCase(), unitId: ml.id, companyId: company.id, content: '500' },
    select: { id: true },
  });
  return {
    companyId: company.id,
    userId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    recipeId: recipe.id,
    p500: presentation.id,
  };
}

async function dropCompany(c: Company): Promise<void> {
  await prisma.reservationMovement.deleteMany({ where: { companyId: c.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: c.companyId } });
  await prisma.order.deleteMany({ where: { companyId: c.companyId } });
  await prisma.productBatch.deleteMany({ where: { companyId: c.companyId } });
  await prisma.product.deleteMany({ where: { companyId: c.companyId } });
  await prisma.presentation.deleteMany({ where: { companyId: c.companyId } });
  await prisma.recipe.deleteMany({ where: { companyId: c.companyId } });
  await prisma.user.deleteMany({ where: { companyId: c.companyId } });
  await prisma.company.delete({ where: { id: c.companyId } });
  await prisma.role.delete({ where: { id: c.roleId } });
  await prisma.documentType.delete({ where: { code: c.documentTypeCode } });
}

function lote(c: Company, stock: string, unitCost: string | null, presentationId: string | null = null): NewProductBatch {
  return { presentationId, stock, unitCost, lot: null, purchaseDate: '2026-09-01', expiryDate: null, createdBy: c.userId };
}

async function envase(c: Company, stock: string, unitCost: string): Promise<{ id: string; batchId: string }> {
  const unitId = await findPackageUnitId();
  if (unitId === null) throw new Error('falta la unidad de envases');
  return createWithFirstBatch(
    { name: `Botella PET ${token()}`, qtyAlert: '0', type: PRODUCT_TYPES.PACKAGING },
    lote(c, stock, unitCost),
    new Date(),
    { companyId: c.companyId },
    { presentationId: c.p500, unitId },
  );
}

let sequence = 970_000;

async function orderReserving(c: Company, productId: string, quantity: string): Promise<string> {
  sequence += 1;
  const order = await prisma.order.create({
    data: {
      companyId: c.companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: sequence,
      recipeId: c.recipeId,
      quantity: new Prisma.Decimal('1'),
    },
    select: { id: true },
  });
  const outcome = await createMaterialReservations(prisma).syncForOrder({
    orderId: order.id,
    companyId: c.companyId,
    requirement: [{ productId, quantity }],
    actorId: c.userId,
    now: new Date(),
  });
  expect(outcome.kind).toBe('reserved');
  return order.id;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('QC-195 — PackagingCatalog', () => {
  it('R11 — findRefs solo devuelve envases vivos, de la empresa y con presentacion fija', async () => {
    const c = await createCompany();
    const other = await createCompany();
    try {
      const nuevo = await envase(c, '100', '0.5000');
      const legado = await createWithFirstBatch(
        { name: `Bidon legado ${token()}`, qtyAlert: '0', type: PRODUCT_TYPES.PACKAGING },
        lote(c, '10', '1.0000', c.p500),
        new Date(),
        { companyId: c.companyId },
      );
      const materia = await createWithFirstBatch(
        { name: `Materia ${token()}`, qtyAlert: '0', type: PRODUCT_TYPES.PRODUCT },
        lote(c, '10', '1.0000', c.p500),
        new Date(),
        { companyId: c.companyId },
      );
      const borrado = await envase(c, '5', '0.5000');
      await prisma.product.update({ where: { id: borrado.id }, data: { deletedAt: new Date() } });
      const ajeno = await envase(other, '5', '0.5000');

      const refs = await findPackagingRefs(
        [nuevo.id, legado.id, materia.id, borrado.id, ajeno.id, randomUUID()],
        c.companyId,
      );
      const presentation = await prisma.presentation.findUniqueOrThrow({ where: { id: c.p500 } });
      expect(refs).toEqual([
        {
          id: nuevo.id,
          name: expect.stringContaining('Botella PET'),
          presentationId: c.p500,
          presentationName: presentation.name,
          content: '500.0000',
          unitId: presentation.unitId,
          available: '100.0000',
        },
      ]);
    } finally {
      await dropCompany(c);
      await dropCompany(other);
    }
  });

  it('R10, R30 — el disponible es en envases, descuenta lo apartado y con excludeOrderId cuenta lo del propio pedido', async () => {
    const c = await createCompany();
    try {
      const botella = await envase(c, '100', '0.5000');
      const orderId = await orderReserving(c, botella.id, '40');

      expect((await findPackagingRefs([botella.id], c.companyId))[0]?.available).toBe('60.0000');
      expect((await findPackagingRefs([botella.id], c.companyId, { excludeOrderId: orderId }))[0]?.available).toBe(
        '100.0000',
      );
    } finally {
      await dropCompany(c);
    }
  });

  it('R10 — un envase con disponible cero tambien vuelve', async () => {
    const c = await createCompany();
    try {
      const botella = await envase(c, '10', '0.5000');
      await orderReserving(c, botella.id, '10');
      expect((await findPackagingRefs([botella.id], c.companyId))[0]?.available).toBe('0.0000');
    } finally {
      await dropCompany(c);
    }
  });

  it('R27, R30 — findCostingBatches devuelve costo y disponible por lote, sin los lotes sin disponible', async () => {
    const c = await createCompany();
    try {
      const botella = await envase(c, '100', '0.5000');
      await addBatchToAlive(botella.id, lote(c, '50', '0.7000'), new Date(), { companyId: c.companyId }, {
        presentationId: c.p500,
      });
      const orderId = await orderReserving(c, botella.id, '100');

      const sinPropio = await findPackagingCostingBatches([botella.id], c.companyId);
      expect(sinPropio).toEqual([{ productId: botella.id, unitCost: '0.7000', available: '50.0000' }]);

      const conPropio = await findPackagingCostingBatches([botella.id], c.companyId, { excludeOrderId: orderId });
      expect([...conPropio].sort((a, b) => a.unitCost.localeCompare(b.unitCost))).toEqual([
        { productId: botella.id, unitCost: '0.5000', available: '100.0000' },
        { productId: botella.id, unitCost: '0.7000', available: '50.0000' },
      ]);
    } finally {
      await dropCompany(c);
    }
  });

  it('R30 — un lote de envase sin costo unitario no entra en el promedio, aunque tenga disponible', async () => {
    const c = await createCompany();
    try {
      const botella = await envase(c, '100', '0.5000');
      const sinCosto = await addBatchToAlive(botella.id, lote(c, '50', null), new Date(), { companyId: c.companyId }, {
        presentationId: c.p500,
      });
      expect(sinCosto).not.toBeNull();
      const sinCostoGuardado = await prisma.productBatch.findFirstOrThrow({
        where: { productId: botella.id, unitCost: null },
        select: { stock: true },
      });
      expect(sinCostoGuardado.stock.toFixed(4)).toBe('50.0000');

      const lotes = await findPackagingCostingBatches([botella.id], c.companyId);
      expect(lotes).toEqual([{ productId: botella.id, unitCost: '0.5000', available: '100.0000' }]);

      // El promedio es el del unico lote con costo: 40 envases x 0.50.
      expect(calculatePackagingCost([{ productId: botella.id, packages: 40 }], lotes)).toBe('20.0000');
    } finally {
      await dropCompany(c);
    }
  });

  it('R11 — findCostingBatches ignora lo que no es un envase con presentacion fija de la empresa', async () => {
    const c = await createCompany();
    const other = await createCompany();
    try {
      const materia = await createWithFirstBatch(
        { name: `Materia ${token()}`, qtyAlert: '0', type: PRODUCT_TYPES.PRODUCT },
        lote(c, '10', '1.0000', c.p500),
        new Date(),
        { companyId: c.companyId },
      );
      const ajeno = await envase(other, '5', '0.5000');
      expect(await findPackagingCostingBatches([materia.id, ajeno.id], c.companyId)).toEqual([]);
    } finally {
      await dropCompany(c);
      await dropCompany(other);
    }
  });
});
