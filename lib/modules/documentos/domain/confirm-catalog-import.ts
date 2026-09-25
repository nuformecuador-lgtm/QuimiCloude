/**
 * La confirmacion de una importacion de catalogo: reclasifica EN EL SERVIDOR en vez de fiarse de
 * la clase que trae la fila -el navegador pudo mandar cualquier cosa- y rechaza la confirmacion
 * entera si una sola fila no puede escribirse, para no dejar una escritura parcial. El permiso de
 * inventario solo se exige si de verdad hace falta crear una presentacion nueva.
 */
import { assertPermission } from '@/lib/modules/identity';
import { normalizePresentationName, PresentationDuplicateNameError } from '@/lib/modules/inventario';
import { normalizeSupplierName } from '@/lib/modules/proveedores';

import { requirePermission, CATALOG_IMPORT_PERMISSION, type Actor } from './actor';
import {
  classifyCatalogImportRows,
  type AliveCatalogLine,
  type ClassifiedLine,
  type ClassifyRowInput,
  type PresentationMatch,
} from './classify-catalog-import';
import { confirmCatalogImportInputSchema, type ReviewedLineInput } from './catalog-import-input';
import { isCropPathOf } from './document-path';
import { UnauthorizedError, ValidationError } from './errors';

import type { CatalogImportDeps } from './preview-catalog-import';

export type CatalogImportSummary = {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly presentationsCreated: number;
};

function toClassifyRow(row: ReviewedLineInput): ClassifyRowInput {
  return {
    name: row.name,
    presentation: row.presentation,
    cost: row.cost,
    minPurchase: row.minPurchase,
    deliveryTime: row.deliveryTime,
    material: row.material,
    measurements: row.measurements,
  };
}

function distinctNormalizedPresentationNames(rows: readonly ReviewedLineInput[]): readonly string[] {
  const names = new Set<string>();
  for (const row of rows) {
    const normalized = normalizePresentationName(row.presentation);
    if (normalized !== '') names.add(normalized);
  }
  return [...names];
}

function distinctIdentityKeys(
  rows: readonly ReviewedLineInput[],
  presentations: readonly PresentationMatch[],
): readonly { nameNormalized: string; presentationId: string }[] {
  const byNormalizedName = new Map(presentations.map((match) => [match.nameNormalized, match]));
  const keys = new Map<string, { nameNormalized: string; presentationId: string }>();
  for (const row of rows) {
    const nameNormalized = normalizeSupplierName(row.name);
    if (nameNormalized === '') continue;
    const match = byNormalizedName.get(normalizePresentationName(row.presentation));
    if (match === undefined) continue;
    keys.set(`${nameNormalized}::${match.id}`, { nameNormalized, presentationId: match.id });
  }
  return [...keys.values()];
}

/** Una presentacion nueva que hacen falta filas de este documento, vista una sola vez aunque
 *  varias filas la nombren, con los indices de esas filas para el motivo por fila. */
type NewPresentationNeed = {
  readonly rawName: string;
  readonly normalizedName: string;
  readonly rowNumbers: readonly number[];
};

function collectNewPresentationNeeds(
  rows: readonly ReviewedLineInput[],
  classified: readonly ClassifiedLine[],
): readonly NewPresentationNeed[] {
  const byNormalizedName = new Map<string, { rawName: string; rowNumbers: number[] }>();
  rows.forEach((row, index) => {
    const line = classified[index];
    if (line === undefined || line.kind !== 'nueva' || line.presentationId !== null) return;
    const normalizedName = normalizePresentationName(row.presentation);
    const existing = byNormalizedName.get(normalizedName);
    if (existing === undefined) {
      byNormalizedName.set(normalizedName, { rawName: row.presentation, rowNumbers: [index + 1] });
    } else {
      existing.rowNumbers.push(index + 1);
    }
  });
  return [...byNormalizedName.entries()].map(([normalizedName, need]) => ({
    normalizedName,
    rawName: need.rawName,
    rowNumbers: need.rowNumbers,
  }));
}

export function createConfirmCatalogImport(
  deps: CatalogImportDeps,
): (actor: Actor | null | undefined, input: unknown) => Promise<CatalogImportSummary> {
  return async function confirmCatalogImport(
    actor: Actor | null | undefined,
    input: unknown,
  ): Promise<CatalogImportSummary> {
    requirePermission(actor, CATALOG_IMPORT_PERMISSION);

    const parsed = confirmCatalogImportInputSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const { supplierId, documentFileId, lines, newPresentationUnits } = parsed.data;

    const file = await deps.repository.readFileForReview(documentFileId, actor.companyId);
    if (file === null || file.status !== 'done' || file.strategy !== 'catalogo') {
      throw new ValidationError();
    }

    const presentationNames = distinctNormalizedPresentationNames(lines);
    const presentationsFound =
      presentationNames.length === 0
        ? []
        : await deps.presentations.findByNormalizedNames(presentationNames, actor.companyId);
    const presentationMatches: readonly PresentationMatch[] = presentationsFound;

    const identityKeys = distinctIdentityKeys(lines, presentationMatches);
    const aliveByIdentity = await deps.catalog.findAliveByIdentity({ supplierId, keys: identityKeys }, actor);
    const aliveLines: readonly AliveCatalogLine[] = aliveByIdentity;

    const classified = classifyCatalogImportRows(lines.map(toClassifyRow), presentationMatches, aliveLines);

    const cropPaths = await deps.crops.list(actor.companyId, documentFileId);

    const reasons: string[] = [];

    lines.forEach((_row, index) => {
      const line = classified[index] as ClassifiedLine;
      if (line.kind === 'incompleta') {
        reasons.push(`fila ${index + 1}: incompleta (${line.invalidFields.join(', ')})`);
      } else if (line.kind === 'duplicada') {
        reasons.push(`fila ${index + 1}: duplicada`);
      }
    });

    const resolvedImagePaths: (string | null)[] = lines.map((row, index) => {
      if (row.imagePath === null) return null;
      const belongsToFile = isCropPathOf(row.imagePath, actor.companyId, documentFileId);
      if (!belongsToFile || !cropPaths.includes(row.imagePath)) {
        reasons.push(`fila ${index + 1}: imagen ajena a este archivo`);
        return null;
      }
      return row.imagePath;
    });

    const newPresentationNeeds = collectNewPresentationNeeds(lines, classified);
    const chosenUnitByNormalizedName = new Map(
      newPresentationUnits.map((entry) => [normalizePresentationName(entry.presentation), entry.unitId]),
    );

    const unitIdByNewPresentation = new Map<string, string>();
    for (const need of newPresentationNeeds) {
      const chosenUnitId = chosenUnitByNormalizedName.get(need.normalizedName);
      if (chosenUnitId === undefined) {
        reasons.push(`fila ${need.rowNumbers.join(', ')}: presentacion nueva sin unidad`);
        continue;
      }
      const visibleUnits = await deps.units.findRefs([chosenUnitId], actor.companyId);
      if (visibleUnits.length !== 1) {
        reasons.push(`fila ${need.rowNumbers.join(', ')}: unidad no visible para la empresa`);
        continue;
      }
      unitIdByNewPresentation.set(need.normalizedName, chosenUnitId);
    }

    if (reasons.length > 0) throw new ValidationError(reasons.join('; '));

    if (newPresentationNeeds.length > 0) {
      assertPermission(actor, 'inventario.modificar', () => new UnauthorizedError());
    }

    const presentationInfoByNormalizedName = new Map<string, { id: string; unitId: string }>(
      presentationsFound.map((found) => [found.nameNormalized, { id: found.id, unitId: found.unitId }]),
    );

    let presentationsCreated = 0;
    for (const need of newPresentationNeeds) {
      const unitId = unitIdByNewPresentation.get(need.normalizedName) as string;
      try {
        const created = await deps.createPresentation({ name: need.rawName, unitId }, actor);
        presentationInfoByNormalizedName.set(need.normalizedName, { id: created.id, unitId });
        presentationsCreated += 1;
      } catch (error) {
        if (!(error instanceof PresentationDuplicateNameError)) throw error;
        const [reused] = await deps.presentations.findByNormalizedNames([need.normalizedName], actor.companyId);
        if (reused === undefined) throw error;
        presentationInfoByNormalizedName.set(need.normalizedName, { id: reused.id, unitId: reused.unitId });
      }
    }

    const fields = lines.map((row, index) => {
      const info = presentationInfoByNormalizedName.get(normalizePresentationName(row.presentation));
      if (info === undefined) throw new ValidationError();
      return {
        name: row.name,
        presentationId: info.id,
        unitId: info.unitId,
        imagePath: resolvedImagePaths[index] ?? null,
        cost: row.cost,
        minPurchase: row.minPurchase,
        deliveryTime: row.deliveryTime,
        material: row.material,
        measurements: row.measurements,
      };
    });

    const summary = await deps.catalog.importLines(supplierId, fields, actor);

    return { ...summary, presentationsCreated };
  };
}
