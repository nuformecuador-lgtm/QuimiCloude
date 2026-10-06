import { assertPermission, type PermissionCode } from '@/lib/modules/identity';
import type { UnitCatalog } from '@/lib/modules/unidades';

import { requirePermission, type Actor } from './actor';
import { detectImportFileFormat } from './import-file-format';
import { parseImportSheet, type ParsedImportSheet } from './import-sheet';
import {
  collectFinishedPairs,
  collectImportLookups,
  planInventoryImport,
  type ImportCatalogSnapshot,
  type ImportFormulaRef,
  type ImportPresentationRef,
  type PlannedInventoryImport,
} from './plan-inventory-import';

import type {
  ImportFileRejected,
  ImportPreviewRow,
  ImportPreviewTotals,
  InventoryImportFile,
  InventoryImportFormat,
  PreviewInventoryImport,
} from './inventory-import-contract';
import type { InventoryScope } from './inventory-scope';
import type { PresentationCatalog } from './presentation-catalog';
import type { ImportFormulaLookup } from '../ports/import-formula-lookup';
import type { InventoryImportRepository } from '../ports/inventory-import-repository';
import type { SpreadsheetReader } from '../ports/spreadsheet-reader';

/** Lo que hace falta para leer y planificar un archivo; la confirmacion lo comparte. */
export type InventoryImportReadDeps = {
  readonly reader: SpreadsheetReader;
  readonly imports: Pick<
    InventoryImportRepository,
    'findAliveProductsByNormalizedNames' | 'findAliveFinishedProducts' | 'findBatchesByLots'
  >;
  readonly units: Pick<UnitCatalog, 'listVisibleRefs'>;
  readonly presentations: PresentationCatalog;
  readonly formulas: ImportFormulaLookup;
  /** Inyectable para que los tests fijen el instante sin tocar el reloj global. */
  readonly now?: () => Date;
};

export type PreviewInventoryImportDeps = InventoryImportReadDeps;

export type ReadInventoryImportOutcome =
  | ImportFileRejected
  | {
      readonly kind: 'planned';
      readonly format: InventoryImportFormat;
      readonly sheet: ParsedImportSheet;
      readonly plan: PlannedInventoryImport;
    };

async function loadPresentations(
  deps: InventoryImportReadDeps,
  names: readonly string[],
  companyId: string,
): Promise<ImportPresentationRef[]> {
  if (names.length === 0) return [];
  const byName = await deps.presentations.findByNormalizedNames(names, companyId);
  const refs = await deps.presentations.findRefs(
    byName.map((presentation) => presentation.id),
    companyId,
  );
  const contentById = new Map(refs.map((ref) => [ref.id, ref.content]));
  return byName.map((presentation) => ({
    id: presentation.id,
    name: presentation.name,
    nameNormalized: presentation.nameNormalized,
    unitId: presentation.unitId,
    content: contentById.get(presentation.id) ?? null,
  }));
}

async function loadFormulas(
  deps: InventoryImportReadDeps,
  names: ReadonlyMap<string, string>,
  companyId: string,
): Promise<Map<string, ImportFormulaRef>> {
  const found = await Promise.all(
    [...names].map(async ([key, text]) => [key, await deps.formulas.findAliveOriginalByName(text, companyId)] as const),
  );
  const formulas = new Map<string, ImportFormulaRef>();
  for (const [key, formula] of found) if (formula !== null) formulas.set(key, formula);
  return formulas;
}

/** Lecturas en lote, sin importar el numero de filas: ninguna consulta por fila. */
async function loadSnapshot(
  deps: InventoryImportReadDeps,
  sheet: ParsedImportSheet,
  scope: InventoryScope,
): Promise<ImportCatalogSnapshot> {
  const lookups = collectImportLookups(sheet);
  const { companyId } = scope;

  const [units, presentations, formulas, products, batches] = await Promise.all([
    lookups.needsUnits ? deps.units.listVisibleRefs(companyId) : Promise.resolve([]),
    loadPresentations(deps, lookups.presentationNames, companyId),
    loadFormulas(deps, lookups.formulaNames, companyId),
    lookups.productNames.length === 0
      ? Promise.resolve([])
      : deps.imports.findAliveProductsByNormalizedNames(lookups.productNames, scope),
    lookups.lots.length === 0 ? Promise.resolve([]) : deps.imports.findBatchesByLots(lookups.lots, scope),
  ]);

  const pairs = collectFinishedPairs(sheet, presentations, formulas);
  const finishedProducts = pairs.length === 0 ? [] : await deps.imports.findAliveFinishedProducts(pairs, scope);

  return { units, presentations, formulas, products, finishedProducts, batches };
}

const rejected = (rejection: ImportFileRejected['rejection']): ImportFileRejected => ({
  kind: 'file_rejected',
  rejection,
});

/** Lee y planifica contra la base de ahora. El permiso lo comprueba quien llama, antes. */
export async function readInventoryImport(
  deps: InventoryImportReadDeps,
  input: InventoryImportFile,
  scope: InventoryScope,
  today: string,
): Promise<ReadInventoryImportOutcome> {
  const format = detectImportFileFormat(input.fileName, input.bytes);
  if (typeof format !== 'string') return rejected(format);

  const read = await deps.reader.read(input.bytes, format);
  const parsed = parseImportSheet(read);
  if (!parsed.ok) return rejected(parsed.rejection);

  const snapshot = await loadSnapshot(deps, parsed.sheet, scope);
  return { kind: 'planned', format, sheet: parsed.sheet, plan: planInventoryImport(parsed.sheet, snapshot, today) };
}

export function civilDateUtc(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

function previewTotals(rows: readonly ImportPreviewRow[]): ImportPreviewTotals {
  const count = (status: ImportPreviewRow['status']): number => rows.filter((row) => row.status === status).length;
  return {
    rows: rows.length,
    create: count('create'),
    addBatch: count('add_batch'),
    duplicate: count('duplicate'),
    error: count('error'),
  };
}

/** Solo decide si se ofrece el boton: el alta de cada faltante vuelve a mirar su permiso. */
function holds(actor: Actor, permission: PermissionCode): boolean {
  try {
    assertPermission(actor, permission, () => new Error(permission));
    return true;
  } catch {
    return false;
  }
}

/** No escribe nada: ni productos, ni lotes, ni unidades o presentaciones que falten. */
export function createPreviewInventoryImport(deps: PreviewInventoryImportDeps): PreviewInventoryImport {
  const now = deps.now ?? (() => new Date());

  return async function previewInventoryImport(input, actor) {
    requirePermission(actor, 'inventario.modificar');
    const scope = { companyId: actor.companyId };

    const outcome = await readInventoryImport(deps, input, scope, civilDateUtc(now()));
    if (outcome.kind === 'file_rejected') return outcome;

    const { plan, sheet, format } = outcome;
    return {
      kind: 'preview',
      fileName: input.fileName,
      format,
      exampleRowIgnored: sheet.exampleRowIgnored,
      totals: previewTotals(plan.rows),
      rows: plan.rows,
      missingUnits: plan.missingUnits,
      missingPresentations: plan.missingPresentations,
      canCreateUnits: holds(actor, 'unidades.modificar'),
      canCreatePresentations: holds(actor, 'inventario.modificar'),
    };
  };
}
