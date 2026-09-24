'use client';

import { useId } from 'react';

import { EntityImage } from '@/components/shared/entity-image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CatalogImportPreviewCrop } from '@/lib/modules/documentos';

import { CropPicker } from './crop-picker';
import type { MeasurementUnit, RowFormState } from './catalog-import-review';

const TOUCH_TARGET = 'min-h-11 min-w-11';
/** 16 px en TODOS los anchos: por debajo, Safari en iOS hace zoom al enfocar el campo (R37). */
const FIELD_TEXT = 'text-base md:text-base';
const DECIMAL_INPUT_PATTERN = '\\d{1,10}(\\.\\d{1,4})?';

const MEASUREMENT_UNIT_OPTIONS = [
  { label: 'mm', value: 'mm' },
  { label: 'cm', value: 'cm' },
] as const;

/** Etiqueta legible de cada clase (R9). */
export const KIND_LABELS: Record<RowFormState['kind'], string> = {
  nueva: 'Nueva',
  cambia: 'Cambia de costo',
  'sin cambios': 'Sin cambios',
  incompleta: 'Incompleta',
  duplicada: 'Duplicada',
};

const INVALID_FIELD_LABELS: Record<string, string> = {
  name: 'nombre',
  presentation: 'presentación',
  cost: 'costo',
  minPurchase: 'mínimo de compra',
  deliveryTime: 'tiempo de entrega',
  material: 'material',
  measurements: 'medidas',
};

type CatalogImportRowProps = {
  readonly index: number;
  readonly row: RowFormState;
  readonly crops: readonly CatalogImportPreviewCrop[];
  readonly onChange: (patch: Partial<RowFormState>) => void;
  readonly onToggleIncluded: () => void;
  readonly onIdentityBlur: () => void;
  readonly onRemoveImage: () => void;
  readonly onPickImage: (path: string) => void;
};

/**
 * Una tarjeta por linea interpretada (R8): no una fila de tabla, porque cada linea tiene hasta
 * once controles y una tabla no cabe en movil.
 *
 * `readOnlyFields` es la unica diferencia de comportamiento entre clases (R11, R12): «cambia» y
 * «sin cambios» solo dejan editar el costo, y el resto de esta tarjeta no cambia de forma sea
 * cual sea la clase.
 */
export function CatalogImportRow({
  index,
  row,
  crops,
  onChange,
  onToggleIncluded,
  onIdentityBlur,
  onRemoveImage,
  onPickImage,
}: CatalogImportRowProps) {
  const fieldId = useId();
  const readOnlyFields = row.kind === 'cambia' || row.kind === 'sin cambios';

  return (
    <Card data-testid={`catalog-import-row-${index}`}>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Fila {index + 1}</CardTitle>
          <span className="text-sm text-muted-foreground" data-testid={`catalog-import-row-kind-${index}`}>
            {KIND_LABELS[row.kind]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${fieldId}-included`}
            className={TOUCH_TARGET}
            checked={row.included}
            onCheckedChange={onToggleIncluded}
            aria-label={`Incluir fila ${index + 1}`}
            data-testid={`catalog-import-row-included-${index}`}
          />
          <Label htmlFor={`${fieldId}-included`} className="text-sm">
            Incluir
          </Label>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {row.invalidFields.length === 0 ? null : (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid={`catalog-import-row-invalid-fields-${index}`}
          >
            Revisa: {row.invalidFields.map((field) => INVALID_FIELD_LABELS[field] ?? field).join(', ')}.
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <EntityImage
            path={row.imageUrl}
            name={row.name === '' ? `Fila ${index + 1}` : row.name}
            testId={`catalog-import-row-image-${index}`}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className={TOUCH_TARGET}
              disabled={row.imagePath === null}
              onClick={onRemoveImage}
              data-testid={`catalog-import-row-remove-image-${index}`}
            >
              Quitar
            </Button>
            <CropPicker
              crops={crops}
              selectedPath={row.imagePath}
              onPick={onPickImage}
              triggerTestId={`catalog-import-row-change-image-${index}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <RowField
            label="Nombre"
            value={row.name}
            readOnly={readOnlyFields}
            onChange={(value) => onChange({ name: value })}
            onBlur={onIdentityBlur}
            testId={`catalog-import-row-name-${index}`}
          />
          <RowField
            label="Presentación"
            value={row.presentation}
            readOnly={readOnlyFields}
            onChange={(value) => onChange({ presentation: value })}
            onBlur={onIdentityBlur}
            testId={`catalog-import-row-presentation-${index}`}
          />
          <RowField
            label="Costo"
            value={row.cost}
            readOnly={false}
            inputMode="decimal"
            pattern={DECIMAL_INPUT_PATTERN}
            onChange={(value) => onChange({ cost: value })}
            testId={`catalog-import-row-cost-${index}`}
          />
          <RowField
            label="Mínimo de compra"
            value={row.minPurchase}
            readOnly={readOnlyFields}
            inputMode="decimal"
            pattern={DECIMAL_INPUT_PATTERN}
            onChange={(value) => onChange({ minPurchase: value })}
            testId={`catalog-import-row-min-purchase-${index}`}
          />
          <RowField
            label="Tiempo de entrega (días)"
            value={row.deliveryTime}
            readOnly={readOnlyFields}
            type="number"
            inputMode="numeric"
            onChange={(value) => onChange({ deliveryTime: value })}
            testId={`catalog-import-row-delivery-time-${index}`}
          />
          <RowField
            label="Material"
            value={row.material}
            readOnly={readOnlyFields}
            onChange={(value) => onChange({ material: value })}
            testId={`catalog-import-row-material-${index}`}
          />
        </div>

        {row.kind === 'cambia' ? (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span data-testid={`catalog-import-row-current-cost-${index}`}>
              Costo actual: {row.currentCost}
            </span>
            <span data-testid={`catalog-import-row-new-cost-${index}`}>Costo nuevo: {row.cost}</span>
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <RowField
              label="Diámetro"
              value={row.diameterValue}
              readOnly={readOnlyFields}
              inputMode="decimal"
              pattern={DECIMAL_INPUT_PATTERN}
              onChange={(value) => onChange({ diameterValue: value })}
              testId={`catalog-import-row-diameter-value-${index}`}
            />
            <MeasurementUnitField
              label="Unidad de diámetro"
              value={row.diameterUnit}
              readOnly={readOnlyFields}
              onChange={(value) => onChange({ diameterUnit: value })}
              testId={`catalog-import-row-diameter-unit-${index}`}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <RowField
              label="Alto"
              value={row.heightValue}
              readOnly={readOnlyFields}
              inputMode="decimal"
              pattern={DECIMAL_INPUT_PATTERN}
              onChange={(value) => onChange({ heightValue: value })}
              testId={`catalog-import-row-height-value-${index}`}
            />
            <MeasurementUnitField
              label="Unidad de alto"
              value={row.heightUnit}
              readOnly={readOnlyFields}
              onChange={(value) => onChange({ heightUnit: value })}
              testId={`catalog-import-row-height-unit-${index}`}
            />
          </div>
          <RowField
            label="Boca"
            value={row.mouth}
            readOnly={readOnlyFields}
            onChange={(value) => onChange({ mouth: value })}
            testId={`catalog-import-row-mouth-${index}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

type RowFieldProps = {
  readonly label: string;
  readonly value: string;
  readonly readOnly: boolean;
  readonly onChange?: (value: string) => void;
  readonly onBlur?: () => void;
  readonly inputMode?: 'decimal' | 'numeric';
  readonly pattern?: string;
  readonly type?: 'number';
  readonly testId: string;
};

/** Un campo de texto de la fila: editable o de solo lectura, segun la clase (R11, R12). */
function RowField({ label, value, readOnly, onChange, onBlur, inputMode, pattern, type, testId }: RowFieldProps) {
  const inputId = useId();

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      {readOnly ? (
        <p className={`${TOUCH_TARGET} ${FIELD_TEXT} flex items-center`} data-testid={testId}>
          {value === '' ? '—' : value}
        </p>
      ) : (
        <Input
          id={inputId}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          onBlur={onBlur}
          type={type ?? 'text'}
          inputMode={inputMode}
          pattern={pattern}
          className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
          data-testid={testId}
        />
      )}
    </div>
  );
}

type MeasurementUnitFieldProps = {
  readonly label: string;
  readonly value: MeasurementUnit;
  readonly readOnly: boolean;
  readonly onChange: (value: MeasurementUnit) => void;
  readonly testId: string;
};

/** La unidad de una medida (diametro o alto): lista cerrada, sin conversion (R12, R27). */
function MeasurementUnitField({ label, value, readOnly, onChange, testId }: MeasurementUnitFieldProps) {
  const fieldId = useId();

  if (readOnly) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{label}</span>
        <p className={`${TOUCH_TARGET} ${FIELD_TEXT} flex items-center`} data-testid={testId}>
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={`${fieldId}-label`} className="text-sm font-medium">
        {label}
      </span>
      <Select value={value} onValueChange={(next) => onChange(next as MeasurementUnit)} items={MEASUREMENT_UNIT_OPTIONS}>
        <SelectTrigger
          aria-labelledby={`${fieldId}-label`}
          className={`w-full ${TOUCH_TARGET} ${FIELD_TEXT}`}
          data-testid={testId}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MEASUREMENT_UNIT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} data-testid={`${testId}-option-${option.value}`}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
