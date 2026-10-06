/**
 * Producto terminado importado contra Postgres real: nace ligado a su formula y su presentacion,
 * con el nombre derivado, lotes con `package_content`, asiento de apertura y existencia.
 *
 * AISLAMIENTO: commit. `receiveImportedFinishedGoods` abre su propia transaccion con el cliente
 * Prisma GLOBAL. Cada caso fabrica su empresa efimera y `afterAll` la borra entera.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/shared/db/prisma';

import {
  borrarEmpresa,
  sembrarEmpresa,
  sembrarPresentacion,
  sembrarReceta,
  sembrarUnidad,
  token,
} from './inventory-import-fixture';
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
  const presentacion = `Garrafa ${token().slice(0, 8)}`;
  const presentacionId = await sembrarPresentacion(empresa, unitId, { name: presentacion, content: '2' });
  const sinContenido = `Suelta ${token().slice(0, 8)}`;
  await sembrarPresentacion(empresa, unitId, { name: sinContenido, content: null });
  const formula = `Formula ${token().slice(0, 8)}`;
  const recipeId = await sembrarReceta(empresa, formula);
  return { empresa, unitId, presentacion, presentacionId, sinContenido, formula, recipeId };
}

describe('producto terminado importado', () => {
  it('R16 crea el terminado ligado a la formula y despues le suma lotes, con package_content y asiento de apertura', async () => {
    const datos = await escenario();
    const { confirm, stockIncreases } = wireImport();
    const { companyId, userId } = datos.empresa;
    const lote = `T-${token().slice(0, 8)}`;

    const outcome = await confirm(
      {
        ...csvFile([
          { type: 'Producto terminado', formula: datos.formula, presentation: datos.presentacion, stock: '3', unitCost: '1,5', lot: lote },
          { type: 'Producto terminado', formula: datos.formula.toUpperCase(), presentation: datos.presentacion, stock: '2', totalCost: '8' },
        ]),
        importKey: crypto.randomUUID(),
      },
      actorOf(datos.empresa),
    );

    const result = outcome as InventoryImportResult;
    expect(result.rows.map((row) => [row.status, row.productName])).toEqual([
      ['created', `${datos.formula} · ${datos.presentacion}`],
      ['batch_added', `${datos.formula} · ${datos.presentacion}`],
    ]);

    const producto = await prisma.product.findFirstOrThrow({
      where: { companyId, recipeId: datos.recipeId },
      select: { id: true, name: true, type: true, presentationId: true, unitId: true, stock: true },
    });
    expect(producto).toMatchObject({
      name: `${datos.formula} · ${datos.presentacion}`,
      type: 'FINISHED_PRODUCT',
      presentationId: datos.presentacionId,
      unitId: datos.unitId,
    });
    expect(producto.stock.toString()).toBe('10');

    const lotes = await prisma.productBatch.findMany({
      where: { productId: producto.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, lot: true, stock: true, unitCost: true, packageContent: true, createdBy: true },
    });
    expect(lotes.map((batch) => [batch.stock.toString(), batch.unitCost?.toString(), batch.packageContent?.toString()])).toEqual([
      ['6', '1.5', '2'],
      ['4', '2', '2'],
    ]);
    expect(lotes[0]?.lot).toBe(lote);
    for (const batch of lotes) {
      expect(batch.createdBy).toBe(userId);
      const asiento = await prisma.inventoryMovement.findFirstOrThrow({ where: { batchId: batch.id } });
      expect(asiento.kind).toBe('opening');
      expect(asiento.quantity.toString()).toBe(batch.stock.toString());
    }
    expect(stockIncreases.onStockIncreased).toHaveBeenCalledTimes(2);
  });

  it('R16 formula inexistente o presentacion sin contenido quedan en error y no escriben', async () => {
    const datos = await escenario();
    const { confirm } = wireImport();
    const { companyId } = datos.empresa;

    const outcome = await confirm(
      {
        ...csvFile([
          { type: 'Producto terminado', formula: 'No existe', presentation: datos.presentacion, stock: '1', unitCost: '1' },
          { type: 'Producto terminado', formula: datos.formula, presentation: datos.sinContenido, stock: '1', unitCost: '1' },
        ]),
        importKey: crypto.randomUUID(),
      },
      actorOf(datos.empresa),
    );

    const result = outcome as InventoryImportResult;
    expect(result.rows.map((row) => (row.status === 'error' ? row.issues.map((issue) => issue.code) : row.status))).toEqual([
      ['formula_not_found'],
      ['presentation_without_content'],
    ]);
    expect(await prisma.product.count({ where: { companyId } })).toBe(0);
  });

  it('R16 una version de la formula no es una formula original', async () => {
    const datos = await escenario();
    const version = `Version ${token().slice(0, 8)}`;
    await prisma.recipe.create({
      data: {
        name: version,
        nameNormalized: version.toLowerCase().replace(/[^a-z0-9]/gu, ''),
        companyId: datos.empresa.companyId,
        parentRecipeId: datos.recipeId,
      },
    });
    const { preview } = wireImport();

    const outcome = await preview(
      csvFile([{ type: 'Producto terminado', formula: version, presentation: datos.presentacion, stock: '1', unitCost: '1' }]),
      actorOf(datos.empresa),
    );

    const row = outcome.kind === 'preview' ? outcome.rows[0] : undefined;
    expect(row?.status === 'error' && row.issues.map((issue) => issue.code)).toEqual(['formula_not_found']);
  });
});
