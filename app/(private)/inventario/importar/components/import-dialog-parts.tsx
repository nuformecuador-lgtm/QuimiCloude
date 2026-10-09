'use client';

import { ErrorAlert } from '@/components/shared/error-alert';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ErrorState } from '@/lib/modules/errores';

import {
  DIALOG_CANCEL_LABEL,
  DIALOG_CANCEL_TESTID,
  DIALOG_FORM_ERROR_TESTID,
  DIALOG_SAVE_LABEL,
  DIALOG_SAVING_LABEL,
  DIALOG_SUBMIT_TESTID,
  dialogFieldErrorTestId,
  dialogFieldTestId,
} from './import-texts';

// El primitivo baja a 14 px desde `md`; iOS hace zoom al enfocar un campo de menos de 16 px.
export const FIELD_TEXT = 'text-base md:text-base';
export const DIALOG_CONTENT_CLASS = 'max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md';

export function DialogTextField({
  id,
  field,
  label,
  value,
  onChange,
  error,
  required,
  inputMode,
}: {
  readonly id: string;
  readonly field: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  readonly required?: boolean;
  readonly inputMode?: 'decimal';
}) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        autoComplete="off"
        inputMode={inputMode}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`min-h-11 ${FIELD_TEXT}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        data-testid={dialogFieldTestId(field)}
      />
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="text-sm text-destructive" data-testid={dialogFieldErrorTestId(field)}>
          {error}
        </p>
      )}
    </div>
  );
}

export function DialogFormError({ error }: { readonly error: ErrorState }) {
  return (
    <ErrorAlert
      error={error}
      className="flex flex-col gap-1 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
      testId={DIALOG_FORM_ERROR_TESTID}
      withDataCode
    />
  );
}

export function DialogActions({ pending, onCancel }: { readonly pending: boolean; readonly onCancel: () => void }) {
  return (
    <DialogFooter>
      <Button
        type="button"
        variant="ghost"
        touch
        onClick={onCancel}
        data-testid={DIALOG_CANCEL_TESTID}
      >
        {DIALOG_CANCEL_LABEL}
      </Button>
      <Button
        type="submit"
        touch
        disabled={pending}
        aria-busy={pending}
        data-testid={DIALOG_SUBMIT_TESTID}
      >
        {pending ? DIALOG_SAVING_LABEL : DIALOG_SAVE_LABEL}
      </Button>
    </DialogFooter>
  );
}
