import { describe, expect, it } from 'vitest';

import { UnauthorizedError } from '@/lib/modules/inventario/domain/errors';
import { createPreviewInventoryImport } from '@/lib/modules/inventario/domain/preview-inventory-import';

import {
  CSV_FILE,
  fakeReader,
  fakeReadPorts,
  KG,
  NOW,
  productRef,
  ROW_ENVASE,
  ROW_INSTRUMENTO,
  ROW_INSUMO,
  ROW_TERMINADO,
} from './inventory-import-kit';

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import type { ImportCells } from '@/lib/modules/inventario';

const ADMIN: Actor = { id: 'user-1', companyId: 'company-1', permissions: ['inventario.modificar', 'unidades.modificar'] };

function build(rows: readonly Partial<ImportCells>[], state: Parameters<typeof fakeReadPorts>[0] = {}) {
  const ports = fakeReadPorts(state);
  const reader = fakeReader(rows);
  const preview = createPreviewInventoryImport({ ...ports, reader, now: () => NOW });
  return { preview, reader, ...ports };
}

describe('previewInventoryImport — permiso', () => {
  const sinPermiso: [string, Actor | null | undefined][] = [
    ['sin sesion', null],
    ['sin actor', undefined],
    ['sin inventario.modificar', { ...ADMIN, permissions: ['inventario.consultar', 'unidades.modificar'] }],
  ];

  it.each(sinPermiso)('R1 %s rechaza con unauthorized sin leer el archivo ni consultar el inventario', async (_caso, actor) => {
    const { preview, reader, imports, units, presentations, formulas } = build([ROW_INSUMO]);

    await expect(preview(CSV_FILE, actor)).rejects.toBeInstanceOf(UnauthorizedError);

    const spies = [
      reader.read,
      ...Object.values(imports),
      units.listVisibleRefs,
      presentations.findByNormalizedNames,
      presentations.findRefs,
      formulas.findAliveOriginalByName,
    ];
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('previewInventoryImport — resultado', () => {
  it('R9 devuelve cada fila con su estado y los totales, y no escribe nada', async () => {
    const existing = productRef({ id: 'p-sal', nameNormalized: 'salfina', unitId: KG.id });
    const { preview, imports } = build(
      [ROW_INSUMO, { ...ROW_INSUMO, lot: 'L-1' }, ROW_ENVASE, ROW_INSTRUMENTO, ROW_TERMINADO, { ...ROW_INSUMO, stock: 'x' }],
      { products: [existing], batches: [{ lot: 'L-1', productId: 'p-sal' }] },
    );

    const outcome = await preview(CSV_FILE, ADMIN);

    expect(outcome.kind).toBe('preview');
    if (outcome.kind !== 'preview') return;
    expect(outcome.fileName).toBe('inventario.csv');
    expect(outcome.format).toBe('csv');
    expect(outcome.rows.map((row) => row.status)).toEqual(['add_batch', 'duplicate', 'create', 'create', 'create', 'error']);
    expect(outcome.totals).toEqual({ rows: 6, create: 3, addBatch: 1, duplicate: 1, error: 1 });
    expect(imports.claimImport).not.toHaveBeenCalled();
    expect(imports.finishImport).not.toHaveBeenCalled();
    expect(imports.receiveImportedFinishedGoods).not.toHaveBeenCalled();
  });

  it('R9 lee la base en lote: una consulta por tipo de dato, no una por fila', async () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({ ...ROW_INSUMO, name: `Insumo ${index}`, lot: `L-${index}` }));
    const { preview, imports, units, presentations } = build([...rows, ROW_TERMINADO, ROW_ENVASE]);

    await preview(CSV_FILE, ADMIN);

    expect(imports.findAliveProductsByNormalizedNames).toHaveBeenCalledTimes(1);
    expect(imports.findBatchesByLots).toHaveBeenCalledTimes(1);
    expect(imports.findAliveFinishedProducts).toHaveBeenCalledTimes(1);
    expect(units.listVisibleRefs).toHaveBeenCalledTimes(1);
    expect(presentations.findByNormalizedNames).toHaveBeenCalledTimes(1);
    expect(imports.findAliveProductsByNormalizedNames).toHaveBeenCalledWith(
      expect.arrayContaining(['Insumo 0', 'Insumo 39']),
      { companyId: 'company-1' },
    );
  });

  it('R20 lista los faltantes aparte y ofrece crearlos segun los permisos del alta normal', async () => {
    const rows = [{ ...ROW_INSUMO, unit: 'Galón' }, { ...ROW_ENVASE, presentation: 'Garrafa' }];

    const conTodo = await build(rows).preview(CSV_FILE, ADMIN);
    const sinUnidades = await build(rows).preview(CSV_FILE, { ...ADMIN, permissions: ['inventario.modificar'] });

    expect(conTodo).toMatchObject({
      missingUnits: [{ name: 'Galón', rowNumbers: [2] }],
      missingPresentations: [{ name: 'Garrafa', rowNumbers: [3] }],
      canCreateUnits: true,
      canCreatePresentations: true,
    });
    expect(sinUnidades).toMatchObject({ canCreateUnits: false, canCreatePresentations: true });
  });

  it('R22 la vista previa no crea unidades ni presentaciones: los puertos que usa solo leen', async () => {
    const { preview, units, presentations } = build([{ ...ROW_INSUMO, unit: 'Galón' }]);
    await preview(CSV_FILE, ADMIN);
    expect(Object.keys(units)).toEqual(['listVisibleRefs']);
    expect(Object.keys(presentations).sort()).toEqual(['findByNormalizedNames', 'findRefs']);
  });

  it('R4 un archivo con otra extension se rechaza entero sin leerlo', async () => {
    const { preview, reader } = build([ROW_INSUMO]);
    const outcome = await preview({ fileName: 'inventario.pdf', bytes: CSV_FILE.bytes }, ADMIN);
    expect(outcome).toEqual({ kind: 'file_rejected', rejection: { code: 'unsupported_format' } });
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('R5 una cabecera rechazada no consulta el inventario', async () => {
    const { preview, reader, imports } = build([]);
    reader.read.mockResolvedValueOnce({ kind: 'ok', rows: [[{ text: 'Tipo', origin: 'text' }]] });
    const outcome = await preview(CSV_FILE, ADMIN);
    expect(outcome).toMatchObject({ kind: 'file_rejected', rejection: { code: 'missing_columns' } });
    expect(imports.findAliveProductsByNormalizedNames).not.toHaveBeenCalled();
  });
});
