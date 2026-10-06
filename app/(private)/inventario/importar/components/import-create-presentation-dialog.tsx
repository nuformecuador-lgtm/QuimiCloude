'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';

import { PresentationUnitSelect } from '@/components/shared/presentation-unit-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ErrorCode, ErrorState } from '@/lib/modules/errores';
import { createPresentationAction } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { UnitRef } from '@/lib/modules/unidades';

import { DIALOG_CONTENT_CLASS, DialogActions, DialogFormError, DialogTextField } from './import-dialog-parts';
import {
  PRESENTATION_DIALOG_DESCRIPTION,
  PRESENTATION_DIALOG_TESTID,
  PRESENTATION_DIALOG_TITLE,
  PRESENTATION_FIELD_LABELS,
} from './import-texts';

type PresentationValues = { readonly name: string; readonly unitId: string; readonly content: string };

type PresentationField = keyof PresentationValues;

const CODE_TO_FIELD: Readonly<Partial<Record<ErrorCode, PresentationField>>> = {
  presentation_duplicate_name: 'name',
};

// La coma es el separador decimal del teclado en castellano; el esquema espera punto.
export function buildCreatePresentationFormData(values: PresentationValues): FormData {
  const formData = new FormData();
  formData.set('name', values.name);
  formData.set('unitId', values.unitId);
  const content = values.content.trim().replace(/,/g, '.');
  if (content !== '') formData.set('content', content);
  return formData;
}

export type ImportCreatePresentationDialogProps = {
  readonly initialName: string;
  readonly units: readonly UnitRef[];
  readonly onClose: () => void;
  readonly onCreated: () => void;
};

export function ImportCreatePresentationDialog({
  initialName,
  units,
  onClose,
  onCreated,
}: ImportCreatePresentationDialogProps) {
  const fieldId = useId();
  const [values, setValues] = useState<PresentationValues>({ name: initialName, unitId: '', content: '' });
  const [error, setError] = useState<ErrorState | null>(null);
  const [pending, startTransition] = useTransition();

  const errorField = error === null ? undefined : CODE_TO_FIELD[error.code];

  function update(field: PresentationField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createPresentationAction({ status: 'idle' }, buildCreatePresentationFormData(values));
      if (result.status === 'error') {
        setError(result);
        return;
      }
      if (result.status === 'success') onCreated();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        className={DIALOG_CONTENT_CLASS}
        data-testid={PRESENTATION_DIALOG_TESTID}
      >
        <DialogHeader>
          <DialogTitle>{PRESENTATION_DIALOG_TITLE}</DialogTitle>
          <DialogDescription>{PRESENTATION_DIALOG_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {error !== null && errorField === undefined ? <DialogFormError error={error} /> : null}

          <DialogTextField
            id={`${fieldId}-name`}
            field="name"
            label={PRESENTATION_FIELD_LABELS.name}
            value={values.name}
            onChange={(value) => update('name', value)}
            error={errorField === 'name' ? error?.message : undefined}
            required
          />
          <PresentationUnitSelect
            units={units}
            name={null}
            value={values.unitId}
            onValueChange={(unitId) => update('unitId', unitId)}
          />
          <DialogTextField
            id={`${fieldId}-content`}
            field="content"
            label={PRESENTATION_FIELD_LABELS.content}
            value={values.content}
            onChange={(value) => update('content', value)}
            inputMode="decimal"
          />

          <DialogActions pending={pending} onCancel={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
