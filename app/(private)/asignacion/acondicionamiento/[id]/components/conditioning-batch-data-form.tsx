'use client';

import { startTransition, useActionState, useId, useState, type FormEvent } from 'react';

import { ErrorAlert } from '@/components/shared/error-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ConditioningBatchLineView } from '@/lib/modules/asignaciones';
import {
  saveConditioningBatchDataAction,
  type SaveConditioningBatchDataResult,
} from '@/lib/modules/asignaciones/adapters/driving/order-conditioning-actions';

export const CONDITIONING_BATCH_DATA_SECTION_TESTID = 'conditioning-batch-data';
export const CONDITIONING_BATCH_DATA_FORM_TESTID = 'conditioning-batch-data-form';
export const CONDITIONING_BATCH_DATA_LINE_TESTID = 'conditioning-batch-data-line';
export const CONDITIONING_BATCH_DATA_PROVISIONAL_TESTID = 'conditioning-batch-data-provisional';
export const CONDITIONING_BATCH_DATA_SUBMIT_TESTID = 'conditioning-batch-data-submit';
export const CONDITIONING_BATCH_DATA_ERROR_TESTID = 'conditioning-batch-data-error';
export const CONDITIONING_BATCH_DATA_SUCCESS_TESTID = 'conditioning-batch-data-success';

/** Los nombres que lee la acción, emparejados por posición. */
export const CONDITIONING_BATCH_DATA_FIELDS = {
  orderId: 'orderId',
  batchId: 'batchId',
  lot: 'lot',
  expiryDate: 'expiryDate',
  productionDate: 'productionDate',
} as const;

export const CONDITIONING_BATCH_DATA_TEXTS = {
  title: 'Datos de lote',
  lot: 'Lote',
  expiryDate: 'Vencimiento',
  productionDate: 'Día de producción',
  submit: 'Guardar datos de lote',
  saved: 'Datos de lote guardados.',
  provisional: (lot: string) => `Lote provisional: ${lot}.`,
} as const;

const FIELD_CLASS = 'min-h-11 text-base md:text-base';

type LineValues = { readonly lot: string; readonly expiryDate: string; readonly productionDate: string };

const INITIAL_STATE: SaveConditioningBatchDataResult = { status: 'idle' };

/** `label` llega ya escrita como en el reparto: la compone la pantalla de servidor. */
export type ConditioningBatchFormLine = ConditioningBatchLineView & { readonly label: string };

function initialValues(lines: readonly ConditioningBatchFormLine[]): LineValues[] {
  return lines.map((line) => ({
    lot: line.lot ?? '',
    expiryDate: line.expiryDate ?? '',
    productionDate: line.productionDate ?? '',
  }));
}

export type ConditioningBatchDataFormProps = {
  readonly orderId: string;
  /** En orden de alta. */
  readonly lines: readonly ConditioningBatchFormLine[];
};

export function ConditioningBatchDataForm({ orderId, lines }: ConditioningBatchDataFormProps) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const errorId = `${baseId}-error`;
  const [values, setValues] = useState<LineValues[]>(() => initialValues(lines));
  const [state, formAction, isPending] = useActionState(saveConditioningBatchDataAction, INITIAL_STATE);

  const error = state.status === 'error' ? state : undefined;
  const culpritBatchId = error?.batchId;

  function update(index: number, field: keyof LineValues, value: string): void {
    setValues((current) => current.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  }

  // Sin el reinicio automático de `<form action>`: tras un rechazo, lo escrito se queda.
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3"
      data-testid={CONDITIONING_BATCH_DATA_SECTION_TESTID}
    >
      <h2 id={headingId} className="text-base font-medium">
        {CONDITIONING_BATCH_DATA_TEXTS.title}
      </h2>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        data-testid={CONDITIONING_BATCH_DATA_FORM_TESTID}
      >
        <input type="hidden" name={CONDITIONING_BATCH_DATA_FIELDS.orderId} value={orderId} />

        {lines.map((line, index) => {
          const lineValues = values[index] ?? { lot: '', expiryDate: '', productionDate: '' };
          const invalid = line.batchId !== null && line.batchId === culpritBatchId;
          // Sin lote de producción no hay nada que guardar: deshabilitado, no viaja en el envío.
          const disabled = line.batchId === null;
          const anyValue =
            lineValues.lot !== '' || lineValues.expiryDate !== '' || lineValues.productionDate !== '';
          const fieldId = (field: string) => `${baseId}-${index}-${field}`;

          return (
            <fieldset
              key={line.batchId ?? `${line.presentationId}-${index}`}
              disabled={disabled}
              aria-invalid={invalid ? true : undefined}
              className="flex flex-col gap-3 rounded-lg border p-3 aria-invalid:border-destructive"
              data-testid={CONDITIONING_BATCH_DATA_LINE_TESTID}
              data-batch-id={line.batchId ?? undefined}
            >
              <legend className="px-1 text-base font-medium">{line.label}</legend>
              {line.batchId === null ? null : (
                <input type="hidden" name={CONDITIONING_BATCH_DATA_FIELDS.batchId} value={line.batchId} />
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={fieldId('lot')} className="text-base">
                    {CONDITIONING_BATCH_DATA_TEXTS.lot}
                  </Label>
                  <Input
                    id={fieldId('lot')}
                    type="text"
                    name={CONDITIONING_BATCH_DATA_FIELDS.lot}
                    value={lineValues.lot}
                    onChange={(event) => update(index, 'lot', event.target.value)}
                    required={anyValue}
                    aria-invalid={invalid ? true : undefined}
                    aria-describedby={invalid ? errorId : undefined}
                    className={FIELD_CLASS}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={fieldId('expiry')} className="text-base">
                    {CONDITIONING_BATCH_DATA_TEXTS.expiryDate}
                  </Label>
                  <Input
                    id={fieldId('expiry')}
                    type="date"
                    name={CONDITIONING_BATCH_DATA_FIELDS.expiryDate}
                    value={lineValues.expiryDate}
                    onChange={(event) => update(index, 'expiryDate', event.target.value)}
                    required={anyValue}
                    aria-invalid={invalid ? true : undefined}
                    aria-describedby={invalid ? errorId : undefined}
                    className={FIELD_CLASS}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={fieldId('production')} className="text-base">
                    {CONDITIONING_BATCH_DATA_TEXTS.productionDate}
                  </Label>
                  <Input
                    id={fieldId('production')}
                    type="date"
                    name={CONDITIONING_BATCH_DATA_FIELDS.productionDate}
                    value={lineValues.productionDate}
                    onChange={(event) => update(index, 'productionDate', event.target.value)}
                    required={anyValue}
                    aria-invalid={invalid ? true : undefined}
                    aria-describedby={invalid ? errorId : undefined}
                    className={FIELD_CLASS}
                  />
                </div>
              </div>
              {line.provisionalLot === null ? null : (
                <p className="text-base text-muted-foreground" data-testid={CONDITIONING_BATCH_DATA_PROVISIONAL_TESTID}>
                  {CONDITIONING_BATCH_DATA_TEXTS.provisional(line.provisionalLot)}
                </p>
              )}
            </fieldset>
          );
        })}

        {error === undefined ? null : (
          <ErrorAlert
            error={error}
            id={errorId}
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            testId={CONDITIONING_BATCH_DATA_ERROR_TESTID}
            withDataCode
          />
        )}

        {state.status === 'success' ? (
          <p role="status" className="text-base" data-testid={CONDITIONING_BATCH_DATA_SUCCESS_TESTID}>
            {CONDITIONING_BATCH_DATA_TEXTS.saved}
          </p>
        ) : null}

        <Button
          type="submit"
          touch
          className="w-fit"
          disabled={isPending}
          aria-busy={isPending}
          data-testid={CONDITIONING_BATCH_DATA_SUBMIT_TESTID}
        >
          {CONDITIONING_BATCH_DATA_TEXTS.submit}
        </Button>
      </form>
    </section>
  );
}
