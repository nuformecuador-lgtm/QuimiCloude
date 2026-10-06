/**
 * Aislamiento por empresa de `inventory-import-prisma.ts` contra Postgres real: cada metodo,
 * llamado con el ambito de B, trata lo de A como inexistente y no lo toca. La vista previa,
 * con los catalogos reales, tampoco resuelve unidades, presentaciones ni formulas de A.
 *
 * AISLAMIENTO: el adaptador usa el cliente Prisma GLOBAL y abre sus propias transacciones, asi
 * que una transaccion del test no lo envolveria. Dos empresas efimeras (randomUUID) nacen en
 * `beforeAll` y `afterAll` las borra enteras por `company_id`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  claimImport,
  findAliveFinishedProducts,
  findAliveProductsByNormalizedNames,
  findBatchesByLots,
  finishImport,
  receiveImportedFinishedGoods,
} from '@/lib/modules/inventario/adapters/driven/persistence/inventory-import-prisma';
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
import { actorOf, csvFile, wireImport } from './inventory-import-wiring';

import type { Empresa } from './inventory-import-fixture';
import type { InventoryImportPreviewOutcome } from '@/lib/modules/inventario';
import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';

let A: Empresa;
let B: Empresa;
let unitId: string;
let presentacionA: string;
let recetaA: string;
let terminadoA: string;
let lote: string;
const nombre = `Glicerina ${token().slice(0, 8)}`;

function ambito(empresa: Empresa): InventoryScope {
  return { companyId: empresa.companyId };
}

beforeAll(async () => {
  A = await sembrarEmpresa();
  B = await sembrarEmpresa();
  unitId = await sembrarUnidad(A);
  presentacionA = await sembrarPresentacion(A, unitId, { content: '1' });
  recetaA = await sembrarReceta(A);
  const insumoA = await sembrarProducto(A, nombre, { unitId });
  terminadoA = await sembrarProducto(A, `Terminado ${token()}`, {
    type: PRODUCT_TYPES.FINISHED_PRODUCT,
    unitId,
    recipeId: recetaA,
    presentationId: presentacionA,
  });
  lote = `ISO-${token().slice(0, 10)}`;
  await sembrarLote(A, insumoA, lote);
});

afterAll(async () => {
  await borrarEmpresa(A);
  await borrarEmpresa(B);
  await prisma.$disconnect();
});

describe('R31: el adaptador de importacion no ve ni escribe en otra empresa', () => {
  it('R31: findAliveProductsByNormalizedNames no devuelve el homonimo de otra empresa', async () => {
    expect(await findAliveProductsByNormalizedNames([nombre], ambito(B))).toEqual([]);
    expect((await findAliveProductsByNormalizedNames([nombre], ambito(A))).length).toBe(1);
  });

  it('R31: findAliveFinishedProducts no devuelve el terminado de otra empresa', async () => {
    const par = [{ recipeId: recetaA, presentationId: presentacionA }];
    expect(await findAliveFinishedProducts(par, ambito(B))).toEqual([]);
    expect((await findAliveFinishedProducts(par, ambito(A))).map((ref) => ref.id)).toEqual([terminadoA]);
  });

  it('R31: findBatchesByLots no devuelve el lote de otra empresa', async () => {
    expect(await findBatchesByLots([lote], ambito(B))).toEqual([]);
    expect((await findBatchesByLots([lote], ambito(A))).length).toBe(1);
  });

  it('R31, R29: la misma clave en otra empresa es otra importacion', async () => {
    const importKey = randomUUID();
    const base = { importKey, fileName: 'a.csv', fileSha256: 'e'.repeat(64), now: new Date() };

    const enA = await claimImport({ ...base, createdBy: A.userId }, ambito(A));
    const enB = await claimImport({ ...base, createdBy: B.userId }, ambito(B));

    expect(enA.kind).toBe('claimed');
    expect(enB.kind).toBe('claimed');
    expect(enA.importId).not.toBe(enB.importId);
    const deB = await prisma.inventoryImport.findUniqueOrThrow({ where: { id: enB.importId } });
    expect(deB.companyId).toBe(B.companyId);
  });

  it('R31: finishImport con el ambito de otra empresa lanza y no cierra la importacion ajena', async () => {
    const reservada = await claimImport(
      { importKey: randomUUID(), fileName: 'a.csv', fileSha256: 'f'.repeat(64), createdBy: A.userId, now: new Date() },
      ambito(A),
    );
    const totales = { rows: 1, created: 1, batchAdded: 0, duplicate: 0, error: 0 };

    await expect(finishImport(reservada.importId, totales, new Date(), ambito(B))).rejects.toThrow(/no existe en la empresa/u);

    const fila = await prisma.inventoryImport.findUniqueOrThrow({ where: { id: reservada.importId } });
    expect(fila.completedAt).toBeNull();
    expect(fila.rowsTotal).toBeNull();
  });

  it('R31: receiveImportedFinishedGoods con una presentacion de otra empresa no escribe nada', async () => {
    const resultado = await receiveImportedFinishedGoods(
      {
        recipeId: recetaA,
        recipeName: 'Receta de A',
        presentationId: presentacionA,
        packages: 1,
        unitCost: '1',
        lot: null,
        purchaseDate: '2026-10-01',
        expiryDate: null,
        createdBy: B.userId,
      },
      new Date(),
      ambito(B),
    );

    expect(resultado).toEqual({ kind: 'presentation_without_content' });
    expect(await prisma.product.count({ where: { companyId: B.companyId } })).toBe(0);
    expect(await prisma.productBatch.count({ where: { companyId: B.companyId } })).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { companyId: B.companyId } })).toBe(0);
  });
});

async function sembrarUnidadDeEmpresa(empresa: Empresa, name: string): Promise<void> {
  const { id } = await prisma.unit.create({
    data: { name, nameNormalized: name.toLowerCase().replace(/[^a-z0-9]/gu, ''), companyId: empresa.companyId },
    select: { id: true },
  });
  empresa.unitIds.push(id);
}

function filaUnica(outcome: InventoryImportPreviewOutcome) {
  if (outcome.kind !== 'preview') throw new Error(`se esperaba una vista previa y llego ${outcome.kind}`);
  expect(outcome.rows).toHaveLength(1);
  const fila = outcome.rows[0]!;
  return { outcome, fila, codigos: fila.status === 'error' ? fila.issues.map((issue) => issue.code) : [] };
}

describe('R31: la vista previa trata los catalogos homonimos de otra empresa como inexistentes', () => {
  it('R31 una unidad de otra empresa con el mismo nombre sale como faltante y unit_not_found', async () => {
    const unidad = `Galon ${token().slice(0, 8)}`;
    await sembrarUnidadDeEmpresa(A, unidad);
    const { preview } = wireImport();

    const { outcome, fila, codigos } = filaUnica(
      await preview(csvFile([{ type: 'Insumo', name: 'Sal', unit: unidad, stock: '1', unitCost: '1', qtyAlert: '1' }]), actorOf(B)),
    );

    expect(fila.status).toBe('error');
    expect(codigos).toContain('unit_not_found');
    expect(outcome.missingUnits).toEqual([{ name: unidad, rowNumbers: [2] }]);
  });

  it('R31 una presentacion de otra empresa con el mismo nombre sale como faltante y presentation_not_found', async () => {
    const presentacion = `Bidon ${token().slice(0, 8)}`;
    await sembrarPresentacion(A, unitId, { name: presentacion });
    const { preview } = wireImport();

    const { outcome, fila, codigos } = filaUnica(
      await preview(
        csvFile([{ type: 'Envase', name: 'Bidon azul', presentation: presentacion, stock: '1', unitCost: '1', qtyAlert: '1' }]),
        actorOf(B),
      ),
    );

    expect(fila.status).toBe('error');
    expect(codigos).toContain('presentation_not_found');
    expect(outcome.missingPresentations).toEqual([{ name: presentacion, rowNumbers: [2] }]);
  });

  it('R31 una formula de otra empresa con el mismo nombre sale como formula_not_found', async () => {
    const formula = `Formula ${token().slice(0, 8)}`;
    await sembrarReceta(A, formula);
    const presentacionB = `Frasco ${token().slice(0, 8)}`;
    await sembrarPresentacion(B, await sembrarUnidad(B), { name: presentacionB });
    const { preview } = wireImport();

    const { outcome, fila, codigos } = filaUnica(
      await preview(
        csvFile([{ type: 'Producto terminado', formula, presentation: presentacionB, stock: '1', unitCost: '1' }]),
        actorOf(B),
      ),
    );

    expect(fila.status).toBe('error');
    expect(codigos).toEqual(['formula_not_found']);
    expect(outcome.missingPresentations).toEqual([]);
  });
});
