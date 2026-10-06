/**
 * Vista previa y confirmacion de la importacion contra Postgres real, con el alta manual de
 * producto como camino de escritura.
 *
 * AISLAMIENTO: commit. El alta manual y los adaptadores usan el cliente Prisma GLOBAL y cada
 * fila abre su propia transaccion: una transaccion del test no las envolveria. Cada caso fabrica
 * su empresa efimera y `afterAll` la borra entera por `company_id`.
 */
import { performance } from 'node:perf_hooks';

import { afterAll, describe, expect, it } from 'vitest';

import { inventario } from '@/lib/composition';
import { prisma } from '@/lib/shared/db/prisma';

import {
  borrarEmpresa,
  sembrarEmpresa,
  sembrarLote,
  sembrarPresentacion,
  sembrarProducto,
  sembrarUnidad,
  token,
} from './inventory-import-fixture';
import { actorOf, csvFile, wireImport } from './inventory-import-wiring';

import type { Empresa } from './inventory-import-fixture';
import type { ImportCells, InventoryImportResult } from '@/lib/modules/inventario';

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

async function conteos(companyId: string) {
  const [productos, lotes, asientos, importaciones] = await Promise.all([
    prisma.product.count({ where: { companyId } }),
    prisma.productBatch.count({ where: { companyId } }),
    prisma.inventoryMovement.count({ where: { companyId } }),
    prisma.inventoryImport.count({ where: { companyId } }),
  ]);
  return { productos, lotes, asientos, importaciones };
}

type Escenario = {
  readonly empresa: Empresa;
  readonly unidad: string;
  readonly presentacion: string;
  readonly existente: string;
  readonly loteExistente: string;
  readonly filas: Partial<ImportCells>[];
};

/** Insumo nuevo, homonimo existente, duplicado, fila con error, envase e instrumento. */
async function escenarioMixto(): Promise<Escenario> {
  const empresa = await nuevaEmpresa();
  const unitId = await sembrarUnidad(empresa);
  const unidad = (await prisma.unit.findUniqueOrThrow({ where: { id: unitId }, select: { name: true } })).name;
  const presentacionId = await sembrarPresentacion(empresa, unitId, { name: `Bidon ${token()}` });
  const presentacion = (await prisma.presentation.findUniqueOrThrow({ where: { id: presentacionId } })).name;
  const existente = await sembrarProducto(empresa, 'Sal existente', { unitId });
  const loteExistente = `EX-${token().slice(0, 8)}`;
  await sembrarLote(empresa, existente, loteExistente);

  const lote = `N-${token().slice(0, 8)}`;
  return {
    empresa,
    unidad,
    presentacion,
    existente,
    loteExistente,
    filas: [
      { type: 'Insumo', name: 'Sal nueva', unit: unidad, stock: '25', unitCost: '3,5', qtyAlert: '5', lot: lote },
      { type: 'Insumo', name: 'SAL EXISTENTE', unit: unidad, stock: '4', totalCost: '10', qtyAlert: '1' },
      { type: 'Insumo', name: 'Sal existente', unit: unidad, stock: '9', unitCost: '1', qtyAlert: '1', lot: loteExistente },
      { type: 'Insumo', name: 'Mal', unit: unidad, stock: 'abc', unitCost: '1', qtyAlert: '1' },
      { type: 'Envase', name: 'Bidon azul', presentation: presentacion, stock: '30', unitCost: '2', qtyAlert: '3' },
      { type: 'Instrumento', name: 'Balanza', stock: '1', purchaseDate: '15/01/2026' },
    ],
  };
}

describe('importacion de inventario contra la base', () => {
  it('R9 la vista previa no escribe nada en la base', async () => {
    const escenario = await escenarioMixto();
    const { preview } = wireImport();
    const antes = await conteos(escenario.empresa.companyId);

    const outcome = await preview(csvFile(escenario.filas), actorOf(escenario.empresa));

    expect(outcome.kind === 'preview' && outcome.rows.map((row) => row.status)).toEqual([
      'create',
      'add_batch',
      'duplicate',
      'error',
      'create',
      'create',
    ]);
    expect(await conteos(escenario.empresa.companyId)).toEqual(antes);
  });

  it('R7 R24 R26 al volver, las filas validas estan escritas con su lote, asiento de apertura, existencia y aviso', async () => {
    const escenario = await escenarioMixto();
    const { confirm, stockIncreases } = wireImport();
    const { companyId, userId } = escenario.empresa;
    const antes = await conteos(companyId);

    const outcome = await confirm(
      { ...csvFile(escenario.filas), importKey: crypto.randomUUID() },
      actorOf(escenario.empresa),
    );

    expect(outcome.kind).toBe('imported');
    const result = outcome as InventoryImportResult;
    expect(result.rows.map((row) => row.status)).toEqual(['created', 'batch_added', 'duplicate', 'error', 'created', 'created']);
    expect(result.totals).toEqual({ rows: 6, created: 3, batchAdded: 1, duplicate: 1, error: 1 });

    // Sin nada pendiente: todo lo de la confirmacion ya esta en la base cuando la llamada vuelve.
    expect(await conteos(companyId)).toEqual({
      productos: antes.productos + 3,
      lotes: antes.lotes + 4,
      asientos: antes.asientos + 4,
      importaciones: antes.importaciones + 1,
    });
    expect(stockIncreases.onStockIncreased).toHaveBeenCalledTimes(4);

    for (const row of result.rows) {
      if (row.status !== 'created' && row.status !== 'batch_added') continue;
      const batch = await prisma.productBatch.findFirstOrThrow({
        where: { companyId, productId: row.productId, lot: row.lot },
        select: { id: true, stock: true, createdBy: true },
      });
      const asiento = await prisma.inventoryMovement.findFirstOrThrow({
        where: { batchId: batch.id },
        select: { kind: true, quantity: true, createdBy: true },
      });
      expect(asiento).toEqual({ kind: 'opening', quantity: batch.stock, createdBy: userId });
      expect(batch.createdBy).toBe(userId);
    }

    const existente = await prisma.product.findUniqueOrThrow({ where: { id: escenario.existente }, select: { stock: true } });
    expect(existente.stock.toString()).toBe('5');
    const sumado = result.rows[1];
    expect(sumado?.status === 'batch_added' && sumado.productId).toBe(escenario.existente);
    const balanza = await prisma.productBatch.findFirstOrThrow({
      where: { companyId, product: { name: 'Balanza' } },
      select: { purchaseDate: true },
    });
    expect(balanza.purchaseDate.toISOString().slice(0, 10)).toBe('2026-01-15');
  });

  it('R27 una fila que falla al escribir no deshace las ya escritas y las siguientes se escriben', async () => {
    const escenario = await escenarioMixto();
    const base = wireImport();
    let llamada = 0;
    const { confirm } = wireImport({
      createProduct: async (input, actor) => {
        llamada += 1;
        if (llamada === 2) throw new Error('fallo simulado de escritura');
        return base.manualCreate(input, actor);
      },
    });
    const { companyId } = escenario.empresa;

    const outcome = await confirm(
      { ...csvFile(escenario.filas), importKey: crypto.randomUUID() },
      actorOf(escenario.empresa),
    );

    const result = outcome as InventoryImportResult;
    expect(result.rows.map((row) => row.status)).toEqual(['created', 'error', 'duplicate', 'error', 'created', 'created']);
    const fallida = result.rows[1];
    expect(fallida?.status === 'error' && fallida.issues.map((issue) => issue.code)).toEqual(['write_failed']);
    expect(await prisma.product.count({ where: { companyId, name: { in: ['Sal nueva', 'Bidon azul', 'Balanza'] } } })).toBe(3);
    expect(await prisma.productBatch.count({ where: { companyId, productId: escenario.existente } })).toBe(1);
  });

  it('R25 R18 la confirmacion revalida: un lote escrito despues de la vista previa sale duplicado', async () => {
    const escenario = await escenarioMixto();
    const { preview, confirm } = wireImport();
    const archivo = csvFile(escenario.filas.slice(0, 1));
    const actor = actorOf(escenario.empresa);

    const vista = await preview(archivo, actor);
    expect(vista.kind === 'preview' && vista.rows[0]?.status).toBe('create');
    await confirm({ ...archivo, importKey: crypto.randomUUID() }, actor);

    const segunda = await confirm({ ...archivo, importKey: crypto.randomUUID() }, actor);
    // Su unica fila ya no es valida: no queda nada que importar.
    expect(segunda.kind === 'nothing_imported' && segunda.rows[0]?.status).toBe('duplicate');
  });

  it.skipIf(process.env.QC209_MEDIR_2000 !== '1')(
    'R7 medida: confirmar 2.000 filas en la misma peticion, con el alta y el aviso de pedidos reales',
    async () => {
      const empresa = await nuevaEmpresa();
      const unitId = await sembrarUnidad(empresa);
      const unidad = (await prisma.unit.findUniqueOrThrow({ where: { id: unitId }, select: { name: true } })).name;
      const filas: Partial<ImportCells>[] = Array.from({ length: 2000 }, (_, index) => ({
        type: 'Insumo',
        name: `Insumo medida ${index % 500}`,
        unit: unidad,
        stock: '10',
        unitCost: '1,25',
        qtyAlert: '2',
        lot: index % 2 === 0 ? `M-${index}` : '',
      }));
      const { confirm } = wireImport({ createProduct: inventario.createProduct });
      const archivo = { ...csvFile(filas), importKey: crypto.randomUUID() };

      const inicio = performance.now();
      const outcome = await confirm(archivo, actorOf(empresa));
      const segundos = (performance.now() - inicio) / 1000;

      console.log(`medida de la importacion: 2000 filas confirmadas en ${segundos.toFixed(1)} s`, JSON.stringify((outcome as InventoryImportResult).totals));
      expect((outcome as InventoryImportResult).totals).toEqual({ rows: 2000, created: 500, batchAdded: 1500, duplicate: 0, error: 0 });
      expect(await prisma.productBatch.count({ where: { companyId: empresa.companyId } })).toBe(2000);
    },
    600_000,
  );
});
