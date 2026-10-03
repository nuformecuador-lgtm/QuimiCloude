// lib/modules/pedidos/domain/resolve-distribution.ts
//
// La resolucion del reparto que comparten el alta, la edicion, «Reparto y unidad» y el disponible:
// cada linea nombra un envase -su presentacion fija da el contenido- o, solo para conservarla,
// una linea antigua por su presentacion. No abre transaccion ni bloquea nada: quien llama ya
// decide donde encaja esta llamada dentro de la suya.

import {
  IncompatibleUnitsError,
  OrderDistributionExceedsQuantityError,
  OrderWithoutUnitError,
  PresentationNotFoundError,
  PresentationWithoutContentError,
  ProductNotFoundError,
  UnitNotFoundError,
  ValidationError,
} from './errors';
import { validateDistribution, type DistributionLine } from './order-distribution';
import { packagingLinesOf, type PackagingRequirementLine } from './order-requirement';

import type { PackagingCatalog, PackagingRef, PresentationCatalog, PresentationRef } from '@/lib/modules/inventario';
import type { UnitCatalog, UnitRef } from '@/lib/modules/unidades';

import type { OrderPresentationLineRow, OrderPresentationLineWrite } from './order-view';

/** Una linea antigua, tal como se reenvia para conservarla: su presentacion y sus envases. */
export type PresentationLineInput = {
  readonly presentationId: string;
  readonly packages: number;
};

/** Una linea del reparto que nombra su envase, o una antigua que se reenvia tal cual estaba. */
export type DistributionLineInput =
  | { readonly packagingProductId: string; readonly packages: number }
  | PresentationLineInput;

/** Los tres contratos publicos que hacen falta para resolver un reparto. */
export type DistributionCatalogs = {
  readonly packaging: PackagingCatalog;
  readonly presentations: PresentationCatalog;
  readonly units: UnitCatalog;
};

export type ResolvedDistributionLine = {
  readonly write: OrderPresentationLineWrite;
  readonly distribution: DistributionLine;
};

/**
 * `invalid_lines`: dos lineas con la misma presentacion, o una linea antigua que el pedido no
 * tenia tal cual (otra presentacion u otros envases).
 */
export type DistributionResolution =
  | {
      readonly kind: 'resolved';
      readonly orderUnit: UnitRef;
      readonly lines: readonly ResolvedDistributionLine[];
    }
  | { readonly kind: 'unit_not_found' }
  | { readonly kind: 'presentation_not_found' }
  | { readonly kind: 'packaging_not_found'; readonly packagingProductId: string }
  | { readonly kind: 'invalid_lines' };

export type ResolveDistributionOptions = {
  /** Las lineas que el pedido ya tiene. Con ellas, una linea antigua solo se acepta si llega
   *  igual que una de las suyas sin envase. Sin ellas (consulta del disponible) no se compara. */
  readonly savedLines?: readonly OrderPresentationLineRow[];
};

function isPackagingLine(
  line: DistributionLineInput,
): line is { readonly packagingProductId: string; readonly packages: number } {
  return 'packagingProductId' in line;
}

function legacyLineIsKept(line: PresentationLineInput, saved: readonly OrderPresentationLineRow[]): boolean {
  return saved.some(
    (row) =>
      row.packagingProductId === null && row.presentationId === line.presentationId && row.packages === line.packages,
  );
}

/** Resuelve sin lanzar: quien llama traduce cada fallo a su forma. */
export async function resolveDistributionLines(
  catalogs: DistributionCatalogs,
  companyId: string,
  unitId: string,
  lines: readonly DistributionLineInput[],
  options: ResolveDistributionOptions = {},
): Promise<DistributionResolution> {
  const packagingIds: string[] = [];
  const presentationIds: string[] = [];
  for (const line of lines) {
    if (isPackagingLine(line)) {
      packagingIds.push(line.packagingProductId);
    } else {
      if (options.savedLines !== undefined && !legacyLineIsKept(line, options.savedLines)) {
        return { kind: 'invalid_lines' };
      }
      presentationIds.push(line.presentationId);
    }
  }

  const [packagingRefs, presentationRefs] = await Promise.all([
    packagingIds.length === 0 ? [] : catalogs.packaging.findRefs(packagingIds, companyId),
    presentationIds.length === 0 ? [] : catalogs.presentations.findRefs(presentationIds, companyId),
  ]);
  const packagingById = new Map<string, PackagingRef>(packagingRefs.map((ref) => [ref.id, ref]));
  const presentationById = new Map<string, PresentationRef>(presentationRefs.map((ref) => [ref.id, ref]));

  // UNA sola llamada al catalogo de unidades, con los ids UNICOS: la del pedido y la de cada
  // presentacion distinta del reparto.
  const unitIds = [
    ...new Set([unitId, ...packagingRefs.map((ref) => ref.unitId), ...presentationRefs.map((ref) => ref.unitId)]),
  ];
  const unitById = new Map((await catalogs.units.findRefs(unitIds, companyId)).map((ref) => [ref.id, ref] as const));

  const orderUnit = unitById.get(unitId);
  if (orderUnit === undefined) return { kind: 'unit_not_found' };

  const resolved: ResolvedDistributionLine[] = [];
  for (const line of lines) {
    let source: { readonly presentationId: string; readonly content: string | null; readonly unitId: string };
    let packagingProductId: string | null = null;
    if (isPackagingLine(line)) {
      const ref = packagingById.get(line.packagingProductId);
      if (ref === undefined) return { kind: 'packaging_not_found', packagingProductId: line.packagingProductId };
      source = { presentationId: ref.presentationId, content: ref.content, unitId: ref.unitId };
      packagingProductId = ref.id;
    } else {
      const ref = presentationById.get(line.presentationId);
      if (ref === undefined) return { kind: 'presentation_not_found' };
      source = { presentationId: ref.id, content: ref.content, unitId: ref.unitId };
    }
    // Un catalogo consistente nunca apunta a una unidad que `unidades` no conozca.
    const unit = unitById.get(source.unitId);
    if (unit === undefined) return { kind: 'unit_not_found' };

    const write: OrderPresentationLineWrite = {
      presentationId: source.presentationId,
      packages: line.packages,
      content: source.content,
      packagingProductId,
    };
    resolved.push({ write, distribution: { presentationId: write.presentationId, packages: write.packages, content: write.content, unit } });
  }

  // Una presentacion es una linea: dos envases con la misma presentacion no caben en un reparto.
  if (new Set(resolved.map((line) => line.write.presentationId)).size !== resolved.length) {
    return { kind: 'invalid_lines' };
  }

  return { kind: 'resolved', orderUnit, lines: resolved };
}

export type ResolvedDistribution = {
  /** Las lineas con el contenido ya copiado y listas para el puerto de escritura. */
  readonly lines: readonly OrderPresentationLineWrite[];
  /** Los envases del reparto, para la necesidad y el costo. */
  readonly packagingLines: readonly PackagingRequirementLine[];
};

/**
 * Resuelve, valida contra la cantidad y traduce: el paso de `createOrder` y `updateOrder`. Con
 * fallo, lanza sin haber devuelto nada: quien llama no escribe ni la unidad ni las lineas.
 */
export async function resolveDistribution(
  catalogs: DistributionCatalogs,
  companyId: string,
  quantity: string,
  unitId: string,
  lines: readonly DistributionLineInput[],
  options: ResolveDistributionOptions = {},
): Promise<ResolvedDistribution> {
  const resolution = await resolveDistributionLines(catalogs, companyId, unitId, lines, options);
  switch (resolution.kind) {
    case 'resolved':
      break;
    case 'unit_not_found':
      throw new UnitNotFoundError();
    case 'presentation_not_found':
      throw new PresentationNotFoundError();
    case 'packaging_not_found':
      throw new ProductNotFoundError(resolution.packagingProductId);
    case 'invalid_lines':
      throw new ValidationError();
  }

  const result = validateDistribution(
    quantity,
    resolution.orderUnit,
    resolution.lines.map((line) => line.distribution),
  );
  switch (result.kind) {
    case 'ok':
      break;
    case 'without_unit':
      throw new OrderWithoutUnitError();
    case 'presentation_without_content':
      throw new PresentationWithoutContentError(result.presentationId);
    case 'incompatible_units':
      throw new IncompatibleUnitsError(result.presentationId);
    case 'exceeds_quantity':
      throw new OrderDistributionExceedsQuantityError(result.available);
  }

  const writes = resolution.lines.map((line) => line.write);
  return { lines: writes, packagingLines: packagingLinesOf(writes) };
}
