/**
 * `inventory-import-prisma.ts` contra Postgres real: lecturas en lote, clave de importacion y
 * entrada de producto terminado importado.
 *
 * AISLAMIENTO: el adaptador usa el cliente Prisma GLOBAL y `receiveImportedFinishedGoods` abre
 * su propia transaccion; la doble reserva de la clave necesita dos conexiones reales que
 * confirmen. Una transaccion del test no los envolveria. Cada caso fabrica su empresa con
 * randomUUID y `afterAll` la borra entera por `company_id`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import {
  claimImport,
  findAliveFinishedProducts,
  findAliveProductsByNormalizedNames,
  findBatchesByLots,
  finishImport,
  receiveImportedFinishedGoods,
} from '@/lib/modules/inventario/adapters/driven/persistence/inventory-import-prisma';
import { findAliveIdByNameInPresentationUnit } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { PRODUCT_TYPES } from '@/lib/modules/inventario/domain/product-type';
import { prisma } from '@/lib/shared/db/prisma';

import {
  borrarEmpresa,
  sembrarEmpresa,
  sembrarLote,
  sembrarPresentacion,
  sembrarProducto,
  sembrarReceta,
  sembrarUnidad,
  token,
} from './inventory-import-fixture';

import type { Empresa } from './inventory-import-fixture';
import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { ImportedFinishedGoods } from '@/lib/modules/inventario/ports/inventory-import-repository';

const empresas: Empresa[] = [];

async function nuevaEmpresa(): Promise<Empresa> {
  const empresa = await sembrarEmpresa();
  empresas.push(empresa);
  return empresa;
}

afterAll(async () => {
  for (const empresa of empresas) await borrarEmpresa(empresa);
  await prisma.$disconnect();
});

function ambito(empresa: Empresa): InventoryScope {
  return { companyId: empresa.companyId };
}

const totales = { rows: 5, created: 2, batchAdded: 1, duplicate: 1, error: 1 } as const;

describe('findAliveProductsByNormalizedNames — R14, R15, R17: identidad por nombre', () => {
  it('R14: el primero de cada identidad es el mismo que elige findAliveIdByNameInPresentationUnit', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad(empresa);
    const presentationId = await sembrarPresentacion(empresa, unitId);
    const mismoInstante = new Date('2026-03-01T10:00:00Z');
    const ids = [
      await sembrarProducto(empresa, 'Ácido Cítrico', { unitId, createdAt: mismoInstante }),
      await sembrarProducto(empresa, 'acido citrico', { unitId, createdAt: mismoInstante }),
      await sembrarProducto(empresa, 'ACIDO-CITRICO', { unitId, createdAt: new Date('2026-04-01T10:00:00Z') }),
    ];
    await sembrarProducto(empresa, 'Acido citrico', {
      unitId,
      createdAt: new Date('2026-01-01T10:00:00Z'),
      deletedAt: new Date('2026-02-01T10:00:00Z'),
    });

    const refs = await findAliveProductsByNormalizedNames(['  Acido Citrico '], ambito(empresa));
    const delPuertoExistente = await findAliveIdByNameInPresentationUnit('Acido citrico', presentationId, ambito(empresa));

    expect(refs.map((ref) => ref.id)).toEqual([...ids.slice(0, 2)].sort().concat(ids[2] as string));
    expect(refs[0]?.id).toBe(delPuertoExistente?.id);
    expect(refs[0]).toMatchObject({ nameNormalized: 'acidocitrico', type: PRODUCT_TYPES.PRODUCT, unitId });
  });

  it('R17: devuelve tambien los terminados vivos con su formula y presentacion', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad(empresa);
    const presentationId = await sembrarPresentacion(empresa, unitId);
    const recipeId = await sembrarReceta(empresa);
    const id = await sembrarProducto(empresa, 'Jabon · Botella', {
      type: PRODUCT_TYPES.FINISHED_PRODUCT,
      unitId,
      recipeId,
      presentationId,
    });

    const refs = await findAliveProductsByNormalizedNames(['jabon botella', 'otro'], ambito(empresa));

    expect(refs).toEqual([
      { id, nameNormalized: 'jabonbotella', type: PRODUCT_TYPES.FINISHED_PRODUCT, unitId, presentationId, recipeId },
    ]);
  });

  it('R14: sin nombres no consulta y devuelve vacio', async () => {
    const empresa = await nuevaEmpresa();
    expect(await findAliveProductsByNormalizedNames([], ambito(empresa))).toEqual([]);
    expect(await findAliveProductsByNormalizedNames(['  ', '---'], ambito(empresa))).toEqual([]);
  });
});

describe('findAliveFinishedProducts — R16: terminado por formula + presentacion', () => {
  it('R16: solo el par pedido, vivo y de tipo terminado', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad(empresa);
    const botella = await sembrarPresentacion(empresa, unitId);
    const garrafa = await sembrarPresentacion(empresa, unitId);
    const jabon = await sembrarReceta(empresa);
    const cloro = await sembrarReceta(empresa);
    const jabonBotella = await sembrarProducto(empresa, 'Jabon · Botella', {
      type: PRODUCT_TYPES.FINISHED_PRODUCT,
      unitId,
      recipeId: jabon,
      presentationId: botella,
    });
    await sembrarProducto(empresa, 'Jabon · Garrafa', {
      type: PRODUCT_TYPES.FINISHED_PRODUCT,
      unitId,
      recipeId: jabon,
      presentationId: garrafa,
    });
    await sembrarProducto(empresa, 'Cloro · Botella', {
      type: PRODUCT_TYPES.FINISHED_PRODUCT,
      unitId,
      recipeId: cloro,
      presentationId: botella,
      deletedAt: new Date(),
    });

    const refs = await findAliveFinishedProducts(
      [
        { recipeId: jabon, presentationId: botella },
        { recipeId: cloro, presentationId: botella },
      ],
      ambito(empresa),
    );

    expect(refs.map((ref) => ref.id)).toEqual([jabonBotella]);
    expect(await findAliveFinishedProducts([], ambito(empresa))).toEqual([]);
  });
});

describe('findBatchesByLots — R18, R19: lotes de la empresa por codigo', () => {
  it('R18, R19: devuelve lote y producto, tambien de un producto dado de baja', async () => {
    const empresa = await nuevaEmpresa();
    const unitId = await sembrarUnidad(empresa);
    const vivo = await sembrarProducto(empresa, `Vivo ${token()}`, { unitId });
    const deBaja = await sembrarProducto(empresa, `Baja ${token()}`, { unitId, deletedAt: new Date() });
    const loteVivo = `L-${token().slice(0, 10)}`;
    const loteBaja = `L-${token().slice(0, 10)}`;
    await sembrarLote(empresa, vivo, loteVivo);
    await sembrarLote(empresa, deBaja, loteBaja);

    const lotes = await findBatchesByLots([loteVivo, loteBaja, loteVivo, 'NO-EXISTE'], ambito(empresa));

    expect([...lotes].sort((a, b) => a.lot.localeCompare(b.lot))).toEqual(
      [
        { lot: loteVivo, productId: vivo },
        { lot: loteBaja, productId: deBaja },
      ].sort((a, b) => a.lot.localeCompare(b.lot)),
    );
    expect(await findBatchesByLots([], ambito(empresa))).toEqual([]);
  });
});

describe('claimImport y finishImport — R29, R30: una importacion por clave', () => {
  it('R29: la segunda reserva de la misma clave devuelve already con la importacion previa', async () => {
    const empresa = await nuevaEmpresa();
    const importKey = randomUUID();
    const input = { importKey, fileName: 'inventario.xlsx', fileSha256: 'a'.repeat(64), createdBy: empresa.userId };

    const primera = await claimImport({ ...input, now: new Date('2026-10-06T12:00:00Z') }, ambito(empresa));
    const segunda = await claimImport({ ...input, now: new Date('2026-10-06T12:05:00Z') }, ambito(empresa));

    expect(primera.kind).toBe('claimed');
    if (primera.kind !== 'claimed') return;
    expect(segunda).toEqual({ kind: 'already', importId: primera.importId, importedAt: new Date('2026-10-06T12:00:00Z') });
    expect(await prisma.inventoryImport.count({ where: { companyId: empresa.companyId, importKey } })).toBe(1);
  });

  it('R29: dos reservas simultaneas de la misma clave, solo una gana', async () => {
    const empresa = await nuevaEmpresa();
    const importKey = randomUUID();
    const input = { importKey, fileName: 'a.csv', fileSha256: 'b'.repeat(64), createdBy: empresa.userId, now: new Date() };

    const resultados = await Promise.all([claimImport(input, ambito(empresa)), claimImport(input, ambito(empresa))]);

    expect(resultados.map((r) => r.kind).sort()).toEqual(['already', 'claimed']);
    expect(new Set(resultados.map((r) => r.importId)).size).toBe(1);
  });

  it('R30: queda quien la hizo, cuando, el archivo y, al cerrar, las cuentas', async () => {
    const empresa = await nuevaEmpresa();
    const importKey = randomUUID();
    const reservada = await claimImport(
      {
        importKey,
        fileName: 'stock inicial.xlsx',
        fileSha256: 'c'.repeat(64),
        createdBy: empresa.userId,
        now: new Date('2026-10-06T09:00:00Z'),
      },
      ambito(empresa),
    );
    if (reservada.kind !== 'claimed') throw new Error('debia reservarse');

    const abierta = await prisma.inventoryImport.findUniqueOrThrow({ where: { id: reservada.importId } });
    expect(abierta).toMatchObject({ completedAt: null, rowsTotal: null });

    await finishImport(reservada.importId, totales, new Date('2026-10-06T09:01:00Z'), ambito(empresa));

    const cerrada = await prisma.inventoryImport.findUniqueOrThrow({ where: { id: reservada.importId } });
    expect(cerrada).toMatchObject({
      companyId: empresa.companyId,
      importKey,
      fileName: 'stock inicial.xlsx',
      fileSha256: 'c'.repeat(64),
      createdBy: empresa.userId,
      createdAt: new Date('2026-10-06T09:00:00Z'),
      completedAt: new Date('2026-10-06T09:01:00Z'),
      rowsTotal: 5,
      createdCount: 2,
      batchAddedCount: 1,
      duplicateCount: 1,
      errorCount: 1,
    });
  });

  it('R30: la base rechaza cuentas negativas y un cierre sin cuentas', async () => {
    const empresa = await nuevaEmpresa();
    const base = {
      companyId: empresa.companyId,
      fileName: 'x.csv',
      fileSha256: 'd'.repeat(64),
      createdBy: empresa.userId,
    };

    await expect(
      prisma.inventoryImport.create({ data: { ...base, importKey: randomUUID(), rowsTotal: -1 } }),
    ).rejects.toThrow(/inventory_imports_counts_non_negative/u);
    await expect(
      prisma.inventoryImport.create({ data: { ...base, importKey: randomUUID(), completedAt: new Date() } }),
    ).rejects.toThrow(/inventory_imports_completed_has_totals/u);
  });
});

async function escenarioTerminado(empresa: Empresa, content: string | null = '2.5') {
  const unitId = await sembrarUnidad(empresa);
  const presentationId = await sembrarPresentacion(empresa, unitId, { name: `Botella ${token().slice(0, 6)}`, content });
  const recipeName = `Desengrasante ${token().slice(0, 6)}`;
  const recipeId = await sembrarReceta(empresa, recipeName);
  const input: ImportedFinishedGoods = {
    recipeId,
    recipeName,
    presentationId,
    packages: 4,
    unitCost: '3.2500',
    lot: null,
    purchaseDate: '2026-09-30',
    expiryDate: '2027-09-30',
    createdBy: empresa.userId,
  };
  return { unitId, presentationId, recipeId, input };
}

describe('receiveImportedFinishedGoods — R16, R26: terminado importado', () => {
  it('R16: la primera vez crea el producto, el lote con package_content y el asiento opening; despues suma', async () => {
    const empresa = await nuevaEmpresa();
    const { unitId, presentationId, recipeId, input } = await escenarioTerminado(empresa);
    const now = new Date('2026-10-06T15:00:00Z');

    const primera = await receiveImportedFinishedGoods(input, now, ambito(empresa));
    if (primera.kind !== 'received') throw new Error(`esperaba received, llego ${primera.kind}`);
    expect(primera.created).toBe(true);

    const producto = await prisma.product.findUniqueOrThrow({ where: { id: primera.productId } });
    expect(producto).toMatchObject({
      type: PRODUCT_TYPES.FINISHED_PRODUCT,
      recipeId,
      presentationId,
      unitId,
      companyId: empresa.companyId,
    });
    expect(producto.stock.toFixed(4)).toBe('10.0000');

    const lote = await prisma.productBatch.findFirstOrThrow({ where: { productId: primera.productId, lot: primera.lot } });
    expect(lote.packageContent?.toFixed(4)).toBe('2.5000');
    expect(lote.stock.toFixed(4)).toBe('10.0000');
    expect(lote.unitCost?.toFixed(4)).toBe('3.2500');
    expect(lote.purchaseDate.toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(lote.expiryDate?.toISOString().slice(0, 10)).toBe('2027-09-30');
    expect(lote.createdBy).toBe(empresa.userId);

    const asientos = await prisma.inventoryMovement.findMany({ where: { batchId: lote.id } });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]).toMatchObject({ kind: 'opening', reason: null, orderId: null, createdBy: empresa.userId });
    expect(asientos[0]?.quantity.toFixed(4)).toBe('10.0000');

    const segunda = await receiveImportedFinishedGoods({ ...input, packages: 2 }, now, ambito(empresa));
    if (segunda.kind !== 'received') throw new Error(`esperaba received, llego ${segunda.kind}`);
    expect(segunda).toMatchObject({ productId: primera.productId, created: false });
    expect(segunda.lot).not.toBe(primera.lot);

    const despues = await prisma.product.findUniqueOrThrow({ where: { id: primera.productId } });
    expect(despues.stock.toFixed(4)).toBe('15.0000');
    expect(
      await prisma.product.count({ where: { companyId: empresa.companyId, recipeId, presentationId, deletedAt: null } }),
    ).toBe(1);
  });

  it('R18: un lote escrito a mano que ya existe devuelve duplicate_lot y no escribe nada', async () => {
    const empresa = await nuevaEmpresa();
    const { recipeId, input } = await escenarioTerminado(empresa);
    const lot = `LT-${token().slice(0, 8)}`;

    const primera = await receiveImportedFinishedGoods({ ...input, lot }, new Date(), ambito(empresa));
    expect(primera).toMatchObject({ kind: 'received', lot, created: true });
    const antes = await prisma.inventoryMovement.count({ where: { companyId: empresa.companyId } });

    const repetida = await receiveImportedFinishedGoods({ ...input, lot }, new Date(), ambito(empresa));

    expect(repetida).toEqual({ kind: 'duplicate_lot' });
    expect(await prisma.inventoryMovement.count({ where: { companyId: empresa.companyId } })).toBe(antes);
    const producto = await prisma.product.findFirstOrThrow({ where: { companyId: empresa.companyId, recipeId } });
    expect(producto.stock.toFixed(4)).toBe('10.0000');
  });

  it('R16: presentacion sin contenido devuelve presentation_without_content y no crea el producto', async () => {
    const empresa = await nuevaEmpresa();
    const { input } = await escenarioTerminado(empresa, null);

    const resultado = await receiveImportedFinishedGoods(input, new Date(), ambito(empresa));

    expect(resultado).toEqual({ kind: 'presentation_without_content' });
    expect(await prisma.product.count({ where: { companyId: empresa.companyId } })).toBe(0);
    expect(await prisma.productBatch.count({ where: { companyId: empresa.companyId } })).toBe(0);
  });
});
