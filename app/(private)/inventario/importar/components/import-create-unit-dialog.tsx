'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ErrorCode, ErrorState } from '@/lib/modules/errores';
import type { UnitView } from '@/lib/modules/unidades';
import { createUnitAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import {
  DIALOG_CONTENT_CLASS,
  DialogActions,
  DialogFormError,
  DialogTextField,
  FIELD_TEXT,
} from './import-dialog-parts';
import {
  NO_BASE_UNIT_LABEL,
  UNIT_DIALOG_DESCRIPTION,
  UNIT_DIALOG_TESTID,
  UNIT_DIALOG_TITLE,
  UNIT_FIELD_LABELS,
  dialogFieldErrorTestId,
  dialogFieldTestId,
} from './import-texts';

type UnitField = keyof typeof UNIT_FIELD_LABELS;

const NO_BASE_UNIT = '';

const CODE_TO_FIELD: Readonly<Partial<Record<ErrorCode, UnitField>>> = {
  unit_duplicate_name: 'name',
  duplicate_symbol: 'symbol',
  invalid_derivation: 'baseUnitId',
};

type UnitValues = Readonly<Record<UnitField, string>>;

// Una clave ausente significa «no lo declaro»; enviarla vacía es una entrada inválida.
export function buildCreateUnitFormData(values: UnitValues): FormData {
  const formData = new FormData();
  formData.set('name', values.name);
  const symbol = values.symbol.trim();
  if (symbol !== '') formData.set('symbol', symbol);
  if (values.baseUnitId !== NO_BASE_UNIT) {
    formData.set('baseUnitId', values.baseUnitId);
    const factor = values.factor.trim();
    if (factor !== '') formData.set('factor', factor);
  }
  return formData;
}

function unitLabel(unit: UnitView): string {
  return unit.symbol ?? unit.name;
}

export type ImportCreateUnitDialogProps = {
  readonly initialName: string;
  readonly units: readonly UnitView[];
  readonly onClose: () => void;
  readonly onCreated: () => void;
};

export function ImportCreateUnitDialog({ initialName, units, onClose, onCreated }: ImportCreateUnitDialogProps) {
  const fieldId = useId();
  const baseLabelId = `${fieldId}-base-label`;
  const baseErrorId = `${fieldId}-base-error`;
  const [values, setValues] = useState<UnitValues>({
    name: initialName,
    symbol: '',
    baseUnitId: NO_BASE_UNIT,
    factor: '',
  });
  const [error, setError] = useState<ErrorState | null>(null);
  const [pending, startTransition] = useTransition();

  const errorField = error === null ? undefined : CODE_TO_FIELD[error.code];
  const fieldError = (field: UnitField) => (errorField === field ? error?.message : undefined);
  const baseUnits = units.flatMap((unit) => (unit.baseUnitId === null ? [unit] : []));

  function update(field: UnitField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createUnitAction({ status: 'idle' }, buildCreateUnitFormData(values));
      if (result.status === 'error') {
        setError(result);
        return;
      }
      if (result.status === 'success') onCreated();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent showCloseButton={false} className={DIALOG_CONTENT_CLASS} data-testid={UNIT_DIALOG_TESTID}>
        <DialogHeader>
          <DialogTitle>{UNIT_DIALOG_TITLE}</DialogTitle>
          <DialogDescription>{UNIT_DIALOG_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {error !== null && errorField === undefined ? <DialogFormError error={error} /> : null}

          <DialogTextField
            id={`${fieldId}-name`}
            field="name"
            label={UNIT_FIELD_LABELS.name}
            value={values.name}
            onChange={(value) => update('name', value)}
            error={fieldError('name')}
            required
          />
          <DialogTextField
            id={`${fieldId}-symbol`}
            field="symbol"
            label={UNIT_FIELD_LABELS.symbol}
            value={values.symbol}
            onChange={(value) => update('symbol', value)}
            error={fieldError('symbol')}
          />

          <div className="flex flex-col gap-2">
            <span id={baseLabelId} className="text-sm font-medium">
              {UNIT_FIELD_LABELS.baseUnitId}
            </span>
            <Select
              value={values.baseUnitId}
              onValueChange={(next) => update('baseUnitId', next ?? NO_BASE_UNIT)}
              items={[
                { label: NO_BASE_UNIT_LABEL, value: NO_BASE_UNIT },
                ...baseUnits.map((unit) => ({ label: unitLabel(unit), value: unit.id })),
              ]}
            >
              <SelectTrigger
                aria-labelledby={baseLabelId}
                aria-invalid={fieldError('baseUnitId') === undefined ? undefined : true}
                aria-describedby={fieldError('baseUnitId') === undefined ? undefined : baseErrorId}
                className={`w-full ${touchTarget} ${FIELD_TEXT}`}
                data-testid={dialogFieldTestId('baseUnitId')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BASE_UNIT}>{NO_BASE_UNIT_LABEL}</SelectItem>
                {baseUnits.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id} data-testid={`${dialogFieldTestId('baseUnitId')}-option`}>
                    {unitLabel(unit)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError('baseUnitId') === undefined ? null : (
              <p
                id={baseErrorId}
                role="alert"
                className="text-sm text-destructive"
                data-testid={dialogFieldErrorTestId('baseUnitId')}
              >
                {fieldError('baseUnitId')}
              </p>
            )}
          </div>

          {values.baseUnitId === NO_BASE_UNIT ? null : (
            <DialogTextField
              id={`${fieldId}-factor`}
              field="factor"
              label={UNIT_FIELD_LABELS.factor}
              value={values.factor}
              onChange={(value) => update('factor', value)}
              inputMode="decimal"
            />
          )}

          <DialogActions pending={pending} onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
