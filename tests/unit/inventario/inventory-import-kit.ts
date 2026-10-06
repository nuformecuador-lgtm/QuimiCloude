/**
 * Datos y dobles compartidos por los tests unitarios de la planificacion, la vista previa y la
 * confirmacion de la importacion. No es una suite.
 */
import { vi } from 'vitest';

import { INVENTORY_IMPORT_COLUMNS } from '@/lib/modules/inventario';

import type { ImportCellOrigin } from '@/lib/modules/inventario/domain/import-cell-parsing';
import type { ParsedImportRow, ParsedImportSheet } from '@/lib/modules/inventario/domain/import-sheet';
import type { ImportCells, ImportColumnKey } from '@/lib/modules/inventario';
import type { ImportCatalogSnapshot } from '@/lib/modules/inventario/domain/plan-inventory-import';
import type {
  ExistingImport,
  ImportClaim,
  ImportedFinishedGoodsOutcome,
  ImportProductRef,
} from '@/lib/modules/inventario/ports/inventory-import-repository';
import type { SpreadsheetReader } from '@/lib/modules/inventario/ports/spreadsheet-reader';
import type { UnitRef } from '@/lib/modules/unidades';

export const TODAY = '2026-10-06';
export const NOW = new Date(`${TODAY}T15:00:00.000Z`);

export const KG: UnitRef = { id: '11111111-1111-4111-8111-111111111111', name: 'Kilogramo', symbol: 'kg', baseUnitId: null, factor: null };
export const LITRO: UnitRef = { id: '22222222-2222-4222-8222-222222222222', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null };

export const BIDON = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Bidón 20 L',
  nameNormalized: 'bidon20l',
  unitId: LITRO.id,
  content: '20',
} as const;
export const BOTELLA = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Botella 1 L',
  nameNormalized: 'botella1l',
  unitId: LITRO.id,
  content: '1',
} as const;
export const SIN_CONTENIDO = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Caja suelta',
  nameNormalized: 'cajasuelta',
  unitId: LITRO.id,
  content: null,
} as const;

export const FORMULA = { id: '66666666-6666-4666-8666-666666666666', name: 'Desengrasante' } as const;

export const ROW_INSUMO: Partial<ImportCells> = {
  type: 'Insumo',
  name: 'Sal fina',
  unit: 'kg',
  stock: '25',
  unitCost: '3,5',
  qtyAlert: '5',
};
export const ROW_ENVASE: Partial<ImportCells> = {
  type: 'Envase',
  name: 'Bidón',
  presentation: 'Bidón 20 L',
  stock: '10',
  totalCost: '100',
  qtyAlert: '2',
};
export const ROW_INSTRUMENTO: Partial<ImportCells> = { type: 'Instrumento', name: 'Balanza', stock: '1' };
export const ROW_TERMINADO: Partial<ImportCells> = {
  type: 'Producto terminado',
  formula: 'Desengrasante',
  presentation: 'Botella 1 L',
  stock: '12',
  unitCost: '2',
};

export function cells(values: Partial<ImportCells>): ImportCells {
  const all = {} as Record<ImportColumnKey, string>;
  for (const column of INVENTORY_IMPORT_COLUMNS) all[column.key] = values[column.key] ?? '';
  return all;
}

export function row(
  rowNumber: number,
  values: Partial<ImportCells>,
  origins: Partial<Record<ImportColumnKey, ImportCellOrigin>> = {},
): ParsedImportRow {
  const all = {} as Record<ImportColumnKey, ImportCellOrigin>;
  for (const column of INVENTORY_IMPORT_COLUMNS) all[column.key] = origins[column.key] ?? 'text';
  return { rowNumber, cells: cells(values), origins: all };
}

/** Filas numeradas desde la 2, como en la hoja. */
export function sheet(...rows: Partial<ImportCells>[]): ParsedImportSheet {
  return { rows: rows.map((values, index) => row(index + 2, values)), exampleRowIgnored: false };
}

export function snapshot(overrides: Partial<ImportCatalogSnapshot> = {}): ImportCatalogSnapshot {
  return {
    units: [KG, LITRO],
    presentations: [BIDON, BOTELLA, SIN_CONTENIDO],
    formulas: new Map([['desengrasante', FORMULA]]),
    products: [],
    finishedProducts: [],
    batches: [],
    ...overrides,
  };
}

export function productRef(overrides: Partial<ImportProductRef> & Pick<ImportProductRef, 'id' | 'nameNormalized'>): ImportProductRef {
  return { type: 'PRODUCT', unitId: null, presentationId: null, recipeId: null, ...overrides };
}

/** Un lector que devuelve siempre esta hoja, con la cabecera de la plantilla delante. */
export function fakeReader(rows: readonly Partial<ImportCells>[]): SpreadsheetReader & { read: ReturnType<typeof vi.fn> } {
  const header = INVENTORY_IMPORT_COLUMNS.map((column) => ({ text: column.header, origin: 'text' as const }));
  const body = rows.map((values) =>
    INVENTORY_IMPORT_COLUMNS.map((column) => ({ text: values[column.key] ?? '', origin: 'text' as const })),
  );
  return { read: vi.fn(async () => ({ kind: 'ok' as const, rows: [header, ...body] })) };
}

export const CSV_FILE = { fileName: 'inventario.csv', bytes: new TextEncoder().encode('Tipo;Nombre\n') };

export type CatalogState = {
  products?: ImportProductRef[];
  finishedProducts?: ImportProductRef[];
  batches?: { lot: string; productId: string }[];
};

/** Puertos de lectura con espias; el estado se puede cambiar entre llamadas. */
export function fakeReadPorts(state: CatalogState = {}) {
  const imports = {
    findAliveProductsByNormalizedNames: vi.fn(async () => state.products ?? []),
    findAliveFinishedProducts: vi.fn(async () => state.finishedProducts ?? []),
    findBatchesByLots: vi.fn(async (lots: readonly string[]) =>
      (state.batches ?? []).filter((batch) => lots.includes(batch.lot)),
    ),
    findImport: vi.fn(async (): Promise<ExistingImport | null> => null),
    claimImport: vi.fn(async (): Promise<ImportClaim> => ({ kind: 'claimed', importId: 'import-1' })),
    finishImport: vi.fn(async () => undefined),
    receiveImportedFinishedGoods: vi.fn(async (): Promise<ImportedFinishedGoodsOutcome> => ({
      kind: 'received',
      productId: 'terminado-1',
      lot: 'L-T',
      created: true,
    })),
  };
  const units = { listVisibleRefs: vi.fn(async () => [KG, LITRO]) };
  const presentations = {
    findByNormalizedNames: vi.fn(async (names: readonly string[]) =>
      [BIDON, BOTELLA, SIN_CONTENIDO]
        .filter((presentation) => names.includes(presentation.nameNormalized))
        .map(({ id, name, nameNormalized, unitId }) => ({ id, name, nameNormalized, unitId })),
    ),
    findRefs: vi.fn(async (ids: readonly string[]) =>
      [BIDON, BOTELLA, SIN_CONTENIDO]
        .filter((presentation) => ids.includes(presentation.id))
        .map(({ id, name, content, unitId }) => ({ id, name, content, unitId })),
    ),
  };
  const formulas = {
    findAliveOriginalByName: vi.fn(async (name: string) =>
      name.trim().toLowerCase() === 'desengrasante' ? FORMULA : null,
    ),
  };
  return { imports, units, presentations, formulas };
}
