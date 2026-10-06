import { describe, expect, it } from 'vitest';

import { planInventoryImport } from '@/lib/modules/inventario/domain/plan-inventory-import';

import {
  BIDON,
  BOTELLA,
  FORMULA,
  KG,
  LITRO,
  productRef,
  ROW_ENVASE,
  ROW_INSTRUMENTO,
  ROW_INSUMO,
  ROW_TERMINADO,
  row,
  sheet,
  snapshot,
  TODAY,
} from './inventory-import-kit';

import type { ImportPreviewRow, ImportRowIssueCode } from '@/lib/modules/inventario';
import type { ImportCatalogSnapshot } from '@/lib/modules/inventario/domain/plan-inventory-import';
import type { ParsedImportSheet } from '@/lib/modules/inventario/domain/import-sheet';

function plan(parsed: ParsedImportSheet, catalog: ImportCatalogSnapshot = snapshot()) {
  return planInventoryImport(parsed, catalog, TODAY);
}

function codes(previewRow: ImportPreviewRow | undefined): [ImportRowIssueCode, string | null][] {
  if (previewRow?.status !== 'error') return [];
  return previewRow.issues.map((issue) => [issue.code, issue.column]);
}

describe('planInventoryImport — un estado por fila', () => {
  it('R9 asigna a cada fila exactamente un estado y conserva el orden y el numero de fila', () => {
    const existing = productRef({ id: 'p-sal', nameNormalized: 'salfina', unitId: KG.id });
    const result = plan(
      sheet(
        { ...ROW_INSUMO, name: 'Ácido cítrico' },
        ROW_INSUMO,
        { ...ROW_INSUMO, lot: 'L-1' },
        { ...ROW_INSUMO, stock: 'abc' },
      ),
      snapshot({ products: [existing], batches: [{ lot: 'L-1', productId: 'p-sal' }] }),
    );

    expect(result.rows.map((r) => [r.rowNumber, r.status])).toEqual([
      [2, 'create'],
      [3, 'add_batch'],
      [4, 'duplicate'],
      [5, 'error'],
    ]);
    expect([...result.writes.keys()]).toEqual([2, 3]);
  });

  it('R9 «Tipo» vacio o desconocido deja la fila en error sin tipo', () => {
    const result = plan(sheet({ ...ROW_INSUMO, type: '' }, { ...ROW_INSUMO, type: 'Reactivo' }));
    for (const previewRow of result.rows) {
      expect(previewRow.type).toBeNull();
      expect(codes(previewRow)).toEqual([['type_invalid', 'type']]);
    }
  });

  it('R9 el tipo se lee sin mayusculas, tildes ni espacios de los extremos', () => {
    const result = plan(sheet({ ...ROW_TERMINADO, type: '  PRODUCTO TERMINÁDO ' }));
    expect(result.rows[0]?.type).toBe('FINISHED_PRODUCT');
  });
});

describe('planInventoryImport — reglas de campo del alta manual', () => {
  it('R10 un motivo por cada regla incumplida, cada uno con su columna', () => {
    const result = plan(
      sheet({ ...ROW_INSUMO, name: 'x'.repeat(201), stock: 'abc', unitCost: '0', qtyAlert: '-1', lot: '9'.repeat(60) }),
    );
    expect(codes(result.rows[0])).toEqual([
      ['name_too_long', 'name'],
      ['stock_invalid', 'stock'],
      ['cost_invalid', 'unitCost'],
      ['lot_invalid', 'lot'],
      ['qty_alert_invalid', 'qtyAlert'],
    ]);
  });

  it('R10 el mensaje nombra la columna afectada', () => {
    const result = plan(sheet({ ...ROW_INSUMO, stock: 'abc' }));
    const previewRow = result.rows[0];
    expect(previewRow?.status === 'error' && previewRow.issues[0]?.message).toMatch(/^Existencia: /u);
  });

  it('R10 sin ningun costo pide uno, una sola vez', () => {
    const result = plan(sheet({ ...ROW_INSUMO, unitCost: '' }));
    expect(codes(result.rows[0])).toEqual([['cost_required', 'unitCost']]);
  });

  it('R10 el instrumento no exige costo ni alerta, como en el alta manual', () => {
    const result = plan(sheet(ROW_INSTRUMENTO));
    expect(result.rows[0]?.status).toBe('create');
  });

  it('R10 un costo total que deja el unitario en 0 se rechaza en «Costo total»', () => {
    const result = plan(sheet({ ...ROW_INSUMO, unitCost: '', totalCost: '0,0001', stock: '3' }));
    expect(codes(result.rows[0])).toEqual([['total_cost_too_low', 'totalCost']]);
  });

  it('R10 la existencia de un envase es entera', () => {
    const result = plan(sheet({ ...ROW_ENVASE, stock: '2,5' }));
    expect(codes(result.rows[0])).toEqual([['stock_not_whole', 'stock']]);
  });

  it('R10 las columnas obligatorias vacias se nombran', () => {
    const result = plan(sheet({ ...ROW_INSUMO, name: '', stock: '', qtyAlert: '' }));
    expect(codes(result.rows[0])).toEqual([
      ['value_required', 'name'],
      ['value_required', 'stock'],
      ['value_required', 'qtyAlert'],
    ]);
  });

  it('R10 R12 un numero con separador de miles queda en error en su columna', () => {
    const result = plan(sheet({ ...ROW_INSUMO, stock: '1.234,5' }));
    expect(codes(result.rows[0])).toEqual([['number_format_invalid', 'stock']]);
  });

  it('R10 R12 un numero nativo con mas de 4 decimales no se redondea en silencio', () => {
    const parsed: ParsedImportSheet = {
      rows: [row(2, { ...ROW_INSUMO, stock: '1.23456' }, { stock: 'number' })],
      exampleRowIgnored: false,
    };
    expect(codes(plan(parsed).rows[0])).toEqual([['number_format_invalid', 'stock']]);
  });

  it('R10 R13 fecha de compra futura o inexistente, y vencimiento inexistente', () => {
    const result = plan(
      sheet(
        { ...ROW_INSUMO, purchaseDate: '07/10/2026' },
        { ...ROW_INSUMO, purchaseDate: '2026-02-30', expiryDate: '31/02/2027' },
      ),
    );
    expect(codes(result.rows[0])).toEqual([['purchase_date_future', 'purchaseDate']]);
    expect(codes(result.rows[1])).toEqual([
      ['purchase_date_invalid', 'purchaseDate'],
      ['expiry_date_invalid', 'expiryDate'],
    ]);
  });

  it('R10 R13 la fecha DD/MM/AAAA entra en forma canonica y la compra vacia la resuelve el alta', () => {
    const result = plan(sheet({ ...ROW_INSUMO, purchaseDate: '15/01/2026', expiryDate: '31/12/2027' }, ROW_INSUMO));
    const first = result.writes.get(2);
    const second = result.writes.get(3);
    expect(first?.kind === 'product' && first.candidate).toMatchObject({
      purchaseDate: '2026-01-15',
      expiryDate: '2027-12-31',
      unitCost: '3.5',
    });
    expect(second?.kind === 'product' && second.candidate.purchaseDate).toBeNull();
  });
});

describe('planInventoryImport — columnas que no aplican', () => {
  it('R11 un valor en una columna prohibida para el tipo deja la fila en error nombrandola', () => {
    const result = plan(
      sheet(
        { ...ROW_INSTRUMENTO, qtyAlert: '3', unit: 'kg' },
        { ...ROW_ENVASE, expiryDate: '2027-01-01' },
        { ...ROW_INSUMO, presentation: 'Bidón 20 L', formula: 'Desengrasante' },
        { ...ROW_TERMINADO, name: 'Algo', unit: 'kg' },
      ),
    );
    expect(codes(result.rows[0])).toEqual([
      ['column_not_applicable', 'unit'],
      ['column_not_applicable', 'qtyAlert'],
    ]);
    expect(codes(result.rows[1])).toEqual([['column_not_applicable', 'expiryDate']]);
    expect(codes(result.rows[2])).toEqual([
      ['column_not_applicable', 'presentation'],
      ['column_not_applicable', 'formula'],
    ]);
    expect(codes(result.rows[3])).toEqual([
      ['column_not_applicable', 'name'],
      ['column_not_applicable', 'unit'],
    ]);
  });
});

describe('planInventoryImport — identidad', () => {
  it('R14 insumo por nombre + unidad: el homonimo vivo en la misma unidad suma lote, en otra crea', () => {
    const existing = productRef({ id: 'p-sal', nameNormalized: 'salfina', unitId: KG.id });
    const result = plan(
      sheet({ ...ROW_INSUMO, name: 'SAL  FINA' }, { ...ROW_INSUMO, unit: 'Litro' }),
      snapshot({ products: [existing] }),
    );
    expect(result.rows[0]).toMatchObject({ status: 'add_batch', target: { kind: 'existing', productId: 'p-sal' } });
    expect(result.rows[1]?.status).toBe('create');
  });

  it('R14 de dos homonimos vivos toma el mas antiguo, el primero que devuelve la lectura', () => {
    const older = productRef({ id: 'p-viejo', nameNormalized: 'salfina', unitId: KG.id });
    const newer = productRef({ id: 'p-nuevo', nameNormalized: 'salfina', unitId: KG.id });
    const result = plan(sheet(ROW_INSUMO), snapshot({ products: [older, newer] }));
    expect(result.rows[0]).toMatchObject({ target: { kind: 'existing', productId: 'p-viejo' } });
  });

  it('R14 la unidad casa por nombre o por simbolo', () => {
    const result = plan(sheet({ ...ROW_INSUMO, unit: ' kilogramo ' }, { ...ROW_INSUMO, name: 'Otro', unit: 'kg' }));
    for (const index of [0, 1]) {
      const write = result.writes.get(index + 2);
      expect(write?.kind === 'product' && write.candidate.unitId).toBe(KG.id);
    }
  });

  it('R14 envase por nombre: con la misma presentacion suma lote, con otra queda en error', () => {
    const existing = productRef({
      id: 'p-bidon',
      nameNormalized: 'bidon',
      type: 'PACKAGING',
      presentationId: BIDON.id,
    });
    const result = plan(
      sheet(ROW_ENVASE, { ...ROW_ENVASE, presentation: 'Botella 1 L' }),
      snapshot({ products: [existing] }),
    );
    expect(result.rows[0]).toMatchObject({ status: 'add_batch', target: { kind: 'existing', productId: 'p-bidon' } });
    expect(codes(result.rows[1])).toEqual([['presentation_mismatch', 'presentation']]);
  });

  it('R14 instrumento por nombre sin unidad', () => {
    const machine = productRef({ id: 'p-balanza', nameNormalized: 'balanza', type: 'MACHINE' });
    const supplyInKg = productRef({ id: 'p-otra', nameNormalized: 'balanza', unitId: KG.id });
    const result = plan(sheet(ROW_INSTRUMENTO), snapshot({ products: [supplyInKg, machine] }));
    expect(result.rows[0]).toMatchObject({ status: 'add_batch', target: { kind: 'existing', productId: 'p-balanza' } });
  });

  it('R15 la misma identidad nueva dos veces: la primera crea y las siguientes suman a esa fila', () => {
    const result = plan(sheet(ROW_INSUMO, { ...ROW_INSUMO, name: 'sal fina' }, ROW_ENVASE, ROW_ENVASE, ROW_INSUMO));
    expect(result.rows.map((r) => (r.status === 'add_batch' ? [r.status, r.target] : [r.status]))).toEqual([
      ['create'],
      ['add_batch', { kind: 'file_row', rowNumber: 2 }],
      ['create'],
      ['add_batch', { kind: 'file_row', rowNumber: 4 }],
      ['add_batch', { kind: 'file_row', rowNumber: 2 }],
    ]);
  });

  it('R15 una fila en error no crea el producto para las siguientes', () => {
    const result = plan(sheet({ ...ROW_INSUMO, stock: 'abc' }, ROW_INSUMO));
    expect(result.rows.map((r) => r.status)).toEqual(['error', 'create']);
  });

  it('R17 insumo o instrumento cuyo homonimo vivo es un producto terminado queda en error', () => {
    const finishedInKg = productRef({ id: 'p-t', nameNormalized: 'salfina', unitId: KG.id, type: 'FINISHED_PRODUCT' });
    const finishedNoUnit = productRef({ id: 'p-t2', nameNormalized: 'balanza', type: 'FINISHED_PRODUCT' });
    const result = plan(sheet(ROW_INSUMO, ROW_INSTRUMENTO), snapshot({ products: [finishedInKg, finishedNoUnit] }));
    expect(codes(result.rows[0])).toEqual([['finished_product_homonym', 'name']]);
    expect(codes(result.rows[1])).toEqual([['finished_product_homonym', 'name']]);
  });
});

describe('planInventoryImport — producto terminado', () => {
  it('R16 con formula original y presentacion con contenido crea el terminado con el nombre derivado', () => {
    const result = plan(sheet(ROW_TERMINADO));
    expect(result.rows[0]).toMatchObject({
      status: 'create',
      type: 'FINISHED_PRODUCT',
      productName: `${FORMULA.name} · ${BOTELLA.name}`,
    });
    expect(result.writes.get(2)).toEqual({
      kind: 'finished',
      input: {
        recipeId: FORMULA.id,
        recipeName: FORMULA.name,
        presentationId: BOTELLA.id,
        content: BOTELLA.content,
        packages: 12,
        unitCost: '2',
        totalCost: null,
        lot: null,
        purchaseDate: null,
        expiryDate: null,
      },
    });
  });

  it('R16 identifica por formula + presentacion: suma al existente y a la fila anterior', () => {
    const finished = productRef({
      id: 'p-term',
      nameNormalized: 'desengrasantebotella1l',
      type: 'FINISHED_PRODUCT',
      recipeId: FORMULA.id,
      presentationId: BOTELLA.id,
      unitId: LITRO.id,
    });
    const result = plan(
      sheet(ROW_TERMINADO, { ...ROW_TERMINADO, presentation: 'Bidón 20 L' }, { ...ROW_TERMINADO, presentation: 'Bidón 20 L' }),
      snapshot({ finishedProducts: [finished] }),
    );
    expect(result.rows.map((r) => (r.status === 'add_batch' ? r.target : r.status))).toEqual([
      { kind: 'existing', productId: 'p-term' },
      'create',
      { kind: 'file_row', rowNumber: 3 },
    ]);
  });

  it('R16 sin formula, con formula inexistente o con presentacion sin contenido queda en error', () => {
    const result = plan(
      sheet(
        { ...ROW_TERMINADO, formula: '' },
        { ...ROW_TERMINADO, formula: 'Jabon' },
        { ...ROW_TERMINADO, presentation: 'Caja suelta' },
        { ...ROW_TERMINADO, presentation: '' },
      ),
    );
    expect(codes(result.rows[0])).toEqual([['value_required', 'formula']]);
    expect(codes(result.rows[1])).toEqual([['formula_not_found', 'formula']]);
    expect(codes(result.rows[2])).toEqual([['presentation_without_content', 'presentation']]);
    expect(codes(result.rows[3])).toEqual([['value_required', 'presentation']]);
  });

  it('R16 la existencia son envases enteros mayores que 0 y hace falta un costo', () => {
    const result = plan(
      sheet(
        { ...ROW_TERMINADO, stock: '2,5' },
        { ...ROW_TERMINADO, stock: '0' },
        { ...ROW_TERMINADO, unitCost: '' },
        { ...ROW_TERMINADO, unitCost: '', totalCost: '0,0001', presentation: 'Bidón 20 L' },
      ),
    );
    expect(codes(result.rows[0])).toEqual([['stock_not_whole', 'stock']]);
    expect(codes(result.rows[1])).toEqual([['stock_not_whole', 'stock']]);
    expect(codes(result.rows[2])).toEqual([['cost_required', 'unitCost']]);
    expect(codes(result.rows[3])).toEqual([['total_cost_too_low', 'totalCost']]);
  });

  it('R17 un insumo con el nombre derivado de un terminado que crea el archivo queda en error', () => {
    const result = plan(
      sheet(ROW_TERMINADO, { ...ROW_INSUMO, name: 'Desengrasante · Botella 1 L', unit: 'Litro' }),
    );
    expect(codes(result.rows[1])).toEqual([['finished_product_homonym', 'name']]);
  });
});

describe('planInventoryImport — lotes', () => {
  it('R18 el lote ya existe en el mismo producto, en la base o en una fila anterior: duplicado', () => {
    const existing = productRef({ id: 'p-sal', nameNormalized: 'salfina', unitId: KG.id });
    const result = plan(
      sheet(
        { ...ROW_INSUMO, lot: 'L-1' },
        { ...ROW_INSUMO, name: 'Nuevo', lot: 'L-2' },
        { ...ROW_INSUMO, name: 'nuevo', lot: ' L-2 ' },
      ),
      snapshot({ products: [existing], batches: [{ lot: 'L-1', productId: 'p-sal' }] }),
    );
    expect(result.rows[0]).toMatchObject({ status: 'duplicate', lot: 'L-1', target: { kind: 'existing', productId: 'p-sal' } });
    expect(result.rows[1]?.status).toBe('create');
    expect(result.rows[2]).toMatchObject({ status: 'duplicate', lot: 'L-2', target: { kind: 'file_row', rowNumber: 3 } });
    expect(result.writes.has(2)).toBe(false);
    expect(result.writes.has(4)).toBe(false);
  });

  it('R19 el lote es de otro producto, en la base o en una fila anterior: error', () => {
    const result = plan(
      sheet(
        { ...ROW_INSUMO, lot: 'L-1' },
        { ...ROW_INSUMO, name: 'Otro', lot: 'L-2' },
        { ...ROW_INSUMO, name: 'Tercero', lot: 'L-2' },
      ),
      snapshot({ batches: [{ lot: 'L-1', productId: 'p-ajeno' }] }),
    );
    expect(codes(result.rows[0])).toEqual([['lot_used_by_other_product', 'lot']]);
    expect(result.rows[1]?.status).toBe('create');
    expect(codes(result.rows[2])).toEqual([['lot_used_by_other_product', 'lot']]);
  });
});

describe('planInventoryImport — faltantes', () => {
  it('R20 cada unidad o presentacion que falta se lista una vez con sus filas, y esas filas quedan en error', () => {
    const result = plan(
      sheet(
        { ...ROW_INSUMO, unit: 'Galón' },
        { ...ROW_INSUMO, name: 'Otro', unit: 'galon' },
        { ...ROW_ENVASE, presentation: 'Garrafa 5 L' },
        { ...ROW_TERMINADO, presentation: 'garrafa 5L' },
      ),
    );
    expect(result.missingUnits).toEqual([{ name: 'Galón', rowNumbers: [2, 3] }]);
    expect(result.missingPresentations).toEqual([{ name: 'Garrafa 5 L', rowNumbers: [4, 5] }]);
    expect(result.rows.map((r) => codes(r))).toEqual([
      [['unit_not_found', 'unit']],
      [['unit_not_found', 'unit']],
      [['presentation_not_found', 'presentation']],
      [['presentation_not_found', 'presentation']],
    ]);
  });

  it('R20 una unidad que casa con varias es ambigua y no es un faltante', () => {
    const otherKg = { ...KG, id: '77777777-7777-4777-8777-777777777777', name: 'Kilo granel' };
    const result = plan(sheet(ROW_INSUMO), snapshot({ units: [KG, otherKg] }));
    expect(codes(result.rows[0])).toEqual([['unit_ambiguous', 'unit']]);
    expect(result.missingUnits).toEqual([]);
  });

  it('R22 la planificacion nunca pide crear una unidad ni una presentacion', () => {
    const result = plan(sheet({ ...ROW_INSUMO, unit: 'Galón' }, { ...ROW_ENVASE, presentation: 'Garrafa' }, ROW_INSUMO));
    expect([...result.writes.keys()]).toEqual([4]);
    expect([...result.writes.values()].map((write) => write.kind)).toEqual(['product']);
  });
});
