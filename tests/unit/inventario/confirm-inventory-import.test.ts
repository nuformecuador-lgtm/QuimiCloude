import { describe, expect, it, vi } from 'vitest';

import { createConfirmInventoryImport } from '@/lib/modules/inventario/domain/confirm-inventory-import';
import { ActionNotAllowedError, BatchDuplicateLotError, UnauthorizedError } from '@/lib/modules/inventario/domain/errors';

import {
  CSV_FILE,
  fakeReader,
  fakeReadPorts,
  FORMULA,
  BOTELLA,
  KG,
  NOW,
  productRef,
  ROW_ENVASE,
  ROW_INSTRUMENTO,
  ROW_INSUMO,
  ROW_TERMINADO,
} from './inventory-import-kit';

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import type { ImportCells, ImportResultRow } from '@/lib/modules/inventario';

const ADMIN: Actor = { id: 'user-1', companyId: 'company-1', permissions: ['inventario.modificar'] };
const KEY = '9b2f6a52-5d0e-4c7e-9a36-0f1d7c1b2a10';
const FILE = { ...CSV_FILE, importKey: KEY };

function build(rows: readonly Partial<ImportCells>[], state: Parameters<typeof fakeReadPorts>[0] = {}) {
  const ports = fakeReadPorts(state);
  const reader = fakeReader(rows);
  let counter = 0;
  const createProduct = vi.fn(async (input: unknown) => {
    counter += 1;
    const lot = (input as { lot?: string | null }).lot;
    return { id: `p-${counter}`, lot: lot ?? `GEN-${counter}` };
  });
  const stockIncreases = { onStockIncreased: vi.fn(async () => undefined) };
  const digest = { sha256Hex: vi.fn(async () => 'a'.repeat(64)) };
  const confirm = createConfirmInventoryImport({ ...ports, reader, createProduct, stockIncreases, digest, now: () => NOW });
  return { confirm, reader, createProduct, stockIncreases, digest, ...ports };
}

function statuses(rows: readonly ImportResultRow[]): string[] {
  return rows.map((row) => (row.status === 'error' ? `error:${row.issues.map((i) => i.code).join(',')}` : row.status));
}

describe('confirmInventoryImport — permiso', () => {
  it.each([
    ['sin sesion', null],
    ['sin inventario.modificar', { ...ADMIN, permissions: ['unidades.modificar'] }],
  ] as const)('R1 %s rechaza con unauthorized sin leer, consultar ni escribir', async (_caso, actor) => {
    const { confirm, reader, createProduct, imports, stockIncreases, digest } = build([ROW_INSUMO]);

    await expect(confirm(FILE, actor)).rejects.toBeInstanceOf(UnauthorizedError);

    for (const spy of [reader.read, digest.sha256Hex, createProduct, stockIncreases.onStockIncreased, ...Object.values(imports)]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe('confirmInventoryImport — que se escribe', () => {
  it('R24 escribe solo las filas crear o sumar lote; las duplicadas y en error no', async () => {
    const existing = productRef({ id: 'p-sal', nameNormalized: 'salfina', unitId: KG.id });
    const { confirm, createProduct } = build(
      [ROW_INSUMO, { ...ROW_INSUMO, lot: 'L-1' }, { ...ROW_INSUMO, stock: 'x' }, ROW_ENVASE, { ...ROW_INSUMO, unit: 'Galón' }],
      { products: [existing], batches: [{ lot: 'L-1', productId: 'p-sal' }] },
    );

    const outcome = await confirm(FILE, ADMIN);

    expect(outcome.kind).toBe('imported');
    if (outcome.kind !== 'imported') return;
    expect(statuses(outcome.rows)).toEqual([
      'batch_added',
      'duplicate',
      'error:stock_invalid',
      'created',
      'error:unit_not_found',
    ]);
    expect(createProduct).toHaveBeenCalledTimes(2);
    expect(outcome.totals).toEqual({ rows: 5, created: 1, batchAdded: 1, duplicate: 1, error: 2 });
  });

  it('R24 sin ninguna fila valida no escribe ningun lote ni avisa de existencias', async () => {
    const { confirm, createProduct, imports, stockIncreases } = build([{ ...ROW_INSUMO, stock: 'x' }, { ...ROW_TERMINADO, formula: 'Jabon' }]);

    const outcome = await confirm(FILE, ADMIN);

    expect(outcome).toMatchObject({ kind: 'imported', totals: { rows: 2, error: 2, created: 0, batchAdded: 0 } });
    expect(createProduct).not.toHaveBeenCalled();
    expect(imports.receiveImportedFinishedGoods).not.toHaveBeenCalled();
    expect(stockIncreases.onStockIncreased).not.toHaveBeenCalled();
  });

  it('R25 vuelve a validar contra la base del momento: lo que cambio desde la vista previa se refleja', async () => {
    const state: Parameters<typeof fakeReadPorts>[0] = { products: [], batches: [] };
    const { confirm, createProduct } = build([{ ...ROW_INSUMO, lot: 'L-9' }, { ...ROW_INSTRUMENTO, lot: 'L-8' }], state);
    state.products = [productRef({ id: 'p-sal', nameNormalized: 'salfina', unitId: KG.id })];
    state.batches = [
      { lot: 'L-9', productId: 'p-sal' },
      { lot: 'L-8', productId: 'p-ajeno' },
    ];

    const outcome = await confirm(FILE, ADMIN);

    expect(outcome.kind === 'imported' && statuses(outcome.rows)).toEqual(['duplicate', 'error:lot_used_by_other_product']);
    expect(createProduct).not.toHaveBeenCalled();
  });

  it('R26 insumo, envase e instrumento pasan por el alta manual con la unidad y la presentacion ya resueltas', async () => {
    const { confirm, createProduct } = build([{ ...ROW_INSUMO, lot: 'L-1' }, ROW_ENVASE, ROW_INSTRUMENTO]);

    const outcome = await confirm(FILE, ADMIN);

    expect(createProduct.mock.calls).toEqual([
      [expect.objectContaining({ type: 'PRODUCT', name: 'Sal fina', unitId: KG.id, stock: '25', unitCost: '3.5', lot: 'L-1' }), ADMIN],
      [expect.objectContaining({ type: 'PACKAGING', name: 'Bidón', presentationId: expect.any(String), totalCost: '100' }), ADMIN],
      [expect.objectContaining({ type: 'MACHINE', name: 'Balanza', stock: '1' }), ADMIN],
    ]);
    expect(outcome.kind === 'imported' && outcome.rows.map((row) => row.status === 'created' && [row.productId, row.lot])).toEqual([
      ['p-1', 'L-1'],
      ['p-2', 'GEN-2'],
      ['p-3', 'GEN-3'],
    ]);
  });

  it('R26 el terminado entra con quien importa como autor, el costo resuelto y aviso de existencias', async () => {
    const { confirm, imports, stockIncreases } = build([{ ...ROW_TERMINADO, unitCost: '', totalCost: '24', lot: 'T-1' }]);

    const outcome = await confirm(FILE, ADMIN);

    expect(imports.receiveImportedFinishedGoods).toHaveBeenCalledWith(
      {
        recipeId: FORMULA.id,
        recipeName: FORMULA.name,
        presentationId: BOTELLA.id,
        packages: 12,
        unitCost: '2.0000',
        lot: 'T-1',
        purchaseDate: '2026-10-06',
        expiryDate: null,
        createdBy: ADMIN.id,
      },
      NOW,
      { companyId: ADMIN.companyId },
    );
    expect(stockIncreases.onStockIncreased).toHaveBeenCalledWith({ companyId: ADMIN.companyId, now: NOW });
    expect(outcome.kind === 'imported' && outcome.rows[0]).toMatchObject({ status: 'created', productId: 'terminado-1', lot: 'L-T' });
  });

  it('R27 una fila que falla al escribir queda en error y las demas se escriben', async () => {
    const { confirm, createProduct } = build([
      { ...ROW_INSUMO, name: 'Uno' },
      { ...ROW_INSUMO, name: 'Dos' },
      { ...ROW_INSUMO, name: 'Tres' },
    ]);
    createProduct.mockImplementationOnce(async () => ({ id: 'p-uno', lot: 'A' }));
    createProduct.mockImplementationOnce(async () => {
      throw new Error('conexion perdida');
    });

    const outcome = await confirm(FILE, ADMIN);

    expect(outcome.kind === 'imported' && statuses(outcome.rows)).toEqual(['created', 'error:write_failed', 'created']);
    expect(createProduct).toHaveBeenCalledTimes(3);
    const failed = outcome.kind === 'imported' ? outcome.rows[1] : undefined;
    expect(failed?.status === 'error' && failed.issues[0]).toMatchObject({ code: 'write_failed', column: null });
  });

  it('R27 los rechazos del alta manual se traducen a su motivo', async () => {
    const { confirm, createProduct, imports } = build([
      { ...ROW_INSUMO, lot: 'L-1' },
      ROW_ENVASE,
      { ...ROW_INSUMO, name: 'Otro', unit: 'Litro' },
    ]);
    createProduct.mockRejectedValueOnce(new BatchDuplicateLotError());
    createProduct.mockRejectedValueOnce(new ActionNotAllowedError());
    createProduct.mockRejectedValueOnce(new ActionNotAllowedError());
    imports.findBatchesByLots.mockResolvedValueOnce([]).mockResolvedValue([{ lot: 'L-1', productId: 'p-ajeno' }]);

    const outcome = await confirm(FILE, ADMIN);

    expect(outcome.kind === 'imported' && statuses(outcome.rows)).toEqual([
      'error:lot_used_by_other_product',
      'error:presentation_mismatch',
      'error:finished_product_homonym',
    ]);
  });

  it('R27 un lote que choca al escribir sobre el mismo producto es duplicado', async () => {
    const existing = productRef({ id: 'p-sal', nameNormalized: 'salfina', unitId: KG.id });
    const { confirm, createProduct, imports } = build([{ ...ROW_INSUMO, lot: 'L-5' }], { products: [existing] });
    createProduct.mockRejectedValueOnce(new BatchDuplicateLotError());
    imports.findBatchesByLots.mockResolvedValueOnce([]).mockResolvedValueOnce([{ lot: 'L-5', productId: 'p-sal' }]);

    const outcome = await confirm(FILE, ADMIN);

    expect(outcome.kind === 'imported' && outcome.rows[0]).toMatchObject({ status: 'duplicate', lot: 'L-5' });
  });
});

describe('confirmInventoryImport — registro de la importacion', () => {
  it('R29 reserva la clave antes de la primera escritura y cierra el registro con las cuentas', async () => {
    const order: string[] = [];
    const { confirm, createProduct, imports } = build([ROW_INSUMO, { ...ROW_INSUMO, stock: 'x' }]);
    imports.claimImport.mockImplementation(async () => {
      order.push('claim');
      return { kind: 'claimed', importId: 'import-7' };
    });
    createProduct.mockImplementation(async () => {
      order.push('write');
      return { id: 'p-1', lot: 'A' };
    });
    imports.finishImport.mockImplementation(async () => {
      order.push('finish');
    });

    const outcome = await confirm(FILE, ADMIN);

    expect(order).toEqual(['claim', 'write', 'finish']);
    expect(imports.claimImport).toHaveBeenCalledWith(
      {
        importKey: KEY,
        fileName: 'inventario.csv',
        fileSha256: 'a'.repeat(64),
        createdBy: ADMIN.id,
        now: NOW,
      },
      { companyId: ADMIN.companyId },
    );
    expect(imports.finishImport).toHaveBeenCalledWith(
      'import-7',
      { rows: 2, created: 1, batchAdded: 0, duplicate: 0, error: 1 },
      NOW,
      { companyId: ADMIN.companyId },
    );
    expect(outcome).toMatchObject({ kind: 'imported', importId: 'import-7', importedAt: NOW.toISOString() });
  });

  it('R29 una clave ya usada responde que la importacion ya se hizo sin escribir nada', async () => {
    const { confirm, createProduct, imports, stockIncreases } = build([ROW_INSUMO, ROW_TERMINADO]);
    imports.claimImport.mockResolvedValueOnce({
      kind: 'already',
      importId: 'import-1',
      importedAt: new Date('2026-10-05T10:00:00.000Z'),
    });

    const outcome = await confirm(FILE, ADMIN);

    expect(outcome).toEqual({ kind: 'already_imported', importId: 'import-1', importedAt: '2026-10-05T10:00:00.000Z' });
    expect(createProduct).not.toHaveBeenCalled();
    expect(imports.receiveImportedFinishedGoods).not.toHaveBeenCalled();
    expect(imports.finishImport).not.toHaveBeenCalled();
    expect(stockIncreases.onStockIncreased).not.toHaveBeenCalled();
  });

  it('R4 un archivo rechazado no reserva la clave ni escribe', async () => {
    const { confirm, imports, createProduct } = build([ROW_INSUMO]);
    const outcome = await confirm({ ...FILE, fileName: 'inventario.txt' }, ADMIN);
    expect(outcome).toEqual({ kind: 'file_rejected', rejection: { code: 'unsupported_format' } });
    expect(imports.claimImport).not.toHaveBeenCalled();
    expect(createProduct).not.toHaveBeenCalled();
  });
});
