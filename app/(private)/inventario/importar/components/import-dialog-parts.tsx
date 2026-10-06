'use client';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';

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

export const TOUCH_TARGET = 'min-h-11 min-w-11';
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
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
      data-testid={DIALOG_FORM_ERROR_TESTID}
      data-code={error.code}
    >
      {error.code === UNEXPECTED_ERROR_CODE ? <UnexpectedErrorNotice state={error} /> : <p>{error.message}</p>}
    </div>
  );
}

export function DialogActions({ pending, onCancel }: { readonly pending: boolean; readonly onCancel: () => void }) {
  return (
    <DialogFooter>
      <Button
        type="button"
        variant="ghost"
        className={TOUCH_TARGET}
        onClick={onCancel}
        data-testid={DIALOG_CANCEL_TESTID}
      >
        {DIALOG_CANCEL_LABEL}
      </Button>
      <Button
        type="submit"
        className={TOUCH_TARGET}
        disabled={pending}
        aria-busy={pending}
        data-testid={DIALOG_SUBMIT_TESTID}
      >
        {pending ? DIALOG_SAVING_LABEL : DIALOG_SAVE_LABEL}
      </Button>
    </DialogFooter>
  );
}
