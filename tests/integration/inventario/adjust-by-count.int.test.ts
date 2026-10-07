/**
 * El ajuste por total contado contra Postgres real: `adjustBatchStock` y `findBatchMovements` de
 * los adaptadores, y los tres CHECK de `inventory_movements` sobre la existencia de antes y el
 * total contado.
 *
 * AISLAMIENTO: commit. `createWithFirstBatch` y `adjustBatchStock` usan el cliente Prisma GLOBAL y
 * abren cada uno SU PROPIA `prisma.$transaction`, asi que una transaccion del test no los
 * envolveria; y dos ajustes concurrentes necesitan que cada uno confirme para que el otro lo vea.
 * Cada caso fabrica su empresa efimera y la limpia en un `finally`, como `ledger-cuadre`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { findBatchMovements } from '@/lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma';
import {
  adjustBatchStock,
  createWithFirstBatch,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { MovementReason } from '@/lib/modules/inventario/domain/movement-reason';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';

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

type Fixture = {
  readonly actorId: string;
  readonly companyId: string;
  readonly presentationId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly productIds: string[];
};

function ambito(fixture: Fixture): InventoryScope {
  return { companyId: fixture.companyId };
}

async function createFixture(): Promise<Fixture> {
  const marker = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const companyName = `Empresa ${marker}`;
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
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'kilogramo', companyId: null },
    select: { id: true },
  });
  const presentationName = `Bidon ${token()}`;
  const presentation = await prisma.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: normalizeForTest(presentationName),
      unitId: unit.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  return {
    actorId: user.id,
    companyId: company.id,
    presentationId: presentation.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    productIds: [],
  };
}

/** En orden de FK: asientos, lotes, productos, presentacion, usuario, rol, tipo, empresa. */
async function dropFixture(fixture: Fixture): Promise<void> {
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: fixture.productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: fixture.productIds } } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.user.delete({ where: { id: fixture.actorId } });
  await prisma.role.delete({ where: { id: fixture.roleId } });
  await prisma.documentType.delete({ where: { code: fixture.documentTypeCode } });
  await prisma.company.delete({ where: { id: fixture.companyId } });
}

/** Un producto nuevo con un lote de `stock`; devuelve el lote. */
async function loteCon(fixture: Fixture, stock: string): Promise<string> {
  const batch: NewProductBatch = {
    presentationId: fixture.presentationId,
    stock,
    unitCost: '2.5000',
    lot: null,
    purchaseDate: '2026-09-01',
    expiryDate: null,
    createdBy: fixture.actorId,
  };
  const creado = await createWithFirstBatch({ name: `Producto ${token()}` }, batch, new Date(), ambito(fixture));
  fixture.productIds.push(creado.id);
  return creado.batchId;
}

function ajustar(
  fixture: Fixture,
  batchId: string,
  seenStock: string,
  countedStock: string,
  reason: MovementReason,
) {
  return adjustBatchStock({ batchId, seenStock, countedStock, reason }, fixture.actorId, new Date(), ambito(fixture));
}

async function existenciaDe(batchId: string): Promise<string> {
  const fila = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } });
  return fila.stock.toFixed(4);
}

async function ajustesDe(batchId: string) {
  const filas = await prisma.inventoryMovement.findMany({
    where: { batchId, kind: 'adjustment' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { quantity: true, reason: true, stockBefore: true, countedStock: true },
  });
  return filas.map((fila) => ({
    quantity: fila.quantity.toFixed(4),
    reason: fila.reason,
    stockBefore: fila.stockBefore?.toFixed(4) ?? null,
    countedStock: fila.countedStock?.toFixed(4) ?? null,
  }));
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ajuste por total contado contra Postgres', () => {
  it('R12, R24: un aumento y una disminucion dejan el lote en el total y el asiento cuadrando con sus dos columnas', async () => {
    const fixture = await createFixture();
    try {
      const batchId = await loteCon(fixture, '10');

      await expect(ajustar(fixture, batchId, '10', '13.5', 'conteo_fisico')).resolves.toEqual({
        kind: 'adjusted',
        previousStock: '10.0000',
        difference: '3.5000',
        stock: '13.5000',
        reserved: '0.0000',
        overReserved: false,
      });
      expect(await existenciaDe(batchId)).toBe('13.5000');

      await expect(ajustar(fixture, batchId, '13.5000', '4', 'merma')).resolves.toMatchObject({
        kind: 'adjusted',
        previousStock: '13.5000',
        difference: '-9.5000',
        stock: '4.0000',
      });
      expect(await existenciaDe(batchId)).toBe('4.0000');

      expect(await ajustesDe(batchId)).toEqual([
        { quantity: '3.5000', reason: 'conteo_fisico', stockBefore: '10.0000', countedStock: '13.5000' },
        { quantity: '-9.5000', reason: 'merma', stockBefore: '13.5000', countedStock: '4.0000' },
      ]);
    } finally {
      await dropFixture(fixture);
    }
  });

  it('R13: con una existencia vista vieja no escribe nada y devuelve la existencia actual', async () => {
    const fixture = await createFixture();
    try {
      const batchId = await loteCon(fixture, '10');

      await expect(ajustar(fixture, batchId, '9', '12', 'conteo_fisico')).resolves.toEqual({
        kind: 'stock_changed',
        currentStock: '10.0000',
      });
      expect(await existenciaDe(batchId)).toBe('10.0000');
      expect(await ajustesDe(batchId)).toEqual([]);
    } finally {
      await dropFixture(fixture);
    }
  });

  it('R14: dos ajustes simultaneos del mismo lote con la misma vista aplican uno y rechazan el otro', async () => {
    const fixture = await createFixture();
    try {
      const batchId = await loteCon(fixture, '10');

      // Sin `await` entre los dos: compiten de verdad por el bloqueo del lote.
      const resultados = await Promise.all([
        ajustar(fixture, batchId, '10', '12', 'conteo_fisico'),
        ajustar(fixture, batchId, '10', '7', 'merma'),
      ]);

      const aplicados = resultados.filter((resultado) => resultado.kind === 'adjusted');
      const rechazados = resultados.filter((resultado) => resultado.kind === 'stock_changed');
      expect(aplicados).toHaveLength(1);
      expect(rechazados).toHaveLength(1);

      const ganador = aplicados[0];
      if (ganador?.kind !== 'adjusted') throw new Error('sin ajuste aplicado');
      expect(rechazados[0]).toEqual({ kind: 'stock_changed', currentStock: ganador.stock });
      expect(await existenciaDe(batchId)).toBe(ganador.stock);
      expect(await ajustesDe(batchId)).toHaveLength(1);
    } finally {
      await dropFixture(fixture);
    }
  });

  it('R26: findBatchMovements devuelve las dos columnas del ajuste nuevo y null en el asiento de alta', async () => {
    const fixture = await createFixture();
    try {
      const batchId = await loteCon(fixture, '10');
      await ajustar(fixture, batchId, '10', '8.25', 'rotura');

      const historial = await findBatchMovements(batchId, ambito(fixture));
      const ajuste = historial?.find((entrada) => entrada.kind === 'adjustment');
      const alta = historial?.find((entrada) => entrada.kind === 'opening');

      expect(ajuste).toMatchObject({ quantity: '-1.7500', previousStock: '10.0000', countedStock: '8.2500' });
      expect(alta).toMatchObject({ quantity: '10.0000', previousStock: null, countedStock: null });
    } finally {
      await dropFixture(fixture);
    }
  });
});

describe('R25 — los CHECK de la existencia de antes y el total contado', () => {
  type Fila = {
    kind: 'opening' | 'adjustment';
    quantity: string;
    reason: string | null;
    stockBefore: string | null;
    countedStock: string | null;
  };

  /** `INSERT` crudo: el cliente tipado no deja escribir una fila que el dominio nunca arma. */
  function insertar(fixture: Fixture, batchId: string, fila: Fila): Promise<number> {
    return prisma.$executeRaw`
      INSERT INTO "inventory_movements"
        ("batch_id", "kind", "quantity", "reason", "company_id", "stock_before", "counted_stock")
      VALUES (
        CAST(${batchId} AS uuid), CAST(${fila.kind} AS "InventoryMovementKind"),
        CAST(${fila.quantity} AS numeric), ${fila.reason}, CAST(${fixture.companyId} AS uuid),
        CAST(${fila.stockBefore} AS numeric), CAST(${fila.countedStock} AS numeric)
      )`;
  }

  const violaciones: ReadonlyArray<{ etiqueta: string; restriccion: string; fila: Fila }> = [
    {
      etiqueta: 'existencia de antes sin total contado',
      restriccion: 'inventory_movements_count_pair',
      fila: { kind: 'adjustment', quantity: '2', reason: 'conteo_fisico', stockBefore: '10', countedStock: null },
    },
    {
      etiqueta: 'total contado sin existencia de antes',
      restriccion: 'inventory_movements_count_pair',
      fila: { kind: 'adjustment', quantity: '2', reason: 'conteo_fisico', stockBefore: null, countedStock: '12' },
    },
    {
      etiqueta: 'las dos columnas en un asiento que no es ajuste',
      restriccion: 'inventory_movements_count_only_adjustment',
      fila: { kind: 'opening', quantity: '5', reason: null, stockBefore: '0', countedStock: '5' },
    },
    {
      etiqueta: 'un total que no es la existencia de antes mas la cantidad',
      restriccion: 'inventory_movements_count_balances',
      fila: { kind: 'adjustment', quantity: '2', reason: 'conteo_fisico', stockBefore: '10', countedStock: '13' },
    },
    {
      etiqueta: 'un total negativo aunque cuadre',
      restriccion: 'inventory_movements_count_balances',
      fila: { kind: 'adjustment', quantity: '-3', reason: 'merma', stockBefore: '2', countedStock: '-1' },
    },
  ];

  for (const { etiqueta, restriccion, fila } of violaciones) {
    it(`R25: rechaza ${etiqueta} con ${restriccion}`, async () => {
      const fixture = await createFixture();
      try {
        const batchId = await loteCon(fixture, '10');

        await expect(insertar(fixture, batchId, fila)).rejects.toThrow(restriccion);
        expect(await ajustesDe(batchId)).toEqual([]);
      } finally {
        await dropFixture(fixture);
      }
    });
  }

  it('R25: control positivo -un ajuste que cuadra con las dos columnas se acepta-', async () => {
    const fixture = await createFixture();
    try {
      const batchId = await loteCon(fixture, '10');

      await expect(
        insertar(fixture, batchId, {
          kind: 'adjustment',
          quantity: '2',
          reason: 'conteo_fisico',
          stockBefore: '10',
          countedStock: '12',
        }),
      ).resolves.toBe(1);
    } finally {
      await dropFixture(fixture);
    }
  });
});
