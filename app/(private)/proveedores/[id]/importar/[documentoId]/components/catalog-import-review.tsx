'use client';

import { useMemo, useState, useTransition } from 'react';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import {
  confirmCatalogImportAction,
  previewCatalogImportAction,
} from '@/lib/modules/documentos/adapters/driving/catalog-import-actions';
import {
  suggestUnitId,
  type CatalogImportPreview,
  type CatalogImportPreviewCrop,
  type CatalogImportPreviewRow,
  type CatalogImportSummary as CatalogImportSummaryData,
  type ReviewedLineInput,
} from '@/lib/modules/documentos';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import { normalizePresentationName } from '@/lib/modules/inventario';
import { normalizeSupplierName } from '@/lib/modules/proveedores';
import type { UnitRef } from '@/lib/modules/unidades';

import { CatalogImportRow } from './catalog-import-row';
import { CatalogImportSummary } from './catalog-import-summary';
import { NewPresentationUnits, type NewPresentationGroup } from './new-presentation-units';

export type MeasurementUnit = 'mm' | 'cm';

/**
 * Lo que el revisor ve y edita de una fila. No es `ReviewedLineInput` ni `CatalogImportPreviewRow`
 * -los dos mezclan cadena y valores estructurados de forma distinta a como los editan los
 * controles-: es la forma de FORMULARIO, con cada medida partida en su valor y su unidad, como ya
 * hace `catalog-line-form.tsx` para la edicion de una linea existente.
 */
export type RowFormState = {
  readonly included: boolean;
  readonly kind: CatalogImportPreviewRow['kind'];
  readonly invalidFields: readonly string[];
  readonly currentCost: string | null;
  readonly presentationId: string | null;
  /** La unidad que leyo la IA, solo informativa: alimenta la sugerencia de `> new-presentation-units`. */
  readonly readUnit: string | null;
  readonly name: string;
  readonly presentation: string;
  readonly cost: string;
  readonly minPurchase: string;
  readonly deliveryTime: string;
  readonly material: string;
  readonly diameterValue: string;
  readonly diameterUnit: MeasurementUnit;
  readonly heightValue: string;
  readonly heightUnit: MeasurementUnit;
  readonly mouth: string;
  readonly imagePath: string | null;
  readonly imageUrl: string | null;
};

type RawMeasurements = {
  readonly diameter?: { readonly value?: string | null; readonly unit?: string | null } | null;
  readonly height?: { readonly value?: string | null; readonly unit?: string | null } | null;
  readonly mouth?: string | null;
} | null;

function asMeasurements(value: unknown): RawMeasurements {
  if (value === null || typeof value !== 'object') return null;
  return value as RawMeasurements;
}

function asMeasurementUnit(value: string | null | undefined): MeasurementUnit {
  return value === 'mm' ? 'mm' : 'cm';
}

function toRowFormState(row: CatalogImportPreviewRow): RowFormState {
  const measurements = asMeasurements(row.measurements);

  return {
    included: row.kind !== 'incompleta' && row.kind !== 'duplicada',
    kind: row.kind,
    invalidFields: row.invalidFields,
    currentCost: row.currentCost,
    presentationId: row.presentationId,
    readUnit: row.readUnit,
    name: row.name ?? '',
    presentation: row.presentation ?? '',
    cost: row.cost ?? '',
    minPurchase: row.minPurchase ?? '',
    deliveryTime: row.deliveryTime === null ? '' : String(row.deliveryTime),
    material: row.material ?? '',
    diameterValue: measurements?.diameter?.value ?? '',
    diameterUnit: asMeasurementUnit(measurements?.diameter?.unit),
    heightValue: measurements?.height?.value ?? '',
    heightUnit: asMeasurementUnit(measurements?.height?.unit),
    mouth: measurements?.mouth ?? '',
    imagePath: row.imagePath,
    imageUrl: row.imageUrl,
  };
}

function blankToNull(value: string): string | null {
  return value.trim() === '' ? null : value;
}

function toReviewedLineInput(row: RowFormState): ReviewedLineInput {
  const diameterValue = row.diameterValue.trim();
  const heightValue = row.heightValue.trim();
  const mouth = row.mouth.trim();
  const hasMeasurements = diameterValue !== '' || heightValue !== '' || mouth !== '';
  const deliveryTime = row.deliveryTime.trim();

  return {
    name: row.name,
    presentation: row.presentation,
    cost: row.cost,
    minPurchase: blankToNull(row.minPurchase),
    deliveryTime: deliveryTime === '' ? null : Number.parseInt(deliveryTime, 10),
    material: blankToNull(row.material),
    measurements: hasMeasurements
      ? {
          diameter: diameterValue === '' ? null : { value: diameterValue, unit: row.diameterUnit },
          height: heightValue === '' ? null : { value: heightValue, unit: row.heightUnit },
          mouth: mouth === '' ? null : mouth,
        }
      : null,
    imagePath: row.imagePath,
  };
}

/** Las presentaciones nuevas que alguna fila INCLUIDA necesita, vistas una sola vez. */
function computeNewPresentationGroups(rows: readonly RowFormState[]): readonly NewPresentationGroup[] {
  const byKey = new Map<string, { presentation: string; readUnit: string | null; rowNumbers: number[] }>();

  rows.forEach((row, index) => {
    if (!row.included || row.kind !== 'nueva' || row.presentationId !== null) return;
    const key = normalizePresentationName(row.presentation);
    if (key === '') return;

    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, { presentation: row.presentation, readUnit: row.readUnit, rowNumbers: [index + 1] });
    } else {
      existing.rowNumbers.push(index + 1);
    }
  });

  return [...byKey.entries()].map(([key, value]) => ({ key, ...value }));
}

/**
 * Los motivos que impiden confirmar, para nombrar las filas: el servidor rechaza con un motivo
 * generico, asi que esta pantalla tiene que decirlo ANTES de llamar a confirmar.
 */
function computeConfirmReasons(
  rows: readonly RowFormState[],
  groups: readonly NewPresentationGroup[],
  unitSelections: Readonly<Record<string, string>>,
): readonly string[] {
  const reasons: string[] = [];

  rows.forEach((row, index) => {
    if (!row.included) return;
    if (row.kind === 'incompleta') {
      reasons.push(`Fila ${index + 1}: incompleta (${row.invalidFields.join(', ')}).`);
    } else if (row.kind === 'duplicada') {
      reasons.push(`Fila ${index + 1}: repite la identidad de otra fila incluida.`);
    }
  });

  const rowNumbersByIdentity = new Map<string, number[]>();
  rows.forEach((row, index) => {
    if (!row.included) return;
    const nameKey = normalizeSupplierName(row.name);
    if (nameKey === '') return;
    const presentationKey = row.presentationId ?? `~${normalizePresentationName(row.presentation)}`;
    const identity = `${nameKey}::${presentationKey}`;
    const rowNumbers = rowNumbersByIdentity.get(identity) ?? [];
    rowNumbers.push(index + 1);
    rowNumbersByIdentity.set(identity, rowNumbers);
  });
  for (const rowNumbers of rowNumbersByIdentity.values()) {
    if (rowNumbers.length > 1) {
      reasons.push(`Filas ${rowNumbers.join(' y ')}: comparten la misma identidad.`);
    }
  }

  for (const group of groups) {
    const unitId = unitSelections[group.key];
    if (unitId === undefined || unitId === '') {
      const plural = group.rowNumbers.length > 1 ? 's' : '';
      reasons.push(
        `La presentación «${group.presentation}» (fila${plural} ${group.rowNumbers.join(', ')}) necesita una unidad.`,
      );
    }
  }

  return reasons;
}

type CatalogImportReviewProps = {
  readonly supplierId: string;
  readonly documentFileId: string;
  readonly units: readonly UnitRef[];
  readonly preview: CatalogImportPreview;
};

/**
 * La revision de una importacion de catalogo: una tarjeta por linea, reclasificacion al perder el
 * foco de nombre o presentacion, y confirmacion prevalidada en el cliente porque el servidor
 * rechaza con un motivo generico.
 */
export function CatalogImportReview({ supplierId, documentFileId, units, preview }: CatalogImportReviewProps) {
  const [rows, setRows] = useState<readonly RowFormState[]>(() => preview.rows.map(toRowFormState));
  const [crops, setCrops] = useState<readonly CatalogImportPreviewCrop[]>(preview.crops);
  // Solo lo que el revisor ELIGE a mano. La sugerencia se deriva mas abajo y nunca se guarda
  // aqui: si viviera en este estado, sincronizarla con un efecto seria justamente el patron que
  // "no necesitas un efecto para esto" desaconseja.
  const [unitOverrides, setUnitOverrides] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<CatalogImportSummaryData | null>(null);
  const [confirmError, setConfirmError] = useState<ErrorState | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isReclassifying, startReclassify] = useTransition();

  const groups = useMemo(() => computeNewPresentationGroups(rows), [rows]);
  // La sugerencia de unidad: sin eleccion propia, la unica coincidencia exacta por nombre o
  // simbolo normalizado; vacia si no hay ninguna o hay mas de una.
  const unitSelections = useMemo(() => {
    const selections: Record<string, string> = {};
    for (const group of groups) {
      selections[group.key] = unitOverrides[group.key] ?? suggestUnitId(group.readUnit, units) ?? '';
    }
    return selections;
  }, [groups, units, unitOverrides]);
  const reasons = useMemo(() => computeConfirmReasons(rows, groups, unitSelections), [rows, groups, unitSelections]);

  function updateRow(index: number, patch: Partial<RowFormState>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function toggleIncluded(index: number) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, included: !row.included } : row)));
  }

  function removeImage(index: number) {
    updateRow(index, { imagePath: null, imageUrl: null });
  }

  function pickImage(index: number, path: string) {
    const crop = crops.find((item) => item.path === path);
    updateRow(index, { imagePath: path, imageUrl: crop?.url ?? null });
  }

  function applyPreview(data: CatalogImportPreview) {
    setCrops(data.crops);
    setRows((current) =>
      current.map((row, index) => {
        const updated = data.rows[index];
        if (updated === undefined) return row;
        return {
          ...row,
          kind: updated.kind,
          invalidFields: updated.invalidFields,
          currentCost: updated.currentCost,
          presentationId: updated.presentationId,
          imagePath: updated.imagePath,
          imageUrl: updated.imageUrl,
        };
      }),
    );
  }

  function reclassify(currentRows: readonly RowFormState[]) {
    startReclassify(async () => {
      const result = await previewCatalogImportAction({
        supplierId,
        documentFileId,
        lines: currentRows.map(toReviewedLineInput),
      });
      if (result.status === 'success') applyPreview(result.data);
    });
  }

  async function handleConfirm() {
    if (reasons.length > 0 || isReclassifying || isConfirming) return;

    setConfirmError(null);
    setIsConfirming(true);

    const includedLines = rows.filter((row) => row.included).map(toReviewedLineInput);
    const newPresentationUnits = groups
      .map((group) => ({ presentation: group.presentation, unitId: unitSelections[group.key] }))
      .filter((entry): entry is { presentation: string; unitId: string } => Boolean(entry.unitId));

    const result = await confirmCatalogImportAction({
      supplierId,
      documentFileId,
      lines: includedLines,
      newPresentationUnits,
    });

    setIsConfirming(false);

    if (result.status === 'success') {
      setSummary(result.data);
      return;
    }

    setConfirmError(result);
    // El servidor no dice que fila fallo: se vuelve a clasificar con lo que hay para que las
    // tarjetas reflejen lo que el servidor vio de verdad.
    reclassify(rows);
  }

  if (summary !== null) {
    return <CatalogImportSummary supplierId={supplierId} summary={summary} />;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="catalog-import-review">
      <div className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <CatalogImportRow
            key={index}
            index={index}
            row={row}
            crops={crops}
            onChange={(patch) => updateRow(index, patch)}
            onToggleIncluded={() => toggleIncluded(index)}
            onIdentityBlur={() => reclassify(rows)}
            onRemoveImage={() => removeImage(index)}
            onPickImage={(path) => pickImage(index, path)}
          />
        ))}
      </div>

      <NewPresentationUnits
        groups={groups}
        units={units}
        selections={unitSelections}
        onChange={(key, unitId) => setUnitOverrides((current) => ({ ...current, [key]: unitId }))}
      />

      {confirmError === null ? null : (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid="catalog-import-confirm-error"
        >
          {confirmError.code === UNEXPECTED_ERROR_CODE ? (
            <UnexpectedErrorNotice state={confirmError} />
          ) : (
            <>
              <p data-testid="catalog-import-confirm-error-message">{confirmError.message}</p>
              <p className="text-xs" data-testid="catalog-import-confirm-error-code">
                {confirmError.code}
              </p>
            </>
          )}
        </div>
      )}

      {reasons.length === 0 ? null : (
        <ul
          role="alert"
          className="flex flex-col gap-1 text-sm text-destructive"
          data-testid="catalog-import-confirm-reasons"
        >
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}

      <div>
        <Button
          type="button"
          className="min-h-11 min-w-11"
          disabled={reasons.length > 0 || isReclassifying || isConfirming}
          aria-busy={isConfirming || isReclassifying}
          onClick={handleConfirm}
          data-testid="catalog-import-confirm"
        >
          {isConfirming ? 'Confirmando…' : 'Confirmar'}
        </Button>
      </div>
    </div>
  );
}
