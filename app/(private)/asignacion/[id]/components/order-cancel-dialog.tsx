'use client';

import { useActionState, useId, useState } from 'react';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  cancelAssignedOrderAction,
  type CancelAssignedOrderResult,
} from '@/lib/modules/asignaciones/adapters/driving/order-execution-actions';
import { UNEXPECTED_ERROR_CODE, type ErrorCode } from '@/lib/modules/errores';
import { cancelOrderSchema } from '@/lib/modules/pedidos';

/**
 * Cancela el pedido desde la ejecucion pidiendo antes el motivo. La accion redirige a la lista
 * cuando sale bien, asi que aqui solo se pinta el rechazo.
 */

export const ORDER_CANCEL_TRIGGER_TESTID = 'order-cancel-trigger';
export const ORDER_CANCEL_DIALOG_TESTID = 'order-cancel-dialog';
export const ORDER_CANCEL_FORM_TESTID = 'order-cancel-form';
export const ORDER_CANCEL_REASON_TESTID = 'order-cancel-reason';
export const ORDER_CANCEL_CONFIRM_TESTID = 'order-cancel-confirm';
export const ORDER_CANCEL_DISMISS_TESTID = 'order-cancel-dismiss';
export const ORDER_CANCEL_ERROR_TESTID = 'order-cancel-error';

export const ORDER_CANCEL_ORDER_ID_FIELD = 'orderId';
export const ORDER_CANCEL_STEP_POSITION_FIELD = 'stepPosition';
export const ORDER_CANCEL_REASON_FIELD = 'reason';

export const ORDER_CANCEL_TEXTS = {
  trigger: 'Cancelar pedido',
  title: '¿Cancelar el pedido?',
  description: 'El pedido queda cancelado y el material apartado se libera. No se puede deshacer.',
  reasonLabel: 'Motivo de la cancelación',
  reasonRequired: 'Escribe el motivo de la cancelación.',
  confirm: 'Cancelar pedido',
  dismiss: 'Volver',
} as const;

const TOUCH_TARGET = 'min-h-11 min-w-11';
// Por debajo de 16 px Safari en iOS hace zoom al enfocar el campo.
const FIELD_TEXT = 'text-base md:text-base';

// Sin `reference`: es un rechazo del propio formulario, no del servidor.
const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;

type CancelFormState = { readonly status: 'idle' } | CancelAssignedOrderResult;

const INITIAL_STATE: CancelFormState = { status: 'idle' };
const IGNORED_PREV_STATE: CancelAssignedOrderResult = { status: 'success' };

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export type OrderCancelDialogProps = {
  readonly orderId: string;
  readonly stepPosition: number | null;
};

export function OrderCancelDialog({ orderId, stepPosition }: OrderCancelDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={TOUCH_TARGET}
            data-testid={ORDER_CANCEL_TRIGGER_TESTID}
          />
        }
      >
        {ORDER_CANCEL_TEXTS.trigger}
      </AlertDialogTrigger>
      <AlertDialogContent data-testid={ORDER_CANCEL_DIALOG_TESTID}>
        {/* El popup se desmonta al cerrar: cada apertura empieza sin motivo ni error previos. */}
        <OrderCancelForm orderId={orderId} stepPosition={stepPosition} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function OrderCancelForm({ orderId, stepPosition }: OrderCancelDialogProps) {
  const fieldId = useId();
  const reasonId = `${fieldId}-reason`;
  const errorId = `${fieldId}-error`;
  const [reason, setReason] = useState('');

  const [state, formAction, isPending] = useActionState<CancelFormState, FormData>(
    async (_previous, formData) => {
      const parsed = cancelOrderSchema.safeParse({
        reason: readString(formData, ORDER_CANCEL_REASON_FIELD),
      });
      if (!parsed.success) {
        return {
          status: 'error',
          code: INVALID_INPUT_CODE,
          message: ORDER_CANCEL_TEXTS.reasonRequired,
        };
      }
      formData.set(ORDER_CANCEL_REASON_FIELD, parsed.data.reason);
      return cancelAssignedOrderAction(IGNORED_PREV_STATE, formData);
    },
    INITIAL_STATE,
  );

  const error = state.status === 'error' ? state : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid={ORDER_CANCEL_FORM_TESTID}>
      <AlertDialogHeader>
        <AlertDialogTitle>{ORDER_CANCEL_TEXTS.title}</AlertDialogTitle>
        <AlertDialogDescription>{ORDER_CANCEL_TEXTS.description}</AlertDialogDescription>
      </AlertDialogHeader>

      <input type="hidden" name={ORDER_CANCEL_ORDER_ID_FIELD} value={orderId} />
      <input type="hidden" name={ORDER_CANCEL_STEP_POSITION_FIELD} value={stepPosition ?? ''} />

      <div className="flex flex-col gap-2">
        <label htmlFor={reasonId} className="text-sm font-medium">
          {ORDER_CANCEL_TEXTS.reasonLabel}
        </label>
        <Textarea
          id={reasonId}
          name={ORDER_CANCEL_REASON_FIELD}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={FIELD_TEXT}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          data-testid={ORDER_CANCEL_REASON_TESTID}
        />
      </div>

      {error === undefined ? null : (
        <div
          role="alert"
          id={errorId}
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid={ORDER_CANCEL_ERROR_TESTID}
          data-code={error.code}
        >
          {error.code === UNEXPECTED_ERROR_CODE ? (
            <UnexpectedErrorNotice state={error} />
          ) : (
            <p>{error.message}</p>
          )}
        </div>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel
          type="button"
          className={TOUCH_TARGET}
          disabled={isPending}
          data-testid={ORDER_CANCEL_DISMISS_TESTID}
        >
          {ORDER_CANCEL_TEXTS.dismiss}
        </AlertDialogCancel>
        <Button
          type="submit"
          variant="destructive"
          className={TOUCH_TARGET}
          disabled={isPending}
          aria-busy={isPending}
          data-testid={ORDER_CANCEL_CONFIRM_TESTID}
        >
          {ORDER_CANCEL_TEXTS.confirm}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
