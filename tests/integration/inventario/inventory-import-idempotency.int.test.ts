/**
 * Doble confirmacion y registro de la importacion contra Postgres real.
 *
 * AISLAMIENTO: commit. La reserva de la clave y cada fila escriben con el cliente Prisma GLOBAL
 * en sus propias transacciones. Cada caso fabrica su empresa efimera y `afterAll` la borra entera.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/shared/db/prisma';

import { borrarEmpresa, sembrarEmpresa, sembrarUnidad, token } from './inventory-import-fixture';
import { actorOf, csvFile, wireImport } from './inventory-import-wiring';

import type { Empresa } from './inventory-import-fixture';
import type { InventoryImportResult } from '@/lib/modules/inventario';

const empresas: Empresa[] = [];

afterAll(async () => {
  for (const empresa of empresas) await borrarEmpresa(empresa);
  await prisma.$disconnect();
});

async function escenario() {
  const empresa = await sembrarEmpresa();
  empresas.push(empresa);
  const unitId = await sembrarUnidad(empresa);
  const unidad = (await prisma.unit.findUniqueOrThrow({ where: { id: unitId }, select: { name: true } })).name;
  const archivo = csvFile(
    [
      { type: 'Insumo', name: 'Sal', unit: unidad, stock: '5', unitCost: '1', qtyAlert: '1', lot: `I-${token().slice(0, 8)}` },
      { type: 'Insumo', name: 'Azucar', unit: unidad, stock: '5', unitCost: '1', qtyAlert: '1' },
      { type: 'Insumo', name: 'Mal', unit: unidad, stock: 'x', unitCost: '1', qtyAlert: '1' },
    ],
    'compras-octubre.csv',
  );
  return { empresa, archivo };
}

describe('idempotencia y registro de la importacion', () => {
  it('R29 la misma clave dos veces escribe solo la primera y responde que ya se hizo', async () => {
    const { empresa, archivo } = await escenario();
    const { confirm, createProduct } = wireImport();
    const importKey = crypto.randomUUID();

    const primera = (await confirm({ ...archivo, importKey }, actorOf(empresa))) as InventoryImportResult;
    const lotes = await prisma.productBatch.count({ where: { companyId: empresa.companyId } });
    const asientos = await prisma.inventoryMovement.count({ where: { companyId: empresa.companyId } });
    const segunda = await confirm({ ...archivo, importKey }, actorOf(empresa));

    expect(segunda).toEqual({ kind: 'already_imported', importId: primera.importId, importedAt: primera.importedAt });
    expect(createProduct).toHaveBeenCalledTimes(2);
    expect(await prisma.productBatch.count({ where: { companyId: empresa.companyId } })).toBe(lotes);
    expect(await prisma.inventoryMovement.count({ where: { companyId: empresa.companyId } })).toBe(asientos);
    expect(lotes).toBe(2);
  });

  it('R29 con otra clave es otra importacion: la fila con lote sale duplicada y la de lote vacio suma otro', async () => {
    const { empresa, archivo } = await escenario();
    const { confirm } = wireImport();

    await confirm({ ...archivo, importKey: crypto.randomUUID() }, actorOf(empresa));
    const otra = (await confirm({ ...archivo, importKey: crypto.randomUUID() }, actorOf(empresa))) as InventoryImportResult;

    expect(otra.rows.map((row) => row.status)).toEqual(['duplicate', 'batch_added', 'error']);
    expect(await prisma.inventoryImport.count({ where: { companyId: empresa.companyId } })).toBe(2);
  });

  it('R30 deja registrado quien, cuando, el archivo y las filas por resultado', async () => {
    const { empresa, archivo } = await escenario();
    const { confirm } = wireImport();
    const importKey = crypto.randomUUID();

    const result = (await confirm({ ...archivo, importKey }, actorOf(empresa))) as InventoryImportResult;

    const registro = await prisma.inventoryImport.findFirstOrThrow({ where: { companyId: empresa.companyId, importKey } });
    expect(registro).toMatchObject({
      id: result.importId,
      fileName: 'compras-octubre.csv',
      createdBy: empresa.userId,
      rowsTotal: 3,
      createdCount: 2,
      batchAddedCount: 0,
      duplicateCount: 0,
      errorCount: 1,
    });
    expect(registro.fileSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(registro.createdAt.toISOString()).toBe(result.importedAt);
    expect(registro.finishedAt).not.toBeNull();
  });
});
