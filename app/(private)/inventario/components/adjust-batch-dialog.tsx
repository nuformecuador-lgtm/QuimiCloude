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
import {
  PRODUCT_TYPES,
  describeAdjustment,
  isReasonAllowed,
  reasonsFor,
  type MovementReason,
  type ProductBatchView,
  type ProductType,
  type StockAdjustmentReading,
} from '@/lib/modules/inventario';
import {
  exactDecimalTitle,
  formatDecimalDisplay,
  trimDecimal,
} from '@/lib/shared/ui/decimal-display';

import { movementReasonLabel } from './batch-history';

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base md:text-base';

const BATCH_ID_FIELD = 'batchId';
const COUNTED_STOCK_FIELD = 'countedStock';
const SEEN_STOCK_FIELD = 'seenStock';
const REASON_FIELD = 'reason';

const DIALOG_TITLE = 'Ajustar existencia';
const CONFIRM_LABEL = 'Ajustar';
const CONFIRM_PENDING_LABEL = 'Ajustando…';
const CANCEL_LABEL = 'Cancelar';
const ADJUST_SUCCESS = 'Existencia ajustada.';
const RECORDED_STOCK_LABEL = 'Existencia registrada';
const COUNTED_STOCK_LABEL = 'Total contado';
const INCREASE_PREFIX = 'Aumento de';
const DECREASE_PREFIX = 'Disminución de';
const ZERO_DIFFERENCE_MESSAGE = 'El total contado es igual a la existencia registrada.';
const INVALID_COUNT_MESSAGE = 'Escribe el total contado.';
const MISSING_REASON_MESSAGE = 'Elegi un motivo.';
const OVER_RESERVED_MESSAGE =
  'El lote queda sobre-reservado: hay pedidos sin cobertura completa.';
const FINISHED_PRODUCT_NOTICE = 'Solo se admiten ajustes que restan.';
const WHOLE_PACKAGES_MESSAGE = 'Escribe un número entero de envases.';
const WHOLE_COUNT_PATTERN = /^\d{1,10}$/;

const INITIAL_STATE: AdjustBatchStockFormState = { status: 'idle' };

/**
 * Deja en el campo solo lo que puede ser un decimal sin signo: digitos y un punto, hasta 4
 * decimales -la escala de la columna-. La coma se convierte en punto en vez de descartarse: es el
 * separador del teclado en castellano y tirarla multiplicaria el total por diez en silencio.
 */
function sanitizeCountedInput(raw: string): string {
  const onlyAmountCharacters = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const [whole = '', ...afterFirstDot] = onlyAmountCharacters.split('.');

  const hasDot = afterFirstDot.length > 0;
  const head = (whole === '' && hasDot ? '0' : whole).slice(0, 10);

  if (!hasDot) return head;
  return `${head}.${afterFirstDot.join('').slice(0, 4)}`;
}

/** El motivo elegido sobrevive solo si el sentido nuevo lo admite; sin sentido, se conserva. */
function keepAllowedReason(
  reason: MovementReason | null,
  reading: StockAdjustmentReading,
): MovementReason | null {
  if (reason === null || typeof reading === 'string') return reason;
  return isReasonAllowed(reading.direction, reason) ? reason : null;
}

export type AdjustBatchDialogProps = {
  readonly batch: ProductBatchView;
  /** Permiso `inventario.modificar`, resuelto en el servidor y bajado por props. */
  readonly canAdjust: boolean;
  /** Tipo del producto dueño del lote. Con `FINISHED_PRODUCT` se avisa que solo se admite restar. */
  readonly productType?: ProductType;
  /** Lote de un envase con presentacion fija: se ajusta en envases enteros. */
  readonly wholePackages?: boolean;
  readonly onAdjusted?: () => void;
};

/**
 * Dialogo de ajuste de existencia de un lote.
 *
 * **Sin `canAdjust` el control no existe en el DOM**: el Operador, que solo tiene
 * `inventario.consultar`, no ve ni un boton deshabilitado. El defecto falla cerrado.
 *
 * Se escribe el total contado y viaja junto a la existencia que el usuario tenia delante: la
 * diferencia que se muestra es solo informativa, la que se asienta la calcula el servidor.
 */
export function AdjustBatchDialog({
  batch,
  canAdjust,
  productType,
  wholePackages = false,
  onAdjusted,
}: AdjustBatchDialogProps) {
  if (!canAdjust) return null;

  return (
    <AdjustBatchDialogContent
      batch={batch}
      productType={productType}
      wholePackages={wholePackages}
      onAdjusted={onAdjusted}
    />
  );
}

function AdjustBatchDialogContent({
  batch,
  productType,
  wholePackages,
  onAdjusted,
}: {
  readonly batch: ProductBatchView;
  readonly productType?: ProductType;
  readonly wholePackages: boolean;
  readonly onAdjusted?: () => void;
}) {
  const fieldId = useId();
  const countedId = `${fieldId}-counted`;
  const differenceId = `${fieldId}-difference`;
  const reasonLabelId = `${fieldId}-reason`;
  const errorId = `${fieldId}-error`;
  const zeroErrorId = `${fieldId}-zero-error`;
  const countedErrorId = `${fieldId}-counted-error`;
  const reasonErrorId = `${fieldId}-reason-error`;
  const wholeErrorId = `${fieldId}-whole-error`;

  const router = useRouter();
  const [requestedOpen, setRequestedOpen] = useState(false);
  const [zeroError, setZeroError] = useState(false);
  const [countedError, setCountedError] = useState(false);
  const [reasonError, setReasonError] = useState(false);
  const [wholeError, setWholeError] = useState(false);
  const [counted, setCounted] = useState('');
  const [seenStock, setSeenStock] = useState(batch.stock);
  const [reason, setReason] = useState<MovementReason | null>(null);
  const [state, formAction, isPending] = useActionState(adjustBatchStockAction, INITIAL_STATE);

  // Al reabrir, el resultado de la vez anterior deja de pintarse sin tener que reiniciar la action.
  const [dismissedState, setDismissedState] = useState<AdjustBatchStockFormState | null>(null);
  const visibleState = state === dismissedState ? INITIAL_STATE : state;

  // Ajuste durante el render, no en un efecto: la existencia nueva tiene que estar ya en el
  // mismo render que pinta el rechazo, para que la diferencia y los motivos salgan recalculados.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === 'stock_changed') {
      setSeenStock(state.currentStock);
      setReason(keepAllowedReason(reason, describeAdjustment(state.currentStock, counted)));
    }
  }

  const reading = describeAdjustment(seenStock, counted);
  const adjustment = typeof reading === 'string' ? null : reading;
  const availableReasons = adjustment === null ? [] : reasonsFor(adjustment.direction);

  // Sobre-reservado se queda abierto con el aviso a la vista hasta que el usuario lo cierra.
  const overReserved = visibleState.status === 'success' && visibleState.overReserved;
  const open = requestedOpen && (visibleState.status !== 'success' || overReserved);

  useEffect(() => {
    if (state.status !== 'success') return;
    toast.success(ADJUST_SUCCESS);
    router.refresh();
    onAdjusted?.();
  }, [state, router, onAdjusted]);

  const error = visibleState.status === 'error' ? visibleState : undefined;
  const stockChanged = visibleState.status === 'stock_changed' ? visibleState : undefined;

  function handleCountedChange(raw: string) {
    const next = sanitizeCountedInput(raw);
    setCounted(next);
    setReason(keepAllowedReason(reason, describeAdjustment(seenStock, next)));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const isZero = reading === 'zero';
    const isInvalid = reading === 'invalid';
    const isFractional = wholePackages && counted !== '' && !WHOLE_COUNT_PATTERN.test(counted);
    const isMissingReason = adjustment !== null && reason === null;

    if (isZero || isInvalid || isFractional || isMissingReason) {
      event.preventDefault();
      setZeroError(isZero);
      setCountedError(isInvalid);
      setWholeError(isFractional);
      setReasonError(isMissingReason);
      return;
    }
    setZeroError(false);
    setCountedError(false);
    setWholeError(false);
    setReasonError(false);
  }

  const countedDescribedBy = [
    adjustment === null ? '' : differenceId,
    zeroError ? zeroErrorId : '',
    countedError ? countedErrorId : '',
    wholeError ? wholeErrorId : '',
  ]
    .join(' ')
    .trim()
    .replace(/\s+/g, ' ');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setRequestedOpen(next);
        if (next) {
          setDismissedState(state);
          setZeroError(false);
          setCountedError(false);
          setReasonError(false);
          setWholeError(false);
          setCounted('');
          setSeenStock(batch.stock);
          setReason(null);
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

        {productType !== PRODUCT_TYPES.FINISHED_PRODUCT ? null : (
          <p className="text-sm text-muted-foreground" data-testid="adjust-batch-finished-product-notice">
            {FINISHED_PRODUCT_NOTICE}
          </p>
        )}

        {zeroError ? (
          <p
            role="alert"
            id={zeroErrorId}
            className="text-sm text-destructive"
            data-testid="adjust-batch-zero-error"
          >
            {ZERO_DIFFERENCE_MESSAGE}
          </p>
        ) : null}

        {countedError ? (
          <p
            role="alert"
            id={countedErrorId}
            className="text-sm text-destructive"
            data-testid="adjust-batch-counted-error"
          >
            {INVALID_COUNT_MESSAGE}
          </p>
        ) : null}

        {wholeError ? (
          <p
            role="alert"
            id={wholeErrorId}
            className="text-sm text-destructive"
            data-testid="adjust-batch-whole-error"
          >
            {WHOLE_PACKAGES_MESSAGE}
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

        {stockChanged === undefined ? null : (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid="adjust-batch-stock-changed"
            data-code={stockChanged.code}
          >
            {stockChanged.message}
          </p>
        )}

        {overReserved ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid="adjust-batch-over-reserved"
          >
            {OVER_RESERVED_MESSAGE}
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
          <input
            type="hidden"
            name={SEEN_STOCK_FIELD}
            value={seenStock}
            readOnly
            data-testid="adjust-batch-seen-stock"
          />

          <dl className="flex flex-col gap-1">
            <dt className="text-sm font-medium">{RECORDED_STOCK_LABEL}</dt>
            <dd
              title={exactDecimalTitle(seenStock)}
              className="text-base"
              data-testid="adjust-batch-recorded-stock"
            >
              {formatDecimalDisplay(seenStock)}
            </dd>
          </dl>

          <div className="flex flex-col gap-2">
            <label htmlFor={countedId} className="text-sm font-medium">
              {COUNTED_STOCK_LABEL}
            </label>
            <Input
              id={countedId}
              name={COUNTED_STOCK_FIELD}
              type="text"
              required
              // Sin `pattern`: la validacion nativa taparia los avisos propios del dialogo.
              inputMode={wholePackages ? 'numeric' : 'decimal'}
              autoComplete="off"
              value={counted}
              onChange={(event) => handleCountedChange(event.currentTarget.value)}
              className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
              aria-invalid={zeroError || countedError || wholeError || undefined}
              aria-describedby={countedDescribedBy === '' ? undefined : countedDescribedBy}
              data-testid="adjust-batch-counted"
            />
            {adjustment === null ? null : (
              <p
                id={differenceId}
                aria-live="polite"
                className="text-sm"
                data-testid="adjust-batch-difference"
                data-direction={adjustment.direction}
              >
                {adjustment.direction === 'increase' ? INCREASE_PREFIX : DECREASE_PREFIX}{' '}
                {trimDecimal(adjustment.amount)}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span id={reasonLabelId} className="text-sm font-medium">
              Motivo
            </span>
            <Select
              name={REASON_FIELD}
              value={reason}
              onValueChange={(next, details) => {
                // Base UI vacia el valor cuando su opcion deja de estar en la lista, incluso
                // mientras el total esta a medio escribir; quien decide si el motivo sigue
                // valiendo es `keepAllowedReason`.
                if (next === null && details.reason === 'none') return;
                setReason(next as MovementReason | null);
              }}
              disabled={adjustment === null}
            >
              <SelectTrigger
                aria-labelledby={reasonLabelId}
                aria-describedby={reasonError ? reasonErrorId : undefined}
                className={`w-full ${TOUCH_TARGET} ${FIELD_TEXT}`}
                data-testid="adjust-batch-reason"
              >
                <SelectValue>
                  {(value: MovementReason | null) =>
                    value === null ? null : movementReasonLabel(value)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableReasons.map((option) => (
                  <SelectItem key={option} value={option} data-testid="adjust-batch-reason-option">
                    {movementReasonLabel(option)}
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
