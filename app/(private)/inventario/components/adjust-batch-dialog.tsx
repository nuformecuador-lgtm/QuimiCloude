'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';
import {
  adjustBatchStockAction,
  type AdjustBatchStockFormState,
} from '@/lib/modules/inventario/adapters/driving/batch-actions';
import { MOVEMENT_REASONS, type ProductBatchView } from '@/lib/modules/inventario';

import { movementReasonLabel } from './batch-history';

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base md:text-base';

const BATCH_ID_FIELD = 'batchId';
const DELTA_FIELD = 'delta';
const REASON_FIELD = 'reason';

const DIALOG_TITLE = 'Ajustar existencia';
const CONFIRM_LABEL = 'Ajustar';
const CONFIRM_PENDING_LABEL = 'Ajustando…';
const CANCEL_LABEL = 'Cancelar';
const ADJUST_SUCCESS = 'Existencia ajustada.';
const ZERO_DELTA_MESSAGE = 'La cantidad no puede ser cero.';
const MISSING_REASON_MESSAGE = 'Elegi un motivo.';

/** Mismo patron que la action: el signo se conserva, hasta 4 decimales pasan. */
const DECIMAL_DELTA_PATTERN = /^-?\d{1,10}(\.\d{1,4})?$/;

/** Cero de cualquier forma decimal: `'0'`, `'0.0'`, `'-0.0000'`... todas son «no cambia nada». */
const ZERO_DELTA_PATTERN = /^-?0+(\.0+)?$/;

const INITIAL_STATE: AdjustBatchStockFormState = { status: 'idle' };

/**
 * Deja en el campo solo lo que puede ser un decimal CON SIGNO: digitos, un signo menos al
 * principio y un punto, hasta 4 decimales -la escala de la columna-. La coma se convierte en
 * punto en vez de descartarse, igual que en `sanitizeCostInput` (`product-cost-amount.ts`): es el
 * separador del teclado en castellano y tirarla multiplicaria la cantidad por diez en silencio.
 */
function sanitizeDeltaInput(raw: string): string {
  const negative = raw.trimStart().startsWith('-');
  const onlyAmountCharacters = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const [whole = '', ...afterFirstDot] = onlyAmountCharacters.split('.');

  const hasDot = afterFirstDot.length > 0;
  const head = (whole === '' && hasDot ? '0' : whole).slice(0, 10);
  const sign = negative ? '-' : '';

  if (!hasDot) return `${sign}${head}`;
  return `${sign}${head}.${afterFirstDot.join('').slice(0, 4)}`;
}

export type AdjustBatchDialogProps = {
  readonly batch: ProductBatchView;
  /** Permiso `inventario.modificar`, resuelto en el servidor y bajado por props. */
  readonly canAdjust: boolean;
  readonly onAdjusted?: () => void;
};

/**
 * Dialogo de ajuste de existencia de un lote.
 *
 * **Sin `canAdjust` el control no existe en el DOM**: el Operador, que solo tiene
 * `inventario.consultar`, no ve ni un boton deshabilitado. El defecto falla cerrado.
 *
 * La cantidad viaja **con signo** -lo que suma o lo que resta-, nunca el total nuevo del lote: eso
 * lo decide la action y el caso de uso, este componente solo evita el viaje redondo cuando la
 * cantidad es cero.
 */
export function AdjustBatchDialog({ batch, canAdjust, onAdjusted }: AdjustBatchDialogProps) {
  if (!canAdjust) return null;

  return (
    <AdjustBatchDialogContent batch={batch} onAdjusted={onAdjusted} />
  );
}

function AdjustBatchDialogContent({
  batch,
  onAdjusted,
}: {
  readonly batch: ProductBatchView;
  readonly onAdjusted?: () => void;
}) {
  const fieldId = useId();
  const deltaId = `${fieldId}-delta`;
  const reasonLabelId = `${fieldId}-reason`;
  const errorId = `${fieldId}-error`;
  const zeroErrorId = `${fieldId}-zero-error`;
  const reasonErrorId = `${fieldId}-reason-error`;

  const router = useRouter();
  const [requestedOpen, setRequestedOpen] = useState(false);
  const [zeroError, setZeroError] = useState(false);
  const [reasonError, setReasonError] = useState(false);
  const [delta, setDelta] = useState('');
  const [state, formAction, isPending] = useActionState(adjustBatchStockAction, INITIAL_STATE);

  // El dialogo abierto se DERIVA del pedido del usuario y del resultado de la operacion, igual
  // que en `delete-product-dialog.tsx`: evita el `setState` sincrono dentro de un efecto.
  const open = requestedOpen && state.status !== 'success';

  useEffect(() => {
    if (state.status !== 'success') return;
    toast.success(ADJUST_SUCCESS);
    router.refresh();
    onAdjusted?.();
  }, [state, router, onAdjusted]);

  const error = state.status === 'error' ? state : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const typedDelta = formData.get(DELTA_FIELD);
    const reason = formData.get(REASON_FIELD);

    const isZero =
      typeof typedDelta === 'string' &&
      DECIMAL_DELTA_PATTERN.test(typedDelta) &&
      ZERO_DELTA_PATTERN.test(typedDelta);
    const isMissingReason = typeof reason !== 'string' || reason.length === 0;

    if (isZero || isMissingReason) {
      event.preventDefault();
      setZeroError(isZero);
      setReasonError(isMissingReason);
      return;
    }
    setZeroError(false);
    setReasonError(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setRequestedOpen(next);
        if (next) {
          setZeroError(false);
          setReasonError(false);
          setDelta('');
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className={TOUCH_TARGET}
            data-testid="adjust-batch-open"
          />
        }
      >
        {DIALOG_TITLE}
      </DialogTrigger>
      <DialogContent data-testid="adjust-batch-dialog">
        <DialogHeader>
          <DialogTitle>{DIALOG_TITLE}</DialogTitle>
          <DialogDescription>Lote {batch.lot}.</DialogDescription>
        </DialogHeader>

        {zeroError ? (
          <p
            role="alert"
            id={zeroErrorId}
            className="text-sm text-destructive"
            data-testid="adjust-batch-zero-error"
          >
            {ZERO_DELTA_MESSAGE}
          </p>
        ) : null}

        {reasonError ? (
          <p
            role="alert"
            id={reasonErrorId}
            className="text-sm text-destructive"
            data-testid="adjust-batch-reason-error"
          >
            {MISSING_REASON_MESSAGE}
          </p>
        ) : null}

        {error === undefined ? null : (
          <div
            role="alert"
            id={errorId}
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid="adjust-batch-error"
            data-code={error.code}
          >
            {error.code === UNEXPECTED_ERROR_CODE ? (
              <UnexpectedErrorNotice state={error} />
            ) : (
              <p data-testid="adjust-batch-error-message">{error.message}</p>
            )}
          </div>
        )}

        <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="hidden"
            name={BATCH_ID_FIELD}
            defaultValue={batch.id}
            data-testid="adjust-batch-id"
          />

          <div className="flex flex-col gap-2">
            <label htmlFor={deltaId} className="text-sm font-medium">
              Cantidad
            </label>
            <Input
              id={deltaId}
              name={DELTA_FIELD}
              type="text"
              required
              inputMode="decimal"
              value={delta}
              onChange={(event) => setDelta(sanitizeDeltaInput(event.currentTarget.value))}
              className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
              aria-describedby={zeroError ? zeroErrorId : undefined}
              data-testid="adjust-batch-delta"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span id={reasonLabelId} className="text-sm font-medium">
              Motivo
            </span>
            <Select name={REASON_FIELD} items={MOVEMENT_REASONS.map((reason) => ({
              label: movementReasonLabel(reason),
              value: reason,
            }))}>
              <SelectTrigger
                aria-labelledby={reasonLabelId}
                aria-describedby={reasonError ? reasonErrorId : undefined}
                className={`w-full ${TOUCH_TARGET} ${FIELD_TEXT}`}
                data-testid="adjust-batch-reason"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOVEMENT_REASONS.map((reason) => (
                  <SelectItem key={reason} value={reason} data-testid="adjust-batch-reason-option">
                    {movementReasonLabel(reason)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className={TOUCH_TARGET}
              onClick={() => setRequestedOpen(false)}
              data-testid="adjust-batch-cancel"
            >
              {CANCEL_LABEL}
            </Button>
            <Button
              type="submit"
              className={TOUCH_TARGET}
              disabled={isPending}
              aria-busy={isPending}
              data-testid="adjust-batch-confirm"
            >
              {isPending ? CONFIRM_PENDING_LABEL : CONFIRM_LABEL}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
